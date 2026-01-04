import { describe, it, expect } from "vitest";
import { calculateDistance, isWithinDistance } from "./gpsUtils";

describe("GPS Distance Calculation", () => {
  it("should calculate distance between Woodinville WA and Nashville TN correctly", () => {
    // Chateau Ste Michelle, Woodinville WA
    const woodinvilleLat = 47.7287;
    const woodinvilleLon = -122.1509;
    
    // Nashville, TN (approximate)
    const nashvilleLat = 36.1627;
    const nashvilleLon = -86.7816;
    
    const distance = calculateDistance(
      woodinvilleLat,
      woodinvilleLon,
      nashvilleLat,
      nashvilleLon
    );
    
    console.log(`Distance: ${distance.toFixed(1)} miles`);
    
    // Should be approximately 2000 miles
    expect(distance).toBeGreaterThan(1900);
    expect(distance).toBeLessThan(2100);
  });
  
  it("should reject Nashville concert when filtering from Woodinville location", () => {
    const woodinvilleLat = 47.7287;
    const woodinvilleLon = -122.1509;
    const nashvilleLat = 36.1627;
    const nashvilleLon = -86.7816;
    
    const within50Miles = isWithinDistance(
      woodinvilleLat,
      woodinvilleLon,
      nashvilleLat,
      nashvilleLon,
      50
    );
    
    expect(within50Miles).toBe(false);
  });
  
  it("should accept concerts within 50 miles", () => {
    // Seattle Center (Climate Pledge Arena)
    const seattleLat = 47.6221;
    const seattleLon = -122.3540;
    
    // Woodinville (Chateau Ste Michelle)
    const woodinvilleLat = 47.7287;
    const woodinvilleLon = -122.1509;
    
    const distance = calculateDistance(
      seattleLat,
      seattleLon,
      woodinvilleLat,
      woodinvilleLon
    );
    
    console.log(`Seattle to Woodinville: ${distance.toFixed(1)} miles`);
    
    // Should be about 15-20 miles
    expect(distance).toBeLessThan(50);
    
    const within50Miles = isWithinDistance(
      seattleLat,
      seattleLon,
      woodinvilleLat,
      woodinvilleLon,
      50
    );
    
    expect(within50Miles).toBe(true);
  });
});
