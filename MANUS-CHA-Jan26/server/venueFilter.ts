/**
 * Venue filtering and scoring logic
 * Filters out non-venue places from Google Maps results
 */

interface VenueCandidate {
  name: string;
  types?: string[];
  [key: string]: any;
}

interface ScoredVenue extends VenueCandidate {
  venueScore: number;
  venueReasons: string[];
}

// Keywords that indicate a concert venue
const VENUE_KEYWORDS = [
  'theater', 'theatre', 'arena', 'amphitheater', 'amphitheatre',
  'hall', 'auditorium', 'club', 'venue', 'stadium', 'pavilion',
  'center', 'centre', 'ballroom', 'opera', 'concert', 'music',
  'showbox', 'crocodile', 'paramount', 'moore', 'neptune',
  'gorge', 'greek', 'bowl', 'coliseum', 'palace'
];

// Keywords that indicate NOT a concert venue
const NOISE_KEYWORDS = [
  'restaurant', 'cafe', 'coffee', 'bar', 'grill', 'pizza', 'burger',
  'hotel', 'motel', 'inn', 'lodge', 'resort',
  'store', 'shop', 'market', 'mall', 'pharmacy', 'gas',
  'parking', 'garage', 'lot',
  'bank', 'atm', 'hospital', 'clinic', 'dental',
  'school', 'university', 'library', 'museum',
  'church', 'temple', 'mosque', 'synagogue',
  'park', 'trail', 'playground', 'beach'
];

// Google Maps place types that indicate a venue
const VENUE_TYPES = [
  'night_club', 'stadium', 'movie_theater', 'bowling_alley',
  'casino', 'tourist_attraction', 'establishment'
];

// Google Maps place types that indicate noise
const NOISE_TYPES = [
  'restaurant', 'cafe', 'bar', 'lodging', 'store', 'parking',
  'gas_station', 'hospital', 'school', 'church', 'park',
  'supermarket', 'pharmacy', 'bank', 'atm', 'car_rental'
];

/**
 * Score a venue candidate based on name and types
 * Returns a score from -100 (definitely not a venue) to 100 (definitely a venue)
 */
export function scoreVenue(candidate: VenueCandidate): ScoredVenue {
  let score = 0;
  const reasons: string[] = [];
  const nameLower = candidate.name.toLowerCase();
  
  // Check venue keywords in name (positive scoring)
  for (const keyword of VENUE_KEYWORDS) {
    if (nameLower.includes(keyword)) {
      score += 30;
      reasons.push(`Contains venue keyword: "${keyword}"`);
      break; // Only count once
    }
  }
  
  // Check noise keywords in name (negative scoring)
  for (const keyword of NOISE_KEYWORDS) {
    if (nameLower.includes(keyword)) {
      score -= 50;
      reasons.push(`Contains noise keyword: "${keyword}"`);
      break; // Only count once
    }
  }
  
  // Check Google Maps types
  if (candidate.types) {
    for (const type of candidate.types) {
      if (VENUE_TYPES.includes(type)) {
        score += 20;
        reasons.push(`Venue type: ${type}`);
      }
      if (NOISE_TYPES.includes(type)) {
        score -= 40;
        reasons.push(`Noise type: ${type}`);
      }
    }
  }
  
  // Boost score for very short names (often venue names)
  // e.g., "Showbox", "Crocodile", "Neumos"
  if (nameLower.length <= 15 && !nameLower.includes(' ')) {
    score += 10;
    reasons.push('Short single-word name');
  }
  
  // Penalize very long names (often businesses)
  if (nameLower.length > 50) {
    score -= 20;
    reasons.push('Very long name');
  }
  
  return {
    ...candidate,
    venueScore: score,
    venueReasons: reasons
  };
}

/**
 * Filter and sort venue candidates
 * Returns only likely venues, sorted by score
 */
export function filterVenues(candidates: VenueCandidate[], threshold: number = 0): ScoredVenue[] {
  const scored = candidates.map(scoreVenue);
  
  // Filter by threshold
  const filtered = scored.filter(v => v.venueScore >= threshold);
  
  // Sort by score (highest first)
  filtered.sort((a, b) => b.venueScore - a.venueScore);
  
  return filtered;
}

/**
 * Get the best venue candidate from a list
 */
export function getBestVenue(candidates: VenueCandidate[]): ScoredVenue | null {
  const filtered = filterVenues(candidates, 0);
  return filtered.length > 0 ? filtered[0] : null;
}
