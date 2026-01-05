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
import { initScanProgress, updateScanProgress, completeScanProgress, clearScanProgress, saveLastScanResult } from "./scanProgress";

interface EXIFData { takenAt?: Date; latitude?: string; longitude?: string; }

interface PhotoWithEXIF {
  fileId: string;
  fileName: string;
  mimeType: string;
  webViewLink: string;
  thumbnailLink?: string;
  jsonMetadataFileId?: string;
  exif: EXIFData;
  fileCreatedAt?: Date;
}

interface PhotoGroup {
  dateKey: string;  // YYYY-MM-DD
  locationKey: string;  // lat,lng rounded to 3 decimals (~100m precision)
  photos: PhotoWithEXIF[];
  // Cached API results for the group
  locationData?: { city: string; state: string | null; country: string } | null;
  detectedVenue?: string | null;  // Venue name detected from OSM
  venueDetectionDone?: boolean;
  concertResult?: { id: number; artist: string; venue: string } | null;
  concertSearchDone?: boolean;
  matchedConcertId?: number | null;  // Cache the matched concert ID for all photos in this group
  isNewConcert?: boolean;  // Track if this is a newly created concert
}

/**
 * Generate a location key for grouping photos (rounds to ~100m precision)
 */
function getLocationKey(latitude?: string, longitude?: string): string {
  if (!latitude || !longitude) return "no-gps";
  const lat = parseFloat(latitude).toFixed(3);
  const lng = parseFloat(longitude).toFixed(3);
  return `${lat},${lng}`;
}

/**
 * Adjust date for late-night concerts (00:00-04:00 treated as previous day)
 */
export function adjustDateForMidnight(date: Date): Date {
  const hours = date.getHours();

  // If photo taken between midnight and 4am, treat as previous day's concert
  if (hours >= 0 && hours < 4) {
    return new Date(date.getTime() - (24 * 60 * 60 * 1000));
  }

  return date;
}

/**
 * Generate a date key for grouping photos (YYYY-MM-DD in local time)
 * Handles late-night concerts: photos taken 00:00-04:00 are grouped with previous day
 */
function getDateKey(date: Date): string {
  const adjustedDate = adjustDateForMidnight(date);
  return adjustedDate.toISOString().split('T')[0];
}

/**
 * Extract EXIF from JSON metadata file
 */
function extractEXIFFromJSON(jsonData: any): EXIFData {
  const exif: EXIFData = {};
  try {
    if (jsonData.photoTakenTime?.timestamp) {
      exif.takenAt = new Date(parseInt(jsonData.photoTakenTime.timestamp) * 1000);
    }
    if (jsonData.geoData) {
      exif.latitude = jsonData.geoData.latitude?.toString();
      exif.longitude = jsonData.geoData.longitude?.toString();
    }
  } catch (e) {}
  return exif;
}

/**
 * Extract EXIF from Drive metadata
 */
export function extractEXIFData(metadata: any): EXIFData {
  const imageMetadata = metadata.imageMediaMetadata;
  if (!imageMetadata) return {};
  const exif: EXIFData = {};
  if (imageMetadata.time) exif.takenAt = new Date(imageMetadata.time);
  if (imageMetadata.location) {
    exif.latitude = imageMetadata.location.latitude?.toString();
    exif.longitude = imageMetadata.location.longitude?.toString();
  }
  return exif;
}

/**
 * Auto-detect concert from photo EXIF data using setlist.fm
 * Returns cached result if already searched for this group
 */
async function autoDetectConcert(
  userId: number,
  date: Date,
  latitude: string,
  longitude: string,
  detectedVenueName?: string | null
): Promise<{ id: number; artist: string; venue: string } | null> {
  try {
    // STEP 1: Check user's existing concerts FIRST before going to setlist.fm
    console.log(`[Concert Matching] Checking user's database for existing concerts near GPS coordinates...`);

    const nearbyVenues = await db.findVenuesNearCoordinates(latitude, longitude, 1.24); // 2000m = ~1.24 miles

    if (nearbyVenues.length > 0) {
      console.log(`[Concert Matching] Found ${nearbyVenues.length} venues in database within 2000m`);

      // Check each venue for a concert on this date
      for (const venue of nearbyVenues) {
        const existingConcert = await db.findConcert(userId, venue.id, date);

        if (existingConcert) {
          // Found an existing concert at this venue on this date!
          const artist = await db.getArtistById(existingConcert.artistId);
          const venueInfo = await db.getVenueById(existingConcert.venueId);

          console.log(`[Concert Matching] ✓ FOUND EXISTING CONCERT: ${artist?.name} at ${venueInfo?.name} (ID: ${existingConcert.id})`);
          console.log(`[Concert Matching] Skipping setlist.fm search - linking photo to existing concert`);

          return {
            id: existingConcert.id,
            artist: artist?.name || 'Unknown',
            venue: venueInfo?.name || 'Unknown',
          };
        }
      }

      console.log(`[Concert Matching] No existing concerts found at nearby venues for this date`);
    } else {
      console.log(`[Concert Matching] No venues in database near GPS coordinates`);
    }

    // STEP 2: No existing concert found - search setlist.fm for new concerts
    // SAFETY CHECK: If OSM failed to detect a venue, don't auto-match
    // Without a venue name, we can't reliably match concerts (could match wrong venue/date)
    if (!detectedVenueName) {
      console.log(`[Concert Matching] ⚠️  No venue detected by OSM - skipping auto-match to prevent false positives`);
      console.log(`[Concert Matching] → Sending to manual review for user verification`);
      return null;
    }

    console.log(`[Concert Matching] Searching setlist.fm for new concerts...`);
    const result = await searchSetlistsByDateAndLocation(date, latitude, longitude, detectedVenueName);
    if (!result.setlists || result.setlists.length === 0) return null;

    // If multiple setlists found on same date/venue, try to pick the headliner
    let setlist = result.setlists[0];
    if (result.setlists.length > 1) {
      console.log(`[Concert Matching] Found ${result.setlists.length} shows on same date/venue:`);

      // Get song counts for each setlist
      const setlistsWithInfo = result.setlists.map((s: any) => {
        const songCount = s.sets?.set?.reduce((total: number, set: any) => total + (set.song?.length || 0), 0) || 0;
        const tourInfo = s.tour?.name ? ` (Tour: ${s.tour.name})` : '';
        return { setlist: s, songCount, tourInfo };
      });

      setlistsWithInfo.forEach((info: any, idx: number) => {
        console.log(`  ${idx + 1}. ${info.setlist.artist?.name} - ${info.songCount} songs${info.tourInfo}`);
      });

      // Strategy: Use photo timestamp to differentiate opener vs headliner
      const photoHour = date.getHours();
      const photoTime = `${photoHour}:${String(date.getMinutes()).padStart(2, '0')}`;
      console.log(`[Concert Matching] Photo timestamp: ${photoTime}`);

      // Sort by song count (descending - longest first)
      const sortedByLength = [...setlistsWithInfo].sort((a, b) => b.songCount - a.songCount);

      let selected;
      if (photoHour < 20 || (photoHour === 20 && date.getMinutes() < 30)) {
        // Before 8:30pm - likely an opening act
        // Pick the setlist with FEWER songs (opener plays first with shorter set)
        selected = sortedByLength[sortedByLength.length - 1]; // Last one (shortest)
        console.log(`[Concert Matching] Early show time (${photoTime}) - selecting opener: ${selected.setlist.artist?.name} (${selected.songCount} songs)`);
      } else {
        // After 8:30pm - likely the headliner
        // Pick the setlist with MORE songs (headliner plays last with longer set)
        selected = sortedByLength[0]; // First one (longest)
        console.log(`[Concert Matching] Late show time (${photoTime}) - selecting headliner: ${selected.setlist.artist?.name} (${selected.songCount} songs)`);
      }

      setlist = selected.setlist;
    }

    const artistName = setlist.artist?.name;
    const venueName = setlist.venue?.name;
    const cityName = setlist.venue?.city?.name || result.city;
    const countryCode = setlist.venue?.city?.country?.code || result.country;

    if (!artistName || !venueName || !cityName) return null;

    let concertDate = date;
    if (setlist.eventDate) {
      const [day, month, year] = setlist.eventDate.split('-').map(Number);
      concertDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    }

    // Find or create artist
    let artist = await db.findArtistByName(artistName);
    if (!artist) {
      artist = await db.createArtist({ name: artistName, mbid: setlist.artist?.mbid });
    }

    // Find or create venue
    let venue = await db.findVenueByNameAndCity(venueName, cityName);
    if (!venue) {
      venue = await db.createVenue({
        name: venueName,
        city: cityName,
        country: countryCode || "Unknown",
        latitude,
        longitude,
      });
    }

    // Check if concert already exists for this user, venue, and date
    let concert = await db.findConcert(userId, venue.id, concertDate);
    const isNewConcert = !concert;

    if (!concert) {
      // Concert doesn't exist, create it
      let weatherData = null;
      try { weatherData = await fetchCurrentWeather(latitude, longitude); } catch (e) {}

      concert = await db.createConcert({
        userId,
        artistId: artist.id,
        venueId: venue.id,
        concertDate,
        weatherCondition: weatherData?.weather?.[0]?.description,
        temperature: weatherData?.main?.temp,
        setlistFmId: setlist.id || null,
        setlistFmUrl: setlist.url || null,
      });
      console.log(`[PhotoIngestion] Created new concert: ${artistName} at ${venueName} (ID: ${concert.id})`);
    } else {
      console.log(`[PhotoIngestion] Concert already exists: ${artistName} at ${venueName} on ${concertDate.toISOString().split('T')[0]} (ID: ${concert.id})`);
    }

    // Only add setlist if this is a newly created concert
    // (Existing concerts already have their setlists)
    if (isNewConcert && setlist.sets?.set && Array.isArray(setlist.sets.set)) {
      let setNumber = 1;
      for (const set of setlist.sets.set) {
        if (set.song && Array.isArray(set.song)) {
          let position = 1;
          for (const songData of set.song) {
            const song = await db.createSong({ title: songData.name, artistId: artist.id });
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
    return { id: concert.id, artist: artistName, venue: venueName };
  } catch (error: any) {
    console.error("Error auto-detecting concert:", error.message);
    return null;
  }
}

/**
 * Find matching concert from user's existing concerts
 * Uses pre-loaded concerts list for efficiency
 */
function findMatchingConcertFromList(
  concerts: Awaited<ReturnType<typeof db.getUserConcerts>>,
  venueMap: Map<number, Awaited<ReturnType<typeof db.getVenueById>>>,
  takenAt: Date,
  latitude?: string,
  longitude?: string
): number | null {
  const photoTime = takenAt.getTime();
  const eighteenHours = 18 * 60 * 60 * 1000;

  const sameDateConcerts = concerts.filter(concert => {
    const timeDiff = Math.abs(photoTime - new Date(concert.concertDate).getTime());
    return timeDiff <= eighteenHours;
  });

  if (sameDateConcerts.length === 0) return null;

  if (latitude && longitude && sameDateConcerts.length > 1) {
    for (const concert of sameDateConcerts) {
      const venue = venueMap.get(concert.venueId);
      if (venue?.latitude && venue?.longitude) {
        if (Math.abs(parseFloat(venue.latitude) - parseFloat(latitude)) < 0.01 &&
            Math.abs(parseFloat(venue.longitude) - parseFloat(longitude)) < 0.01) {
          return concert.id;
        }
      }
    }
  }
  return sameDateConcerts[0]?.id || null;
}

export async function scanAndIngestPhotos(userId: number, limit?: number): Promise<any> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID not configured");

  const scanStartTime = Date.now();
  const stats = { processed: 0, linked: 0, skipped: 0, newConcerts: 0, unmatched: 0 };
  const concertPhotoCount = new Map<number, { count: number; isNew: boolean }>();

  try {
    // Phase 1: List all files and build metadata map
    const allFiles = await listPhotosFromDrive(folderId);

    // Cache total file count for fast dashboard stats
    await db.updateScanCache(userId, allFiles.length);

    const photoFiles = allFiles.filter(f =>
      !f.name?.endsWith('.json') &&
      !f.name?.toLowerCase().endsWith('.mp4') &&
      !f.name?.toLowerCase().endsWith('.mov')
    );
    const metadataMap = new Map<string, typeof allFiles[0]>();
    allFiles.filter(f => f.name?.endsWith('.json')).forEach(f =>
      metadataMap.set(f.name?.replace('.supplemental-metadata.json', '') || '', f)
    );

    // Get already processed files
    const existingIds = await db.getProcessedPhotoIds(userId);
    const processedFileIds = new Set(Array.isArray(existingIds) ? existingIds : []);
    const unprocessedFiles = photoFiles.filter(f => !processedFileIds.has(f.id || ''));

    // Apply limit
    const filesToProcess = limit ? unprocessedFiles.slice(0, limit) : unprocessedFiles;

    if (filesToProcess.length === 0) {
      return { ...stats, concertsSummary: [] };
    }

    clearScanProgress(userId);
    initScanProgress(userId, filesToProcess.length);

    // Phase 2: Extract EXIF for all files and group by date+location
    console.log(`[PhotoIngestion] Phase 1: Extracting EXIF from ${filesToProcess.length} files...`);
    const photosWithEXIF: PhotoWithEXIF[] = [];

    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      updateScanProgress(userId, { currentPhoto: i + 1, currentFileName: file.name, ...stats });

      const jsonMetadataFile = metadataMap.get(file.name!);
      if (!jsonMetadataFile) {
        stats.skipped++;
        await db.markFileAsProcessed(userId, file.id!, file.name!);
        continue;
      }

      let exif: EXIFData = {};
      let fileCreatedAt: Date | undefined;

      try {
        const jsonContent = await getFileContent(jsonMetadataFile.id!);
        exif = extractEXIFFromJSON(JSON.parse(jsonContent));
      } catch (e) {
        console.error(`Failed to parse JSON metadata for ${file.name}:`, e);
      }

      if (!exif.takenAt) {
        try {
          const metadata = await getPhotoMetadata(file.id!);
          exif = { ...extractEXIFData(metadata), ...exif };
          fileCreatedAt = metadata.createdTime ? new Date(metadata.createdTime) : undefined;
        } catch (e) {
          console.error(`Failed to get Drive metadata for ${file.name}:`, e);
        }
      }

      const photoDate = exif.takenAt || fileCreatedAt;
      if (!photoDate) {
        stats.skipped++;
        await db.markFileAsProcessed(userId, file.id!, file.name!);
        continue;
      }

      photosWithEXIF.push({
        fileId: file.id!,
        fileName: file.name!,
        mimeType: file.mimeType!,
        webViewLink: file.webViewLink!,
        thumbnailLink: file.thumbnailLink || undefined,
        jsonMetadataFileId: jsonMetadataFile.id!,
        exif: { ...exif, takenAt: photoDate },
        fileCreatedAt,
      });
    }

    // Phase 3: Group photos by date + location
    console.log(`[PhotoIngestion] Phase 2: Grouping ${photosWithEXIF.length} photos by date/location...`);
    const groups = new Map<string, PhotoGroup>();

    for (const photo of photosWithEXIF) {
      const dateKey = getDateKey(photo.exif.takenAt!);
      const locationKey = getLocationKey(photo.exif.latitude, photo.exif.longitude);
      const groupKey = `${dateKey}|${locationKey}`;

      let group = groups.get(groupKey);
      if (!group) {
        group = { dateKey, locationKey, photos: [] };
        groups.set(groupKey, group);
      }
      group.photos.push(photo);
    }

    console.log(`[PhotoIngestion] Found ${groups.size} unique date/location groups`);

    // Phase 4: Pre-load user concerts and venues (ONE DB call instead of per-photo)
    const userConcerts = await db.getUserConcerts(userId);
    const venueMap = new Map<number, Awaited<ReturnType<typeof db.getVenueById>>>();
    for (const concert of userConcerts) {
      if (!venueMap.has(concert.venueId)) {
        const venue = await db.getVenueById(concert.venueId);
        if (venue) venueMap.set(concert.venueId, venue);
      }
    }

    // Phase 5: Process each group (batched API calls)
    console.log(`[PhotoIngestion] Phase 3: Processing ${groups.size} groups...`);
    let photoIndex = stats.skipped;

    for (const [groupKey, group] of Array.from(groups.entries())) {
      const firstPhoto = group.photos[0];
      const hasGPS = firstPhoto.exif.latitude && firstPhoto.exif.longitude;

      // ONE reverse geocode per group (if has GPS and might be unmatched)
      if (hasGPS && !group.locationData) {
        try {
          group.locationData = await reverseGeocode(firstPhoto.exif.latitude!, firstPhoto.exif.longitude!);
        } catch (e) {
          console.error(`Failed to reverse geocode for group ${groupKey}:`, e);
          group.locationData = null;
        }
      }

      // ONE venue detection per group (OSM query - batched per date/location)
      if (hasGPS && !group.venueDetectionDone) {
        group.venueDetectionDone = true;
        try {
          console.log(`[PhotoIngestion] Detecting venue for group ${groupKey}...`);

          // Check database cache first
          const cachedVenues = await db.findVenuesNearCoordinates(
            firstPhoto.exif.latitude!,
            firstPhoto.exif.longitude!,
            0.373  // 600 meters
          );

          if (cachedVenues.length > 0) {
            group.detectedVenue = cachedVenues[0].name;
            console.log(`[PhotoIngestion] ✓ Found cached venue: ${group.detectedVenue}`);
          } else {
            // No cached venue, query OSM with setlist.fm validation
            const { findBestOSMVenue } = await import("./osmVenueDetection");
            const bestVenue = await findBestOSMVenue(
              firstPhoto.exif.latitude!,
              firstPhoto.exif.longitude!,
              group.locationData?.city  // Pass city for setlist.fm validation
            );

            if (bestVenue) {
              group.detectedVenue = bestVenue.name;
              console.log(`[PhotoIngestion] ✓ Detected venue: ${group.detectedVenue} (${bestVenue.method}, ${bestVenue.confidence})`);

              // Cache only validated venues to database
              try {
                // Get lat/lon from first photo GPS
                await db.cacheOSMVenue({
                  name: bestVenue.name,
                  altName: bestVenue.altName,
                  latitude: firstPhoto.exif.latitude!,
                  longitude: firstPhoto.exif.longitude!,
                  city: group.locationData?.city || 'Unknown',
                  state: group.locationData?.state,
                  country: group.locationData?.country || 'Unknown',
                });
                const altInfo = bestVenue.altName ? ` [alt: "${bestVenue.altName}"]` : '';
                console.log(`[PhotoIngestion] Cached validated venue to database: ${group.detectedVenue}${altInfo}`);
              } catch (cacheError) {
                console.warn(`[PhotoIngestion] Failed to cache venue:`, cacheError);
              }
            } else {
              group.detectedVenue = null;
              console.log(`[PhotoIngestion] No validated venue found (filtered out non-concert venues)`);
            }
          }
        } catch (e) {
          console.error(`Failed to detect venue for group ${groupKey}:`, e);
          group.detectedVenue = null;
        }
      }

      // Process each photo in the group
      for (const photo of group.photos) {
        photoIndex++;

        // Initial progress update with location info
        updateScanProgress(userId, {
          currentPhoto: photoIndex,
          currentFileName: photo.fileName,
          currentCity: group.locationData?.city,
          currentState: group.locationData?.state,
          currentCountry: group.locationData?.country,
          currentVenue: group.detectedVenue || undefined,
          currentStatus: 'Matching concert...',
          ...stats
        });
        stats.processed++;

        const photoDate = photo.exif.takenAt!;

        // Check if we already matched a concert for this group (batch linking)
        let concertId: number | null = null;
        let isNewConcert = false;

        if (group.matchedConcertId !== undefined) {
          // Use the cached concert match from the first photo in this group
          concertId = group.matchedConcertId;
          isNewConcert = group.isNewConcert || false;
          console.log(`[PhotoIngestion] Batch-linking photo ${photo.fileName} to concert ${concertId} (same event)`);

          // Update progress to show batch linking
          updateScanProgress(userId, {
            currentStatus: 'Linked to same event',
            ...stats
          });
        } else {
          // First photo in group - run matching logic

          // Try to find existing concert match (uses pre-loaded data, no DB call)
          concertId = findMatchingConcertFromList(
            userConcerts,
            venueMap,
            photoDate,
            photo.exif.latitude,
            photo.exif.longitude
          );

          // If no match and has GPS, try auto-detect (ONE API call per group)
          if (!concertId && hasGPS) {
            if (!group.concertSearchDone) {
              group.concertSearchDone = true;
              group.concertResult = await autoDetectConcert(
                userId,
                photoDate,
                firstPhoto.exif.latitude!,
                firstPhoto.exif.longitude!,
                group.detectedVenue  // Pass detected venue name to Setlist.fm search
              );

              if (group.concertResult) {
                // Add new concert to our local cache so subsequent photos match it
                const newConcert = await db.getConcertById(group.concertResult.id);
                if (newConcert) {
                  userConcerts.push(newConcert);
                  const venue = await db.getVenueById(newConcert.venueId);
                  if (venue) venueMap.set(newConcert.venueId, venue);
                }
              }
            }

            if (group.concertResult) {
              concertId = group.concertResult.id;
              isNewConcert = concertId !== null && !concertPhotoCount.has(concertId);
            }
          }

          // If no concert match yet, try proximity-based auto-linking
          if (!concertId && hasGPS) {
            const nearbyConcertId = await db.findNearbyPhotoOnSameDate(
              userId,
              photoDate,
              photo.exif.latitude!,
              photo.exif.longitude!
            );

            if (nearbyConcertId) {
              console.log(`[PhotoIngestion] Auto-linked photo to nearby concert (within 500m): ${photo.fileName}`);
              concertId = nearbyConcertId;
              // Don't count as new concert since it already exists
              isNewConcert = false;

              // Add to local cache if not already present
              if (!userConcerts.find(c => c.id === concertId)) {
                const concert = await db.getConcertById(concertId);
                if (concert) {
                  userConcerts.push(concert);
                  const venue = await db.getVenueById(concert.venueId);
                  if (venue) venueMap.set(concert.venueId, venue);
                }
              }

              // Update progress to show auto-link
              updateScanProgress(userId, {
                currentStatus: 'Auto-linked (nearby photo)',
                ...stats
              });
            }
          }

          // NEW: If no GPS but has date, try to match to concerts on same date
          if (!concertId && !hasGPS && photoDate) {
            const dateKey = getDateKey(photoDate);

            // Find all user's concerts on this date
            const concertsOnDate = userConcerts.filter(c => {
              const concertDateKey = getDateKey(new Date(c.concertDate));
              return concertDateKey === dateKey;
            });

            if (concertsOnDate.length === 1) {
              // Exactly one concert on this date - auto-link!
              concertId = concertsOnDate[0].id;
              isNewConcert = false; // Concert already exists

              const artist = await db.getArtistById(concertsOnDate[0].artistId);
              const venue = venueMap.get(concertsOnDate[0].venueId);
              console.log(`[PhotoIngestion] ✓ Auto-linked no-GPS photo to same-date concert: ${artist?.name} at ${venue?.name} (${photo.fileName})`);

              updateScanProgress(userId, {
                currentStatus: 'Auto-linked (no GPS, same date)',
                currentArtist: artist?.name,
                currentVenue: venue?.name,
                ...stats
              });
            } else if (concertsOnDate.length > 1) {
              console.log(`[PhotoIngestion] No GPS photo on date with ${concertsOnDate.length} concerts - needs manual review`);
            } else {
              console.log(`[PhotoIngestion] No GPS photo with no concerts on this date - needs manual review`);
            }
          }

          // Cache the match result for all subsequent photos in this group
          group.matchedConcertId = concertId;
          group.isNewConcert = isNewConcert;

          if (concertId) {
            console.log(`[PhotoIngestion] Caching concert match for group: concertId=${concertId}, isNew=${isNewConcert}`);
          }
        }

        const directDownloadUrl = `https://drive.google.com/uc?export=view&id=${photo.fileId}`;

        if (!concertId) {
          // Create unmatched photo with cached location data and detected venue
          const noGps = !photo.exif.latitude || !photo.exif.longitude ? 1 : 0;

          await db.createUnmatchedPhoto({
            userId,
            driveFileId: photo.fileId,
            fileName: photo.fileName,
            mimeType: photo.mimeType,
            sourceUrl: directDownloadUrl,
            thumbnailUrl: photo.thumbnailLink || null,
            takenAt: photoDate,
            latitude: photo.exif.latitude,
            longitude: photo.exif.longitude,
            city: group.locationData?.city || null,
            state: group.locationData?.state || null,
            country: group.locationData?.country || null,
            venueName: group.detectedVenue || null,
            venueDetectionMethod: group.detectedVenue ? 'osm_scan' : null,
            venueConfidence: group.detectedVenue ? 'high' : null,
            noGps,
          });
          stats.unmatched++;

          // Update progress with unmatched status
          updateScanProgress(userId, {
            currentStatus: 'Unmatched - needs review',
            ...stats
          });
        } else {
          // Link photo to concert
          const dbPhoto = await db.createPhoto({
            concertId,
            userId,
            sourceUrl: directDownloadUrl,
            takenAt: photoDate,
            latitude: photo.exif.latitude,
            longitude: photo.exif.longitude,
            filename: photo.fileName,
            mimeType: photo.mimeType,
            isStarred: false,
          });

          stats.linked++;
          const existing = concertPhotoCount.get(concertId);
          if (existing) {
            existing.count++;
          } else {
            concertPhotoCount.set(concertId, { count: 1, isNew: isNewConcert });
          }
          if (isNewConcert && !existing) stats.newConcerts++;

          // Update progress with concert details
          const matchedConcert = userConcerts.find(c => c.id === concertId);
          if (matchedConcert) {
            const venue = venueMap.get(matchedConcert.venueId);
            const artist = await db.getArtistById(matchedConcert.artistId);
            updateScanProgress(userId, {
              currentArtist: artist?.name,
              currentVenue: venue?.name,
              currentStatus: isNewConcert ? 'Linked to new concert!' : 'Linked to concert',
              ...stats
            });
          }
        }

        await db.markFileAsProcessed(userId, photo.fileId, photo.fileName);
      }
    }

    completeScanProgress(userId);

    // Save last scan result
    saveLastScanResult(userId, {
      scanType: 'drive',
      completedAt: new Date(),
      totalPhotos: filesToProcess.length,
      processed: stats.processed,
      linked: stats.linked,
      skipped: stats.skipped,
      newConcerts: stats.newConcerts,
      unmatched: stats.unmatched,
      duration: Date.now() - scanStartTime,
    });

    // Build concert summary with artist/venue names
    const concertsSummary = await Promise.all(
      Array.from(concertPhotoCount.entries()).map(async ([concertId, data]) => {
        const concert = await db.getConcertById(concertId);
        const artist = concert?.artistId ? await db.getArtistById(concert.artistId) : null;
        const venue = concert?.venueId ? await db.getVenueById(concert.venueId) : null;
        return {
          concertId,
          artistName: artist?.name || 'Unknown Artist',
          venueName: venue?.name || 'Unknown Venue',
          photoCount: data.count,
          isNew: data.isNew,
        };
      })
    );

    console.log(`[PhotoIngestion] Complete: ${stats.processed} processed, ${stats.linked} linked, ${stats.unmatched} unmatched, ${groups.size} API batches`);
    return { ...stats, concertsSummary };
  } catch (error) {
    completeScanProgress(userId);
    throw error;
  }
}

export async function triggerPhotoScan(userId: number, limit?: number) {
  return await scanAndIngestPhotos(userId, limit);
}
