import axios from "axios";
import { isFuzzyVenueMatch } from "./fuzzyMatch";
import { calculateDistance } from "./gpsUtils";
import { google } from "googleapis";

/**
 * Setlist.fm API Integration
 * Docs: https://api.setlist.fm/docs/1.0/index.html
 */

/**
 * Find nearby venues using GPS coordinates
 * Uses Google Places nearbysearch to find actual event venues
 * Prioritizes places with venue-related types/categories
 * Returns venue name and detection metadata
 */
export async function findNearbyVenue(
  latitude: string,
  longitude: string
): Promise<{ name: string; method: string; confidence: string } | null> {
  try {
    const { findBestOSMVenue } = await import("./osmVenueDetection");
    
    console.log(`[Venue Detection] Finding OSM venues near: ${latitude}, ${longitude}`);
    
    // Use OpenStreetMap tag-based filtering
    const venue = await findBestOSMVenue(latitude, longitude);
    
    if (!venue) {
      console.log('[Venue Detection] No OSM venues found with matching tags');
      return null;
    }
    
    console.log(`[Venue Detection] Found OSM venue: ${venue.name} (method: ${venue.method}, confidence: ${venue.confidence})`);
    return venue;
  } catch (error: any) {
    console.error("Venue lookup error:", error.message);
    return null;
  }
}

/**
 * Reverse geocode GPS coordinates to get location information
 */
export async function reverseGeocode(
  latitude: string,
  longitude: string
): Promise<{ city: string; state: string | null; country: string } | null> {
  try {
    const response = await axios.get("http://api.openweathermap.org/geo/1.0/reverse", {
      params: {
        lat: latitude,
        lon: longitude,
        limit: 1,
        appid: process.env.OPENWEATHER_API_KEY,
      },
    });

    const location = response.data[0];
    if (!location) {
      return null;
    }

    return {
      city: location.name,
      state: location.state || null,
      country: location.country,
    };
  } catch (error: any) {
    console.error("Reverse geocoding error:", error.message);
    return null;
  }
}

/**
 * Search setlist.fm for concerts by date and GPS location
 * This finds concerts that happened on a specific date near GPS coordinates
 */
export async function searchSetlistsByDateAndLocation(
  date: Date,
  latitude: string,
  longitude: string,
  venueName?: string
): Promise<any> {
  const apiKey = process.env.SETLISTFM_API_KEY;
  if (!apiKey) {
    throw new Error("SETLISTFM_API_KEY not configured");
  }

  // Setlist.fm requires DD-MM-YYYY format
  // IMPORTANT: Photos taken at night (e.g., 11 PM local) are stored as next day UTC
  // We need to convert to local date by subtracting timezone offset
  // Use a heuristic: subtract 12 hours to get the local calendar date
  // This works for most US timezones (Pacific UTC-7/8, Eastern UTC-4/5)
  const localDate = new Date(date.getTime() - (12 * 60 * 60 * 1000));
  const day = String(localDate.getUTCDate()).padStart(2, '0');
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const year = localDate.getUTCFullYear();
  const dateStr = `${day}-${month}-${year}`;

  try {
    // First, try to find venue by coordinates using OpenWeather reverse geocoding
    const geoResponse = await axios.get("http://api.openweathermap.org/geo/1.0/reverse", {
      params: {
        lat: latitude,
        lon: longitude,
        limit: 1,
        appid: process.env.OPENWEATHER_API_KEY,
      },
    });

    const location = geoResponse.data[0];
    if (!location) {
      throw new Error("Could not find location for coordinates");
    }

    const cityName = location.name;
    
    // Always search by city + date, then filter by venue name with fuzzy matching
    // This is more reliable than searching by venue name (which requires exact match)
    const searchParams: any = {
      date: dateStr,
      cityName: cityName,
      p: 1,
    };
    
    console.log(`Searching setlists for ${dateStr} in city: ${cityName}${venueName ? ` (will filter for venue: ${venueName})` : ''}`);

    // Search setlist.fm by date and venue (or city if venue not available)
    const response = await axios.get("https://api.setlist.fm/rest/1.0/search/setlists", {
      headers: {
        "x-api-key": apiKey,
        Accept: "application/json",
      },
      params: searchParams,
    });

    const photoLat = parseFloat(latitude);
    const photoLon = parseFloat(longitude);
    const MAX_DISTANCE_MILES = 50; // Only accept concerts within 50 miles of photo location

    // Filter setlists by distance from photo GPS coordinates AND venue name (if provided)
    const filteredSetlists = (response.data.setlist || []).filter((setlist: any) => {
      // Check if venue has GPS coordinates
      const venueLat = setlist.venue?.city?.coords?.lat;
      const venueLon = setlist.venue?.city?.coords?.long;
      
      if (!venueLat || !venueLon) {
        console.log(`[Location Filter] Skipping ${setlist.artist?.name} - no venue GPS coordinates`);
        return false; // Skip if no GPS data
      }
      
      const distance = calculateDistance(photoLat, photoLon, venueLat, venueLon);
      const withinRange = distance <= MAX_DISTANCE_MILES;
      
      // If venue name provided, also check fuzzy match
      let venueMatch = true;
      if (venueName && setlist.venue?.name) {
        venueMatch = isFuzzyVenueMatch(venueName, setlist.venue.name, 70);
        if (!venueMatch) {
          console.log(`[Venue Filter] ${setlist.artist?.name} at ${setlist.venue.name}: No fuzzy match with "${venueName}"`);
        }
      }
      
      const accepted = withinRange && venueMatch;
      console.log(`[Location Filter] ${setlist.artist?.name} at ${setlist.venue?.name}: ${distance.toFixed(1)} miles ${accepted ? '✓' : '✗'}`);
      
      return accepted;
    });

    console.log(`[Location Filter] ${filteredSetlists.length}/${response.data.setlist?.length || 0} concerts within ${MAX_DISTANCE_MILES} miles`);

    return {
      setlists: filteredSetlists,
      city: cityName,
      country: location.country,
    };
  } catch (error: any) {
    console.error("Setlist.fm search error:", error.response?.data || error.message);
    return { setlists: [], city: null, country: null };
  }
}

/**
 * Search setlist.fm by city name + date, then filter by venue name with fuzzy matching
 * This is the fallback when GPS coordinates are not available
 */
export async function searchSetlistsByDateAndCity(
  date: Date,
  cityName: string,
  venueName?: string
): Promise<any> {
  const apiKey = process.env.SETLISTFM_API_KEY;
  if (!apiKey) {
    throw new Error("SETLISTFM_API_KEY not configured");
  }

  // Setlist.fm requires DD-MM-YYYY format
  // IMPORTANT: Photos taken at night (e.g., 11 PM local) are stored as next day UTC
  // We need to convert to local date by subtracting timezone offset
  // Use a heuristic: subtract 12 hours to get the local calendar date
  // This works for most US timezones (Pacific UTC-7/8, Eastern UTC-4/5)
  const localDate = new Date(date.getTime() - (12 * 60 * 60 * 1000));
  const day = String(localDate.getUTCDate()).padStart(2, '0');
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const year = localDate.getUTCFullYear();
  const dateStr = `${day}-${month}-${year}`;

  try {
    console.log(`[Setlist.fm City Search] Searching for ${dateStr} in city: ${cityName}${venueName ? ` (will filter for venue: ${venueName})` : ''}`);

    // Search setlist.fm by date and city
    const response = await axios.get("https://api.setlist.fm/rest/1.0/search/setlists", {
      headers: {
        "x-api-key": apiKey,
        Accept: "application/json",
      },
      params: {
        date: dateStr,
        cityName: cityName,
        p: 1,
      },
    });

    const setlists = response.data.setlist || [];
    console.log(`[Setlist.fm City Search] Found ${setlists.length} setlist(s) in ${cityName}`);

    // If venue name provided, filter by fuzzy venue matching
    if (venueName && setlists.length > 0) {
      const matchingSetlists = setlists.filter((setlist: any) => {
        const setlistVenueName = setlist.venue?.name;
        if (!setlistVenueName) {
          console.log(`[Venue Filter] Skipping setlist - no venue name`);
          return false;
        }
        
        const isMatch = isFuzzyVenueMatch(venueName, setlistVenueName, 70);
        console.log(`[Venue Filter] "${venueName}" vs "${setlistVenueName}": ${isMatch ? '✓ Match' : '✗ No match'}`);
        return isMatch;
      });

      console.log(`[Venue Filter] ${matchingSetlists.length}/${setlists.length} setlists matched venue`);

      if (matchingSetlists.length > 0) {
        console.log(`[Setlist.fm City Search] Returning: ${matchingSetlists[0].artist?.name} at ${matchingSetlists[0].venue?.name}`);
        return matchingSetlists[0];
      }
    } else if (setlists.length > 0) {
      // No venue filter, return first result
      console.log(`[Setlist.fm City Search] Returning: ${setlists[0].artist?.name} at ${setlists[0].venue?.name}`);
      return setlists[0];
    }
    
    console.log(`[Setlist.fm City Search] No matching setlists found`);
    return null;
  } catch (error: any) {
    console.error("Setlist.fm city search error:", error.response?.data || error.message);
    return null;
  }
}

/**
 * Fetch setlist from setlist.fm by artist name and date only
 * Returns the first matching setlist with venue information
 * If GPS coordinates provided, filters results to within 50 miles
 */
export async function fetchSetlistByArtistAndDate(
  artistName: string,
  date: Date,
  latitude?: string,
  longitude?: string
): Promise<any> {
  const apiKey = process.env.SETLISTFM_API_KEY;
  if (!apiKey) {
    throw new Error("SETLISTFM_API_KEY not configured");
  }

  // Setlist.fm requires DD-MM-YYYY format
  // IMPORTANT: Photos taken at night (e.g., 11 PM local) are stored as next day UTC
  // We need to convert to local date by subtracting timezone offset
  // Use a heuristic: subtract 12 hours to get the local calendar date
  // This works for most US timezones (Pacific UTC-7/8, Eastern UTC-4/5)
  const localDate = new Date(date.getTime() - (12 * 60 * 60 * 1000));
  const day = String(localDate.getUTCDate()).padStart(2, '0');
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const year = localDate.getUTCFullYear();
  const dateStr = `${day}-${month}-${year}`;

  try {
    console.log(`[Setlist.fm] Searching for artist: "${artistName}", date: ${dateStr}`);
    const response = await axios.get("https://api.setlist.fm/rest/1.0/search/setlists", {
      headers: {
        "x-api-key": apiKey,
        Accept: "application/json",
      },
      params: {
        artistName,
        date: dateStr,
        p: 1,
      },
    });

    console.log(`[Setlist.fm] Found ${response.data.setlist?.length || 0} setlist(s)`);

    // If GPS coordinates provided, filter by distance
    let setlists = response.data?.setlist || [];
    if (latitude && longitude && setlists.length > 0) {
      const photoLat = parseFloat(latitude);
      const photoLon = parseFloat(longitude);
      const MAX_DISTANCE_MILES = 50;

      setlists = setlists.filter((setlist: any) => {
        const venueLat = setlist.venue?.city?.coords?.lat;
        const venueLon = setlist.venue?.city?.coords?.long;
        
        if (!venueLat || !venueLon) {
          console.log(`[Location Filter] Skipping ${setlist.venue?.name} - no GPS coordinates`);
          return false;
        }
        
        const distance = calculateDistance(photoLat, photoLon, venueLat, venueLon);
        const withinRange = distance <= MAX_DISTANCE_MILES;
        
        console.log(`[Location Filter] ${setlist.venue?.name} (${setlist.venue?.city?.name}, ${setlist.venue?.city?.state || setlist.venue?.city?.country?.code}): ${distance.toFixed(1)} miles ${withinRange ? '✓' : '✗ (too far)'}`);
        
        return withinRange;
      });

      console.log(`[Location Filter] ${setlists.length}/${response.data.setlist?.length || 0} concerts within ${MAX_DISTANCE_MILES} miles`);
    }

    // Return the first (closest) setlist with full venue information
    if (setlists.length > 0) {
      console.log(`[Setlist.fm] Returning: ${setlists[0].artist?.name} at ${setlists[0].venue?.name}`);
      return setlists[0];
    }
    console.log(`[Setlist.fm] No matching setlists found`);
    return null;
  } catch (error: any) {
    console.error("[Setlist.fm] API error:", error.response?.data || error.message);
    return null;
  }
}

export async function fetchSetlistByDateAndVenue(
  artistName: string,
  venueName: string,
  date: Date
): Promise<any> {
  const apiKey = process.env.SETLISTFM_API_KEY;
  if (!apiKey) {
    throw new Error("SETLISTFM_API_KEY not configured");
  }

  // Setlist.fm requires DD-MM-YYYY format
  // IMPORTANT: Photos taken at night (e.g., 11 PM local) are stored as next day UTC
  // We need to convert to local date by subtracting timezone offset
  // Use a heuristic: subtract 12 hours to get the local calendar date
  // This works for most US timezones (Pacific UTC-7/8, Eastern UTC-4/5)
  const localDate = new Date(date.getTime() - (12 * 60 * 60 * 1000));
  const day = String(localDate.getUTCDate()).padStart(2, '0');
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const year = localDate.getUTCFullYear();
  const dateStr = `${day}-${month}-${year}`;

  try {
    console.log(`[Setlist.fm] Searching for artist: "${artistName}", date: ${dateStr}, venue: "${venueName}"`);
    
    // Search by artist + date, then filter by venue with fuzzy matching
    const response = await axios.get("https://api.setlist.fm/rest/1.0/search/setlists", {
      headers: {
        "x-api-key": apiKey,
        Accept: "application/json",
      },
      params: {
        artistName,
        date: dateStr,
        p: 1,
      },
    });

    console.log(`[Setlist.fm] Found ${response.data.setlist?.length || 0} setlist(s)`);

    // Filter by venue name using fuzzy matching
    const setlists = response.data?.setlist || [];
    const matchingSetlists = setlists.filter((setlist: any) => {
      const setlistVenueName = setlist.venue?.name;
      if (!setlistVenueName) {
        console.log(`[Venue Filter] Skipping setlist - no venue name`);
        return false;
      }
      
      const isMatch = isFuzzyVenueMatch(venueName, setlistVenueName, 70);
      console.log(`[Venue Filter] "${venueName}" vs "${setlistVenueName}": ${isMatch ? '✓ Match' : '✗ No match'}`);
      return isMatch;
    });

    console.log(`[Venue Filter] ${matchingSetlists.length}/${setlists.length} setlists matched venue`);

    if (matchingSetlists.length > 0) {
      console.log(`[Setlist.fm] Returning: ${matchingSetlists[0].artist?.name} at ${matchingSetlists[0].venue?.name}`);
      return matchingSetlists[0];
    }
    
    console.log(`[Setlist.fm] No matching setlists found for venue "${venueName}"`);
    return null;
  } catch (error: any) {
    console.error("Setlist.fm API error:", error.response?.data || error.message);
    return null; // Return null instead of throwing to allow graceful fallback
  }
}

/**
 * OpenWeather API Integration
 * Using Current Weather API (free tier) instead of historical data
 * Docs: https://openweathermap.org/current
 */
export async function fetchCurrentWeather(
  latitude: string,
  longitude: string
): Promise<any> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENWEATHER_API_KEY not configured");
  }

  try {
    const response = await axios.get("https://api.openweathermap.org/data/2.5/weather", {
      params: {
        lat: latitude,
        lon: longitude,
        appid: apiKey,
        units: "imperial", // Fahrenheit
      },
    });

    return response.data;
  } catch (error: any) {
    console.error("OpenWeather API error:", error.response?.data || error.message);
    throw new Error(`Failed to fetch weather: ${error.message}`);
  }
}

/**
 * Google Drive API Integration
 * Docs: https://developers.google.com/drive/api/v3/reference
 */
export async function initGoogleDrive() {
  const credentials = process.env.GOOGLE_DRIVE_CREDENTIALS;
  if (!credentials) {
    throw new Error("GOOGLE_DRIVE_CREDENTIALS not configured");
  }

  try {
    const credentialsObj = JSON.parse(credentials);
    
    // Check if it's a service account or OAuth credentials
    if (credentialsObj.type === "service_account") {
      // Fix private key format
      if (credentialsObj.private_key) {
        let key = credentialsObj.private_key;
        // Replace escaped newlines with actual newlines
        key = key.replace(/\\n/g, '\n');
        // Fix missing spaces in BEGIN/END markers
        key = key.replace(/-----BEGINPRIVATEKEY-----/g, '-----BEGIN PRIVATE KEY-----');
        key = key.replace(/-----ENDPRIVATEKEY-----/g, '-----END PRIVATE KEY-----');
        key = key.replace(/-----BEGINRSAPRIVATEKEY-----/g, '-----BEGIN RSA PRIVATE KEY-----');
        key = key.replace(/-----ENDRSAPRIVATEKEY-----/g, '-----END RSA PRIVATE KEY-----');
        credentialsObj.private_key = key;
      }
      
      const auth = new google.auth.GoogleAuth({
        credentials: credentialsObj,
        scopes: ["https://www.googleapis.com/auth/drive.readonly"],
      });

      return google.drive({ version: "v3", auth });
    } else {
      // OAuth credentials
      const oauth2Client = new google.auth.OAuth2(
        credentialsObj.client_id,
        credentialsObj.client_secret,
        credentialsObj.redirect_uris?.[0]
      );

      if (credentialsObj.refresh_token) {
        oauth2Client.setCredentials({
          refresh_token: credentialsObj.refresh_token,
        });
      }

      return google.drive({ version: "v3", auth: oauth2Client });
    }
  } catch (error: any) {
    console.error("Google Drive initialization error:", error.message);
    throw new Error(`Failed to initialize Google Drive: ${error.message}`);
  }
}

/**
 * Get Google Auth client (reusable helper)
 */
export async function getGoogleAuth() {
  const credentials = process.env.GOOGLE_DRIVE_CREDENTIALS;
  if (!credentials) {
    throw new Error("GOOGLE_DRIVE_CREDENTIALS not configured");
  }

  const credentialsObj = JSON.parse(credentials);
  
  // Fix private key format
  if (credentialsObj.private_key) {
    let key = credentialsObj.private_key;
    key = key.replace(/\\n/g, '\n');
    key = key.replace(/-----BEGINPRIVATEKEY-----/g, '-----BEGIN PRIVATE KEY-----');
    key = key.replace(/-----ENDPRIVATEKEY-----/g, '-----END PRIVATE KEY-----');
    key = key.replace(/-----BEGINRSAPRIVATEKEY-----/g, '-----BEGIN RSA PRIVATE KEY-----');
    key = key.replace(/-----ENDRSAPRIVATEKEY-----/g, '-----END RSA PRIVATE KEY-----');
    credentialsObj.private_key = key;
  }
  
  const auth = new google.auth.GoogleAuth({
    credentials: credentialsObj,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  return auth;
}

/**
 * Get file content as text (for JSON files)
 */
export async function getFileContent(fileId: string): Promise<string> {
  const auth = await getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });
  
  const response = await drive.files.get(
    {
      fileId,
      alt: 'media',
    },
    { responseType: 'text' }
  );
  
  return response.data as string;
}

export async function listPhotosFromDrive(folderId: string) {
  const drive = await initGoogleDrive();
  const allFiles: any[] = [];

  try {
    let pageToken: string | undefined = undefined;
    let pageCount = 0;
    
    do {
      pageCount++;
      console.log(`[Google Drive] Fetching page ${pageCount}${pageToken ? ` (token: ${pageToken.substring(0, 20)}...)` : ''}`);
      
      const response: any = await drive.files.list({
        q: `'${folderId}' in parents and (mimeType contains 'image/' or name contains '.jpg' or name contains '.jpeg' or name contains '.png' or name contains '.heic' or name contains '.HEIC' or name contains '.json' or name contains '.DNG' or name contains '.dng')`,
        fields: "nextPageToken, files(id, name, mimeType, createdTime, modifiedTime, webContentLink, webViewLink)",
        pageSize: 50,
        orderBy: 'createdTime',  // Sort by creation date, oldest first
        pageToken,
      });

      const files = response.data.files || [];
      console.log(`[Google Drive] Page ${pageCount}: found ${files.length} files`);
      allFiles.push(...files);
      
      pageToken = response.data.nextPageToken;
    } while (pageToken);
    
    console.log(`[Google Drive] Total files found: ${allFiles.length} across ${pageCount} page(s)`);
    return allFiles;
  } catch (error: any) {
    console.error("Google Drive list error:", error.message);
    throw new Error(`Failed to list photos from Drive: ${error.message}`);
  }
}

export async function getPhotoMetadata(fileId: string) {
  const drive = await initGoogleDrive();

  try {
    const response = await drive.files.get({
      fileId,
      fields: "id, name, mimeType, imageMediaMetadata, createdTime, webContentLink, webViewLink",
    });

    return response.data;
  } catch (error: any) {
    console.error("Google Drive metadata error:", error.message);
    throw new Error(`Failed to get photo metadata: ${error.message}`);
  }
}

export async function downloadPhotoFromDrive(fileId: string): Promise<Buffer> {
  const drive = await initGoogleDrive();

  try {
    const response = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );

    return Buffer.from(response.data as ArrayBuffer);
  } catch (error: any) {
    console.error("Google Drive download error:", error.message);
    throw new Error(`Failed to download photo: ${error.message}`);
  }
}
