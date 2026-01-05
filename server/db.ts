import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../drizzle/schema";
import { eq, and, desc, sql, like, or, isNull, isNotNull } from "drizzle-orm";
import { logDbRead, logDbWrite } from "./logger";
import { dateToNoonUTC } from "./dateUtils";

let connection: mysql.Connection | null = null;

export async function getDb() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!connection) {
    connection = await mysql.createConnection(process.env.DATABASE_URL);
  }

  return drizzle(connection, { schema, mode: "default" });
}

export { schema };

// --- User Functions ---
export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const results = await db.select().from(schema.users).where(eq(schema.users.id, id));
  logDbRead('users', 'getUserById', `id=${id}`, results.length);
  return results[0] || null;
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return null;
  const results = await db.select().from(schema.users).where(eq(schema.users.openId, openId));
  logDbRead('users', 'getUserByOpenId', `openId=${openId.slice(0, 10)}...`, results.length);
  return results[0] || null;
}

export async function createUser(user: schema.InsertUser) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(schema.users).values(user);
  logDbWrite('users', 'INSERT', `name=${user.name || 'unknown'}, id=${result.insertId}`);
  return { id: result.insertId };
}

export async function upsertUser(user: schema.InsertUser) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if user exists
  const existing = await getUserByOpenId(user.openId);

  if (existing) {
    // Update existing user
    await db.update(schema.users)
      .set({
        name: user.name,
        email: user.email,
        lastSignedIn: new Date()
      })
      .where(eq(schema.users.openId, user.openId));
    logDbWrite('users', 'UPDATE', `openId=${user.openId.slice(0, 10)}..., name=${user.name || 'unknown'}`);
    return existing;
  } else {
    // Create new user
    const result = await createUser(user);
    const newUser = await getUserById(result.id);
    return newUser!;
  }
}

// --- Artist & Venue Functions ---
export async function getArtistById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const results = await db.select().from(schema.artists).where(eq(schema.artists.id, id));
  logDbRead('artists', 'getArtistById', `id=${id}`, results.length);
  return results[0] || null;
}

export async function getVenueById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const results = await db.select().from(schema.venues).where(eq(schema.venues.id, id));
  logDbRead('venues', 'getVenueById', `id=${id}`, results.length);
  return results[0] || null;
}

export async function findVenueByNameAndCity(name: string, city: string) {
  const db = await getDb();
  if (!db) return null;
  const results = await db.select().from(schema.venues).where(
    and(eq(schema.venues.name, name), eq(schema.venues.city, city))
  );
  logDbRead('venues', 'findVenueByNameAndCity', `name="${name}", city="${city}"`, results.length);
  return results[0] || null;
}

export async function findArtistByName(name: string) {
  const db = await getDb();
  if (!db) return null;
  const results = await db.select().from(schema.artists).where(eq(schema.artists.name, name));
  logDbRead('artists', 'findArtistByName', `name="${name}"`, results.length);
  return results[0] || null;
}

export async function createArtist(artist: schema.InsertArtist): Promise<schema.Artist> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(schema.artists).values(artist);
  logDbWrite('artists', 'INSERT', `name="${artist.name}", id=${result.insertId}`);
  const created = await getArtistById(result.insertId);
  if (!created) throw new Error("Failed to create artist");
  return created;
}

export async function createVenue(venue: schema.InsertVenue): Promise<schema.Venue> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(schema.venues).values(venue);
  logDbWrite('venues', 'INSERT', `name="${venue.name}", city="${venue.city}", id=${result.insertId}`);
  const created = await getVenueById(result.insertId);
  if (!created) throw new Error("Failed to create venue");
  return created;
}

export async function findVenuesNearCoordinates(latitude: string, longitude: string, maxDistanceMiles: number = 10) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get all venues with GPS coordinates
  const allVenues = await db.select().from(schema.venues).where(
    and(
      isNotNull(schema.venues.latitude),
      isNotNull(schema.venues.longitude)
    )
  );

  logDbRead('venues', 'SELECT', `venues near ${latitude}, ${longitude}`, allVenues.length);

  const photoLat = parseFloat(latitude);
  const photoLon = parseFloat(longitude);

  // Calculate distance for each venue and filter
  const { calculateDistance } = await import('./gpsUtils');
  const nearbyVenues = allVenues
    .map(venue => {
      const distance = calculateDistance(photoLat, photoLon, parseFloat(venue.latitude!), parseFloat(venue.longitude!));
      return { venue, distance };
    })
    .filter(({ distance }) => distance <= maxDistanceMiles)
    .sort((a, b) => a.distance - b.distance); // Sort by distance, closest first

  console.log(`[DB] findVenuesNearCoordinates sorted ${nearbyVenues.length} venues:`);
  nearbyVenues.slice(0, 5).forEach((v, i) => console.log(`  ${i + 1}. ${v.venue.name} (${(v.distance * 1609.34).toFixed(0)}m)`));

  return nearbyVenues.map(({ venue, distance }) => ({ ...venue, distance }));
}

/**
 * Cache an OSM venue into the database for future lookups
 * Uses find-or-create pattern to avoid duplicates
 */
export async function cacheOSMVenue(osmVenue: {
  name: string;
  altName?: string;
  latitude: string;
  longitude: string;
  city?: string;
  state?: string;
  country?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if venue already exists nearby (within 100 meters = 0.062 miles)
  const existingVenues = await findVenuesNearCoordinates(osmVenue.latitude, osmVenue.longitude, 0.062);

  // Find exact match by name or altName
  const exactMatch = existingVenues.find(v =>
    v.name.toLowerCase().trim() === osmVenue.name.toLowerCase().trim() ||
    (osmVenue.altName && v.name.toLowerCase().trim() === osmVenue.altName.toLowerCase().trim())
  );

  if (exactMatch) {
    console.log(`[Venue Cache] Venue "${osmVenue.name}" already exists (ID: ${exactMatch.id})`);
    return exactMatch;
  }

  // Create new venue
  const altInfo = osmVenue.altName ? ` [alt: "${osmVenue.altName}"]` : '';
  console.log(`[Venue Cache] Caching new venue: "${osmVenue.name}"${altInfo} at ${osmVenue.latitude}, ${osmVenue.longitude}`);

  const newVenue = await createVenue({
    name: osmVenue.name,
    altName: osmVenue.altName,
    city: osmVenue.city || 'Unknown',
    state: osmVenue.state,
    country: osmVenue.country || 'Unknown',
    latitude: osmVenue.latitude,
    longitude: osmVenue.longitude,
  });

  return newVenue;
}

// --- Concert Functions ---
export async function getUserConcerts(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const results = await db.select().from(schema.concerts).where(eq(schema.concerts.userId, userId)).orderBy(desc(schema.concerts.concertDate));
  logDbRead('concerts', 'getUserConcerts', `userId=${userId}`, results.length, userId);
  return results;
}

/**
 * OPTIMIZED: Get user concerts with all related data in a single query
 * Uses JOINs and subqueries to avoid N+1 query problem
 *
 * Before: 1 + (N * 4) queries (e.g., 1 + 100*4 = 401 queries for 100 concerts)
 * After: 1 query with JOINs
 * Performance: ~10x faster for large datasets
 */
export async function getUserConcertsWithDetails(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const start = Date.now();

  // Single query with LEFT JOINs and COUNT subqueries
  const results = await db
    .select({
      // Concert fields
      id: schema.concerts.id,
      userId: schema.concerts.userId,
      artistId: schema.concerts.artistId,
      venueId: schema.concerts.venueId,
      concertDate: schema.concerts.concertDate,
      detectedAt: schema.concerts.detectedAt,
      weatherCondition: schema.concerts.weatherCondition,
      temperature: schema.concerts.temperature,
      weatherIcon: schema.concerts.weatherIcon,
      notes: schema.concerts.notes,
      setlistFmId: schema.concerts.setlistFmId,
      createdAt: schema.concerts.createdAt,
      updatedAt: schema.concerts.updatedAt,
      // Artist fields (joined)
      artist: {
        id: schema.artists.id,
        name: schema.artists.name,
        mbid: schema.artists.mbid,
        imageUrl: schema.artists.imageUrl,
        createdAt: schema.artists.createdAt,
        updatedAt: schema.artists.updatedAt,
      },
      // Venue fields (joined)
      venue: {
        id: schema.venues.id,
        name: schema.venues.name,
        city: schema.venues.city,
        state: schema.venues.state,
        country: schema.venues.country,
        latitude: schema.venues.latitude,
        longitude: schema.venues.longitude,
        capacity: schema.venues.capacity,
        address: schema.venues.address,
        createdAt: schema.venues.createdAt,
        updatedAt: schema.venues.updatedAt,
      },
      // Photo counts (subqueries)
      photoCount: sql<number>`(
        SELECT COUNT(*)
        FROM ${schema.photos}
        WHERE ${schema.photos.concertId} = ${schema.concerts.id}
      )`,
      starredCount: sql<number>`(
        SELECT COUNT(*)
        FROM ${schema.photos}
        WHERE ${schema.photos.concertId} = ${schema.concerts.id}
          AND ${schema.photos.isStarred} = true
      )`,
    })
    .from(schema.concerts)
    .leftJoin(schema.artists, eq(schema.concerts.artistId, schema.artists.id))
    .leftJoin(schema.venues, eq(schema.concerts.venueId, schema.venues.id))
    .where(eq(schema.concerts.userId, userId))
    .orderBy(desc(schema.concerts.concertDate));

  const duration = Date.now() - start;
  logDbRead('concerts', 'getUserConcertsWithDetails', `userId=${userId}, duration=${duration}ms`, results.length, userId);

  return results;
}

export async function getConcertById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const results = await db.select().from(schema.concerts).where(eq(schema.concerts.id, id));
  logDbRead('concerts', 'getConcertById', `id=${id}`, results.length);
  return results[0] || null;
}

export async function findConcert(userId: number, venueId: number, date: Date) {
  const db = await getDb();
  if (!db) return null;

  // BUGFIX: Normalize date to noon UTC for comparison
  // Concert dates are stored at noon UTC, but photo dates have exact timestamps
  // Without normalization, "2024-04-19T21:47:00Z" (photo) won't match "2024-04-19T12:00:00Z" (concert)
  const normalizedDate = dateToNoonUTC(date);

  const results = await db.select().from(schema.concerts).where(
    and(
      eq(schema.concerts.userId, userId),
      eq(schema.concerts.venueId, venueId),
      eq(schema.concerts.concertDate, normalizedDate)
    )
  );
  logDbRead('concerts', 'findConcert', `venueId=${venueId}, date=${normalizedDate.toISOString().split('T')[0]}`, results.length, userId);
  return results[0] || null;
}

export async function createConcert(concert: schema.InsertConcert): Promise<schema.Concert> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(schema.concerts).values(concert);
  logDbWrite('concerts', 'INSERT', `artistId=${concert.artistId}, venueId=${concert.venueId}, date=${concert.concertDate}, id=${result.insertId}`, true, concert.userId);
  const created = await getConcertById(result.insertId);
  if (!created) throw new Error("Failed to create concert");
  return created;
}

// --- Photo Functions ---
export async function createPhoto(photo: schema.InsertPhoto) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(schema.photos).values(photo);
  logDbWrite('photos', 'INSERT', `concertId=${photo.concertId}, filename=${photo.filename?.slice(0, 20) || 'unknown'}...`, true, photo.userId);
  return { ...photo, id: result.insertId };
}

export async function createUnmatchedPhoto(photo: schema.InsertUnmatchedPhoto) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(schema.unmatchedPhotos).values(photo);
  logDbWrite('unmatchedPhotos', 'INSERT', `venue="${photo.venueName || 'unknown'}", fileId=${photo.driveFileId?.slice(0, 10)}...`, true, photo.userId);
  return { ...photo, id: result.insertId };
}

export async function getUnmatchedPhotos(userId: number) {
  const db = await getDb();
  if (!db) return [];

  // Order by date, then by rounded GPS location (3 decimals ≈ 110m precision)
  // This groups photos from the same event together for easier review
  const results = await db.select().from(schema.unmatchedPhotos).where(
    and(
      eq(schema.unmatchedPhotos.userId, userId),
      eq(schema.unmatchedPhotos.reviewed, "pending")
    )
  ).orderBy(
    schema.unmatchedPhotos.takenAt,
    sql`ROUND(CAST(${schema.unmatchedPhotos.latitude} AS DECIMAL(10,6)), 3)`,
    sql`ROUND(CAST(${schema.unmatchedPhotos.longitude} AS DECIMAL(10,6)), 3)`,
    schema.unmatchedPhotos.id
  );

  logDbRead('unmatchedPhotos', 'getUnmatchedPhotos', `userId=${userId}`, results.length, userId);
  return results;
}

export async function getUnmatchedCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const results = await db.select({ count: sql<number>`count(*)` })
    .from(schema.unmatchedPhotos)
    .where(
      and(
        eq(schema.unmatchedPhotos.userId, userId),
        eq(schema.unmatchedPhotos.reviewed, "pending")
      )
    );
  const count = results[0]?.count || 0;
  logDbRead('unmatchedPhotos', 'getUnmatchedCount', `userId=${userId}`, count, userId);
  return count;
}

export async function getNoGpsPhotos(userId: number) {
  const db = await getDb();
  if (!db) return [];

  // Fetch photos without GPS that are pending review
  const results = await db.select().from(schema.unmatchedPhotos).where(
    and(
      eq(schema.unmatchedPhotos.userId, userId),
      eq(schema.unmatchedPhotos.noGps, 1),
      eq(schema.unmatchedPhotos.reviewed, "pending")
    )
  ).orderBy(desc(schema.unmatchedPhotos.takenAt));

  logDbRead('unmatchedPhotos', 'getNoGpsPhotos', `userId=${userId}`, results.length, userId);
  return results;
}

export async function getNoGpsPhotosCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;

  const results = await db.select({ count: sql<number>`count(*)` })
    .from(schema.unmatchedPhotos)
    .where(
      and(
        eq(schema.unmatchedPhotos.userId, userId),
        eq(schema.unmatchedPhotos.noGps, 1),
        eq(schema.unmatchedPhotos.reviewed, "pending")
      )
    );

  const count = results[0]?.count || 0;
  logDbRead('unmatchedPhotos', 'getNoGpsPhotosCount', `userId=${userId}`, count, userId);
  return count;
}

export async function getAmbiguousPhotos(userId: number) {
  const db = await getDb();
  if (!db) return [];

  // Fetch photos with ambiguous status (multiple concerts on same date)
  const results = await db.select().from(schema.unmatchedPhotos).where(
    and(
      eq(schema.unmatchedPhotos.userId, userId),
      eq(schema.unmatchedPhotos.reviewed, "ambiguous")
    )
  ).orderBy(desc(schema.unmatchedPhotos.takenAt));

  logDbRead('unmatchedPhotos', 'getAmbiguousPhotos', `userId=${userId}`, results.length, userId);
  return results;
}

export async function getAmbiguousPhotosCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;

  const results = await db.select({ count: sql<number>`count(*)` })
    .from(schema.unmatchedPhotos)
    .where(
      and(
        eq(schema.unmatchedPhotos.userId, userId),
        eq(schema.unmatchedPhotos.reviewed, "ambiguous")
      )
    );

  const count = results[0]?.count || 0;
  logDbRead('unmatchedPhotos', 'getAmbiguousPhotosCount', `userId=${userId}`, count, userId);
  return count;
}

export async function getConcertPhotos(concertId: number) {
  const db = await getDb();
  if (!db) return [];
  const results = await db.select().from(schema.photos).where(eq(schema.photos.concertId, concertId));
  logDbRead('photos', 'getConcertPhotos', `concertId=${concertId}`, results.length);
  return results;
}

export async function getPhotosCount(concertId: number) {
  const db = await getDb();
  if (!db) return 0;
  const results = await db.select({ count: sql<number>`count(*)` }).from(schema.photos).where(
    eq(schema.photos.concertId, concertId)
  );
  const count = results[0]?.count || 0;
  logDbRead('photos', 'getPhotosCount', `concertId=${concertId}`, count);
  return count;
}

export async function getStarredPhotosCount(concertId: number) {
  const db = await getDb();
  if (!db) return 0;
  const results = await db.select({ count: sql<number>`count(*)` }).from(schema.photos).where(
    and(eq(schema.photos.concertId, concertId), eq(schema.photos.isStarred, true))
  );
  const count = results[0]?.count || 0;
  logDbRead('photos', 'getStarredPhotosCount', `concertId=${concertId}`, count);
  return count;
}

export async function moveUnmatchedToConcert(unmatchedId: number, concertId: number) {
  const db = await getDb();
  if (!db) return;
  const [unmatched] = await db.select().from(schema.unmatchedPhotos).where(eq(schema.unmatchedPhotos.id, unmatchedId));
  if (!unmatched) return;

  await db.insert(schema.photos).values({
    userId: unmatched.userId,
    concertId: concertId,
    sourceUrl: unmatched.sourceUrl,
    filename: unmatched.fileName,
    mimeType: unmatched.mimeType,
    takenAt: unmatched.takenAt,
    latitude: unmatched.latitude,
    longitude: unmatched.longitude,
  });

  await db.update(schema.unmatchedPhotos).set({ reviewed: "linked", linkedConcertId: concertId }).where(eq(schema.unmatchedPhotos.id, unmatchedId));
  logDbWrite('photos', 'INSERT', `Moved unmatched photo ${unmatchedId} to concert ${concertId}`, true, unmatched.userId);
}

// --- Processed Files & Cleanup ---
export async function getProcessedPhotoIds(userId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const results = await db.select({ fileId: schema.processedFiles.fileId }).from(schema.processedFiles).where(eq(schema.processedFiles.userId, userId));
  logDbRead('processedFiles', 'getProcessedPhotoIds', `userId=${userId}`, results.length, userId);
  return results.map(r => r.fileId);
}

export async function getProcessedFilesCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const results = await db.select({ count: sql<number>`count(*)` })
    .from(schema.processedFiles)
    .where(eq(schema.processedFiles.userId, userId));
  const count = results[0]?.count || 0;
  logDbRead('processedFiles', 'getProcessedFilesCount', `userId=${userId}`, count, userId);
  return count;
}

export async function markFileAsProcessed(userId: number, fileId: string, filename: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(schema.processedFiles).values({ userId, fileId, filename });
  logDbWrite('processedFiles', 'INSERT', `filename="${filename.slice(0, 30)}..."`, true, userId);
}

export async function getScanCache(userId: number): Promise<{ totalDriveFiles: number } | null> {
  const db = await getDb();
  if (!db) return null;
  const results = await db.select().from(schema.scanCache).where(eq(schema.scanCache.userId, userId));
  logDbRead('scanCache', 'getScanCache', `userId=${userId}`, results.length, userId);
  return results[0] || null;
}

export async function updateScanCache(userId: number, totalDriveFiles: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getScanCache(userId);

  if (existing) {
    await db.update(schema.scanCache)
      .set({ totalDriveFiles, lastUpdated: new Date() })
      .where(eq(schema.scanCache.userId, userId));
  } else {
    await db.insert(schema.scanCache).values({ userId, totalDriveFiles });
  }

  logDbWrite('scanCache', existing ? 'UPDATE' : 'INSERT', `totalDriveFiles=${totalDriveFiles}`, true, userId);
}

export async function clearUnmatchedAndProcessed(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.select({ count: sql<number>`count(*)` }).from(schema.unmatchedPhotos).where(eq(schema.unmatchedPhotos.userId, userId));
  const count = result?.count || 0;

  await db.delete(schema.unmatchedPhotos).where(eq(schema.unmatchedPhotos.userId, userId));
  await db.delete(schema.processedFiles).where(eq(schema.processedFiles.userId, userId));
  logDbWrite('unmatchedPhotos', 'DELETE', `Cleared ${count} unmatched photos for user ${userId}`, true, userId);
  logDbWrite('processedFiles', 'DELETE', `Cleared all processed files for user ${userId}`, true, userId);

  return { count };
}

// --- Setlist Functions ---
export async function getConcertSetlist(concertId: number) {
  const db = await getDb();
  if (!db) return [];
  const results = await db.select().from(schema.setlists).where(eq(schema.setlists.concertId, concertId)).orderBy(schema.setlists.position);
  logDbRead('setlists', 'getConcertSetlist', `concertId=${concertId}`, results.length);
  return results;
}

export async function getSongById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const results = await db.select().from(schema.songs).where(eq(schema.songs.id, id));
  logDbRead('songs', 'getSongById', `id=${id}`, results.length);
  return results[0] || null;
}

// --- Skipped Photos ---
export async function getSkippedPhotos(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const results = await db.select().from(schema.unmatchedPhotos).where(
    and(
      eq(schema.unmatchedPhotos.userId, userId),
      eq(schema.unmatchedPhotos.reviewed, "skipped")
    )
  );
  logDbRead('unmatchedPhotos', 'getSkippedPhotos', `userId=${userId}`, results.length, userId);
  return results;
}

export async function updatePhoto(photoId: number, updates: { reviewed?: "pending" | "skipped" | "linked" }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(schema.unmatchedPhotos).set(updates).where(eq(schema.unmatchedPhotos.id, photoId));
  logDbWrite('unmatchedPhotos', 'UPDATE', `photoId=${photoId}, reviewed=${updates.reviewed}`);
  return { success: true };
}

export async function getUnmatchedPhotoById(photoId: number) {
  const db = await getDb();
  if (!db) return null;
  const results = await db.select().from(schema.unmatchedPhotos).where(eq(schema.unmatchedPhotos.id, photoId));
  logDbRead('unmatchedPhotos', 'getUnmatchedPhotoById', `id=${photoId}`, results.length);
  return results[0] || null;
}

export async function skipPhotosFromSameEvent(userId: number, takenAt: Date | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (!takenAt) return 0;

  // Find all pending photos within 18 hours of this photo's timestamp
  const eighteenHours = 18 * 60 * 60 * 1000;
  const startTime = new Date(takenAt.getTime() - eighteenHours);
  const endTime = new Date(takenAt.getTime() + eighteenHours);

  // Get count first
  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(schema.unmatchedPhotos)
    .where(
      and(
        eq(schema.unmatchedPhotos.userId, userId),
        eq(schema.unmatchedPhotos.reviewed, "pending"),
        sql`${schema.unmatchedPhotos.takenAt} >= ${startTime}`,
        sql`${schema.unmatchedPhotos.takenAt} <= ${endTime}`
      )
    );
  const count = countResult[0]?.count || 0;

  // Update all matching photos to skipped
  await db.update(schema.unmatchedPhotos)
    .set({ reviewed: "skipped" })
    .where(
      and(
        eq(schema.unmatchedPhotos.userId, userId),
        eq(schema.unmatchedPhotos.reviewed, "pending"),
        sql`${schema.unmatchedPhotos.takenAt} >= ${startTime}`,
        sql`${schema.unmatchedPhotos.takenAt} <= ${endTime}`
      )
    );

  logDbWrite('unmatchedPhotos', 'UPDATE', `Skipped ${count} photos from same event`, true, userId);
  return count;
}

// --- Additional Functions from MANUS ---

export async function searchArtists(query: string) {
  const db = await getDb();
  if (!db) return [];
  const results = await db.select().from(schema.artists).where(like(schema.artists.name, `%${query}%`));
  logDbRead('artists', 'searchArtists', `query="${query}"`, results.length);
  return results;
}

export async function searchVenues(query: string) {
  const db = await getDb();
  if (!db) return [];
  const results = await db.select().from(schema.venues).where(
    or(like(schema.venues.name, `%${query}%`), like(schema.venues.city, `%${query}%`))
  );
  logDbRead('venues', 'searchVenues', `query="${query}"`, results.length);
  return results;
}

export async function searchConcerts(userId: number, filters: {
  artistName?: string;
  venueName?: string;
  city?: string;
  year?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const allConcerts = await db.select({
    concert: schema.concerts,
    artist: schema.artists,
    venue: schema.venues,
  })
  .from(schema.concerts)
  .leftJoin(schema.artists, eq(schema.concerts.artistId, schema.artists.id))
  .leftJoin(schema.venues, eq(schema.concerts.venueId, schema.venues.id))
  .where(eq(schema.concerts.userId, userId))
  .orderBy(desc(schema.concerts.concertDate));

  const filtered = allConcerts.filter(r => {
    if (filters.artistName && !r.artist?.name.toLowerCase().includes(filters.artistName.toLowerCase())) return false;
    if (filters.venueName && !r.venue?.name.toLowerCase().includes(filters.venueName.toLowerCase())) return false;
    if (filters.city && !r.venue?.city.toLowerCase().includes(filters.city.toLowerCase())) return false;
    if (filters.year && r.concert.concertDate.getFullYear() !== filters.year) return false;
    return true;
  });

  logDbRead('concerts', 'searchConcerts', `userId=${userId}, filters=${JSON.stringify(filters)}`, filtered.length);
  return filtered.map(r => r.concert);
}

export async function updateUnmatchedPhotoStatus(photoId: number, status: "pending" | "skipped" | "linked", linkedConcertId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(schema.unmatchedPhotos).set({
    reviewed: status,
    linkedConcertId: linkedConcertId || null,
  }).where(eq(schema.unmatchedPhotos.id, photoId));
  logDbWrite('unmatchedPhotos', 'UPDATE', `photoId=${photoId}, status=${status}`);
}

export async function updateUnmatchedPhotoVenue(photoId: number, venueName: string, detectionMethod: string, confidence: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(schema.unmatchedPhotos).set({
    venueName,
    venueDetectionMethod: detectionMethod,
    venueConfidence: confidence,
  }).where(eq(schema.unmatchedPhotos.id, photoId));
  logDbWrite('unmatchedPhotos', 'UPDATE', `photoId=${photoId}, venue="${venueName}"`);
}

export async function updateUnmatchedPhoto(photoId: number, updates: Partial<{
  venueName: string | null;
  venueDetectionMethod: string | null;
  venueConfidence: string | null;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(schema.unmatchedPhotos).set(updates).where(eq(schema.unmatchedPhotos.id, photoId));
  logDbWrite('unmatchedPhotos', 'UPDATE', `photoId=${photoId}, fields=${Object.keys(updates).join(',')}`);
}

function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function findSimilarUnmatchedPhotos(targetDate: Date | null, targetLat: string | null, targetLon: string | null, userId: number) {
  if (!targetDate || !targetLat || !targetLon) return [];
  const db = await getDb();
  if (!db) return [];

  const allPhotos = await db.select().from(schema.unmatchedPhotos).where(
    and(eq(schema.unmatchedPhotos.userId, userId), eq(schema.unmatchedPhotos.reviewed, "pending"))
  );

  const targetDateStr = targetDate.toISOString().split('T')[0];
  const targetLatNum = parseFloat(targetLat);
  const targetLonNum = parseFloat(targetLon);

  const similar = allPhotos.filter(photo => {
    if (!photo.takenAt || !photo.latitude || !photo.longitude) return false;
    const photoDateStr = new Date(photo.takenAt).toISOString().split('T')[0];
    if (photoDateStr !== targetDateStr) return false;
    const latDiff = Math.abs(parseFloat(photo.latitude) - targetLatNum);
    const lonDiff = Math.abs(parseFloat(photo.longitude) - targetLonNum);
    return latDiff < 0.001 && lonDiff < 0.001;
  });

  logDbRead('unmatchedPhotos', 'findSimilarUnmatchedPhotos', `date=${targetDateStr}`, similar.length);
  return similar;
}

export async function skipPhotosByDateAndLocation(userId: number, takenAt: Date, latitude: string, longitude: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const targetDate = takenAt.toISOString().split('T')[0];
  const targetLat = parseFloat(latitude);
  const targetLon = parseFloat(longitude);

  const allPhotos = await db.select().from(schema.unmatchedPhotos).where(
    and(eq(schema.unmatchedPhotos.userId, userId), eq(schema.unmatchedPhotos.reviewed, "pending"))
  );

  const photosToSkip = allPhotos.filter(photo => {
    if (!photo.takenAt || !photo.latitude || !photo.longitude) return false;
    const photoDate = new Date(photo.takenAt).toISOString().split('T')[0];
    if (photoDate !== targetDate) return false;
    const distance = calculateDistanceMeters(targetLat, targetLon, parseFloat(photo.latitude), parseFloat(photo.longitude));
    return distance <= 200;
  });

  for (const photo of photosToSkip) {
    await db.update(schema.unmatchedPhotos).set({ reviewed: "skipped" }).where(eq(schema.unmatchedPhotos.id, photo.id));
  }

  logDbWrite('unmatchedPhotos', 'UPDATE', `Skipped ${photosToSkip.length} photos by date/location`, true, userId);
  return photosToSkip.length;
}

/**
 * Find nearby photos (within 500m) on the same date
 * Returns the concert ID if a matched photo is found nearby, null otherwise
 * Applies midnight date adjustment (00:00-04:00 treated as previous day)
 */
export async function findNearbyPhotoOnSameDate(
  userId: number,
  takenAt: Date,
  latitude: string,
  longitude: string
): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  // Import the midnight adjustment helper
  const { adjustDateForMidnight } = await import('./photoIngestion');
  const adjustedDate = adjustDateForMidnight(takenAt);
  const targetDate = adjustedDate.toISOString().split('T')[0];

  const targetLat = parseFloat(latitude);
  const targetLon = parseFloat(longitude);
  const maxDistanceMeters = 500;

  // First, check matched photos for nearby concert
  const matchedPhotos = await db.select()
    .from(schema.photos)
    .where(eq(schema.photos.userId, userId));

  for (const photo of matchedPhotos) {
    if (!photo.takenAt || !photo.latitude || !photo.longitude) continue;

    // Apply same midnight adjustment to existing photos
    const photoAdjustedDate = adjustDateForMidnight(new Date(photo.takenAt));
    const photoDate = photoAdjustedDate.toISOString().split('T')[0];

    if (photoDate !== targetDate) continue;

    const distance = calculateDistanceMeters(targetLat, targetLon, parseFloat(photo.latitude), parseFloat(photo.longitude));
    if (distance <= maxDistanceMeters && photo.concertId) {
      logDbRead('photos', 'findNearbyPhotoOnSameDate', `date=${targetDate}, distance=${distance.toFixed(0)}m`, 1);
      return photo.concertId;
    }
  }

  logDbRead('photos', 'findNearbyPhotoOnSameDate', `date=${targetDate}`, 0);
  return null;
}

export async function updateConcert(concertId: number, updates: Partial<schema.InsertConcert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(schema.concerts).set(updates).where(eq(schema.concerts.id, concertId));
  logDbWrite('concerts', 'UPDATE', `concertId=${concertId}`);
}

export async function updateConcertVenue(concertId: number, venueId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(schema.concerts).set({ venueId }).where(eq(schema.concerts.id, concertId));
  logDbWrite('concerts', 'UPDATE', `concertId=${concertId}, venueId=${venueId}`);
}

export async function deleteConcert(concertId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(schema.photos).where(eq(schema.photos.concertId, concertId));
  await db.delete(schema.setlists).where(eq(schema.setlists.concertId, concertId));
  await db.delete(schema.concerts).where(eq(schema.concerts.id, concertId));
  logDbWrite('concerts', 'DELETE', `concertId=${concertId} (with photos and setlist)`);
}

export async function mergeConcerts(sourceConcertId: number, targetConcertId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [sourceConcert] = await db.select().from(schema.concerts).where(and(eq(schema.concerts.id, sourceConcertId), eq(schema.concerts.userId, userId)));
  const [targetConcert] = await db.select().from(schema.concerts).where(and(eq(schema.concerts.id, targetConcertId), eq(schema.concerts.userId, userId)));

  if (!sourceConcert || !targetConcert) throw new Error("Concert not found");

  await db.update(schema.photos).set({ concertId: targetConcertId }).where(eq(schema.photos.concertId, sourceConcertId));

  const targetSetlist = await db.select().from(schema.setlists).where(eq(schema.setlists.concertId, targetConcertId));
  let copiedSetlist = false;

  if (targetSetlist.length === 0) {
    const sourceSetlist = await db.select().from(schema.setlists).where(eq(schema.setlists.concertId, sourceConcertId));
    if (sourceSetlist.length > 0) {
      for (const entry of sourceSetlist) {
        await db.insert(schema.setlists).values({
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

  await deleteConcert(sourceConcertId);
  logDbWrite('concerts', 'UPDATE', `merged: source=${sourceConcertId} -> target=${targetConcertId}`, true, userId);

  const movedPhotos = await db.select({ count: sql<number>`count(*)` }).from(schema.photos).where(eq(schema.photos.concertId, targetConcertId));
  return { movedPhotos: Number(movedPhotos[0]?.count || 0), copiedSetlist };
}

export async function deleteTestConcerts(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const testConcerts = await db.select({ id: schema.concerts.id })
    .from(schema.concerts)
    .innerJoin(schema.artists, eq(schema.concerts.artistId, schema.artists.id))
    .where(and(eq(schema.concerts.userId, userId), like(schema.artists.name, '%Test%')));

  for (const concert of testConcerts) {
    await deleteConcert(concert.id);
  }

  logDbWrite('concerts', 'DELETE', `Deleted ${testConcerts.length} test concerts`, true, userId);
  return testConcerts.length;
}

export async function deleteAllData(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const userConcerts = await db.select({ id: schema.concerts.id }).from(schema.concerts).where(eq(schema.concerts.userId, userId));
  const userPhotos = await db.select({ id: schema.photos.id }).from(schema.photos).where(eq(schema.photos.userId, userId));
  const userUnmatched = await db.select({ id: schema.unmatchedPhotos.id }).from(schema.unmatchedPhotos).where(eq(schema.unmatchedPhotos.userId, userId));
  const userProcessed = await db.select({ id: schema.processedFiles.id }).from(schema.processedFiles).where(eq(schema.processedFiles.userId, userId));

  // Delete all concerts (which also deletes setlists)
  for (const concert of userConcerts) {
    await deleteConcert(concert.id);
  }

  // Delete all user-specific data
  await db.delete(schema.photos).where(eq(schema.photos.userId, userId));
  await db.delete(schema.unmatchedPhotos).where(eq(schema.unmatchedPhotos.userId, userId));
  await db.delete(schema.processedFiles).where(eq(schema.processedFiles.userId, userId));
  await db.delete(schema.venueAliases).where(eq(schema.venueAliases.userId, userId));
  await db.delete(schema.scanCache).where(eq(schema.scanCache.userId, userId));

  // Delete ALL shared data (fresh cache on next scan)
  // These are shared across users but we clear them for a complete reset
  await db.delete(schema.venues);
  await db.delete(schema.artists);
  await db.delete(schema.songs);

  logDbWrite('ALL', 'DELETE', `Deleted all data for user ${userId} (including all caches: venues, artists, songs, venueAliases, scanCache)`, true, userId);
  return { concerts: userConcerts.length, photos: userPhotos.length, unmatchedPhotos: userUnmatched.length, processedFiles: userProcessed.length };
}

export async function createSong(song: schema.InsertSong): Promise<schema.Song> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(schema.songs).values(song);
  logDbWrite('songs', 'INSERT', `title="${song.title}", id=${result.insertId}`);
  const created = await getSongById(result.insertId);
  if (!created) throw new Error("Failed to create song");
  return created;
}

export async function getSongByTitle(title: string) {
  const db = await getDb();
  if (!db) return null;
  const results = await db.select().from(schema.songs).where(eq(schema.songs.title, title));
  logDbRead('songs', 'getSongByTitle', `title="${title}"`, results.length);
  return results[0] || null;
}

export async function createSetlistEntry(entry: schema.InsertSetlist) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(schema.setlists).values(entry);
  logDbWrite('setlists', 'INSERT', `concertId=${entry.concertId}, songId=${entry.songId}`);
  return { ...entry, id: result.insertId };
}

export async function deleteSetlistByConcert(concertId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(schema.setlists).where(eq(schema.setlists.concertId, concertId));
  logDbWrite('setlists', 'DELETE', `concertId=${concertId}`);
}

export async function getPhotoById(photoId: number) {
  const db = await getDb();
  if (!db) return null;
  const results = await db.select().from(schema.photos).where(eq(schema.photos.id, photoId));
  logDbRead('photos', 'getPhotoById', `id=${photoId}`, results.length);
  return results[0] || null;
}

export async function updatePhotoStarred(photoId: number, isStarred: boolean, s3Url?: string, s3Key?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(schema.photos).set({
    isStarred,
    starredAt: isStarred ? new Date() : null,
    s3Url: s3Url || null,
    s3Key: s3Key || null,
  }).where(eq(schema.photos.id, photoId));
  logDbWrite('photos', 'UPDATE', `photoId=${photoId}, isStarred=${isStarred}`);
}

export async function bulkHidePhotos(photoIds: number[], userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  for (const id of photoIds) {
    await db.update(schema.photos).set({ isHidden: true }).where(and(eq(schema.photos.id, id), eq(schema.photos.userId, userId)));
  }
  logDbWrite('photos', 'UPDATE', `Hidden ${photoIds.length} photos`, true, userId);
}

export async function bulkDeletePhotos(photoIds: number[], userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  for (const id of photoIds) {
    await db.delete(schema.photos).where(and(eq(schema.photos.id, id), eq(schema.photos.userId, userId)));
  }
  logDbWrite('photos', 'DELETE', `Deleted ${photoIds.length} photos`, true, userId);
}

export async function deleteUnmatchedPhoto(photoId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(schema.unmatchedPhotos).where(eq(schema.unmatchedPhotos.id, photoId));
  logDbWrite('unmatchedPhotos', 'DELETE', `photoId=${photoId}`);
}

export async function createVenueAlias(userId: number, alias: string, venueName: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(schema.venueAliases).values({ userId, alias, venueName });
  logDbWrite('venueAliases', 'INSERT', `alias="${alias}" -> "${venueName}"`);
}

export async function getVenueAliases(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const results = await db.select().from(schema.venueAliases).where(eq(schema.venueAliases.userId, userId));
  logDbRead('venueAliases', 'getVenueAliases', `userId=${userId}`, results.length);
  return results;
}

export async function deleteVenueAlias(aliasId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(schema.venueAliases).where(eq(schema.venueAliases.id, aliasId));
  logDbWrite('venueAliases', 'DELETE', `aliasId=${aliasId}`);
}

// Alias for compatibility
export const getArtistByName = findArtistByName;
export const findExistingConcert = findConcert;