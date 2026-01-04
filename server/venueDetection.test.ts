import { describe, it, expect } from "vitest";
import { findNearbyVenue } from "./integrations";

describe("Venue Detection with Category Filtering", () => {
  it("should find The Showbox in Seattle (known music venue)", async () => {
    // The Showbox coordinates (Seattle)
    const latitude = "47.6089";
    const longitude = "-122.3378";
    
    console.log("\n=== Testing The Showbox (Seattle) ===");
    const venue = await findNearbyVenue(latitude, longitude);
    
    console.log(`Result: ${venue}`);
    expect(venue).toBeTruthy();
    
    // Should find The Showbox, not nearby stores/restaurants
    if (venue) {
      const lowerVenue = venue.toLowerCase();
      const isLikelyVenue = 
        lowerVenue.includes('showbox') ||
        lowerVenue.includes('theater') ||
        lowerVenue.includes('theatre') ||
        lowerVenue.includes('venue') ||
        lowerVenue.includes('hall') ||
        lowerVenue.includes('club');
      
      console.log(`Is likely a venue: ${isLikelyVenue}`);
      expect(isLikelyVenue).toBe(true);
    }
  }, 15000);

  it("should find Madison Square Garden (famous arena)", async () => {
    // Madison Square Garden coordinates
    const latitude = "40.7505";
    const longitude = "-73.9934";
    
    console.log("\n=== Testing Madison Square Garden (NYC) ===");
    const venue = await findNearbyVenue(latitude, longitude);
    
    console.log(`Result: ${venue}`);
    expect(venue).toBeTruthy();
    
    if (venue) {
      const lowerVenue = venue.toLowerCase();
      expect(
        lowerVenue.includes('madison') || 
        lowerVenue.includes('garden') ||
        lowerVenue.includes('arena')
      ).toBe(true);
    }
  }, 15000);

  it("should find The Gorge Amphitheatre (outdoor venue)", async () => {
    // The Gorge Amphitheatre coordinates
    const latitude = "47.0989";
    const longitude = "-119.2728";
    
    console.log("\n=== Testing The Gorge Amphitheatre (George, WA) ===");
    const venue = await findNearbyVenue(latitude, longitude);
    
    console.log(`Result: ${venue}`);
    expect(venue).toBeTruthy();
    
    if (venue) {
      const lowerVenue = venue.toLowerCase();
      expect(
        lowerVenue.includes('gorge') ||
        lowerVenue.includes('amphitheatre') ||
        lowerVenue.includes('amphitheater')
      ).toBe(true);
    }
  }, 15000);
});
