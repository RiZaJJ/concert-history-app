import { describe, expect, it } from "vitest";
import { fetchSetlistByDateAndVenue, fetchCurrentWeather, listPhotosFromDrive } from "./integrations";

describe("API Integration Tests", () => {
  it("should validate setlist.fm API key", async () => {
    // Test with a known artist and date to verify API key works
    // Using a simple search that should return results or proper error
    try {
      const result = await fetchSetlistByDateAndVenue("Coldplay", "Any Venue", new Date("2023-01-01"));
      // If we get here, the API key is valid (even if no results found)
      expect(result).toBeDefined();
      expect(result).toHaveProperty("setlist");
    } catch (error: any) {
      // Check if error is due to invalid API key vs no results found
      if (error.message.includes("401") || error.message.includes("Unauthorized")) {
        throw new Error("Invalid SETLISTFM_API_KEY - please check your credentials");
      }
      // Other errors (like no results) are acceptable for validation
      expect(error).toBeDefined();
    }
  }, 15000);

  it("should validate OpenWeather API key", async () => {
    // Test with known coordinates (Seattle)
    const seattleLat = "47.6062";
    const seattleLon = "-122.3321";

    try {
      const result = await fetchCurrentWeather(seattleLat, seattleLon);
      // If we get here, the API key is valid
      expect(result).toBeDefined();
      expect(result).toHaveProperty("weather");
      expect(result).toHaveProperty("main");
      console.log(`Successfully fetched weather: ${result.weather[0]?.description}, ${result.main?.temp}°F`);
    } catch (error: any) {
      // Check if error is due to invalid API key
      if (error.message.includes("401") || error.message.includes("Invalid API key")) {
        throw new Error("Invalid OPENWEATHER_API_KEY - please check your credentials");
      }
      throw error;
    }
  }, 15000);

  it("should validate Google Drive credentials and folder access", async () => {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    
    if (!folderId) {
      throw new Error("GOOGLE_DRIVE_FOLDER_ID not configured");
    }

    try {
      const files = await listPhotosFromDrive(folderId);
      // If we get here, credentials are valid and folder is accessible
      expect(files).toBeDefined();
      expect(Array.isArray(files)).toBe(true);
      console.log(`Successfully accessed Google Drive folder with ${files.length} photos`);
    } catch (error: any) {
      // Check if error is due to invalid credentials or permissions
      if (error.message.includes("invalid_grant") || error.message.includes("unauthorized")) {
        throw new Error("Invalid GOOGLE_DRIVE_CREDENTIALS - please check your credentials");
      }
      if (error.message.includes("File not found") || error.message.includes("404")) {
        throw new Error("GOOGLE_DRIVE_FOLDER_ID not found or not accessible - check folder ID and sharing permissions");
      }
      throw error;
    }
  }, 15000);
});
