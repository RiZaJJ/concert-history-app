import { describe, it, expect } from "vitest";
import { getUnmatchedPhotos } from "./db";

describe("Dashboard count update after scan", () => {
  it("should return current unmatched photo count", async () => {
    const photos = await getUnmatchedPhotos();
    
    console.log(`Current unmatched photos: ${photos.length}`);
    expect(Array.isArray(photos)).toBe(true);
    
    // Log first few photos for debugging
    if (photos.length > 0) {
      console.log("Sample unmatched photos:");
      photos.slice(0, 3).forEach(p => {
        console.log(`  - ${p.fileName} (${p.venueName || 'no venue'})`);
      });
    }
  });
});
