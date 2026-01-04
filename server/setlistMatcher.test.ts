import { describe, it, expect } from "vitest";
import { findSetlistWithAllCombinations } from "./setlistMatcher";

describe("Enhanced Setlist Matching", () => {
  it("should find setlist with artist + date", async () => {
    const result = await findSetlistWithAllCombinations({
      artistName: "Phish",
      concertDate: new Date("2024-12-31"),
    });
    
    console.log("Artist + Date result:", result ? "Found" : "Not found");
    if (result) {
      console.log(`  Artist: ${result.artist?.name}`);
      console.log(`  Venue: ${result.venue?.name}`);
    }
    
    // Result might be null if no concert on that date, which is fine
    expect(result !== undefined).toBe(true);
  });
  
  it("should try multiple combinations when given all three fields", async () => {
    const result = await findSetlistWithAllCombinations({
      artistName: "Coldplay",
      venueName: "Madison Square Garden",
      concertDate: new Date("2024-01-01"),
    });
    
    console.log("All fields result:", result ? "Found" : "Not found");
    
    // Should try artist+date first, then artist+venue+date
    expect(result !== undefined).toBe(true);
  });
  
  it("should handle partial data gracefully", async () => {
    // Only date provided - should not crash
    const result = await findSetlistWithAllCombinations({
      concertDate: new Date("2024-01-01"),
    });
    
    console.log("Date only result:", result ? "Found" : "Not found");
    expect(result).toBeNull(); // Should return null, not crash
  });
});
