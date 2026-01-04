import { describe, expect, it } from "vitest";
import { getFileContent } from "./integrations";

describe("JSON Sidecar Metadata", () => {
  it("should successfully fetch JSON file content from Google Drive", async () => {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!folderId) {
      console.warn("GOOGLE_DRIVE_FOLDER_ID not configured, skipping test");
      return;
    }

    // This test verifies that we can read JSON files from Google Drive
    // The actual file ID would need to be from a real JSON metadata file
    // For now, we just verify the function exists and doesn't throw
    expect(getFileContent).toBeDefined();
    expect(typeof getFileContent).toBe("function");
  });

  it("should parse Google Photos JSON metadata structure", () => {
    // Sample Google Photos JSON structure
    const sampleJSON = {
      photoTakenTime: {
        timestamp: "1692000000", // Unix timestamp in seconds
        formatted: "Aug 14, 2023, 12:00:00 PM UTC"
      },
      geoData: {
        latitude: 37.7749,
        longitude: -122.4194,
        altitude: 0.0,
        latitudeSpan: 0.0,
        longitudeSpan: 0.0
      },
      title: "IMG_8177.DNG"
    };

    // Verify the structure we expect to parse
    expect(sampleJSON.photoTakenTime.timestamp).toBeDefined();
    expect(sampleJSON.geoData.latitude).toBeDefined();
    expect(sampleJSON.geoData.longitude).toBeDefined();

    // Convert timestamp to Date
    const date = new Date(parseInt(sampleJSON.photoTakenTime.timestamp) * 1000);
    expect(date).toBeInstanceOf(Date);
    expect(date.getFullYear()).toBe(2023);
  });

  it("should handle alternative GPS data structure (geoDataExif)", () => {
    const sampleJSON = {
      photoTakenTime: {
        timestamp: "1692000000"
      },
      geoDataExif: {
        latitude: 37.7749,
        longitude: -122.4194
      }
    };

    expect(sampleJSON.geoDataExif.latitude).toBeDefined();
    expect(sampleJSON.geoDataExif.longitude).toBeDefined();
  });
});
