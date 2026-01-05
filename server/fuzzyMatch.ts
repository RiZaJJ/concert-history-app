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
  
  // Normalize and compare
  const normalized1 = normalizeVenueName(name1);
  const normalized2 = normalizeVenueName(name2);
  
  // Check if one is a substring of the other (after normalization)
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    return true;
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
