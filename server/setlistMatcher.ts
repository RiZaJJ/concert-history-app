import { fetchSetlistByArtistAndDate, fetchSetlistByDateAndVenue, searchSetlistsByDateAndLocation, searchSetlistsByDateAndCity } from "./integrations";

/**
 * Extract core venue name from longer titles
 * Examples:
 *   "The Mann Center" → "Mann"
 *   "TD Pavillion at the Mann" → "Mann"
 *   "Citizens Bank Park" → "Citizens Bank Park" (keep full name if no "at the")
 *   "Sphere at The Venetian Resort" → "Sphere"
 *   "Red Rocks Amphitheatre" → "Red Rocks"
 */
export function extractCoreVenueName(venueName: string): string {
  // Remove leading "The ", "A ", "An "
  let name = venueName.replace(/^(The|A|An)\s+/i, '').trim();

  // If there's an "at the" or "at The" pattern, take everything before it
  const atTheMatch = name.match(/^(.+?)\s+at\s+(the\s+)?/i);
  if (atTheMatch) {
    name = atTheMatch[1].trim();
    console.log(`[VenueExtraction] Found "at the" pattern: "${venueName}" → "${name}"`);
  }

  // Remove common suffixes for setlist.fm search (they fuzzy match anyway)
  name = name.replace(/\s+(Amphitheatre|Amphitheater|Theater|Theatre|Arena|Stadium|Center|Centre|Pavilion|Pavillion|Hall|Ballroom)$/i, '').trim();

  // Extract last significant word if multi-word (often the distinctive part)
  // For "Citizens Bank Park" → "Park" is too generic, keep full
  // For "Red Rocks Amphitheatre" → "Red Rocks" after suffix removal
  // For "TD Pavillion" → "Pavillion" after suffix removal → empty, fallback
  const words = name.split(/\s+/).filter(w => w.length > 0);

  // If we removed too much and have no words, use original
  if (words.length === 0) {
    console.log(`[VenueExtraction] Extracted empty, using original: "${venueName}"`);
    return venueName;
  }

  // If we have multiple words, try to find the most distinctive one
  // Skip common words like "The", numbers, sponsors
  const commonWords = new Set(['the', 'at', 'of', 'and', 'in', 'td', 'bank', 'center', 'centre']);
  const significantWords = words.filter(w => !commonWords.has(w.toLowerCase()) && !/^\d+$/.test(w));

  if (significantWords.length > 0) {
    // Use the last significant word (often the venue name itself)
    const coreName = significantWords[significantWords.length - 1];
    console.log(`[VenueExtraction] "${venueName}" → "${coreName}"`);
    return coreName;
  }

  // Fallback: use the cleaned name
  console.log(`[VenueExtraction] "${venueName}" → "${name}"`);
  return name;
}

/**
 * Try all possible 2-field combinations to find a setlist match
 * This maximizes the chance of finding the correct concert even with partial data
 * If GPS coordinates provided, filters results to within 1 kilometer
 */
export async function findSetlistWithAllCombinations(params: {
  artistName?: string;
  venueName?: string;
  concertDate?: Date;
  latitude?: string;
  longitude?: string;
  city?: string;
}): Promise<any> {
  const { artistName, venueName, concertDate, latitude, longitude, city } = params;
  
  // Collect all attempts we'll make
  const attempts: Array<{ name: string; fn: () => Promise<any> }> = [];
  
  // 1. Artist + Date (most common combination)
  if (artistName && concertDate) {
    attempts.push({
      name: "Artist + Date",
      fn: () => fetchSetlistByArtistAndDate(artistName, concertDate, latitude, longitude),
    });
  }
  
  // 2. Artist + Venue + Date (full match - most accurate)
  if (artistName && venueName && concertDate) {
    attempts.push({
      name: "Artist + Venue + Date",
      fn: () => fetchSetlistByDateAndVenue(artistName, venueName, concertDate),
    });

    // 2b. Artist + Core Venue Name + Date (fallback for sponsor name changes)
    const coreVenueName = extractCoreVenueName(venueName);
    if (coreVenueName !== venueName) {
      attempts.push({
        name: `Artist + Core Venue ("${coreVenueName}") + Date`,
        fn: () => fetchSetlistByDateAndVenue(artistName, coreVenueName, concertDate),
      });
    }
  }

  // 3. Venue + Date (when artist unknown - less common but possible)
  // Use searchSetlistsByDateAndLocation which searches by city + date, then filters by venue with fuzzy matching
  if (venueName && concertDate && !artistName && latitude && longitude) {
    attempts.push({
      name: "Venue + Date (with GPS)",
      fn: async () => {
        const result = await searchSetlistsByDateAndLocation(concertDate, latitude, longitude, venueName);
        // Return first setlist from results
        return result?.setlists?.[0] || null;
      },
    });
  }
  
  // 4. City + Date + Venue (when city is known)
  // Pass GPS if available to disambiguate venues with similar names
  if (venueName && concertDate && !artistName && city) {
    attempts.push({
      name: "City + Date + Venue" + (latitude && longitude ? " (with GPS)" : " (no GPS)"),
      fn: async () => {
        const result = await searchSetlistsByDateAndCity(concertDate, city, venueName, latitude, longitude);
        return result;
      },
    });
  }

  // 5. FALLBACK: Venue + Date (no GPS, no city) - search entire setlist.fm database
  // This handles cases where GPS is invalid (0,0) or city is unknown
  // Always add this as a last resort if we have venue and date
  if (venueName && concertDate && !artistName) {
    attempts.push({
      name: "Venue + Date (no GPS or city - global search)",
      fn: async () => {
        // Use fetchSetlistByDateAndVenue but without artist (will search all artists)
        // This is less accurate but works when we have no location data
        const { searchSetlistsByDateAndCity } = await import("./integrations");

        // Try searching with venue name + date using setlist.fm's built-in venue search
        // We can't use a specific city, so we'll get all results and rely on fuzzy matching
        console.log(`[SetlistMatcher] Searching setlist.fm with venue="${venueName}" and date (no location filter)`);

        // Format date for setlist.fm API (DD-MM-YYYY)
        const day = String(concertDate.getDate()).padStart(2, '0');
        const month = String(concertDate.getMonth() + 1).padStart(2, '0');
        const year = concertDate.getFullYear();
        const dateStr = `${day}-${month}-${year}`;

        // Direct API call without city filter
        const axios = (await import('axios')).default;
        const apiKey = process.env.SETLISTFM_API_KEY;
        if (!apiKey) throw new Error("SETLISTFM_API_KEY not configured");

        // Extract core venue name for better search results
        // "TD Pavillion at the Mann" → "Mann"
        // "The Mann Center" → "Mann"
        const coreVenueName = extractCoreVenueName(venueName);

        try {
          await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit
          const response = await axios.get("https://api.setlist.fm/rest/1.0/search/setlists", {
            headers: { "x-api-key": apiKey, "Accept": "application/json" },
            params: { date: dateStr, venueName: coreVenueName, p: 1 },
            timeout: 15000,
          });

          const setlists = response.data.setlist || [];
          console.log(`[SetlistMatcher] Global venue search found ${setlists.length} result(s)`);

          if (setlists.length > 0) {
            // Apply fuzzy matching to find best venue match
            const { isFuzzyVenueMatch } = await import("./fuzzyMatch");
            const matches = setlists.filter((s: any) =>
              s.venue?.name && isFuzzyVenueMatch(venueName, s.venue.name, 70)
            );

            if (matches.length > 0) {
              console.log(`[SetlistMatcher] Found ${matches.length} fuzzy match(es): ${matches.map((m: any) => m.venue?.name).join(', ')}`);
              return matches[0]; // Return first match
            }
          }
        } catch (error: any) {
          console.error(`[SetlistMatcher] Global venue search failed:`, error.message);
        }

        return null;
      },
    });
  }

  // Try each combination in order until we find a match
  for (const attempt of attempts) {
    try {
      console.log(`[SetlistMatcher] Trying: ${attempt.name}`);
      const result = await attempt.fn();
      
      if (result && result.venue) {
        console.log(`[SetlistMatcher] ✓ Found match with: ${attempt.name}`);
        return result;
      } else {
        console.log(`[SetlistMatcher] ✗ No match with: ${attempt.name}`);
      }
    } catch (error: any) {
      console.log(`[SetlistMatcher] ✗ Error with ${attempt.name}:`, error.message);
    }
  }
  
  console.log(`[SetlistMatcher] No matches found after trying all combinations`);
  return null;
}
