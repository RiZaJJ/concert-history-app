import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(userId: number = 1): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `test-user-${userId}`,
    name: `Test User ${userId}`,
    email: `test${userId}@example.com`,
    role: "user",
  };
  return { ctx: { user } };
}

describe("Concert Creation with 2 of 3 Fields", () => {
  it("should create concert with venue + date (no artist)", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);
    
    const result = await caller.concerts.create({
      venueName: "Test Venue",
      city: "Seattle",
      country: "US",
      concertDate: new Date("2024-01-15"),
    });
    
    expect(result.concert).toBeDefined();
    expect(result.concert.artistId).toBeDefined(); // Should create "Unknown Artist"
    expect(result.concert.venueId).toBeDefined();
  });
  
  it("should create concert with artist + date (no venue)", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);
    
    const result = await caller.concerts.create({
      artistName: "Test Artist",
      concertDate: new Date("2024-01-15"),
    });
    
    expect(result.concert).toBeDefined();
    expect(result.concert.artistId).toBeDefined();
    expect(result.concert.venueId).toBeDefined(); // Should create "Unknown Venue"
  });
  
  it("should create concert with artist + venue + date", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);
    
    const result = await caller.concerts.create({
      artistName: "Test Artist 2",
      venueName: "Test Venue 2",
      city: "Portland",
      country: "US",
      concertDate: new Date("2024-02-20"),
    });
    
    expect(result.concert).toBeDefined();
    expect(result.concert.artistId).toBeDefined();
    expect(result.concert.venueId).toBeDefined();
  });
  
  it("should reject concert with only date", async () => {
    const { ctx } = createTestContext();
    const caller = appRouter.createCaller(ctx);
    
    await expect(
      caller.concerts.create({
        concertDate: new Date("2024-01-15"),
      })
    ).rejects.toThrow();
  });
});
