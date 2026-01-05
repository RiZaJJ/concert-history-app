import axios from "axios";
import { isFuzzyVenueMatch, stringSimilarity } from "./fuzzyMatch";
import { calculateDistance } from "./gpsUtils";
import { google } from "googleapis";
import { logExternalApi } from "./logger";

/**
 * Comprehensive error logging for external API calls
 * Handles timeouts, rate limits, server errors, and network issues
 */
function logApiError(serviceName: string, operation: string, error: any, startTime: number): void {
  const statusCode = error.response?.status || error.code;
  const errorDetails = error.response?.data || error.message;
  const elapsed = Date.now() - startTime;

  // Check for timeout errors
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    console.error(`[${serviceName} ${operation}] ❌ TIMEOUT - Request took too long (${elapsed}ms)`);
    console.error(`[${serviceName}] Error: ${error.message}`);
    logExternalApi(serviceName, operation, false, `⚠️ TIMEOUT (${elapsed}ms)`, elapsed, `Code: ${error.code}, ${error.message}`);
    return;
  }

  // HTTP status code errors
  switch (statusCode) {
    case 404:
      console.error(`[${serviceName} ${operation}] ❌ 404 NOT FOUND`);
      console.error(`[${serviceName}] Response: ${JSON.stringify(errorDetails)}`);
      logExternalApi(serviceName, operation, false, '404 Not Found', elapsed, `Status: ${statusCode}`);
      break;

    case 429:
      console.error(`[${serviceName} ${operation}] ❌ 429 RATE LIMIT EXCEEDED - Too many requests!`);
      console.error(`[${serviceName}] Response: ${JSON.stringify(errorDetails)}`);
      logExternalApi(serviceName, operation, false, '⚠️ RATE LIMIT EXCEEDED (429)', elapsed, `Status: ${statusCode}`);
      break;

    case 500:
      console.error(`[${serviceName} ${operation}] ❌ 500 INTERNAL SERVER ERROR`);
      console.error(`[${serviceName}] Response: ${JSON.stringify(errorDetails)}`);
      logExternalApi(serviceName, operation, false, '⚠️ INTERNAL SERVER ERROR (500)', elapsed, `Status: ${statusCode}`);
      break;

    case 502:
      console.error(`[${serviceName} ${operation}] ❌ 502 BAD GATEWAY`);
      console.error(`[${serviceName}] Response: ${JSON.stringify(errorDetails)}`);
      logExternalApi(serviceName, operation, false, '⚠️ BAD GATEWAY (502)', elapsed, `Status: ${statusCode}`);
      break;

    case 503:
      console.error(`[${serviceName} ${operation}] ❌ 503 SERVICE UNAVAILABLE`);
      console.error(`[${serviceName}] Response: ${JSON.stringify(errorDetails)}`);
      logExternalApi(serviceName, operation, false, '⚠️ SERVICE UNAVAILABLE (503)', elapsed, `Status: ${statusCode}`);
      break;

    case 504:
      console.error(`[${serviceName} ${operation}] ❌ 504 GATEWAY TIMEOUT`);
      console.error(`[${serviceName}] Response: ${JSON.stringify(errorDetails)}`);
      logExternalApi(serviceName, operation, false, '⚠️ GATEWAY TIMEOUT (504)', elapsed, `Status: ${statusCode}`);
      break;

    case 524:
      console.error(`[${serviceName} ${operation}] ❌ 524 CLOUDFLARE TIMEOUT - Origin didn't respond in time`);
      console.error(`[${serviceName}] Response: ${JSON.stringify(errorDetails)}`);
      logExternalApi(serviceName, operation, false, '⚠️ CLOUDFLARE TIMEOUT (524)', elapsed, `Status: ${statusCode}`);
      break;

    default:
      console.error(`[${serviceName} ${operation}] ❌ Error (${statusCode || 'unknown'}):`, errorDetails);
      logExternalApi(serviceName, operation, false, `Error: ${statusCode || 'unknown'}`, elapsed, `Status: ${statusCode || 'unknown'}, ${error.message}`);
  }
}

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
): Promise<{ name: string; altName?: string; method: string; confidence: string } | null> {
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
      timeout: 10000, // 10 second timeout
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
    logApiError('OpenWeather', 'Reverse Geocode', error, startTime);
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
      timeout: 10000, // 10 second timeout
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

    // Build search params - fetch first 3 pages to get more results
    const searchParams: any = {
      date: dateStr,
      p: 1, // Start with page 1
    };

    // Send FIRST WORD of venue name to API
    // setlist.fm API requires venue name for certain concerts (e.g., "Showbox" won't appear without venueName param)
    // Use first word only to be less restrictive (catches "Showbox" and "Showvbox")
    if (venueName) {
      const firstWord = venueName.split(/\s+/)[0];
      searchParams.venueName = firstWord;
      console.log(`[Setlist.fm] Sending first word of venue to API: "${firstWord}" (original: "${venueName}")`);
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

    // Fetch multiple pages to ensure we get all concerts (max 3 pages = 60 concerts)
    let allSetlists: any[] = [];
    const maxPages = 3;

    for (let page = 1; page <= maxPages; page++) {
      searchParams.p = page;

      try {
        const response = await axios.get("https://api.setlist.fm/rest/1.0/search/setlists", {
          headers: {
            "x-api-key": apiKey,
            Accept: "application/json",
          },
          params: searchParams,
          timeout: 15000, // 15 second timeout for setlist searches
        });

        const pageSetlists = response.data.setlist || [];
        allSetlists = allSetlists.concat(pageSetlists);

        console.log(`  Page ${page}: ${pageSetlists.length} setlist(s)`);

        // Stop if this page returned 0 results (no more data)
        if (pageSetlists.length === 0) {
          break;
        }

        // Rate limit between pages (if we're fetching more)
        if (page < maxPages) {
          await setlistFmRateLimit();
        }
      } catch (error: any) {
        // Handle 404 "page does not exist" - just means no more pages
        if (error.response?.status === 404) {
          console.log(`  Page ${page}: No more pages (404)`);
          break;
        }
        // Re-throw other errors
        throw error;
      }
    }

    console.log(`  API returned: ${allSetlists.length} total setlist(s) across ${Math.min(maxPages, Math.ceil(allSetlists.length / 20))} page(s)`);

    // FALLBACK: If no results and we searched with city+venue, retry with just venue+date
    if (allSetlists.length === 0 && venueName && searchParams.cityName) {
      console.log(`\n  No results with city+venue+date. Retrying with just venue+date...`);

      // Remove city from search params
      const fallbackParams: any = {
        date: dateStr,
        p: 1,
      };

      if (venueName) {
        const firstWord = venueName.split(/\s+/)[0];
        fallbackParams.venueName = firstWord;
        console.log(`  Searching with venue="${firstWord}" and date=${dateStr} (no city filter)`);
      }

      await setlistFmRateLimit();

      // Retry with just venue+date (no city)
      for (let page = 1; page <= maxPages; page++) {
        fallbackParams.p = page;

        try {
          const response = await axios.get("https://api.setlist.fm/rest/1.0/search/setlists", {
            headers: {
              "x-api-key": apiKey,
              Accept: "application/json",
            },
            params: fallbackParams,
            timeout: 15000,
          });

          const pageSetlists = response.data.setlist || [];
          allSetlists = allSetlists.concat(pageSetlists);

          console.log(`  Fallback page ${page}: ${pageSetlists.length} setlist(s)`);

          if (pageSetlists.length === 0) {
            break;
          }

          if (page < maxPages) {
            await setlistFmRateLimit();
          }
        } catch (error: any) {
          if (error.response?.status === 404) {
            console.log(`  Fallback page ${page}: No more pages (404)`);
            break;
          }
          throw error;
        }
      }

      console.log(`  Fallback search returned: ${allSetlists.length} setlist(s)`);
    }

    if (allSetlists.length > 0) {
      console.log(`  Sample results (first 5):`);
      allSetlists.slice(0, 5).forEach((s: any, idx: number) => {
        console.log(`    ${idx + 1}. ${s.artist?.name} at ${s.venue?.name} (${s.venue?.city?.name})`);
      });
      if (allSetlists.length > 5) {
        console.log(`    ... and ${allSetlists.length - 5} more`);
      }
    }

    // Replace response.data.setlist with all fetched setlists
    const response = { data: { setlist: allSetlists } };

    console.log(`\n  Applying filters:`);

    // If venue name is provided, filter by fuzzy venue match
    if (venueName) {
      console.log(`    - Fuzzy venue name matching (70% threshold)`);

      let filteredSetlists = (response.data.setlist || []).filter((setlist: any) => {
        if (!setlist.venue?.name) {
          return false;
        }

        const venueMatch = isFuzzyVenueMatch(venueName, setlist.venue.name, 70);
        console.log(`[Venue Filter] ${setlist.artist?.name} at ${setlist.venue.name}: ${venueMatch ? '✓ Match' : '✗ No match'}`);
        return venueMatch;
      });

      console.log(`\n  Fuzzy match result: ${filteredSetlists.length}/${response.data.setlist?.length || 0} concerts matched venue name`);

      // FALLBACK: If no matches, try matching with first SIGNIFICANT word (skip "The", "A", etc.)
      if (filteredSetlists.length === 0 && venueName) {
        const words = venueName.split(/\s+/);
        const commonWords = ['the', 'a', 'an', 'at'];
        const firstSignificantWord = words.find(w => !commonWords.includes(w.toLowerCase())) || words[0];

        console.log(`\n  No fuzzy matches found. Trying fallback: first significant word ("${firstSignificantWord}")`);

        const partialMatches = (response.data.setlist || []).filter((setlist: any) => {
          if (!setlist.venue?.name) return false;

          // Check if venue name contains the significant word (case-insensitive, minimum 3 chars)
          if (firstSignificantWord.length < 3) return false;

          const venueNameLower = setlist.venue.name.toLowerCase();
          const firstWordLower = firstSignificantWord.toLowerCase();

          const contains = venueNameLower.includes(firstWordLower);
          console.log(`[Partial Match] "${setlist.venue.name}" contains "${firstSignificantWord}": ${contains ? '✓' : '✗'}`);
          return contains;
        });

        console.log(`\n  Partial match result: ${partialMatches.length}/${response.data.setlist?.length || 0} concerts contain "${firstSignificantWord}"`);

        if (partialMatches.length > 0) {
          filteredSetlists = partialMatches;
        }
      }

      // If multiple matches found, use fuzzy score to disambiguate
      // NOTE: Do NOT use setlist.fm GPS coordinates - they're often inaccurate (e.g., The Gorge shows as city center)
      if (filteredSetlists.length > 1) {
        console.log(`[Fuzzy Match Filter] Multiple venue matches (${filteredSetlists.length}), selecting best fuzzy match...`);

        // Calculate fuzzy match score for each venue
        const scoredSetlists = filteredSetlists.map((setlist: any) => {
          const fuzzyScore = stringSimilarity(venueName, setlist.venue?.name || '');
          console.log(`[Match Score] "${setlist.venue?.name}" - Fuzzy: ${fuzzyScore}%`);

          return {
            setlist,
            fuzzyScore,
          };
        });

        // Sort by fuzzy score (descending) - best match first
        scoredSetlists.sort((a, b) => b.fuzzyScore - a.fuzzyScore);

        const bestMatch = scoredSetlists[0];
        console.log(`\n  Final result: "${bestMatch.setlist.venue?.name}" selected (${bestMatch.fuzzyScore}% match)`);

        logExternalApi('Setlist.fm', 'searchByDateAndLocation', true, `Found ${scoredSetlists.length} concerts in ${cityName} on ${dateStr}`, Date.now() - startTime);
        return {
          setlists: [bestMatch.setlist], // Return only the best match
          city: cityName,
          country: location.country,
        };
      }

      console.log(`\n  Final result: ${filteredSetlists.length} concert(s) matched`);
      logExternalApi('Setlist.fm', 'searchByDateAndLocation', true, `Found ${filteredSetlists.length} concerts in ${cityName} on ${dateStr}`, Date.now() - startTime);
      return {
        setlists: filteredSetlists,
        city: cityName,
        country: location.country,
      };
    }

    // No venue name detected - return ALL concerts on this date in city (no GPS filtering)
    // User will need to manually pick from the list since we can't auto-match
    console.log(`    - No venue name provided: returning all ${response.data.setlist?.length || 0} concerts on this date in ${cityName}`);
    console.log(`    - GPS filtering disabled (unreliable for matching)`);

    const filteredSetlists = response.data.setlist || [];

    console.log(`\n  Final result: ${filteredSetlists.length} concerts on ${dateStr} in ${cityName} (no filtering applied)`);

    logExternalApi('Setlist.fm', 'searchByDateAndLocation', true, `Found ${filteredSetlists.length} concerts in ${cityName} on ${dateStr}`, Date.now() - startTime);
    return {
      setlists: filteredSetlists,
      city: cityName,
      country: location.country,
    };
  } catch (error: any) {
    logApiError('Setlist.fm', 'Search By Date & Location', error, startTime);
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
  venueName?: string,
  latitude?: string,
  longitude?: string
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
    // Check if the "city" is actually a county name - skip it if so
    const isCounty = cityName.toLowerCase().includes('county');

    if (isCounty) {
      console.log(`[Setlist.fm City Search] Skipping search - "${cityName}" is a county name, not valid for Setlist.fm`);
      return null;
    }

    console.log(`[Setlist.fm City Search] Searching for ${dateStr} in city: ${cityName}${venueName ? ` (will filter for venue: ${venueName})` : ''}`);

    // Apply rate limiting before calling Setlist.fm API
    await setlistFmRateLimit();

    // Build search params - try with venueName if provided
    const searchParams: any = {
      date: dateStr,
      cityName: cityName,
      p: 1,
    };

    // Send FIRST WORD of venue name to API
    // setlist.fm API requires venue name for certain concerts
    // Use first word only to be less restrictive (catches "Showbox" and "Showvbox")
    if (venueName) {
      const firstWord = venueName.split(/\s+/)[0];
      searchParams.venueName = firstWord;
      console.log(`[Setlist.fm City Search] Sending first word of venue to API: "${firstWord}" (original: "${venueName}")`);
    }

    // Search setlist.fm by date and city (and optionally venue)
    const response = await axios.get("https://api.setlist.fm/rest/1.0/search/setlists", {
      headers: {
        "x-api-key": apiKey,
        Accept: "application/json",
      },
      params: searchParams,
      timeout: 15000, // 15 second timeout for setlist searches
    });

    const setlists = response.data.setlist || [];
    console.log(`[Setlist.fm City Search] Found ${setlists.length} setlist(s) in ${cityName}`);

    // If venue name provided, filter by fuzzy venue matching
    if (venueName && setlists.length > 0) {
      let matchingSetlists = setlists.filter((setlist: any) => {
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

      // FALLBACK: If no matches, try matching with first SIGNIFICANT word (skip "The", "A", etc.)
      if (matchingSetlists.length === 0 && venueName) {
        const words = venueName.split(/\s+/);
        const commonWords = ['the', 'a', 'an', 'at'];
        const firstSignificantWord = words.find(w => !commonWords.includes(w.toLowerCase())) || words[0];

        console.log(`\n  No fuzzy matches found. Trying fallback: first significant word ("${firstSignificantWord}")`);

        const partialMatches = setlists.filter((setlist: any) => {
          if (!setlist.venue?.name) return false;

          // Check if venue name contains the significant word (case-insensitive, minimum 3 chars)
          if (firstSignificantWord.length < 3) return false;

          const venueNameLower = setlist.venue.name.toLowerCase();
          const firstWordLower = firstSignificantWord.toLowerCase();

          const contains = venueNameLower.includes(firstWordLower);
          console.log(`[Partial Match] "${setlist.venue.name}" contains "${firstSignificantWord}": ${contains ? '✓' : '✗'}`);
          return contains;
        });

        console.log(`\n  Partial match result: ${partialMatches.length}/${setlists.length} concerts contain "${firstSignificantWord}"`);

        if (partialMatches.length > 0) {
          matchingSetlists = partialMatches;
        }
      }

      if (matchingSetlists.length > 0) {
        // If multiple matches, select best fuzzy match
        // NOTE: Do NOT use setlist.fm GPS coordinates - they're often inaccurate
        if (matchingSetlists.length > 1) {
          console.log(`[Fuzzy Match Filter] Multiple venue matches (${matchingSetlists.length}), selecting best fuzzy match...`);

          // Calculate fuzzy match score for each venue
          const scoredSetlists = matchingSetlists.map((setlist: any) => {
            const fuzzyScore = stringSimilarity(venueName, setlist.venue?.name || '');
            console.log(`[Match Score] "${setlist.venue?.name}" - Fuzzy: ${fuzzyScore}%`);

            return {
              setlist,
              fuzzyScore,
            };
          });

          // Sort by fuzzy score (descending) - best match first
          scoredSetlists.sort((a, b) => b.fuzzyScore - a.fuzzyScore);

          const bestMatch = scoredSetlists[0];
          console.log(`[Setlist.fm City Search] Returning best fuzzy match: ${bestMatch.setlist.artist?.name} at ${bestMatch.setlist.venue?.name} (${bestMatch.fuzzyScore}% match)`);
          return bestMatch.setlist;
        }

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
    logApiError('Setlist.fm', 'City Search', error, startTime);
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
      timeout: 15000, // 15 second timeout for setlist searches
    });

    console.log(`[Setlist.fm] Found ${response.data.setlist?.length || 0} setlist(s)`);

    // Return all setlists for this artist + date (no GPS filtering)
    // GPS coordinates from photos are unreliable for matching
    let setlists = response.data?.setlist || [];
    if (setlists.length > 0) {
      console.log(`[Setlist.fm] Returning all ${setlists.length} concerts for ${artistName} on ${dateStr}`);
      setlists.forEach((s: any, idx: number) => {
        console.log(`  ${idx + 1}. ${s.venue?.name} (${s.venue?.city?.name}, ${s.venue?.city?.state || s.venue?.city?.country?.code})`);
      });
    }

    // Return the first setlist (or all if multiple venues on same date)
    if (setlists.length > 0) {
      console.log(`[Setlist.fm] Returning: ${setlists[0].artist?.name} at ${setlists[0].venue?.name}`);
      return setlists[0];
    }
    console.log(`[Setlist.fm] No matching setlists found`);
    return null;
  } catch (error: any) {
    logApiError('Setlist.fm', 'Artist+Date Search', error, startTime);
    return null;
  }
}

export async function fetchSetlistByDateAndVenue(
  artistName: string,
  venueName: string,
  date: Date
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
      timeout: 15000, // 15 second timeout for setlist searches
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
    logApiError('Setlist.fm', 'Date+Venue Search', error, startTime);
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
      timeout: 10000, // 10 second timeout
    });

    return response.data;
  } catch (error: any) {
    logApiError('OpenWeather', 'Current Weather', error, startTime);
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
    logApiError('Google Drive', 'Get Content', error, startTime);
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
    logApiError('Google Drive', 'List Files', error, startTime);
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
    logApiError('Google Drive', 'Get Metadata', error, startTime);
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
    logApiError('Google Drive', 'Download Photo', error, startTime);
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

  // Helper function to try searching with a specific venue name
  const trySearch = async (searchName: string): Promise<{ hasSetlists: boolean; setlistCount: number } | null> => {
    try {
      const response = await axios.get("https://api.setlist.fm/rest/1.0/search/setlists", {
        headers: {
          "x-api-key": process.env.SETLISTFM_API_KEY!,
          Accept: "application/json",
        },
        params: {
          venueName: searchName,
          cityName: city,
          p: 1, // First page only
        },
        timeout: 10000,
      });

      const setlistCount = response.data.setlist?.length || 0;
      const hasSetlists = setlistCount > 0;

      return { hasSetlists, setlistCount };
    } catch (error: any) {
      // Return null on error to try next variation
      if (error.response?.status === 404) {
        return { hasSetlists: false, setlistCount: 0 };
      }
      throw error; // Re-throw non-404 errors
    }
  };

  try {
    // FIRST: Try exact venue name
    let result = await trySearch(venueName);

    if (result && result.hasSetlists) {
      console.log(`[Setlist.fm Venue Validation] ✓ "${venueName}" HAS ${result.setlistCount} concerts - VALID concert venue`);
      logExternalApi('Setlist.fm', 'validateVenue', true, `${venueName}: ${result.setlistCount} setlists`, Date.now() - startTime);
      return result;
    }

    // SECOND: Try simplified name (remove "at the...", "@ the...", etc.)
    // Examples: "Showbox at the Market" → "Showbox", "Sphere at The Venetian" → "Sphere"
    const simplifiedName = venueName
      .replace(/\s+(at|@)\s+(the\s+)?[\w\s]+$/i, '') // Remove "at the Market", "@ The Venetian", etc.
      .trim();

    if (simplifiedName !== venueName && simplifiedName.length > 0) {
      console.log(`[Setlist.fm Venue Validation] No results for "${venueName}", trying simplified: "${simplifiedName}"`);
      result = await trySearch(simplifiedName);

      if (result && result.hasSetlists) {
        console.log(`[Setlist.fm Venue Validation] ✓ "${simplifiedName}" HAS ${result.setlistCount} concerts - VALID concert venue`);
        logExternalApi('Setlist.fm', 'validateVenue', true, `${simplifiedName}: ${result.setlistCount} setlists`, Date.now() - startTime);
        return result;
      }
    }

    // No results found with any variation
    console.log(`[Setlist.fm Venue Validation] ✗ "${venueName}" has NO concerts - likely not a concert venue`);
    logExternalApi('Setlist.fm', 'validateVenue', true, `${venueName}: not found`, Date.now() - startTime);
    return { hasSetlists: false, setlistCount: 0 };

  } catch (error: any) {
    const statusCode = error.response?.status;

    // 404 is special case - not an error, just means venue doesn't exist
    if (statusCode === 404) {
      console.log(`[Setlist.fm Venue Validation] ✗ "${venueName}" not found (404) - not a concert venue`);
      logExternalApi('Setlist.fm', 'validateVenue', true, `${venueName}: not found`, Date.now() - startTime);
      return { hasSetlists: false, setlistCount: 0 };
    }

    // All other errors (timeouts, rate limits, etc.)
    logApiError('Setlist.fm', 'Venue Validation', error, startTime);

    // On error, assume venue might be valid (fail open rather than fail closed)
    return { hasSetlists: true, setlistCount: 0 };
  }
}
