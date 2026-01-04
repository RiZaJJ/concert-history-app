import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";

describe("skipAllFromEvent", () => {
  it("should skip all photos from the same date and location", async () => {
    // Get all unmatched photos
    const unmatchedPhotos = await db.getUnmatchedPhotos(1, 100);
    console.log(`Found ${unmatchedPhotos.length} unmatched photos`);
    
    if (unmatchedPhotos.length === 0) {
      console.log("No unmatched photos to test");
      return;
    }
    
    // Group by date and location
    const grouped = new Map<string, typeof unmatchedPhotos>();
    unmatchedPhotos.forEach(photo => {
      if (photo.takenAt && photo.latitude && photo.longitude) {
        const date = new Date(photo.takenAt).toISOString().split('T')[0];
        const key = `${date}-${photo.latitude}-${photo.longitude}`;
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(photo);
      }
    });
    
    console.log("\nPhotos grouped by date and location:");
    grouped.forEach((photos, key) => {
      console.log(`  ${key}: ${photos.length} photos`);
      photos.forEach(p => {
        console.log(`    - ID ${p.id}: ${p.fileName}`);
      });
    });
    
    // Find a group with multiple photos
    const testGroup = Array.from(grouped.values()).find(g => g.length > 1);
    
    if (!testGroup) {
      console.log("\nNo group with multiple photos found");
      return;
    }
    
    const testPhoto = testGroup[0];
    console.log(`\nTesting with photo ID ${testPhoto.id} from group of ${testGroup.length} photos`);
    console.log(`Date: ${testPhoto.takenAt}`);
    console.log(`GPS: ${testPhoto.latitude}, ${testPhoto.longitude}`);
    
    // Call skipPhotosByDateAndLocation
    const skippedCount = await db.skipPhotosByDateAndLocation(
      1,
      testPhoto.takenAt!,
      testPhoto.latitude!,
      testPhoto.longitude!
    );
    
    console.log(`\nSkipped ${skippedCount} photos`);
    expect(skippedCount).toBeGreaterThan(0);
    
    // Verify photos were skipped
    const remainingPhotos = await db.getUnmatchedPhotos(1, 100);
    console.log(`Remaining unmatched photos: ${remainingPhotos.length}`);
    
    // Check that none of the skipped photos are still pending
    const stillPending = remainingPhotos.filter(p => 
      testGroup.some(tp => tp.id === p.id)
    );
    
    console.log(`Photos from test group still pending: ${stillPending.length}`);
    expect(stillPending.length).toBe(0);
  });
});
