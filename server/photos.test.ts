import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(userId: number = 1): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `test-user-${userId}`,
    email: `test${userId}@example.com`,
    name: `Test User ${userId}`,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("Photo Management", () => {
  let testConcertId: number;
  let testPhotoId: number;

  beforeAll(async () => {
    // Create test data
    const artist = await db.createArtist({ name: "Photo Test Band" });
    const venue = await db.createVenue({
      name: "Photo Test Venue",
      city: "Portland",
      country: "USA",
    });
    const concert = await db.createConcert({
      userId: 1,
      artistId: artist.id,
      venueId: venue.id,
      concertDate: new Date("2024-07-20"),
    });
    testConcertId = concert.id;

    // Create test photo
    const photo = await db.createPhoto({
      concertId: concert.id,
      userId: 1,
      sourceUrl: "https://drive.google.com/test-photo.jpg",
      takenAt: new Date("2024-07-20T20:00:00"),
      filename: "test-photo.jpg",
      mimeType: "image/jpeg",
      isStarred: false,
    });
    testPhotoId = photo.id;
  });

  it("should get photos by concert", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const photos = await caller.photos.getByConcert({ concertId: testConcertId });

    expect(Array.isArray(photos)).toBe(true);
    expect(photos.length).toBeGreaterThan(0);
    expect(photos[0]).toHaveProperty("sourceUrl");
    expect(photos[0]).toHaveProperty("isStarred");
  });

  it("should star a photo", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.photos.toggleStar({
      photoId: testPhotoId,
      isStarred: true,
    });

    expect(result.success).toBe(true);

    // Verify the photo is starred
    const photo = await db.getPhotoById(testPhotoId);
    expect(photo?.isStarred).toBe(true);
    expect(photo?.starredAt).toBeDefined();
  });

  it("should unstar a photo", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.photos.toggleStar({
      photoId: testPhotoId,
      isStarred: false,
    });

    expect(result.success).toBe(true);

    // Verify the photo is unstarred
    const photo = await db.getPhotoById(testPhotoId);
    expect(photo?.isStarred).toBe(false);
  });

  it("should not allow access to other user's photos", async () => {
    const { ctx } = createTestContext(999); // Different user
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.photos.toggleStar({
        photoId: testPhotoId,
        isStarred: true,
      });
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      expect(error.message).toContain("Photo not found");
    }
  });

  it("should count starred photos correctly", async () => {
    // Star a photo first
    await db.updatePhotoStarred(testPhotoId, true);

    const count = await db.getStarredPhotosCount(testConcertId);

    expect(count).toBeGreaterThan(0);
  });
});

describe("Photo Ingestion (Unit Tests)", () => {
  it("should create photo record with EXIF data", async () => {
    const artist = await db.createArtist({ name: "EXIF Test Band" });
    const venue = await db.createVenue({
      name: "EXIF Test Venue",
      city: "San Francisco",
      country: "USA",
    });
    const concert = await db.createConcert({
      userId: 1,
      artistId: artist.id,
      venueId: venue.id,
      concertDate: new Date("2024-08-10"),
    });

    const photo = await db.createPhoto({
      concertId: concert.id,
      userId: 1,
      sourceUrl: "https://drive.google.com/exif-test.jpg",
      takenAt: new Date("2024-08-10T19:30:00"),
      latitude: "37.7749",
      longitude: "-122.4194",
      filename: "exif-test.jpg",
      mimeType: "image/jpeg",
      isStarred: false,
    });

    expect(photo).toBeDefined();
    expect(photo.latitude).toBe("37.7749");
    expect(photo.longitude).toBe("-122.4194");
    expect(photo.takenAt).toBeDefined();
  });
});
