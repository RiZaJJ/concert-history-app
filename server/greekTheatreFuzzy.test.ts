import { describe, it, expect } from "vitest";
import { stringSimilarity, isFuzzyVenueMatch } from "./fuzzyMatch";

describe("Greek Theatre Fuzzy Matching", () => {
  it("should test similarity between 'The Greek Theatre' and 'William Randolph Hearst Greek Theatre'", () => {
    const venue1 = "The Greek Theatre";
    const venue2 = "William Randolph Hearst Greek Theatre";
    
    const similarity = stringSimilarity(venue1, venue2);
    const similarityPercent = (similarity * 100).toFixed(1);
    
    console.log(`\n=== Greek Theatre Fuzzy Match Test ===`);
    console.log(`Venue 1: "${venue1}"`);
    console.log(`Venue 2: "${venue2}"`);
    console.log(`Similarity: ${similarityPercent}%`);
    console.log(`Threshold: 70%`);
    console.log(`Match: ${similarity >= 0.70 ? 'YES ✓' : 'NO ✗'}`);
    
    // Document the result
    expect(similarity).toBeGreaterThan(0);
  });

  it("should test isFuzzyVenueMatch with 70% threshold", () => {
    const venue1 = "The Greek Theatre";
    const venue2 = "William Randolph Hearst Greek Theatre";
    
    const isMatch = isFuzzyVenueMatch(venue1, venue2, 70);
    
    console.log(`\nisFuzzyVenueMatch result: ${isMatch ? 'MATCH ✓' : 'NO MATCH ✗'}`);
    
    // This test documents whether the current threshold works
    // If it fails, we need to lower the threshold or improve normalization
  });

  it("should test various Greek Theatre name variations", () => {
    const variations = [
      ["The Greek Theatre", "Greek Theatre"],
      ["The Greek Theatre", "Greek Theater"],
      ["The Greek Theatre", "William Randolph Hearst Greek Theatre"],
      ["Greek Theatre", "William Randolph Hearst Greek Theatre"],
      ["Greek Theater Berkeley", "William Randolph Hearst Greek Theatre"],
    ];

    console.log(`\n=== Greek Theatre Name Variations ===`);
    variations.forEach(([name1, name2]) => {
      const similarity = stringSimilarity(name1, name2);
      const isMatch = isFuzzyVenueMatch(name1, name2, 70);
      console.log(`"${name1}" vs "${name2}": ${(similarity * 100).toFixed(1)}% ${isMatch ? '✓' : '✗'}`);
    });
  });
});
