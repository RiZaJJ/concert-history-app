import { fetchSetlistByArtistAndDate, fetchSetlistByDateAndVenue, searchSetlistsByDateAndLocation, searchSetlistsByDateAndCity } from "./integrations";

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
  
  // 4. City + Date + Venue (when GPS not available but city is known)
  // This is the fallback when we only have venue name and date without GPS
  if (venueName && concertDate && !artistName && city) {
    attempts.push({
      name: "City + Date + Venue (no GPS)",
      fn: async () => {
        const result = await searchSetlistsByDateAndCity(concertDate, city, venueName);
        return result;
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
