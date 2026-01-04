import { describe, it, expect } from "vitest";
import { searchSetlistsByDateAndLocation } from "./integrations";

describe("Photo Scanning Workflow", () => {
  it("should search setlist.fm by date and GPS coordinates", async () => {
    // Test with Climate Pledge Arena coordinates (Seattle)
    // Phish played there on 4/19/2025 (future date for testing)
    // Let's use a past date that likely has data
    const testDate = new Date("2024-08-10"); // Using a date from the test data
    const latitude = "37.7749"; // San Francisco coordinates
    const longitude = "-122.4194";

    const result = await searchSetlistsByDateAndLocation(testDate, latitude, longitude);

    console.log("Search result:", JSON.stringify(result, null, 2));

    expect(result).toBeDefined();
    expect(result.city).toBeDefined();
    // setlists might be empty if no concert on that exact date
    expect(Array.isArray(result.setlists)).toBe(true);
  });

  it("should handle coordinates with no concerts", async () => {
    // Random date/location with likely no concerts
    const testDate = new Date("2020-01-15");
    const latitude = "0";
    const longitude = "0";

    const result = await searchSetlistsByDateAndLocation(testDate, latitude, longitude);

    expect(result).toBeDefined();
    expect(result.setlists).toEqual([]);
  });
});
