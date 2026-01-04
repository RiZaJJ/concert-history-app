import axios from "axios";
import { isFuzzyVenueMatch } from "./fuzzyMatch";
import { calculateDistance } from "./gpsUtils";
import { google } from "googleapis";
import { logExternalApi } from "./logger";

/**
 * Setlist.fm API Integration
 * Docs: https://api.setlist.fm/docs/1.0/index.html
 */

// Rate limiting for Setlist.fm API (max 2 requests per second per their docs)
let lastSetlistFmCall = 0;
const SETLISTFM_MIN_DELAY_MS = 500; // 500ms = 2 requests/second

async function setlistFmRateLimit() {
  const now = Date.now();
  const timeSinceLastCall = now - lastSetlistFmCall;

  if (timeSinceLastCall < SETLISTFM_MIN_DELAY_MS) {
    const delayNeeded = SETLISTFM_MIN_DELAY_MS - timeSinceLastCall;
    console.log(`[Setlist.fm Rate Limit] Waiting ${delayNeeded}ms before next API call...`);
    await new Promise(resolve => setTimeout(resolve, delayNeeded));
  }

  lastSetlistFmCall = Date.now();
}

/**
 * Find nearby venues using GPS coordinates
 * Uses OpenStreetMap + setlist.fm validation to find actual event venues
 * Prioritizes venues with setlist.fm concert data over generic places
 * Returns venue name and detection metadata
 */
export async function findNearbyVenue(
  latitude: string,
  longitude: string,
  city?: string
): Promise<{ name: string; method: string; confidence: string } | null> {
  const startTime = Date.now();
  try {
    const { findBestOSMVenue } = await import("./osmVenueDetection");

    console.log(`[Venue Detection] Finding OSM venues near: ${latitude}, ${longitude}${city ? ` in ${city}` : ''}`);

    // Use OpenStreetMap tag-based filtering + setlist.fm validation
    const venue = await findBestOSMVenue(latitude, longitude, city);

    if (!venue) {
      console.log('[Venue Detection] No OSM venues found with matching tags');
      logExternalApi('OpenStreetMap', 'findNearbyVenue', true, `No venues found near ${latitude.slice(0,7)}, ${longitude.slice(0,7)}`, Date.now() - startTime);
      return null;
    }

    console.log(`[Venue Detection] Found OSM venue: ${venue.name} (method: ${venue.method}, confidence: ${venue.confidence})`);
    logExternalApi('OpenStreetMap', 'findNearbyVenue', true, `Found: "${venue.name}" (${venue.confidence})`, Date.now() - startTime);
    return venue;
  } catch (error: any) {
    console.error("Venue lookup error:", error.message);
    logExternalApi('OpenStreetMap', 'findNearbyVenue', false, 'Venue lookup failed', Date.now() - startTime, error.message);
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
  const startTime = Date.now();
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
      logExternalApi('OpenWeather', 'reverseGeocode', true, `No location found for ${latitude.slice(0,7)}, ${longitude.slice(0,7)}`, Date.now() - startTime);
      return null;
    }

    logExternalApi('OpenWeather', 'reverseGeocode', true, `${location.name}, ${location.state || ''} ${location.country}`, Date.now() - startTime);

    // Hard-coded city replacements
    let cityName = location.name;
    const stateName = location.state || null;

    // Paradise, NV is an unincorporated town that contains the Las Vegas Strip
    // For concert venue purposes, treat it as Las Vegas
    if (cityName === 'Paradise' && stateName === 'Nevada') {
      console.log('[Geocode] Converting Paradise, NV -> Las Vegas, NV');
      cityName = 'Las Vegas';
    }

    return {
      city: cityName,
      state: stateName,
      country: location.country,
    };
  } catch (error: any) {
    const statusCode = error.response?.status;
    const errorDetails = error.response?.data || error.message;

    if (statusCode === 429) {
      console.error("[OpenWeather Geocode] ❌ 429 RATE LIMIT EXCEEDED");
      console.error(`[OpenWeather] Response: ${JSON.stringify(errorDetails)}`);
      logExternalApi('OpenWeather', 'reverseGeocode', false, '⚠️ RATE LIMIT EXCEEDED (429)', Date.now() - startTime, `Status: ${statusCode}`);
    } else if (statusCode === 500) {
      console.error("[OpenWeather Geocode] ❌ 500 INTERNAL SERVER ERROR");
      console.error(`[OpenWeather] Response: ${JSON.stringify(errorDetails)}`);
      logExternalApi('OpenWeather', 'reverseGeocode', false, '⚠️ INTERNAL SERVER ERROR (500)', Date.now() - startTime, `Status: ${statusCode}`);
    } else if (statusCode === 504) {
      console.error("[OpenWeather Geocode] ❌ 504 GATEWAY TIMEOUT");
      console.error(`[OpenWeather] Response: ${JSON.stringify(errorDetails)}`);
      logExternalApi('OpenWeather', 'reverseGeocode', false, '⚠️ GATEWAY TIMEOUT (504)', Date.now() - startTime, `Status: ${statusCode}`);
    } else {
      console.error(`[OpenWeather Geocode] Error (${statusCode || 'unknown'}):`, errorDetails);
      logExternalApi('OpenWeather', 'reverseGeocode', false, 'Geocoding failed', Date.now() - startTime, `Status: ${statusCode || 'unknown'}, ${error.message}`);
    }

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
  const startTime = Date.now();
  const apiKey = process.env.SETLISTFM_API_KEY;
  if (!apiKey) {
    throw new Error("SETLISTFM_API_KEY not configured");
  }

  // Setlist.fm requires DD-MM-YYYY format
  // Use local date components (not UTC) to get the actual calendar date
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
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
      const errorMsg = `Could not find location for coordinates ${latitude}, ${longitude}`;
      console.error(`[Setlist.fm] ${errorMsg}`);
      logExternalApi('Setlist.fm', 'searchByDateAndLocation', false, errorMsg, Date.now() - startTime);
      return { setlists: [], city: null, country: null };
    }

    console.log(`[Setlist.fm] Full reverse geocode response:`, JSON.stringify(location, null, 2));

    const cityName = location.name;
    console.log(`[Setlist.fm] Reverse geocoded to city: ${cityName}, ${location.state || ''} ${location.country}`);

    // Check if the "city" is actually a county name - these don't work with Setlist.fm
    const isCounty = cityName.toLowerCase().includes('county');

    // Build search params - add venue name to narrow results
    const searchParams: any = {
      date: dateStr,
      p: 1,
    };

    // Always add venue name if available to get more specific results
    if (venueName) {
      searchParams.venueName = venueName;
      console.log(`[Setlist.fm] Using venue name in search: "${venueName}"`);
    }

    // Add city name for non-county locations
    if (!isCounty) {
      searchParams.cityName = cityName;
      console.log(`[Setlist.fm] Using city name: ${cityName}`);
    } else {
      console.log(`[Setlist.fm] Detected county name "${cityName}", skipping city parameter`);
    }

    console.log(`\n=== SETLIST.FM SEARCH ===`);
    console.log(`  Date: ${dateStr}`);
    console.log(`  City: ${cityName}`);
    console.log(`  Venue to filter: ${venueName || 'None'}`);
    console.log(`  Photo GPS: ${latitude}, ${longitude}`);

    // Apply rate limiting before calling Setlist.fm API
    await setlistFmRateLimit();

    // Search setlist.fm by date and venue (or city if venue not available)
    const response = await axios.get("https://api.setlist.fm/rest/1.0/search/setlists", {
      headers: {
        "x-api-key": apiKey,
        Accept: "application/json",
      },
      params: searchParams,
    });

    console.log(`  API returned: ${response.data.setlist?.length || 0} setlist(s)`);
    if (response.data.setlist && response.data.setlist.length > 0) {
      console.log(`  Results:`);
      response.data.setlist.forEach((s: any, idx: number) => {
        console.log(`    ${idx + 1}. ${s.artist?.name} at ${s.venue?.name} (${s.venue?.city?.name})`);
      });
    }

    console.log(`\n  Applying filters:`);

    // If venue name is provided, skip GPS distance check - trust the venue + date match
    if (venueName) {
      console.log(`    - Venue name match only (no GPS distance check)`);

      const filteredSetlists = (response.data.setlist || []).filter((setlist: any) => {
        if (!setlist.venue?.name) {
          return false;
        }

        const venueMatch = isFuzzyVenueMatch(venueName, setlist.venue.name, 70);
        console.log(`[Venue Filter] ${setlist.artist?.name} at ${setlist.venue.name}: ${venueMatch ? '✓ Match' : '✗ No match'}`);
        return venueMatch;
      });

      console.log(`\n  Final result: ${filteredSetlists.length}/${response.data.setlist?.length || 0} concerts matched venue name`);

      logExternalApi('Setlist.fm', 'searchByDateAndLocation', true, `Found ${filteredSetlists.length} concerts in ${cityName} on ${dateStr}`, Date.now() - startTime);
      return {
        setlists: filteredSetlists,
        city: cityName,
        country: location.country,
      };
    }

    // No venue name - use GPS distance filtering
    console.log(`    - Max distance: 1200 meters (no venue name provided)`);

    const photoLat = parseFloat(latitude);
    const photoLon = parseFloat(longitude);
    const MAX_DISTANCE_MILES = 0.746; // 1200 meters

    const filteredSetlists = (response.data.setlist || []).filter((setlist: any) => {
      const venueLat = setlist.venue?.city?.coords?.lat;
      const venueLon = setlist.venue?.city?.coords?.long;

      if (!venueLat || !venueLon) {
        console.log(`[Location Filter] Skipping ${setlist.artist?.name} - no venue GPS coordinates`);
        return false;
      }

      const distance = calculateDistance(photoLat, photoLon, venueLat, venueLon);
      const withinRange = distance <= MAX_DISTANCE_MILES;

      console.log(`[Location Filter] ${setlist.artist?.name} at ${setlist.venue?.name}: ${distance.toFixed(1)} miles (${(distance * 1609.34).toFixed(0)}m) ${withinRange ? '✓' : '✗'}`);

      return withinRange;
    });

    console.log(`\n  Final result: ${filteredSetlists.length}/${response.data.setlist?.length || 0} concerts within GPS radius`);

    logExternalApi('Setlist.fm', 'searchByDateAndLocation', true, `Found ${filteredSetlists.length} concerts in ${cityName} on ${dateStr}`, Date.now() - startTime);
    return {
      setlists: filteredSetlists,
      city: cityName,
      country: location.country,
    };
  } catch (error: any) {
    const errorDetails = error.response?.data || error.message;
    const statusCode = error.response?.status;

    if (statusCode === 404) {
      console.error(`[Setlist.fm] ❌ 404 Not Found - City "${error.config?.params?.cityName}" or date "${error.config?.params?.date}" may be invalid`);
      logExternalApi('Setlist.fm', 'searchByDateAndLocation', false, `404 Not Found (city or date invalid)`, Date.now() - startTime, `Status: ${statusCode}`);
    } else if (statusCode === 429) {
      console.error("[Setlist.fm] ❌ 429 RATE LIMIT EXCEEDED - Too many requests");
      console.error(`[Setlist.fm] Response: ${JSON.stringify(errorDetails)}`);
      logExternalApi('Setlist.fm', 'searchByDateAndLocation', false, '⚠️ RATE LIMIT EXCEEDED (429)', Date.now() - startTime, `Status: ${statusCode}, Data: ${JSON.stringify(errorDetails)}`);
    } else if (statusCode === 500) {
      console.error("[Setlist.fm] ❌ 500 INTERNAL SERVER ERROR - Setlist.fm server issue");
      console.error(`[Setlist.fm] Response: ${JSON.stringify(errorDetails)}`);
      logExternalApi('Setlist.fm', 'searchByDateAndLocation', false, '⚠️ INTERNAL SERVER ERROR (500)', Date.now() - startTime, `Status: ${statusCode}, Data: ${JSON.stringify(errorDetails)}`);
    } else if (statusCode === 504) {
      console.error("[Setlist.fm] ❌ 504 GATEWAY TIMEOUT - Setlist.fm took too long to respond");
      console.error(`[Setlist.fm] Response: ${JSON.stringify(errorDetails)}`);
      logExternalApi('Setlist.fm', 'searchByDateAndLocation', false, '⚠️ GATEWAY TIMEOUT (504)', Date.now() - startTime, `Status: ${statusCode}, Data: ${JSON.stringify(errorDetails)}`);
    } else {
      console.error(`[Setlist.fm] Error (${statusCode || 'unknown'}):`, errorDetails);
      logExternalApi('Setlist.fm', 'searchByDateAndLocation', false, 'Search failed', Date.now() - startTime, `Status: ${statusCode || 'unknown'}, ${error.message}`);
    }

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
  // Use local date components (not UTC) to get the actual calendar date
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const dateStr = `${day}-${month}-${year}`;

  try {
    // Check if the "city" is actually a county name - skip it if so
    const isCounty = cityName.toLowerCase().includes('county');

    if (isCounty) {
      console.log(`[Setlist.fm City Search] Skipping search - "${cityName}" is a county name, not valid for Setlist.fm`);
      return null;
    }

    console.log(`[Setlist.fm City Search] Searching for ${dateStr} in city: ${cityName}${venueName ? ` (will filter for venue: ${venueName})` : ''}`);

    // Apply rate limiting before calling Setlist.fm API
    await setlistFmRateLimit();

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
    const statusCode = error.response?.status;
    const errorDetails = error.response?.data || error.message;

    if (statusCode === 429) {
      console.error("[Setlist.fm City Search] ❌ 429 RATE LIMIT EXCEEDED");
      console.error(`[Setlist.fm] Response: ${JSON.stringify(errorDetails)}`);
    } else if (statusCode === 500) {
      console.error("[Setlist.fm City Search] ❌ 500 INTERNAL SERVER ERROR");
      console.error(`[Setlist.fm] Response: ${JSON.stringify(errorDetails)}`);
    } else if (statusCode === 504) {
      console.error("[Setlist.fm City Search] ❌ 504 GATEWAY TIMEOUT");
      console.error(`[Setlist.fm] Response: ${JSON.stringify(errorDetails)}`);
    } else {
      console.error(`[Setlist.fm City Search] Error (${statusCode || 'unknown'}):`, errorDetails);
    }

    return null;
  }
}

/**
 * Fetch setlist from setlist.fm by artist name and date only
 * Returns the first matching setlist with venue information
 * If GPS coordinates provided, filters results to within 1 kilometer
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
  // Use local date components (not UTC) to get the actual calendar date
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const dateStr = `${day}-${month}-${year}`;

  try {
    console.log(`[Setlist.fm] Searching for artist: "${artistName}", date: ${dateStr}`);

    // Apply rate limiting before calling Setlist.fm API
    await setlistFmRateLimit();

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
      const MAX_DISTANCE_MILES = 0.746; // Only accept concerts within 1200 meters of photo location

      setlists = setlists.filter((setlist: any) => {
        const venueLat = setlist.venue?.city?.coords?.lat;
        const venueLon = setlist.venue?.city?.coords?.long;

        if (!venueLat || !venueLon) {
          console.log(`[Location Filter] Skipping ${setlist.venue?.name} - no GPS coordinates`);
          return false;
        }

        const distance = calculateDistance(photoLat, photoLon, venueLat, venueLon);
        const withinRange = distance <= MAX_DISTANCE_MILES;

        console.log(`[Location Filter] ${setlist.venue?.name} (${setlist.venue?.city?.name}, ${setlist.venue?.city?.state || setlist.venue?.city?.country?.code}): ${distance.toFixed(1)} miles (${(distance * 1609.34).toFixed(0)}m) ${withinRange ? '✓' : '✗ (too far)'}`);

        return withinRange;
      });

      console.log(`[Location Filter] ${setlists.length}/${response.data.setlist?.length || 0} concerts within 1200 meters`);
    }

    // Return the first (closest) setlist with full venue information
    if (setlists.length > 0) {
      console.log(`[Setlist.fm] Returning: ${setlists[0].artist?.name} at ${setlists[0].venue?.name}`);
      return setlists[0];
    }
    console.log(`[Setlist.fm] No matching setlists found`);
    return null;
  } catch (error: any) {
    const statusCode = error.response?.status;
    const errorDetails = error.response?.data || error.message;

    if (statusCode === 429) {
      console.error("[Setlist.fm Artist+Date] ❌ 429 RATE LIMIT EXCEEDED");
      console.error(`[Setlist.fm] Response: ${JSON.stringify(errorDetails)}`);
    } else if (statusCode === 500) {
      console.error("[Setlist.fm Artist+Date] ❌ 500 INTERNAL SERVER ERROR");
      console.error(`[Setlist.fm] Response: ${JSON.stringify(errorDetails)}`);
    } else if (statusCode === 504) {
      console.error("[Setlist.fm Artist+Date] ❌ 504 GATEWAY TIMEOUT");
      console.error(`[Setlist.fm] Response: ${JSON.stringify(errorDetails)}`);
    } else {
      console.error(`[Setlist.fm Artist+Date] Error (${statusCode || 'unknown'}):`, errorDetails);
    }

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
  // Use local date components (not UTC) to get the actual calendar date
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const dateStr = `${day}-${month}-${year}`;

  try {
    console.log(`[Setlist.fm] Searching for artist: "${artistName}", date: ${dateStr}, venue: "${venueName}"`);

    // Apply rate limiting before calling Setlist.fm API
    await setlistFmRateLimit();

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
    const statusCode = error.response?.status;
    const errorDetails = error.response?.data || error.message;

    if (statusCode === 429) {
      console.error("[Setlist.fm Date+Venue] ❌ 429 RATE LIMIT EXCEEDED");
      console.error(`[Setlist.fm] Response: ${JSON.stringify(errorDetails)}`);
    } else if (statusCode === 500) {
      console.error("[Setlist.fm Date+Venue] ❌ 500 INTERNAL SERVER ERROR");
      console.error(`[Setlist.fm] Response: ${JSON.stringify(errorDetails)}`);
    } else if (statusCode === 504) {
      console.error("[Setlist.fm Date+Venue] ❌ 504 GATEWAY TIMEOUT");
      console.error(`[Setlist.fm] Response: ${JSON.stringify(errorDetails)}`);
    } else {
      console.error(`[Setlist.fm Date+Venue] Error (${statusCode || 'unknown'}):`, errorDetails);
    }

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
    const statusCode = error.response?.status;
    const errorDetails = error.response?.data || error.message;

    if (statusCode === 429) {
      console.error("[OpenWeather Weather] ❌ 429 RATE LIMIT EXCEEDED");
      console.error(`[OpenWeather] Response: ${JSON.stringify(errorDetails)}`);
    } else if (statusCode === 500) {
      console.error("[OpenWeather Weather] ❌ 500 INTERNAL SERVER ERROR");
      console.error(`[OpenWeather] Response: ${JSON.stringify(errorDetails)}`);
    } else if (statusCode === 504) {
      console.error("[OpenWeather Weather] ❌ 504 GATEWAY TIMEOUT");
      console.error(`[OpenWeather] Response: ${JSON.stringify(errorDetails)}`);
    } else {
      console.error(`[OpenWeather Weather] Error (${statusCode || 'unknown'}):`, errorDetails);
    }

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
  try {
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
  } catch (error: any) {
    const statusCode = error.response?.status || error.code;
    const errorDetails = error.response?.data || error.message;

    if (statusCode === 429) {
      console.error("[Google Drive Get Content] ❌ 429 RATE LIMIT EXCEEDED");
      console.error(`[Google Drive] Response: ${JSON.stringify(errorDetails)}`);
    } else if (statusCode === 500) {
      console.error("[Google Drive Get Content] ❌ 500 INTERNAL SERVER ERROR");
      console.error(`[Google Drive] Response: ${JSON.stringify(errorDetails)}`);
    } else if (statusCode === 504) {
      console.error("[Google Drive Get Content] ❌ 504 GATEWAY TIMEOUT");
      console.error(`[Google Drive] Response: ${JSON.stringify(errorDetails)}`);
    } else {
      console.error(`[Google Drive Get Content] Error (${statusCode || 'unknown'}):`, errorDetails);
    }

    throw new Error(`Failed to get file content: ${error.message}`);
  }
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
        pageSize: 1000,
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
    const statusCode = error.response?.status || error.code;
    const errorDetails = error.response?.data || error.message;

    if (statusCode === 429) {
      console.error("[Google Drive List] ❌ 429 RATE LIMIT EXCEEDED");
      console.error(`[Google Drive] Response: ${JSON.stringify(errorDetails)}`);
    } else if (statusCode === 500) {
      console.error("[Google Drive List] ❌ 500 INTERNAL SERVER ERROR");
      console.error(`[Google Drive] Response: ${JSON.stringify(errorDetails)}`);
    } else if (statusCode === 504) {
      console.error("[Google Drive List] ❌ 504 GATEWAY TIMEOUT");
      console.error(`[Google Drive] Response: ${JSON.stringify(errorDetails)}`);
    } else {
      console.error(`[Google Drive List] Error (${statusCode || 'unknown'}):`, errorDetails);
    }

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
    const statusCode = error.response?.status || error.code;
    const errorDetails = error.response?.data || error.message;

    if (statusCode === 429) {
      console.error("[Google Drive Metadata] ❌ 429 RATE LIMIT EXCEEDED");
      console.error(`[Google Drive] Response: ${JSON.stringify(errorDetails)}`);
    } else if (statusCode === 500) {
      console.error("[Google Drive Metadata] ❌ 500 INTERNAL SERVER ERROR");
      console.error(`[Google Drive] Response: ${JSON.stringify(errorDetails)}`);
    } else if (statusCode === 504) {
      console.error("[Google Drive Metadata] ❌ 504 GATEWAY TIMEOUT");
      console.error(`[Google Drive] Response: ${JSON.stringify(errorDetails)}`);
    } else {
      console.error(`[Google Drive Metadata] Error (${statusCode || 'unknown'}):`, errorDetails);
    }

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
    const statusCode = error.response?.status || error.code;
    const errorDetails = error.response?.data || error.message;

    if (statusCode === 429) {
      console.error("[Google Drive Download] ❌ 429 RATE LIMIT EXCEEDED");
      console.error(`[Google Drive] Response: ${JSON.stringify(errorDetails)}`);
    } else if (statusCode === 500) {
      console.error("[Google Drive Download] ❌ 500 INTERNAL SERVER ERROR");
      console.error(`[Google Drive] Response: ${JSON.stringify(errorDetails)}`);
    } else if (statusCode === 504) {
      console.error("[Google Drive Download] ❌ 504 GATEWAY TIMEOUT");
      console.error(`[Google Drive] Response: ${JSON.stringify(errorDetails)}`);
    } else {
      console.error(`[Google Drive Download] Error (${statusCode || 'unknown'}):`, errorDetails);
    }

    throw new Error(`Failed to download photo: ${error.message}`);
  }
}

/**
 * Validate if a venue exists on setlist.fm and has concert data
 * Used to filter out non-concert venues (parks, restaurants, etc.)
 * @param venueName Name of the venue to check
 * @param city City where the venue is located
 * @returns Object with hasSetlists boolean and setlistCount number
 */
export async function validateVenueOnSetlistFm(
  venueName: string,
  city: string
): Promise<{ hasSetlists: boolean; setlistCount: number }> {
  await setlistFmRateLimit();

  const startTime = Date.now();
  console.log(`[Setlist.fm Venue Validation] Checking if "${venueName}" in ${city} has concerts...`);

  try {
    // Search for setlists at this venue
    // Use a date range of last 10 years to check if this venue hosts concerts
    const response = await axios.get("https://api.setlist.fm/rest/1.0/search/setlists", {
      headers: {
        "x-api-key": process.env.SETLISTFM_API_KEY!,
        Accept: "application/json",
      },
      params: {
        venueName: venueName,
        cityName: city,
        p: 1, // First page only
      },
      timeout: 10000,
    });

    const setlistCount = response.data.setlist?.length || 0;
    const hasSetlists = setlistCount > 0;

    if (hasSetlists) {
      console.log(`[Setlist.fm Venue Validation] ✓ "${venueName}" HAS ${setlistCount} concerts - VALID concert venue`);
    } else {
      console.log(`[Setlist.fm Venue Validation] ✗ "${venueName}" has NO concerts - likely not a concert venue`);
    }

    logExternalApi('Setlist.fm', 'validateVenue', true, `${venueName}: ${setlistCount} setlists`, Date.now() - startTime);

    return { hasSetlists, setlistCount };
  } catch (error: any) {
    const statusCode = error.response?.status;
    const errorDetails = error.response?.data || error.message;

    if (statusCode === 404) {
      // 404 means no results found - venue doesn't host concerts
      console.log(`[Setlist.fm Venue Validation] ✗ "${venueName}" not found (404) - not a concert venue`);
      logExternalApi('Setlist.fm', 'validateVenue', true, `${venueName}: not found`, Date.now() - startTime);
      return { hasSetlists: false, setlistCount: 0 };
    } else if (statusCode === 429) {
      console.error("[Setlist.fm Venue Validation] ❌ 429 RATE LIMIT EXCEEDED");
      console.error(`[Setlist.fm] Response: ${JSON.stringify(errorDetails)}`);
      logExternalApi('Setlist.fm', 'validateVenue', false, '⚠️ RATE LIMIT EXCEEDED (429)', Date.now() - startTime, `Status: ${statusCode}`);
    } else if (statusCode === 500) {
      console.error("[Setlist.fm Venue Validation] ❌ 500 INTERNAL SERVER ERROR");
      console.error(`[Setlist.fm] Response: ${JSON.stringify(errorDetails)}`);
      logExternalApi('Setlist.fm', 'validateVenue', false, '⚠️ INTERNAL SERVER ERROR (500)', Date.now() - startTime, `Status: ${statusCode}`);
    } else if (statusCode === 504) {
      console.error("[Setlist.fm Venue Validation] ❌ 504 GATEWAY TIMEOUT");
      console.error(`[Setlist.fm] Response: ${JSON.stringify(errorDetails)}`);
      logExternalApi('Setlist.fm', 'validateVenue', false, '⚠️ GATEWAY TIMEOUT (504)', Date.now() - startTime, `Status: ${statusCode}`);
    } else {
      console.error(`[Setlist.fm Venue Validation] Error (${statusCode || 'unknown'}):`, errorDetails);
      logExternalApi('Setlist.fm', 'validateVenue', false, 'Validation failed', Date.now() - startTime, `Status: ${statusCode || 'unknown'}`);
    }

    // On error, assume venue might be valid (fail open rather than fail closed)
    return { hasSetlists: true, setlistCount: 0 };
  }
}
