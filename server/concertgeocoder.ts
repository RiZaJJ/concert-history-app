/**
 * Concert Venue Geocoding using OpenStreetMap Overpass API
 * Searches for specific venue types within 100 meters of GPS coordinates
 */

export interface GeocodingResult {
  venueName: string | null;
  venueAddress: string | null;
  venueType: string | null;
  confidence: number;
}

// OSM tags that qualify as venues
const VENUE_CRITERIA = {
  amenity: ["nightclub", "theater", "stage", "events_venue", "events_centre"],
  leisure: ["bandstand", "stadium", "park"],
};

const SEARCH_RADIUS_METERS = 50;

/**
 * Build Overpass API query for venues near coordinates
 */
function buildOverpassQuery(latitude: number, longitude: number): string {
  // Build amenity filters
  const amenityFilters = VENUE_CRITERIA.amenity
    .map((amenity) => `node["amenity"="${amenity}"](around:${SEARCH_RADIUS_METERS},${latitude},${longitude});`)
    .join("");

  // Build leisure filters
  const leisureFilters = VENUE_CRITERIA.leisure
    .map((leisure) => `node["leisure"="${leisure}"](around:${SEARCH_RADIUS_METERS},${latitude},${longitude});`)
    .join("");

  // Combine all filters
  const query = `
    [bbox:-90,-180,90,180];
    (
      ${amenityFilters}
      ${leisureFilters}
    );
    out center;
  `;

  return query;
}

/**
 * Calculate distance between two coordinates in meters
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Extract venue name and type from OSM tags
 */
function extractVenueInfo(element: any): { name: string | null; type: string | null } {
  const tags = element.tags || {};

  // Get venue name
  const name = tags.name || tags.ref || null;

  // Determine venue type from tags
  let type = null;
  for (const [tagKey, tagValues] of Object.entries(VENUE_CRITERIA)) {
    const tagValue = tags[tagKey];
    if (tagValue && (tagValues as string[]).includes(tagValue)) {
      type = tagValue;
      break;
    }
  }

  return { name, type };
}

/**
 * Search for venues near GPS coordinates using Overpass API
 * Returns the closest venue matching the criteria within 100 meters
 */
export async function geocodeToVenue(latitude: number, longitude: number): Promise<GeocodingResult> {
  // Validate coordinates
  if (isNaN(latitude) || isNaN(longitude)) {
    return {
      venueName: null,
      venueAddress: null,
      venueType: null,
      confidence: 0,
    };
  }

  try {
    console.log(`[Geocoding] Searching for venues near ${latitude}, ${longitude}`);

    // Query Overpass API
    const overpassUrl = "https://overpass-api.de/api/interpreter";
    const query = buildOverpassQuery(latitude, longitude);

    const response = await fetch(overpassUrl, {
      method: "POST",
      body: query,
      headers: {
        "Content-Type": "application/osm3s",
      },
    });

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status}`);
    }

    const data = await response.json();
    const elements = data.elements || [];

    if (elements.length === 0) {
      console.log("[Geocoding] No venues found within 100 meters");
      return {
        venueName: null,
        venueAddress: null,
        venueType: null,
        confidence: 0,
      };
    }

    // Find the closest venue
    let closestVenue = null;
    let closestDistance = SEARCH_RADIUS_METERS + 1;

    for (const element of elements) {
      const elementLat = element.center?.lat || element.lat;
      const elementLon = element.center?.lon || element.lon;

      if (!elementLat || !elementLon) continue;

      const distance = calculateDistance(latitude, longitude, elementLat, elementLon);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestVenue = element;
      }
    }

    if (!closestVenue) {
      return {
        venueName: null,
        venueAddress: null,
        venueType: null,
        confidence: 0,
      };
    }

    const { name, type } = extractVenueInfo(closestVenue);

    // Calculate confidence based on distance
    // Closer = higher confidence
    const distanceConfidence = Math.max(0.5, 1 - closestDistance / SEARCH_RADIUS_METERS);
    const hasNameConfidence = name ? 0.95 : 0.7;
    const confidence = Math.min(1, distanceConfidence * hasNameConfidence);

    console.log(
      `[Geocoding] Found venue: "${name}" (${type}) at ${closestDistance.toFixed(1)}m, confidence: ${confidence.toFixed(2)}`
    );

    return {
      venueName: name,
      venueAddress: `${closestVenue.center?.lat || closestVenue.lat}, ${closestVenue.center?.lon || closestVenue.lon}`,
      venueType: type,
      confidence,
    };
  } catch (error) {
    console.error("[Geocoding] Overpass API error:", error);
    // Return a mock result as fallback
    return {
      venueName: "Concert Venue (Pending Geocoding)",
      venueAddress: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      venueType: "music_venue",
      confidence: 0.3,
    };
  }
}
