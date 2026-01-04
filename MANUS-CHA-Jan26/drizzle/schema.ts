import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, index, uniqueIndex } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Artists table - stores information about musical artists/bands
 */
export const artists = mysqlTable("artists", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  mbid: varchar("mbid", { length: 64 }), // MusicBrainz ID from setlist.fm
  imageUrl: text("imageUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  nameIdx: index("artist_name_idx").on(table.name),
  mbidIdx: index("artist_mbid_idx").on(table.mbid),
}));

export type Artist = typeof artists.$inferSelect;
export type InsertArtist = typeof artists.$inferInsert;

/**
 * Venues table - stores concert venue information
 */
export const venues = mysqlTable("venues", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  state: varchar("state", { length: 100 }),
  country: varchar("country", { length: 100 }).notNull(),
  latitude: varchar("latitude", { length: 20 }),
  longitude: varchar("longitude", { length: 20 }),
  capacity: int("capacity"),
  address: text("address"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  cityIdx: index("venue_city_idx").on(table.city),
  nameIdx: index("venue_name_idx").on(table.name),
}));

export type Venue = typeof venues.$inferSelect;
export type InsertVenue = typeof venues.$inferInsert;

/**
 * Concerts table - stores concert event information
 * Deduplication constraint: one concert per (date + venue + userId)
 */
export const concerts = mysqlTable("concerts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  artistId: int("artistId").notNull(),
  venueId: int("venueId").notNull(),
  concertDate: timestamp("concertDate").notNull(), // Date of the concert
  detectedAt: timestamp("detectedAt").defaultNow().notNull(), // When this concert was first detected
  
  // Weather data
  weatherCondition: varchar("weatherCondition", { length: 100 }),
  temperature: int("temperature"), // in Fahrenheit
  weatherIcon: varchar("weatherIcon", { length: 20 }),
  
  // Metadata
  notes: text("notes"),
  setlistFmId: varchar("setlistFmId", { length: 64 }), // ID from setlist.fm
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdx: index("concert_user_idx").on(table.userId),
  artistIdx: index("concert_artist_idx").on(table.artistId),
  venueIdx: index("concert_venue_idx").on(table.venueId),
  dateIdx: index("concert_date_idx").on(table.concertDate),
  // Unique constraint for deduplication
  uniqueConcert: uniqueIndex("unique_concert_idx").on(table.userId, table.venueId, table.concertDate),
}));

export type Concert = typeof concerts.$inferSelect;
export type InsertConcert = typeof concerts.$inferInsert;

/**
 * Songs table - stores song information
 */
export const songs = mysqlTable("songs", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  artistId: int("artistId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  artistIdx: index("song_artist_idx").on(table.artistId),
  titleIdx: index("song_title_idx").on(table.title),
}));

export type Song = typeof songs.$inferSelect;
export type InsertSong = typeof songs.$inferInsert;

/**
 * Setlists table - stores the setlist (song order) for each concert
 */
export const setlists = mysqlTable("setlists", {
  id: int("id").autoincrement().primaryKey(),
  concertId: int("concertId").notNull(),
  songId: int("songId").notNull(),
  setNumber: int("setNumber").notNull(), // Which set (1, 2, encore, etc.)
  position: int("position").notNull(), // Order within the set
  notes: text("notes"), // e.g., "with guest vocalist", "acoustic version"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  concertIdx: index("setlist_concert_idx").on(table.concertId),
  songIdx: index("setlist_song_idx").on(table.songId),
}));

export type Setlist = typeof setlists.$inferSelect;
export type InsertSetlist = typeof setlists.$inferInsert;

/**
 * Photos table - stores photo metadata and links to concerts
 */
export const photos = mysqlTable("photos", {
  id: int("id").autoincrement().primaryKey(),
  concertId: int("concertId").notNull(),
  userId: int("userId").notNull(),
  
  // Photo source and storage
  sourceUrl: text("sourceUrl").notNull(), // Google Drive URL
  s3Url: text("s3Url"), // S3 URL if starred
  s3Key: varchar("s3Key", { length: 500 }), // S3 key if starred
  
  // Photo metadata from EXIF
  takenAt: timestamp("takenAt"), // From EXIF timestamp
  latitude: varchar("latitude", { length: 20 }),
  longitude: varchar("longitude", { length: 20 }),
  
  // User actions
  isStarred: boolean("isStarred").default(false).notNull(),
  starredAt: timestamp("starredAt"),
  isHidden: boolean("isHidden").default(false).notNull(),
  
  // Metadata
  filename: varchar("filename", { length: 500 }),
  mimeType: varchar("mimeType", { length: 100 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  concertIdx: index("photo_concert_idx").on(table.concertId),
  userIdx: index("photo_user_idx").on(table.userId),
  starredIdx: index("photo_starred_idx").on(table.isStarred),
}));

export type Photo = typeof photos.$inferSelect;
export type InsertPhoto = typeof photos.$inferInsert;

/**
 * Unmatched photos table - stores photos that couldn't be automatically matched to concerts
 */
export const unmatchedPhotos = mysqlTable("unmatched_photos", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  driveFileId: varchar("driveFileId", { length: 255 }).notNull(),
  fileName: varchar("fileName", { length: 512 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }),
  sourceUrl: text("sourceUrl").notNull(),
  thumbnailUrl: text("thumbnailUrl"),
  
  // EXIF data
  takenAt: timestamp("takenAt"),
  fileCreatedAt: timestamp("fileCreatedAt"),
  latitude: varchar("latitude", { length: 50 }),
  longitude: varchar("longitude", { length: 50 }),
  
  // Reverse-geocoded location data
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 100 }),
  country: varchar("country", { length: 100 }),
  venueName: varchar("venueName", { length: 255 }),
  venueDetectionMethod: varchar("venueDetectionMethod", { length: 50 }), // 'type_match', 'name_match', 'tourist_attraction', 'closest_place', 'manual_override'
  venueConfidence: varchar("venueConfidence", { length: 20 }), // 'high', 'medium', 'low'
  
  // Status
  reviewed: mysqlEnum("reviewed", ["pending", "skipped", "linked"]).default("pending").notNull(),
  linkedConcertId: int("linkedConcertId"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdx: index("unmatched_photo_user_idx").on(table.userId),
  reviewedIdx: index("unmatched_photo_reviewed_idx").on(table.reviewed),
}));

export type UnmatchedPhoto = typeof unmatchedPhotos.$inferSelect;
export type InsertUnmatchedPhoto = typeof unmatchedPhotos.$inferInsert;

/**
 * Venue aliases table - stores user-defined venue nicknames for better matching
 */
export const venueAliases = mysqlTable("venue_aliases", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  alias: varchar("alias", { length: 255 }).notNull(), // e.g., "MSG", "The Gorge"
  venueName: varchar("venueName", { length: 255 }).notNull(), // e.g., "Madison Square Garden", "Gorge Amphitheatre"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdx: index("venue_alias_user_idx").on(table.userId),
  aliasIdx: index("venue_alias_alias_idx").on(table.alias),
}));

export type VenueAlias = typeof venueAliases.$inferSelect;
export type InsertVenueAlias = typeof venueAliases.$inferInsert;

/**
 * Processed Files table - tracks which Google Drive files have been scanned
 * to avoid reprocessing the same files on subsequent scans
 */
export const processedFiles = mysqlTable("processed_files", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  fileId: varchar("fileId", { length: 255 }).notNull(), // Google Drive file ID
  filename: varchar("filename", { length: 255 }).notNull(),
  processedAt: timestamp("processedAt").defaultNow().notNull(),
}, (table) => ({
  userFileIdx: index("processed_file_user_file_idx").on(table.userId, table.fileId),
  fileIdIdx: index("processed_file_id_idx").on(table.fileId),
}));

export type ProcessedFile = typeof processedFiles.$inferSelect;
export type InsertProcessedFile = typeof processedFiles.$inferInsert;
