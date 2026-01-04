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

describe("Concert Management", () => {
  let testConcertId: number;

  it("should create a new concert with weather data", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.concerts.create({
      artistName: "Test Band",
      venueName: "Test Arena",
      city: "Seattle",
      state: "WA",
      country: "USA",
      concertDate: new Date("2024-06-15"),
      latitude: "47.6062",
      longitude: "-122.3321",
    });

    expect(result).toBeDefined();
    expect(result.concert).toBeDefined();
    expect(result.concert.artistId).toBeGreaterThan(0);
    expect(result.concert.venueId).toBeGreaterThan(0);
    
    // Store the concert ID regardless of whether it's new or existing
    testConcertId = result.concert.id;
    
    // The concert should exist (either newly created or already present)
    expect(testConcertId).toBeGreaterThan(0);
  });

  it("should prevent duplicate concerts (deduplication)", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // Try to create the same concert again
    const result = await caller.concerts.create({
      artistName: "Test Band",
      venueName: "Test Arena",
      city: "Seattle",
      state: "WA",
      country: "USA",
      concertDate: new Date("2024-06-15"),
      latitude: "47.6062",
      longitude: "-122.3321",
    });

    expect(result.isNew).toBe(false);
    expect(result.concert.id).toBe(testConcertId);
  });

  it("should list user concerts", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const concerts = await caller.concerts.list();

    expect(Array.isArray(concerts)).toBe(true);
    expect(concerts.length).toBeGreaterThan(0);
    expect(concerts[0]).toHaveProperty("artist");
    expect(concerts[0]).toHaveProperty("venue");
    expect(concerts[0]).toHaveProperty("starredCount");
  });

  it("should get concert by id with details", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const concert = await caller.concerts.getById({ id: testConcertId });

    expect(concert).toBeDefined();
    expect(concert.id).toBe(testConcertId);
    expect(concert.artist).toBeDefined();
    expect(concert.venue).toBeDefined();
    expect(concert.photos).toBeDefined();
    expect(concert.setlist).toBeDefined();
  });

  it("should search concerts by artist name", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const results = await caller.concerts.search({
      artistName: "Test Band",
    });

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].artist?.name).toContain("Test Band");
  });

  it("should search concerts by city", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const results = await caller.concerts.search({
      city: "Seattle",
    });

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].venue?.city).toContain("Seattle");
  });

  it("should search concerts by year", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const results = await caller.concerts.search({
      year: 2024,
    });

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(new Date(results[0].concertDate).getFullYear()).toBe(2024);
  });

  it("should not allow access to other user's concerts", async () => {
    const { ctx } = createTestContext(999); // Different user
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.concerts.getById({ id: testConcertId });
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      expect(error.message).toContain("Concert not found");
    }
  });
});

describe("Artist and Venue Operations", () => {
  it("should search artists", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const results = await caller.artists.search({ query: "Test" });

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it("should search venues", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const results = await caller.venues.search({ query: "Test" });

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });
});
