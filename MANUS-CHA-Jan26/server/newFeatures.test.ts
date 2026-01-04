import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";
import type { InsertConcert, InsertPhoto, InsertUnmatchedPhoto } from "../drizzle/schema";

describe("Photo Grouping by Date+GPS", () => {
  const userId = 1; // Use test user ID
  let testPhotos: number[] = [];

  it("should group photos by date and GPS coordinates", async () => {
    // Create 3 photos at same location on same date (should return 1 representative)
    const date1 = new Date("2024-08-15T20:00:00Z");
    const lat1 = "47.098";
    const lon1 = "-119.278";
    
    for (let i = 0; i < 3; i++) {
      const photo = await db.createUnmatchedPhoto({
        userId,
        driveFileId: `test-group-1-${i}`,
        fileName: `test-group-1-${i}.jpg`,
        sourceUrl: `https://drive.google.com/file/d/test-group-1-${i}`,
        takenAt: date1,
        latitude: lat1,
        longitude: lon1,
        city: "George",
        state: "WA",
        country: "USA",
        venueName: "Gorge Amphitheatre",
        reviewed: "pending",
      });
      testPhotos.push(photo.id);
    }
    
    // Create 2 photos at different location on same date (should return 1 representative)
    const lat2 = "36.120";
    const lon2 = "-115.162";
    
    for (let i = 0; i < 2; i++) {
      const photo = await db.createUnmatchedPhoto({
        userId,
        driveFileId: `test-group-2-${i}`,
        fileName: `test-group-2-${i}.jpg`,
        sourceUrl: `https://drive.google.com/file/d/test-group-2-${i}`,
        takenAt: date1,
        latitude: lat2,
        longitude: lon2,
        city: "Las Vegas",
        state: "NV",
        country: "USA",
        venueName: "Sphere",
        reviewed: "pending",
      });
      testPhotos.push(photo.id);
    }
    
    // Create 1 photo at different date (should return 1 representative)
    const date2 = new Date("2024-08-16T20:00:00Z");
    const photo = await db.createUnmatchedPhoto({
      userId,
      driveFileId: "test-group-3-0",
      fileName: "test-group-3-0.jpg",
      sourceUrl: "https://drive.google.com/file/d/test-group-3-0",
      takenAt: date2,
      latitude: lat1,
      longitude: lon1,
      city: "George",
      state: "WA",
      country: "USA",
      venueName: "Gorge Amphitheatre",
      reviewed: "pending",
    });
    testPhotos.push(photo.id);
    
    // Get grouped photos
    const grouped = await db.getUnmatchedPhotos(userId, 50);
    
    // Should return at least 3 representatives (one per group we created)
    // Note: There may be other unmatched photos from previous tests
    expect(grouped.length).toBeGreaterThanOrEqual(3);
    
    // Verify our test photos are represented
    const group1Rep = grouped.find(p => p.venueName === "Gorge Amphitheatre" && new Date(p.takenAt!).getTime() === date1.getTime());
    const group2Rep = grouped.find(p => p.venueName === "Sphere" && new Date(p.takenAt!).getTime() === date1.getTime());
    const group3Rep = grouped.find(p => p.venueName === "Gorge Amphitheatre" && new Date(p.takenAt!).getTime() === date2.getTime());
    
    expect(group1Rep).toBeDefined();
    expect(group2Rep).toBeDefined();
    expect(group3Rep).toBeDefined();
    
    // Clean up
    for (const photoId of testPhotos) {
      await db.deleteUnmatchedPhoto(photoId);
    }
  });
  
  it("should handle photos without GPS coordinates separately", async () => {
    // Create photo without GPS
    const photoNoGPS = await db.createUnmatchedPhoto({
      userId,
      driveFileId: "test-no-gps",
      fileName: "test-no-gps.jpg",
      sourceUrl: "https://drive.google.com/file/d/test-no-gps",
      takenAt: new Date("2024-08-15T20:00:00Z"),
      latitude: null,
      longitude: null,
      city: null,
      state: null,
      country: null,
      venueName: null,
      reviewed: "pending",
    });
    
    const grouped = await db.getUnmatchedPhotos(userId, 50);
    
    // Should include the photo without GPS
    const foundNoGPS = grouped.find(p => p.id === photoNoGPS.id);
    expect(foundNoGPS).toBeDefined();
    
    // Clean up
    await db.deleteUnmatchedPhoto(photoNoGPS.id);
  });
});

describe("Concert Update", () => {
  const userId = 1; // Use test user ID
  let artistId: number;
  let venueId: number;
  let concertId: number;

  beforeAll(async () => {
    
    // Create test artist
    const artist = await db.createArtist({
      name: "Test Update Artist",
    });
    artistId = artist.id;
    
    // Create test venue
    const venue = await db.createVenue({
      name: "Test Update Venue",
      city: "Seattle",
      state: "WA",
      country: "USA",
    });
    venueId = venue.id;
    
    // Create test concert
    const concert = await db.createConcert({
      userId,
      artistId,
      venueId,
      concertDate: new Date("2024-08-15"),
      weatherCondition: "Clear",
      temperature: 75,
      weatherIcon: null,
    });
    concertId = concert.id;
  });

  it("should update concert with new artist", async () => {
    // Create new artist
    const newArtist = await db.createArtist({
      name: "Updated Artist Name",
    });
    
    // Update concert
    await db.updateConcert(concertId, {
      artistId: newArtist.id,
    });
    
    // Verify update
    const updated = await db.getConcertById(concertId);
    expect(updated?.artistId).toBe(newArtist.id);
  });
  
  it("should update concert with new venue", async () => {
    // Create new venue
    const newVenue = await db.createVenue({
      name: "Updated Venue Name",
      city: "Portland",
      state: "OR",
      country: "USA",
    });
    
    // Update concert
    await db.updateConcert(concertId, {
      venueId: newVenue.id,
    });
    
    // Verify update
    const updated = await db.getConcertById(concertId);
    expect(updated?.venueId).toBe(newVenue.id);
  });
  
  it("should update concert date", async () => {
    const newDate = new Date("2024-09-20");
    
    // Update concert
    await db.updateConcert(concertId, {
      concertDate: newDate,
    });
    
    // Verify update
    const updated = await db.getConcertById(concertId);
    expect(updated?.concertDate.getTime()).toBe(newDate.getTime());
  });
  
  it("should delete and recreate setlist when requested", async () => {
    // Create some setlist entries
    const song1 = await db.createSong({
      title: "Test Song 1",
      artistId,
    });
    
    const song2 = await db.createSong({
      title: "Test Song 2",
      artistId,
    });
    
    await db.createSetlistEntry({
      concertId,
      songId: song1.id,
      setNumber: 1,
      position: 1,
      notes: null,
    });
    
    await db.createSetlistEntry({
      concertId,
      songId: song2.id,
      setNumber: 1,
      position: 2,
      notes: null,
    });
    
    // Verify setlist exists
    let setlist = await db.getConcertSetlist(concertId);
    expect(setlist.length).toBe(2);
    
    // Delete setlist
    await db.deleteSetlistByConcert(concertId);
    
    // Verify setlist is deleted
    setlist = await db.getConcertSetlist(concertId);
    expect(setlist.length).toBe(0);
  });
});

describe("Database Helper Functions", () => {
  it("should find song by title", async () => {
    const artist = await db.createArtist({
      name: "Test Song Search Artist",
    });
    
    const uniqueTitle = `Unique Test Song Title ${Date.now()}`;
    const song = await db.createSong({
      title: uniqueTitle,
      artistId: artist.id,
    });
    
    const found = await db.getSongByTitle(uniqueTitle);
    expect(found).toBeDefined();
    expect(found?.id).toBe(song.id);
    expect(found?.title).toBe(uniqueTitle);
  });
  
  it("should return undefined for non-existent song", async () => {
    const found = await db.getSongByTitle("Non Existent Song Title XYZ");
    expect(found).toBeUndefined();
  });
});
