/**
 * Calculate Levenshtein distance between two strings
 * Returns the minimum number of single-character edits (insertions, deletions, substitutions)
 * needed to change one string into the other
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  
  // Create a 2D array for dynamic programming
  const dp: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));
  
  // Initialize first row and column
  for (let i = 0; i <= len1; i++) dp[i][0] = i;
  for (let j = 0; j <= len2; j++) dp[0][j] = j;
  
  // Fill the dp table
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,     // deletion
          dp[i][j - 1] + 1,     // insertion
          dp[i - 1][j - 1] + 1  // substitution
        );
      }
    }
  }
  
  return dp[len1][len2];
}

/**
 * Calculate similarity score between two strings (0-100%)
 * Uses Levenshtein distance normalized by the longer string length
 */
export function stringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 100;
  
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  const maxLength = Math.max(str1.length, str2.length);
  
  return Math.round(((maxLength - distance) / maxLength) * 100);
}

/**
 * Normalize venue name for comparison
 * - Convert to lowercase
 * - Remove common prefixes (William Randolph Hearst, The, etc.)
 * - Remove common suffixes (amphitheatre, theater, venue, etc.)
 * - Remove punctuation
 * - Normalize whitespace
 */
function normalizeVenueName(name: string): string {
  return name
    .toLowerCase()
    // BUGFIX: Normalize unicode characters (é → e, ñ → n, etc.)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Remove common venue name prefixes
    .replace(/^(william randolph hearst|the)\s+/gi, '')
    // Remove location suffixes like "at the Market", "@ The Venetian", etc.
    // Examples: "Showbox at the Market" → "Showbox", "Sphere at The Venetian" → "Sphere"
    .replace(/\s+(at|@)\s+(the\s+)?[\w\s]+$/i, '')
    // Remove common venue type suffixes
    .replace(/\b(amphitheatre|amphitheater|theater|theatre|venue|winery|arena|stadium|hall|center|centre|auditorium|pavilion)\b/gi, '')
    // Remove punctuation (EXPANDED: now includes apostrophes, quotes, and more special chars)
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()'"''""\[\]<>|\\@#]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if two venue names are a fuzzy match
 * Returns true if similarity score is above threshold
 * 
 * @param name1 First venue name
 * @param name2 Second venue name
 * @param threshold Minimum similarity percentage (0-100), default 70
 */
export function isFuzzyVenueMatch(name1: string, name2: string, threshold: number = 70): boolean {
  if (!name1 || !name2) return false;

  // Exact match
  if (name1.toLowerCase() === name2.toLowerCase()) return true;

  // IMPORTANT: Check substring match BEFORE normalization
  // This catches cases like "Mann" vs "TD Pavilion at the Mann"
  // Normalization would remove "Mann" (everything after "at the")
  const lower1 = name1.toLowerCase().trim();
  const lower2 = name2.toLowerCase().trim();

  if (lower1.length >= 4 && lower2.includes(lower1)) {
    console.log(`[Fuzzy Match] "${name1}" is substring of "${name2}" (before normalization)`);
    return true;
  }
  if (lower2.length >= 4 && lower1.includes(lower2)) {
    console.log(`[Fuzzy Match] "${name2}" is substring of "${name1}" (before normalization)`);
    return true;
  }

  // Normalize and compare
  const normalized1 = normalizeVenueName(name1);
  const normalized2 = normalizeVenueName(name2);

  // Check if one is a substring of the other (after normalization)
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    return true;
  }

  // Try extracting core venue names and compare those
  // "The Mann Center" vs "TD Pavillion at the Mann" → both extract to "Mann"
  // Import dynamically to avoid circular dependency
  let extractCoreVenueName: (name: string) => string;
  try {
    const setlistMatcher = require('./setlistMatcher');
    extractCoreVenueName = setlistMatcher.extractCoreVenueName;
  } catch {
    // Fallback if import fails
    extractCoreVenueName = (name: string) => name;
  }

  const core1 = normalizeVenueName(extractCoreVenueName(name1));
  const core2 = normalizeVenueName(extractCoreVenueName(name2));

  if (core1 === core2 && core1.length >= 4) {
    console.log(`[Fuzzy Match] Core name match: "${name1}" vs "${name2}" → "${core1}"`);
    return true;
  }

  // Check if either core name is substring of the other normalized name
  if (core1.length >= 4 && (normalized2.includes(core1) || normalized1.includes(core2))) {
    console.log(`[Fuzzy Match] Core name substring match: "${name1}" vs "${name2}"`);
    return true;
  }

  // IMPORTANT: Before checking string similarity, verify at least ONE significant word matches
  // This prevents "The Mann Center Lounge" from matching "DNA Lounge" (73% similar but no real overlap)
  const words1 = normalized1.split(/\s+/).filter(w => w.length > 2);
  const words2 = normalized2.split(/\s+/).filter(w => w.length > 2);

  // Common venue words that don't count as significant
  const commonWords = new Set(['the', 'and', 'lounge', 'center', 'centre', 'hall', 'theater', 'theatre',
                                'amphitheatre', 'amphitheater', 'arena', 'stadium', 'ballroom', 'club',
                                'bar', 'cafe', 'room', 'house', 'park']);

  const significantWords1 = words1.filter(w => !commonWords.has(w.toLowerCase()));
  const significantWords2 = words2.filter(w => !commonWords.has(w.toLowerCase()));

  // Check if at least one significant word exists in both
  const hasCommonWord = significantWords1.some(w1 =>
    significantWords2.some(w2 =>
      w1.includes(w2) || w2.includes(w1) || stringSimilarity(w1, w2) >= 80
    )
  );

  if (!hasCommonWord && significantWords1.length > 0 && significantWords2.length > 0) {
    console.log(`[Fuzzy Match] "${name1}" vs "${name2}": NO significant word overlap - rejecting`);
    console.log(`  Significant words in "${name1}": ${significantWords1.join(', ')}`);
    console.log(`  Significant words in "${name2}": ${significantWords2.join(', ')}`);
    return false;
  }

  // Calculate similarity score
  const similarity = stringSimilarity(normalized1, normalized2);

  console.log(`[Fuzzy Match] "${name1}" vs "${name2}": ${similarity}% (threshold: ${threshold}%)`);

  return similarity >= threshold;
}

/**
 * Find the best matching venue name from a list
 * Returns the venue with the highest similarity score above threshold
 */
export function findBestVenueMatch(
  targetName: string,
  candidates: string[],
  threshold: number = 70
): { name: string; score: number } | null {
  if (!targetName || !candidates || candidates.length === 0) return null;
  
  const normalized = normalizeVenueName(targetName);
  let bestMatch: { name: string; score: number } | null = null;
  
  for (const candidate of candidates) {
    const candidateNormalized = normalizeVenueName(candidate);
    const score = stringSimilarity(normalized, candidateNormalized);
    
    if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { name: candidate, score };
    }
  }
  
  return bestMatch;
}
