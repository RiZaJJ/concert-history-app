import { eq, and, desc, asc, like, or, sql, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, users, 
  artists, InsertArtist, Artist,
  venues, InsertVenue, Venue,
  concerts, InsertConcert, Concert,
  songs, InsertSong, Song,
  setlists, InsertSetlist, Setlist,
  photos, InsertPhoto, Photo,
  unmatchedPhotos, InsertUnmatchedPhoto, UnmatchedPhoto,
  venueAliases, InsertVenueAlias, VenueAlias
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============ Artist Operations ============

export async function createArtist(artist: InsertArtist): Promise<Artist> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(artists).values(artist);
  const insertedId = Number(result[0].insertId);
  
  const inserted = await db.select().from(artists).where(eq(artists.id, insertedId)).limit(1);
  return inserted[0]!;
}

export async function getArtistByName(name: string): Promise<Artist | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(artists).where(eq(artists.name, name)).limit(1);
  return result[0];
}

export async function getArtistById(id: number): Promise<Artist | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(artists).where(eq(artists.id, id)).limit(1);
  return result[0];
}

export async function searchArtists(query: string): Promise<Artist[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(artists).where(like(artists.name, `%${query}%`)).limit(50);
}

// ============ Venue Operations ============

export async function createVenue(venue: InsertVenue): Promise<Venue> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(venues).values(venue);
  const insertedId = Number(result[0].insertId);
  
  const inserted = await db.select().from(venues).where(eq(venues.id, insertedId)).limit(1);
  return inserted[0]!;
}

export async function getVenueById(id: number): Promise<Venue | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(venues).where(eq(venues.id, id)).limit(1);
  return result[0];
}

export async function findVenueByNameAndCity(name: string, city: string): Promise<Venue | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(venues)
    .where(and(eq(venues.name, name), eq(venues.city, city)))
    .limit(1);
  return result[0];
}

export async function searchVenues(query: string): Promise<Venue[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(venues)
    .where(or(
      like(venues.name, `%${query}%`),
      like(venues.city, `%${query}%`)
    ))
    .limit(50);
}

// ============ Concert Operations ============

export async function createConcert(concert: InsertConcert): Promise<Concert> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(concerts).values(concert);
  const insertedId = Number(result[0].insertId);
  
  const inserted = await db.select().from(concerts).where(eq(concerts.id, insertedId)).limit(1);
  return inserted[0]!;
}

export async function getConcertById(id: number): Promise<Concert | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(concerts).where(eq(concerts.id, id)).limit(1);
  return result[0];
}

export async function findExistingConcert(
  userId: number,
  venueId: number,
  concertDate: Date
): Promise<Concert | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(concerts)
    .where(and(
      eq(concerts.userId, userId),
      eq(concerts.venueId, venueId),
      eq(concerts.concertDate, concertDate)
    ))
    .limit(1);
  return result[0];
}

export async function getUserConcerts(userId: number): Promise<Concert[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(concerts)
    .where(eq(concerts.userId, userId))
    .orderBy(desc(concerts.concertDate));
}

export async function searchConcerts(userId: number, filters: {
  artistName?: string;
  venueName?: string;
  city?: string;
  year?: number;
}): Promise<Concert[]> {
  const db = await getDb();
  if (!db) return [];

  let query = db.select({
    concert: concerts,
    artist: artists,
    venue: venues,
  })
  .from(concerts)
  .leftJoin(artists, eq(concerts.artistId, artists.id))
  .leftJoin(venues, eq(concerts.venueId, venues.id))
  .where(eq(concerts.userId, userId));

  const results = await query.orderBy(desc(concerts.concertDate));
  
  return results
    .filter(r => {
      if (filters.artistName && !r.artist?.name.toLowerCase().includes(filters.artistName.toLowerCase())) {
        return false;
      }
      if (filters.venueName && !r.venue?.name.toLowerCase().includes(filters.venueName.toLowerCase())) {
        return false;
      }
      if (filters.city && !r.venue?.city.toLowerCase().includes(filters.city.toLowerCase())) {
        return false;
      }
      if (filters.year && r.concert.concertDate.getFullYear() !== filters.year) {
        return false;
      }
      return true;
    })
    .map(r => r.concert);
}

// ============ Song Operations ============

export async function createSong(song: InsertSong): Promise<Song> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(songs).values(song);
  const insertedId = Number(result[0].insertId);
  
  const inserted = await db.select().from(songs).where(eq(songs.id, insertedId)).limit(1);
  return inserted[0]!;
}

export async function getSongById(id: number): Promise<Song | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(songs)
    .where(eq(songs.id, id))
    .limit(1);
  return result[0];
}

export async function getSongByTitle(title: string): Promise<Song | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(songs)
    .where(eq(songs.title, title))
    .limit(1);
  return result[0];
}

export async function findSongByTitleAndArtist(title: string, artistId: number): Promise<Song | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(songs)
    .where(and(eq(songs.title, title), eq(songs.artistId, artistId)))
    .limit(1);
  return result[0];
}

// ============ Setlist Operations ============

export async function createSetlistEntry(entry: InsertSetlist): Promise<Setlist> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(setlists).values(entry);
  const insertedId = Number(result[0].insertId);
  
  const inserted = await db.select().from(setlists).where(eq(setlists.id, insertedId)).limit(1);
  return inserted[0]!;
}

export async function getConcertSetlist(concertId: number): Promise<Setlist[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(setlists)
    .where(eq(setlists.concertId, concertId))
    .orderBy(asc(setlists.setNumber), asc(setlists.position));
}

export async function deleteSetlistByConcert(concertId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(setlists).where(eq(setlists.concertId, concertId));
}

// ============ Photo Operations ============

export async function createPhoto(photo: InsertPhoto): Promise<Photo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(photos).values(photo);
  const insertedId = Number(result[0].insertId);
  
  const inserted = await db.select().from(photos).where(eq(photos.id, insertedId)).limit(1);
  return inserted[0]!;
}

export async function getPhotoById(id: number): Promise<Photo | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(photos).where(eq(photos.id, id)).limit(1);
  return result[0];
}

export async function getConcertPhotos(concertId: number): Promise<Photo[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(photos)
    .where(eq(photos.concertId, concertId))
    .orderBy(desc(photos.takenAt));
}

export async function updatePhotoStarred(photoId: number, isStarred: boolean, s3Url?: string, s3Key?: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(photos)
    .set({
      isStarred,
      starredAt: isStarred ? new Date() : null,
      s3Url: s3Url || null,
      s3Key: s3Key || null,
    })
    .where(eq(photos.id, photoId));
}

export async function getStarredPhotosCount(concertId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db.select({ count: sql<number>`count(*)` })
    .from(photos)
    .where(and(eq(photos.concertId, concertId), eq(photos.isStarred, true)));
  
  return Number(result[0]?.count || 0);
}

// ============ Unmatched Photos Operations ============

export async function createUnmatchedPhoto(photo: InsertUnmatchedPhoto): Promise<UnmatchedPhoto> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(unmatchedPhotos).values(photo);
  const insertedId = Number(result[0].insertId);
  
  const inserted = await db.select().from(unmatchedPhotos).where(eq(unmatchedPhotos.id, insertedId)).limit(1);
  return inserted[0]!;
}

export async function getUnmatchedPhotos(userId: number, limit: number = 50): Promise<UnmatchedPhoto[]> {
  const db = await getDb();
  if (!db) return [];
  
  // Get all unmatched photos
  const allPhotos = await db
    .select()
    .from(unmatchedPhotos)
    .where(and(eq(unmatchedPhotos.userId, userId), eq(unmatchedPhotos.reviewed, "pending")))
    .orderBy(desc(unmatchedPhotos.createdAt));
  
  // Group by date + GPS coordinates (rounded to 3 decimal places for ~100m accuracy)
  const groups = new Map<string, UnmatchedPhoto[]>();
  
  for (const photo of allPhotos) {
    if (!photo.takenAt || !photo.latitude || !photo.longitude) {
      // Photos without date/GPS go in separate groups
      const key = `no-location-${photo.id}`;
      groups.set(key, [photo]);
      continue;
    }
    
    const date = new Date(photo.takenAt);
    const dateStr = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const lat = parseFloat(photo.latitude).toFixed(3);
    const lon = parseFloat(photo.longitude).toFixed(3);
    const key = `${dateStr}-${lat}-${lon}`;
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(photo);
  }
  
  // Return one representative photo per group (the first one)
  const representatives: UnmatchedPhoto[] = [];
  for (const group of Array.from(groups.values())) {
    representatives.push(group[0]);
  }
  
  return representatives.slice(0, limit);
}

export async function updateUnmatchedPhotoStatus(photoId: number, status: "pending" | "skipped" | "linked", linkedConcertId?: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(unmatchedPhotos)
    .set({ 
      reviewed: status,
      linkedConcertId: linkedConcertId || null,
    })
    .where(eq(unmatchedPhotos.id, photoId));
}

export async function getSkippedPhotos(userId: number): Promise<UnmatchedPhoto[]> {
  const db = await getDb();
  if (!db) return [];
  
  const photos = await db
    .select()
    .from(unmatchedPhotos)
    .where(and(eq(unmatchedPhotos.userId, userId), eq(unmatchedPhotos.reviewed, "skipped")))
    .orderBy(desc(unmatchedPhotos.createdAt));
  
  return photos;
}

export async function updateUnmatchedPhotoVenue(
  photoId: number,
  venueName: string,
  detectionMethod: string,
  confidence: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(unmatchedPhotos)
    .set({ 
      venueName,
      venueDetectionMethod: detectionMethod,
      venueConfidence: confidence,
    })
    .where(eq(unmatchedPhotos.id, photoId));
}

export async function getUnmatchedPhotoById(photoId: number): Promise<UnmatchedPhoto | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db
    .select()
    .from(unmatchedPhotos)
    .where(eq(unmatchedPhotos.id, photoId))
    .limit(1);
  
  return result[0];
}

/**
 * Venue Aliases
 */
export async function createVenueAlias(
  userId: number,
  alias: string,
  venueName: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(venueAliases).values({
    userId,
    alias,
    venueName,
  });
}

export async function getVenueAliases(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db
    .select()
    .from(venueAliases)
    .where(eq(venueAliases.userId, userId));
}

export async function deleteVenueAlias(aliasId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .delete(venueAliases)
    .where(eq(venueAliases.id, aliasId));
}

export async function deleteUnmatchedPhoto(photoId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(unmatchedPhotos).where(eq(unmatchedPhotos.id, photoId));
}

/**
 * Calculate distance between two GPS coordinates in meters using Haversine formula
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

export async function skipPhotosByDateAndLocation(
  userId: number,
  takenAt: Date,
  latitude: string,
  longitude: string
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Get the date portion (YYYY-MM-DD) for comparison
  const targetDate = takenAt.toISOString().split('T')[0];
  const targetLat = parseFloat(latitude);
  const targetLon = parseFloat(longitude);
  
  // Find all unmatched photos from the same user
  const allPhotos = await db
    .select()
    .from(unmatchedPhotos)
    .where(
      and(
        eq(unmatchedPhotos.userId, userId),
        eq(unmatchedPhotos.reviewed, "pending")
      )
    );
  
  // Filter by date (same day) and proximity (within 200 meters)
  const photosToSkip = allPhotos.filter(photo => {
    if (!photo.takenAt || !photo.latitude || !photo.longitude) return false;
    
    // Check if same date
    const photoDate = new Date(photo.takenAt).toISOString().split('T')[0];
    if (photoDate !== targetDate) return false;
    
    // Check if within 200 meters (typical concert venue size)
    const photoLat = parseFloat(photo.latitude);
    const photoLon = parseFloat(photo.longitude);
    const distance = calculateDistance(targetLat, targetLon, photoLat, photoLon);
    
    return distance <= 200; // 200 meters proximity
  });
  
  // Skip all matching photos
  if (photosToSkip.length > 0) {
    const idsToSkip = photosToSkip.map(p => p.id);
    await db
      .update(unmatchedPhotos)
      .set({ reviewed: "skipped" })
      .where(
        and(
          eq(unmatchedPhotos.userId, userId),
          inArray(unmatchedPhotos.id, idsToSkip)
        )
      );
  }
  
  return photosToSkip.length;
}

export async function updateConcert(
  concertId: number,
  updates: Partial<InsertConcert>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(concerts)
    .set(updates)
    .where(eq(concerts.id, concertId));
}

export async function updateConcertVenue(concertId: number, venueId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(concerts)
    .set({ venueId })
    .where(eq(concerts.id, concertId));
}

export async function deleteConcert(concertId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Delete cascade: photos, setlist entries, then concert
  await db.delete(photos).where(eq(photos.concertId, concertId));
  await db.delete(setlists).where(eq(setlists.concertId, concertId));
  await db.delete(concerts).where(eq(concerts.id, concertId));
}

export async function mergeConcerts(
  sourceConcertId: number,
  targetConcertId: number,
  userId: number
): Promise<{ movedPhotos: number; copiedSetlist: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Verify both concerts exist and belong to the user
  const [sourceConcert, targetConcert] = await Promise.all([
    db.select().from(concerts).where(and(eq(concerts.id, sourceConcertId), eq(concerts.userId, userId))).limit(1),
    db.select().from(concerts).where(and(eq(concerts.id, targetConcertId), eq(concerts.userId, userId))).limit(1)
  ]);
  
  if (!sourceConcert[0] || !targetConcert[0]) {
    throw new Error("Concert not found or access denied");
  }
  
  // Move all photos from source to target
  await db.update(photos)
    .set({ concertId: targetConcertId })
    .where(eq(photos.concertId, sourceConcertId));
  
  const movedPhotos = await db.select({ count: sql<number>`count(*)` })
    .from(photos)
    .where(eq(photos.concertId, targetConcertId));
  
  // Check if target has setlist data
  const targetSetlist = await db.select().from(setlists)
    .where(eq(setlists.concertId, targetConcertId))
    .limit(1);
  
  let copiedSetlist = false;
  
  // If target has no setlist but source does, copy setlist data
  if (targetSetlist.length === 0) {
    const sourceSetlist = await db.select().from(setlists)
      .where(eq(setlists.concertId, sourceConcertId));
    
    if (sourceSetlist.length > 0) {
      // Copy setlist entries to target concert
      for (const entry of sourceSetlist) {
        await db.insert(setlists).values({
          concertId: targetConcertId,
          songId: entry.songId,
          setNumber: entry.setNumber,
          position: entry.position,
          notes: entry.notes
        });
      }
      copiedSetlist = true;
    }
  }
  
  // Delete the source concert (cascade will handle remaining setlist entries)
  await deleteConcert(sourceConcertId);
  
  return {
    movedPhotos: Number(movedPhotos[0]?.count || 0),
    copiedSetlist
  };
}

export async function deleteTestConcerts(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Find all concerts with "Test" in artist name
  const testConcerts = await db
    .select({ id: concerts.id })
    .from(concerts)
    .innerJoin(artists, eq(concerts.artistId, artists.id))
    .where(and(
      eq(concerts.userId, userId),
      like(artists.name, '%Test%')
    ));
  
  // Delete each test concert
  for (const concert of testConcerts) {
    await deleteConcert(concert.id);
  }
  
  return testConcerts.length;
}

export async function getProcessedFileIds(userId: number): Promise<Set<string>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { processedFiles } = await import("../drizzle/schema");
  const results = await db
    .select({ fileId: processedFiles.fileId })
    .from(processedFiles)
    .where(eq(processedFiles.userId, userId));
  
  return new Set(results.map(r => r.fileId));
}

export async function markFileAsProcessed(userId: number, fileId: string, filename: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  try {
    const { processedFiles } = await import("../drizzle/schema");
    await db.insert(processedFiles).values({
      userId,
      fileId,
      filename,
    });
  } catch (error: any) {
    // Ignore duplicate key errors - file already marked as processed
    if (!error.message?.includes('Duplicate entry')) {
      console.error('Error marking file as processed:', error);
      throw error;
    }
  }
}

export async function bulkHidePhotos(photoIds: number[], userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(photos)
    .set({ isHidden: true })
    .where(and(inArray(photos.id, photoIds), eq(photos.userId, userId)));
}

export async function bulkDeletePhotos(photoIds: number[], userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .delete(photos)
    .where(and(inArray(photos.id, photoIds), eq(photos.userId, userId)));
}

export async function getPhotosByConcert(concertId: number, includeHidden: boolean = false): Promise<Photo[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  if (includeHidden) {
    return await db.select().from(photos).where(eq(photos.concertId, concertId));
  } else {
    return await db.select().from(photos).where(
      and(eq(photos.concertId, concertId), eq(photos.isHidden, false))
    );
  }
}

export async function findSimilarUnmatchedPhotos(
  targetDate: Date | null,
  targetLat: string | null,
  targetLon: string | null,
  userId: number
): Promise<UnmatchedPhoto[]> {
  if (!targetDate || !targetLat || !targetLon) {
    return [];
  }
  
  const db = await getDb();
  if (!db) return [];
  
  // Find photos from same date (within same day) and similar location (within ~100m)
  const allPhotos = await db
    .select()
    .from(unmatchedPhotos)
    .where(
      and(
        eq(unmatchedPhotos.userId, userId),
        eq(unmatchedPhotos.reviewed, "pending")
      )
    );
  
  const targetDateObj = new Date(targetDate);
  const targetDateStr = targetDateObj.toISOString().split('T')[0]; // YYYY-MM-DD
  const targetLatNum = parseFloat(targetLat);
  const targetLonNum = parseFloat(targetLon);
  
  return allPhotos.filter(photo => {
    if (!photo.takenAt && !photo.fileCreatedAt) return false;
    if (!photo.latitude || !photo.longitude) return false;
    
    const photoDate = photo.takenAt || photo.fileCreatedAt;
    if (!photoDate) return false;
    const photoDateStr = new Date(photoDate).toISOString().split('T')[0];
    
    // Same date
    if (photoDateStr !== targetDateStr) return false;
    
    // Similar location (within ~100m, approximately 0.001 degrees)
    const photoLat = parseFloat(photo.latitude);
    const photoLon = parseFloat(photo.longitude);
    const latDiff = Math.abs(photoLat - targetLatNum);
    const lonDiff = Math.abs(photoLon - targetLonNum);
    
    return latDiff < 0.001 && lonDiff < 0.001;
  });
}

/**
 * Delete ALL data for a user - concerts, photos, unmatched photos, processed files
 * This is a complete database reset for the user
 */
export async function deleteAllData(userId: number): Promise<{ 
  concerts: number; 
  photos: number; 
  unmatchedPhotos: number; 
  processedFiles: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { processedFiles } = await import("../drizzle/schema");
  
  // Get counts before deletion
  const userConcerts = await db
    .select({ id: concerts.id })
    .from(concerts)
    .where(eq(concerts.userId, userId));
  
  const userPhotos = await db
    .select({ id: photos.id })
    .from(photos)
    .where(eq(photos.userId, userId));
  
  const userUnmatchedPhotos = await db
    .select({ id: unmatchedPhotos.id })
    .from(unmatchedPhotos)
    .where(eq(unmatchedPhotos.userId, userId));
  
  const userProcessedFiles = await db
    .select({ id: processedFiles.id })
    .from(processedFiles)
    .where(eq(processedFiles.userId, userId));
  
  // Delete all concerts (cascade will handle setlists)
  for (const concert of userConcerts) {
    await deleteConcert(concert.id);
  }
  
  // Delete all remaining photos (in case some weren't linked to concerts)
  await db.delete(photos).where(eq(photos.userId, userId));
  
  // Delete all unmatched photos
  await db.delete(unmatchedPhotos).where(eq(unmatchedPhotos.userId, userId));
  
  // Delete all processed file records
  await db.delete(processedFiles).where(eq(processedFiles.userId, userId));
  
  return {
    concerts: userConcerts.length,
    photos: userPhotos.length,
    unmatchedPhotos: userUnmatchedPhotos.length,
    processedFiles: userProcessedFiles.length,
  };
}
