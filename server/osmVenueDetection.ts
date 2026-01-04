import axios from 'axios';

/**
 * OpenStreetMap Overpass API integration for venue detection
 * Uses structured OSM tags instead of fuzzy keyword matching
 */

// Venue-specific OSM tags we're looking for
const VENUE_TAGS = {
  amenity: ['nightclub', 'theater', 'theatre', 'stage', 'events_venue', 'events_centre'],
  leisure: ['bandstand', 'stadium', 'park'],
};

interface OSMElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: {
    name?: string;
    amenity?: string;
    leisure?: string;
    [key: string]: string | undefined;
  };
}

interface OSMVenue {
  name: string;
  lat: number;
  lon: number;
  tags: {
    amenity?: string;
    leisure?: string;
    [key: string]: string | undefined;
  };
  matchedTag: string; // e.g., "amenity=nightclub"
  distance: number; // meters from query point
}

/**
 * Query OpenStreetMap Overpass API for venues near GPS coordinates
 * @param latitude GPS latitude
 * @param longitude GPS longitude
 * @param radiusMeters Search radius in meters (default: 100m)
 * @returns Array of venues matching our tag criteria
 */
export async function findOSMVenues(
  latitude: string,
  longitude: string,
  radiusMeters: number = 100
): Promise<OSMVenue[]> {
  try {
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    // Build Overpass QL query
    // Search for nodes, ways, and relations with our venue tags within radius
    const query = `
      [out:json][timeout:10];
      (
        node(around:${radiusMeters},${lat},${lon})["amenity"~"^(${VENUE_TAGS.amenity.join('|')})$"];
        way(around:${radiusMeters},${lat},${lon})["amenity"~"^(${VENUE_TAGS.amenity.join('|')})$"];
        relation(around:${radiusMeters},${lat},${lon})["amenity"~"^(${VENUE_TAGS.amenity.join('|')})$"];
        node(around:${radiusMeters},${lat},${lon})["leisure"~"^(${VENUE_TAGS.leisure.join('|')})$"];
        way(around:${radiusMeters},${lat},${lon})["leisure"~"^(${VENUE_TAGS.leisure.join('|')})$"];
        relation(around:${radiusMeters},${lat},${lon})["leisure"~"^(${VENUE_TAGS.leisure.join('|')})$"];
      );
      out center tags;
    `;

    console.log(`[OSM Venue Detection] Querying Overpass API for venues within ${radiusMeters}m of ${lat}, ${lon}`);

    const response = await axios.post(
      'https://overpass-api.de/api/interpreter',
      query,
      {
        headers: { 'Content-Type': 'text/plain' },
        timeout: 15000,
      }
    );

    const elements: OSMElement[] = response.data.elements || [];
    console.log(`[OSM Venue Detection] Found ${elements.length} OSM elements`);

    // Filter and transform results
    const venues: OSMVenue[] = [];

    for (const element of elements) {
      // Skip elements without names
      if (!element.tags?.name) {
        console.log(`[OSM Venue Detection] Skipping unnamed element ${element.id}`);
        continue;
      }

      // Get coordinates (nodes have lat/lon, ways/relations have center)
      const elementLat = element.lat || element.center?.lat;
      const elementLon = element.lon || element.center?.lon;

      if (!elementLat || !elementLon) {
        console.log(`[OSM Venue Detection] Skipping element ${element.id} without coordinates`);
        continue;
      }

      // Determine which tag matched
      let matchedTag = '';
      if (element.tags.amenity && VENUE_TAGS.amenity.includes(element.tags.amenity)) {
        matchedTag = `amenity=${element.tags.amenity}`;
      } else if (element.tags.leisure && VENUE_TAGS.leisure.includes(element.tags.leisure)) {
        matchedTag = `leisure=${element.tags.leisure}`;
      }

      if (!matchedTag) {
        console.log(`[OSM Venue Detection] Element ${element.id} has no matching venue tags`);
        continue;
      }

      // Calculate distance from query point
      const distance = calculateDistance(lat, lon, elementLat, elementLon);

      venues.push({
        name: element.tags.name,
        lat: elementLat,
        lon: elementLon,
        tags: element.tags,
        matchedTag,
        distance,
      });

      console.log(`[OSM Venue Detection] Found venue: ${element.tags.name} (${matchedTag}, ${distance.toFixed(0)}m away)`);
    }

    // Sort by distance (closest first)
    venues.sort((a, b) => a.distance - b.distance);

    console.log(`[OSM Venue Detection] Returning ${venues.length} venues`);
    return venues;
  } catch (error: any) {
    const statusCode = error.response?.status || error.code;
    const errorDetails = error.response?.data || error.message;

    if (statusCode === 429) {
      console.error("[OSM Overpass API] ❌ 429 RATE LIMIT EXCEEDED - Too many requests");
      console.error(`[OSM Overpass] Response: ${JSON.stringify(errorDetails)}`);
    } else if (statusCode === 500) {
      console.error("[OSM Overpass API] ❌ 500 INTERNAL SERVER ERROR - Overpass server issue");
      console.error(`[OSM Overpass] Response: ${JSON.stringify(errorDetails)}`);
    } else if (statusCode === 504) {
      console.error("[OSM Overpass API] ❌ 504 GATEWAY TIMEOUT - Query took too long");
      console.error(`[OSM Overpass] Response: ${JSON.stringify(errorDetails)}`);
      console.error(`[OSM Overpass] Query may be too complex or server is overloaded`);
    } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      console.error("[OSM Overpass API] ❌ REQUEST TIMEOUT - Client-side timeout after 15s");
    } else {
      console.error(`[OSM Overpass API] Error (${statusCode || error.code || 'unknown'}):`, errorDetails);
    }

    return [];
  }
}

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @returns Distance in meters
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Find the best venue from OSM results with setlist.fm validation
 * @param latitude GPS latitude
 * @param longitude GPS longitude
 * @param city City name for setlist.fm validation
 * @returns Best matching venue or null
 */
export async function findBestOSMVenue(
  latitude: string,
  longitude: string,
  city?: string
): Promise<{ name: string; method: string; confidence: string } | null> {
  const venues = await findOSMVenues(latitude, longitude, 600); // Expand to 600m to find more candidates

  if (venues.length === 0) {
    console.log('[OSM Venue Detection] No venues found');
    return null;
  }

  console.log(`[OSM Venue Detection] Found ${venues.length} venues, validating against setlist.fm...`);

  // Validate top venues (up to 5 closest) against setlist.fm if city is provided
  if (city) {
    const { validateVenueOnSetlistFm } = await import('./integrations');

    for (const venue of venues.slice(0, 5)) {
      const validation = await validateVenueOnSetlistFm(venue.name, city);

      if (validation.hasSetlists) {
        // Found a venue with setlists! Use this one.
        console.log(`[OSM Venue Detection] ✓ Selected "${venue.name}" (${venue.distance.toFixed(0)}m away, ${validation.setlistCount} concerts on setlist.fm)`);

        // Determine confidence based on distance + setlist.fm presence
        let confidence = 'high';
        if (venue.distance > 50) {
          confidence = 'medium';
        }
        if (venue.distance > 200) {
          confidence = 'low';
        }

        return {
          name: venue.name,
          method: 'osm_scan_validated',
          confidence
        };
      } else {
        console.log(`[OSM Venue Detection] ✗ Skipping "${venue.name}" (${venue.distance.toFixed(0)}m) - no concerts on setlist.fm`);
      }
    }

    console.log('[OSM Venue Detection] ⚠️ No venues found with setlist.fm data');
  }

  // Fallback: Return the closest venue if very close (< 50m) even without setlist.fm validation
  const best = venues[0];
  if (best.distance < 50) {
    console.log(`[OSM Venue Detection] Using closest venue "${best.name}" (${best.distance.toFixed(0)}m) without validation`);

    let confidence = 'high';
    if (best.matchedTag.startsWith('leisure=park')) {
      confidence = 'low';
    }

    return {
      name: best.name,
      method: `osm_${best.matchedTag.replace('=', '_')}`,
      confidence,
    };
  }

  // No validated venues found and not close enough to trust
  console.log(`[OSM Venue Detection] ⚠️ No suitable venue found (closest is ${best.name} at ${best.distance.toFixed(0)}m but failed validation)`);
  return null;
}
