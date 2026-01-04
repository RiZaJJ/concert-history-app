import {
  listPhotosFromDrive,
  getPhotoMetadata,
  searchSetlistsByDateAndLocation,
  fetchCurrentWeather,
  getFileContent,
  reverseGeocode,
} from "./integrations";
import * as db from "./db";
import { notifyOwner } from "./_core/notification";
import { initScanProgress, updateScanProgress, completeScanProgress, clearScanProgress } from "./scanProgress";

/**
 * Auto-detect concert from photo EXIF data using setlist.fm
 */
async function autoDetectConcert(
  userId: number,
  date: Date,
  latitude: string,
  longitude: string,
  detectedVenueName?: string | null
): Promise<{ id: number; artist: string; venue: string } | null> {
  try {
    // Search setlist.fm for concerts on this date at this location
    // Pass venue name if available for more accurate matching
    const result = await searchSetlistsByDateAndLocation(date, latitude, longitude, detectedVenueName || undefined);
    
    if (!result.setlists || result.setlists.length === 0) {
      console.log(`No setlists found for ${date.toDateString()} at ${latitude},${longitude}`);
      return null;
    }
    
    // Use the first setlist found (most likely match)
    const setlist = result.setlists[0];
    const artistName = setlist.artist?.name;
    const venueName = setlist.venue?.name;
    const cityName = setlist.venue?.city?.name || result.city;
    const countryCode = setlist.venue?.city?.country?.code || result.country;
    
    if (!artistName || !venueName || !cityName) {
      console.log(`Incomplete setlist data, skipping`);
      return null;
    }
    
    // Parse the concert date from setlist.fm eventDate (format: "DD-MM-YYYY")
    // Use this instead of photo EXIF date to avoid timezone issues
    let concertDate = date; // fallback to photo date
    if (setlist.eventDate) {
      const [day, month, year] = setlist.eventDate.split('-').map(Number);
      // Create date at noon UTC to avoid timezone shifts
      concertDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      console.log(`Using setlist eventDate: ${setlist.eventDate} -> ${concertDate.toISOString()}`);
    } else {
      console.log(`No eventDate in setlist, using photo date: ${date.toISOString()}`);
    }
    
    // Create or find artist
    const artist = await db.createArtist({
      name: artistName,
      mbid: setlist.artist?.mbid,
    });
    
    // Create or find venue
    const venue = await db.createVenue({
      name: venueName,
      city: cityName,
      country: countryCode || "Unknown",
      latitude,
      longitude,
    });
    
    // Fetch weather data
    let weatherData = null;
    try {
      weatherData = await fetchCurrentWeather(latitude, longitude);
    } catch (error) {
      console.log("Could not fetch weather data");
    }
    
    // Create concert
    const concert = await db.createConcert({
      userId,
      artistId: artist.id,
      venueId: venue.id,
      concertDate,
      weatherCondition: weatherData?.weather?.[0]?.description,
      temperature: weatherData?.main?.temp,
    });
    
    // Create setlist entries if available
    if (setlist.sets?.set && Array.isArray(setlist.sets.set)) {
      let setNumber = 1;
      for (const set of setlist.sets.set) {
        if (set.song && Array.isArray(set.song)) {
          let position = 1;
          for (const songData of set.song) {
            // Create or find song
            const song = await db.createSong({
              title: songData.name,
              artistId: artist.id,
            });
            
            // Create setlist entry
            await db.createSetlistEntry({
              concertId: concert.id,
              songId: song.id,
              setNumber,
              position,
              notes: songData.info || songData.tape ? `${songData.info || ''} ${songData.tape || ''}`.trim() : undefined,
            });
            
            position++;
          }
        }
        setNumber++;
      }
    }
    
    return {
      id: concert.id,
      artist: artistName,
      venue: venueName,
    };
  } catch (error: any) {
    console.error("Error auto-detecting concert:", error.message);
    return null;
  }
}

interface EXIFData {
  takenAt?: Date;
  latitude?: string;
  longitude?: string;
}

/**
 * Extract EXIF data from Google Photos JSON sidecar file
 */
function extractEXIFFromJSON(jsonData: any): EXIFData {
  const exif: EXIFData = {};
  
  try {
    // Google Photos JSON structure varies, try common paths
    // photoTakenTime is usually in Unix timestamp (seconds)
    if (jsonData.photoTakenTime?.timestamp) {
      // Keep original timestamp for display purposes
      exif.takenAt = new Date(parseInt(jsonData.photoTakenTime.timestamp) * 1000);
    }
    
    // GPS coordinates
    if (jsonData.geoData) {
      if (jsonData.geoData.latitude) {
        exif.latitude = jsonData.geoData.latitude.toString();
      }
      if (jsonData.geoData.longitude) {
        exif.longitude = jsonData.geoData.longitude.toString();
      }
    } else if (jsonData.geoDataExif) {
      // Alternative location for GPS data
      if (jsonData.geoDataExif.latitude) {
        exif.latitude = jsonData.geoDataExif.latitude.toString();
      }
      if (jsonData.geoDataExif.longitude) {
        exif.longitude = jsonData.geoDataExif.longitude.toString();
      }
    }
  } catch (error) {
    console.error('Error extracting EXIF from JSON:', error);
  }
  
  return exif;
}

/**
 * Extract EXIF data from photo metadata
 */
export function extractEXIFData(metadata: any): EXIFData {
  const imageMetadata = metadata.imageMediaMetadata;
  
  if (!imageMetadata) {
    return {};
  }
  
  const exif: EXIFData = {};
  
  // Extract timestamp
  if (imageMetadata.time) {
    // Keep original timestamp for display purposes
    exif.takenAt = new Date(imageMetadata.time);
  }
  
  // Extract GPS coordinates
  if (imageMetadata.location) {
    exif.latitude = imageMetadata.location.latitude?.toString();
    exif.longitude = imageMetadata.location.longitude?.toString();
  }
  
  return exif;
}

/**
 * Determine if a photo belongs to an existing concert based on date and location
 */
async function findMatchingConcert(
  userId: number,
  takenAt: Date,
  latitude?: string,
  longitude?: string
): Promise<number | null> {
  // Get all user concerts
  const concerts = await db.getUserConcerts(userId);
  
  // Find concerts within ±18 hours of photo timestamp
  // This accounts for timezone differences and photos taken late at night or early morning
  const photoTime = takenAt.getTime();
  const eighteenHours = 18 * 60 * 60 * 1000;
  
  const sameDateConcerts = concerts.filter(concert => {
    const concertTime = new Date(concert.concertDate).getTime();
    const timeDiff = Math.abs(photoTime - concertTime);
    return timeDiff <= eighteenHours;
  });
  
  if (sameDateConcerts.length === 0) {
    return null;
  }
  
  // If we have GPS coordinates, try to match by venue location
  if (latitude && longitude && sameDateConcerts.length > 1) {
    for (const concert of sameDateConcerts) {
      const venue = await db.getVenueById(concert.venueId);
      if (venue?.latitude && venue?.longitude) {
        // Simple distance check (within ~1km)
        const latDiff = Math.abs(parseFloat(venue.latitude) - parseFloat(latitude));
        const lonDiff = Math.abs(parseFloat(venue.longitude) - parseFloat(longitude));
        
        if (latDiff < 0.01 && lonDiff < 0.01) {
          return concert.id;
        }
      }
    }
  }
  
  // Return the first concert on that date if no GPS match
  return sameDateConcerts[0]?.id || null;
}

/**
 * Process a single photo from Google Drive
 */
async function processPhoto(
  userId: number,
  fileId: string,
  fileName: string,
  mimeType: string,
  webViewLink: string,
  thumbnailLink: string | undefined,
  jsonMetadataFileId?: string
): Promise<{ concertId: number | null; photoId: number | null; isNewConcert: boolean }> {
  try {
    let exif: EXIFData = {};
    let fileCreatedAt: Date | null = null;
    
    // If JSON metadata file is provided, parse it for EXIF data
    if (jsonMetadataFileId) {
      try {
        const jsonContent = await getFileContent(jsonMetadataFileId);
        const jsonData = JSON.parse(jsonContent);
        exif = extractEXIFFromJSON(jsonData);
        console.log(`Parsed EXIF from JSON for ${fileName}:`, exif);
      } catch (error) {
        console.error(`Failed to parse JSON metadata for ${fileName}:`, error);
      }
    }
    
    // Fallback: try to get metadata from the photo file itself
    if (!exif.takenAt) {
      const metadata = await getPhotoMetadata(fileId);
      const photoExif = extractEXIFData(metadata);
      exif = { ...photoExif, ...exif }; // Merge, preferring JSON data
      fileCreatedAt = metadata.createdTime ? new Date(metadata.createdTime) : null;
    }
    
    // Fallback to file creation date if no EXIF timestamp
    let photoDate = exif.takenAt;
    
    if (!photoDate && fileCreatedAt) {
      console.log(`Photo ${fileName} has no EXIF timestamp, using file creation date: ${fileCreatedAt}`);
      photoDate = fileCreatedAt;
    }
    
    if (!photoDate) {
      console.warn(`Photo ${fileName} has no timestamp (EXIF or file), skipping`);
      return { concertId: null, photoId: null, isNewConcert: false };
    }
    
    // Try to find matching concert
    let concertId = await findMatchingConcert(
      userId,
      photoDate,
      exif.latitude,
      exif.longitude
    );
    
    let isNewConcert = false;
    
    // If no concert exists and we have GPS coordinates, try to auto-detect from setlist.fm
    if (!concertId && exif.latitude && exif.longitude) {
      // First, try to detect the venue name for more accurate setlist matching
      let detectedVenue: string | null = null;
      try {
        const { findNearbyVenue } = await import('./integrations');
        const venueResult = await findNearbyVenue(exif.latitude, exif.longitude);
        if (venueResult) {
          detectedVenue = venueResult.name;
          console.log(`Detected venue for ${fileName}: ${detectedVenue} (${venueResult.method})`);
        }
      } catch (error) {
        console.error('Venue detection failed:', error);
      }
      
      console.log(`Attempting to auto-detect concert for ${fileName} at ${photoDate}`);
      const newConcert = await autoDetectConcert(userId, photoDate, exif.latitude, exif.longitude, detectedVenue);
      if (newConcert) {
        concertId = newConcert.id;
        isNewConcert = true;
        console.log(`✓ Created new concert: ${newConcert.artist} at ${newConcert.venue}`);
      }
    }
    
    if (!concertId) {
      console.log(`No matching concert found for photo ${fileName} taken at ${photoDate}`);
      
      // Reverse geocode to get location and venue if we have GPS coordinates
      let city: string | null = null;
      let state: string | null = null;
      let country: string | null = null;
      let venueName: string | null = null;
      let venueDetectionMethod: string | null = null;
      let venueConfidence: string | null = null;
      
      if (exif.latitude && exif.longitude) {
        try {
          const location = await reverseGeocode(exif.latitude, exif.longitude);
          if (location) {
            city = location.city;
            state = location.state || null;
            country = location.country;
          }
        } catch (error) {
          console.error('Reverse geocoding failed for unmatched photo:', error);
        }
        
        // Try to find nearby venue
        try {
          const { findNearbyVenue } = await import('./integrations');
          const venueResult = await findNearbyVenue(exif.latitude, exif.longitude);
          if (venueResult) {
            venueName = venueResult.name;
            venueDetectionMethod = venueResult.method;
            venueConfidence = venueResult.confidence;
            console.log(`Found venue for ${fileName}: ${venueResult.name} (${venueResult.method}, ${venueResult.confidence})`);
          }
        } catch (error) {
          console.error('Venue lookup failed for unmatched photo:', error);
        }
      }
      
      // Store as unmatched photo for manual review
      // Use Google Drive direct download link format for better compatibility
      const directDownloadUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
      
      await db.createUnmatchedPhoto({
        userId,
        driveFileId: fileId,
        fileName,
        mimeType: mimeType || null,
        sourceUrl: directDownloadUrl,
        thumbnailUrl: thumbnailLink || null,
        takenAt: exif.takenAt || null,
        fileCreatedAt: fileCreatedAt,
        latitude: exif.latitude,
        longitude: exif.longitude,
        city,
        state,
        country,
        venueName,
        venueDetectionMethod,
        venueConfidence,
      });
      
      // Mark file as processed
      await db.markFileAsProcessed(userId, fileId, fileName);
      
      return { concertId: null, photoId: null, isNewConcert: false };
    }
    
    // Create photo record
    // Use Google Drive direct download link format for better compatibility
    const directDownloadUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
    
    const photo = await db.createPhoto({
      concertId,
      userId,
      sourceUrl: directDownloadUrl,
      takenAt: exif.takenAt,
      latitude: exif.latitude,
      longitude: exif.longitude,
      filename: fileName,
      mimeType,
      isStarred: false,
    });
    
    // Mark file as processed
    await db.markFileAsProcessed(userId, fileId, fileName);
    
    return { concertId, photoId: photo.id, isNewConcert };
  } catch (error) {
    console.error(`Error processing photo ${fileName}:`, error);
    return { concertId: null, photoId: null, isNewConcert: false };
  }
}

/**
 * Scan Google Drive folder and ingest photos
 */
export async function scanAndIngestPhotos(userId: number): Promise<{
  processed: number;
  linked: number;
  skipped: number;
  newConcerts: number;
  unmatched: number;
}> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID not configured");
  }
  
  const stats = {
    processed: 0,
    linked: 0,
    skipped: 0,
    newConcerts: 0,
    unmatched: 0,
  };
  
  try {
    // List all files from Drive
    const allFiles = await listPhotosFromDrive(folderId);
    
    console.log(`Found ${allFiles.length} files in Google Drive`);
    
    // Separate photos from JSON metadata files and video files (include DNG files)
    const jsonFiles = allFiles.filter(f => f.name?.endsWith('.supplemental-metadata.json'));
    const videoFiles = allFiles.filter(f => {
      const name = f.name?.toLowerCase();
      return name?.endsWith('.mp4') || name?.endsWith('.mov');
    });
    const photoFiles = allFiles.filter(f => {
      const name = f.name?.toLowerCase();
      return !f.name?.endsWith('.json') && 
             !name?.endsWith('.mp4') && 
             !name?.endsWith('.mov');
    });
    
    const dngCount = photoFiles.filter(f => f.name?.toLowerCase().endsWith('.dng')).length;
    console.log(`${photoFiles.length} photos (including ${dngCount} DNG files), ${jsonFiles.length} JSON metadata files, ${videoFiles.length} videos (ignored)`);
    
    // Create a map of photo names to their JSON metadata files
    const metadataMap = new Map<string, any>();
    for (const jsonFile of jsonFiles) {
      // Extract base photo name from JSON filename
      // e.g., "IMG_8177.DNG.supplemental-metadata.json" -> "IMG_8177.DNG"
      const photoName = jsonFile.name?.replace('.supplemental-metadata.json', '');
      if (photoName) {
        metadataMap.set(photoName, jsonFile);
      }
    }
    
    // Get list of already-processed file IDs for this user
    const processedFileIds = await db.getProcessedFileIds(userId);
    console.log(`${processedFileIds.size} files already processed`);
    
    // Filter out already-processed files
    const unprocessedFiles = photoFiles.filter(f => !processedFileIds.has(f.id || ''));
    console.log(`${unprocessedFiles.length} new files to process`);
    
    // Limit to 50 photos per scan to prevent timeouts
    const batchSize = 50;
    const filesToProcess = unprocessedFiles.slice(0, batchSize);
    
    console.log(`Processing ${filesToProcess.length} photos (batch size: ${batchSize})`);
    
    // Clear any stale progress from previous scans, then initialize fresh progress
    clearScanProgress(userId);
    initScanProgress(userId, filesToProcess.length);
    console.log(`Initialized scan progress for user ${userId} with ${filesToProcess.length} files`);
    
    // If no files to process, complete immediately
    if (filesToProcess.length === 0) {
      completeScanProgress(userId);
      return stats;
    }
    
    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      
      // Update progress
      updateScanProgress(userId, {
        currentPhoto: i + 1,
        currentFileName: file.name,
        processed: stats.processed,
        linked: stats.linked,
        skipped: stats.skipped,
        newConcerts: stats.newConcerts,
        unmatched: stats.unmatched,
      });
      
      // Check if this photo has a corresponding JSON metadata file
      const jsonMetadataFile = metadataMap.get(file.name!);
      if (!jsonMetadataFile) {
        console.warn(`No JSON metadata found for ${file.name}, skipping`);
        stats.skipped++;
        // Mark as processed so we don't try to process it again on next scan
        await db.markFileAsProcessed(userId, file.id!, file.name!);
        continue;
      }
      stats.processed++;
      
      const result = await processPhoto(
        userId,
        file.id!,
        file.name!,
        file.mimeType!,
        file.webViewLink!,
        file.thumbnailLink || undefined, // Pass thumbnail URL for preview
        jsonMetadataFile.id! // Pass JSON metadata file ID
      );
      
      if (result.photoId) {
        stats.linked++;
      } else {
        stats.skipped++;
        stats.unmatched++;
      }
      
      if (result.isNewConcert) {
        stats.newConcerts++;
      }
    }
    
    // Complete progress tracking
    completeScanProgress(userId);
    
    // Notify owner of results
    if (stats.linked > 0 || stats.unmatched > 0) {
      await notifyOwner({
        title: "Photo Ingestion Complete",
        content: `Processed ${stats.processed} photos: ${stats.linked} linked to concerts, ${stats.newConcerts} new concerts detected, ${stats.unmatched} unmatched photos saved for review.`,
      });
    }
    
    return stats;
  } catch (error) {
    // Complete progress tracking on error
    completeScanProgress(userId);
    console.error("Error scanning Google Drive:", error);
    throw error;
  }
}

/**
 * Trigger manual photo scan for a user
 */
export async function triggerPhotoScan(userId: number) {
  console.log(`Starting photo scan for user ${userId}`);
  
  try {
    const stats = await scanAndIngestPhotos(userId);
    return stats;
  } catch (error) {
    console.error("Photo scan failed:", error);
    throw error;
  }
}
