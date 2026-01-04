# Concert History Database - Technical Specification

**Version:** 1.0  
**Last Updated:** December 13, 2025  
**Author:** Manus AI

---

## Executive Summary

The Concert History Database is a personal web application designed to automatically track and organize live concert attendance through intelligent photo analysis. The system leverages EXIF metadata extraction, GPS-based venue detection, and third-party API integrations to create a comprehensive concert history with minimal manual input. This document provides complete technical specifications for developers implementing, maintaining, or extending the application.

---

## System Architecture

### Technology Stack

The application follows a modern full-stack architecture built on the following technologies:

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Frontend | React | 19 | UI framework with hooks and functional components |
| Frontend | TypeScript | 5.x | Type-safe JavaScript for reduced runtime errors |
| Frontend | Vite | 5.x | Fast build tool and development server |
| Frontend | TailwindCSS | 4.x | Utility-first CSS framework for styling |
| Frontend | shadcn/ui | Latest | Pre-built accessible React components |
| Backend | Node.js | 22.13.0 | JavaScript runtime environment |
| Backend | Express | 4.x | Web server framework |
| Backend | tRPC | 11.x | End-to-end typesafe APIs without code generation |
| Backend | TypeScript | 5.x | Type-safe server-side code |
| Database | PostgreSQL | Latest | Relational database via Drizzle ORM |
| ORM | Drizzle | Latest | Lightweight TypeScript ORM |
| Authentication | Manus OAuth | N/A | Built-in OAuth provider |
| Storage | AWS S3 | N/A | Object storage for starred photos |

### Architecture Pattern

The application implements a **client-server architecture** with **tRPC** providing type-safe communication between frontend and backend. All business logic resides in the backend, with the frontend serving as a thin presentation layer. This design ensures data integrity, enables server-side caching, and simplifies testing.

**Key architectural decisions:**

- **Superjson serialization** enables passing complex types (Date objects, BigInt) between client and server without manual transformation
- **Procedure-based API** replaces traditional REST endpoints with typed procedures that enforce contracts at compile time
- **React Query integration** provides automatic caching, background refetching, and optimistic updates
- **Single-user initially** with multi-user support planned through user ID isolation in all database queries

---

## Database Schema

### Entity Relationship Diagram

```
users (1) ──< (M) concerts
              concerts (M) >── (1) artists
              concerts (M) >── (1) venues
              concerts (1) ──< (M) photos
              concerts (1) ──< (M) setlists
                                   setlists (M) >── (1) songs
                                                    songs (M) >── (1) artists

unmatched_photos (M) >── (1) users
processed_files (M) >── (1) users
venue_aliases (M) >── (1) venues
```

### Table Definitions

#### users

Stores authenticated user information from Manus OAuth.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | Unique user identifier |
| openId | VARCHAR(255) | UNIQUE, NOT NULL | OAuth provider user ID |
| name | VARCHAR(255) | NULL | User's display name |
| email | VARCHAR(255) | NULL | User's email address |
| loginMethod | VARCHAR(50) | NULL | OAuth method (apple, google, etc.) |
| role | ENUM('admin', 'user') | DEFAULT 'user' | User role for access control |
| createdAt | TIMESTAMP | DEFAULT NOW() | Account creation timestamp |
| updatedAt | TIMESTAMP | ON UPDATE NOW() | Last update timestamp |
| lastSignedIn | TIMESTAMP | NULL | Last login timestamp |

**Indexes:** `openId` (unique), `email`

#### artists

Stores unique artist/band names referenced by concerts and songs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | Unique artist identifier |
| name | VARCHAR(255) | UNIQUE, NOT NULL | Artist or band name |
| createdAt | TIMESTAMP | DEFAULT NOW() | Record creation timestamp |

**Indexes:** `name` (unique for deduplication)

#### venues

Stores unique venue locations with geographic coordinates.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | Unique venue identifier |
| name | VARCHAR(255) | NOT NULL | Venue name (e.g., "Madison Square Garden") |
| city | VARCHAR(255) | NOT NULL | City name |
| state | VARCHAR(255) | NULL | State/province (optional for international venues) |
| country | VARCHAR(255) | NOT NULL | Country name |
| latitude | VARCHAR(50) | NULL | GPS latitude as string for precision |
| longitude | VARCHAR(50) | NULL | GPS longitude as string for precision |
| createdAt | TIMESTAMP | DEFAULT NOW() | Record creation timestamp |

**Indexes:** Composite index on `(name, city)` for venue lookup

#### concerts

Stores individual concert events linking users, artists, and venues.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | Unique concert identifier |
| userId | INTEGER | FOREIGN KEY → users(id), NOT NULL | Concert owner |
| artistId | INTEGER | FOREIGN KEY → artists(id), NOT NULL | Performing artist |
| venueId | INTEGER | FOREIGN KEY → venues(id), NOT NULL | Concert venue |
| concertDate | DATE | NOT NULL | Date of performance |
| temperature | INTEGER | NULL | Weather temperature in Fahrenheit |
| createdAt | TIMESTAMP | DEFAULT NOW() | Record creation timestamp |

**Indexes:** `userId`, `artistId`, `venueId`, `concertDate`  
**Unique Constraint:** `(userId, venueId, concertDate)` to prevent duplicate concerts

#### songs

Stores unique song titles associated with artists.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | Unique song identifier |
| title | VARCHAR(255) | NOT NULL | Song title |
| artistId | INTEGER | FOREIGN KEY → artists(id), NOT NULL | Song's artist |
| createdAt | TIMESTAMP | DEFAULT NOW() | Record creation timestamp |

**Indexes:** Composite index on `(title, artistId)` for song lookup

#### setlists

Stores ordered song lists for concerts (many-to-many join table).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | Unique setlist entry identifier |
| concertId | INTEGER | FOREIGN KEY → concerts(id), NOT NULL | Associated concert |
| songId | INTEGER | FOREIGN KEY → songs(id), NOT NULL | Song performed |
| setNumber | INTEGER | NOT NULL | Set number (1, 2, 3 for multi-set shows) |
| position | INTEGER | NOT NULL | Song order within set |
| notes | TEXT | NULL | Additional info (e.g., "with guest vocalist") |
| createdAt | TIMESTAMP | DEFAULT NOW() | Record creation timestamp |

**Indexes:** `concertId`, `songId`  
**Cascade Delete:** Deleting a concert removes all associated setlist entries

#### photos

Stores photos linked to concerts with metadata and starring status.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | Unique photo identifier |
| concertId | INTEGER | FOREIGN KEY → concerts(id), NOT NULL | Associated concert |
| userId | INTEGER | FOREIGN KEY → users(id), NOT NULL | Photo owner |
| sourceUrl | TEXT | NOT NULL | Google Drive URL or S3 URL |
| thumbnailUrl | TEXT | NULL | Thumbnail URL for faster loading |
| isStarred | BOOLEAN | DEFAULT FALSE | User-marked favorite |
| s3Key | VARCHAR(255) | NULL | S3 object key if starred (permanent storage) |
| takenAt | TIMESTAMP | NULL | Photo capture timestamp from EXIF |
| latitude | VARCHAR(50) | NULL | GPS latitude from EXIF |
| longitude | VARCHAR(50) | NULL | GPS longitude from EXIF |
| cameraModel | VARCHAR(255) | NULL | Camera/phone model from EXIF |
| createdAt | TIMESTAMP | DEFAULT NOW() | Record creation timestamp |

**Indexes:** `concertId`, `userId`, `isStarred`  
**Cascade Delete:** Deleting a concert removes all associated photos

#### unmatched_photos

Temporary storage for photos awaiting manual review and linking.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | Unique unmatched photo identifier |
| userId | INTEGER | FOREIGN KEY → users(id), NOT NULL | Photo owner |
| sourceUrl | TEXT | NOT NULL | Google Drive URL |
| thumbnailUrl | TEXT | NULL | Thumbnail URL |
| takenAt | TIMESTAMP | NULL | Photo capture timestamp from EXIF |
| fileCreatedAt | TIMESTAMP | NULL | File creation date fallback |
| latitude | VARCHAR(50) | NULL | GPS latitude from EXIF |
| longitude | VARCHAR(50) | NULL | GPS longitude from EXIF |
| city | VARCHAR(255) | NULL | Reverse-geocoded city name |
| state | VARCHAR(255) | NULL | Reverse-geocoded state |
| country | VARCHAR(255) | NULL | Reverse-geocoded country |
| venueName | VARCHAR(255) | NULL | Detected venue name |
| venueConfidence | ENUM('high', 'medium', 'low') | NULL | Venue detection confidence |
| venueDetectionMethod | ENUM('type_match', 'name_match', 'tourist_attraction', 'closest_place', 'manual_override') | NULL | How venue was detected |
| reviewed | ENUM('pending', 'skipped') | DEFAULT 'pending' | Review status |
| createdAt | TIMESTAMP | DEFAULT NOW() | Record creation timestamp |

**Indexes:** `userId`, `reviewed`

#### processed_files

Tracks which Google Drive files have been scanned to prevent reprocessing.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | Unique record identifier |
| userId | INTEGER | FOREIGN KEY → users(id), NOT NULL | File owner |
| fileId | VARCHAR(255) | NOT NULL | Google Drive file ID |
| processedAt | TIMESTAMP | DEFAULT NOW() | Processing timestamp |

**Indexes:** Composite index on `(userId, fileId)` for duplicate detection

#### venue_aliases

User-defined venue nicknames for easier searching (future feature).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, AUTO_INCREMENT | Unique alias identifier |
| venueId | INTEGER | FOREIGN KEY → venues(id), NOT NULL | Target venue |
| alias | VARCHAR(255) | NOT NULL | Nickname (e.g., "MSG") |
| createdAt | TIMESTAMP | DEFAULT NOW() | Record creation timestamp |

**Indexes:** `venueId`, `alias`

---

## API Integrations

### Google Drive API

**Purpose:** Source photos from a specified Google Drive folder with EXIF metadata extraction.

**Authentication:** Service account credentials stored in `GOOGLE_DRIVE_CREDENTIALS` environment variable (JSON format with escaped newlines in private key).

**Key Operations:**

| Operation | Endpoint | Parameters | Response |
|-----------|----------|------------|----------|
| List Files | `drive.files.list` | `folderId`, `pageSize`, `orderBy`, `fields` | Array of file metadata |
| Get File | `drive.files.get` | `fileId`, `alt='media'` | Binary file data |

**Implementation Details:**

- Files are listed in batches of 50, sorted by `createdTime` (oldest first) for chronological processing
- Only image MIME types are queried: `image/jpeg`, `image/png`, `image/heic`, `image/webp`, `image/x-adobe-dng`
- Video files (`.mov`, `.mp4`, `.avi`) are explicitly excluded to prevent decoder errors
- JSON sidecar files (`.supplemental-metadata.json`) from Google Photos are parsed for EXIF data when present
- Pagination uses `nextPageToken` to handle folders with 1000+ files

**Rate Limiting:** Google Drive API has a default quota of 1,000 requests per 100 seconds per user. The application implements:

- Processed file tracking to avoid re-scanning
- Batch processing (50 files per scan)
- Lazy loading for venue dropdowns (fetch only when opened)

### Google Maps API

**Purpose:** Reverse geocoding, venue detection, and nearby place searches.

**Authentication:** Proxied through Manus built-in API (`BUILT_IN_FORGE_API_URL`) with automatic credential injection.

**Key Operations:**

| Operation | Endpoint | Parameters | Response |
|-----------|----------|------------|----------|
| Reverse Geocode | `/maps/api/geocode/json` | `latlng` | Address components (city, state, country) |
| Nearby Search | `/maps/api/place/nearbysearch/json` | `location`, `rankby=distance` or `radius`, `keyword` | Array of nearby places |
| Place Details | `/maps/api/place/details/json` | `place_id`, `fields` | Detailed place information |

**Venue Detection Algorithm:**

The system uses a three-tier priority system to identify concert venues from GPS coordinates:

1. **Type Match (High Confidence):** Place types include `stadium`, `arena`, `performing_arts`, `night_club`, or `event_venue`
2. **Name Match (High Confidence):** Place name contains keywords like `stadium`, `arena`, `venue`, `theater`, `amphitheater`, `concert`, `music`, `pavilion`, `ballroom`, `park`, etc.
3. **Tourist Attraction (Medium Confidence):** Many venues are categorized as `tourist_attraction` but are not stores/restaurants/hotels
4. **Closest Place (Low Confidence):** Fallback to nearest location if no venue indicators found

**Exclusion List:** The algorithm automatically skips `parking`, `store`, `restaurant`, `cafe`, `lodging`, `school`, `hospital`, `bank`, `gas_station`, `car_*`, `pharmacy`, and `supermarket` types.

**Rate Limiting:** Google Maps API has strict rate limits. The application implements:

- 5-minute client-side caching (`staleTime: 5 * 60 * 1000`)
- Lazy loading (queries only execute when dropdowns open)
- State reset on photo navigation to prevent auto-fetching

### setlist.fm API

**Purpose:** Fetch concert setlists by artist name, venue, and date.

**Authentication:** API key stored in `SETLISTFM_API_KEY` environment variable, sent as `x-api-key` header.

**Key Operations:**

| Operation | Endpoint | Parameters | Response |
|-----------|----------|------------|----------|
| Search Setlists | `/rest/1.0/search/setlists` | `artistName`, `venueName`, `date` (DD-MM-YYYY) | Array of setlist objects |

**Smart Matching Algorithm:**

When editing a concert or creating from a photo, the system tries all possible 2-field combinations to find the best match:

1. **Artist + Date:** Most reliable for unique shows
2. **Artist + Venue:** Useful for recurring residencies
3. **Venue + Date:** Fallback when artist name is uncertain

The first successful match is used, with priority given to artist+date combinations.

**Data Extraction:**

- Artist name
- Venue name, city, state, country, coordinates
- Concert date
- Setlist (songs grouped by set number with position and notes)

**Date Format:** setlist.fm requires dates in `DD-MM-YYYY` format (e.g., `03-02-2024` for February 3, 2024).

### OpenWeather API

**Purpose:** Fetch historical weather data for concert dates.

**Authentication:** API key stored in `OPENWEATHER_API_KEY` environment variable.

**Key Operations:**

| Operation | Endpoint | Parameters | Response |
|-----------|----------|------------|----------|
| Current Weather | `/data/2.5/weather` | `lat`, `lon`, `units=imperial` | Temperature, conditions, humidity |

**Limitations:** The free tier only provides current weather, not historical data. The application stores temperature at the time of concert creation, which may not reflect actual concert-day weather for past events.

---

## Core Features

### Photo Scanning Workflow

The photo scanning process is the heart of the application, automatically ingesting photos from Google Drive and attempting to match them to concerts.

**Step-by-Step Process:**

1. **Fetch Files from Google Drive**
   - Query specified folder for image files (JPEG, PNG, HEIC, WebP, DNG)
   - Exclude already-processed files using `processed_files` table
   - Sort by creation date (oldest first) and limit to 50 files per batch

2. **Extract EXIF Metadata**
   - Check for JSON sidecar file (`.supplemental-metadata.json`) from Google Photos
   - Parse EXIF data: `takenAt` (timestamp), `latitude`, `longitude`, `cameraModel`
   - Fallback to file creation date if EXIF timestamp missing

3. **Reverse Geocode Location**
   - Use Google Maps Geocoding API to convert GPS coordinates to address
   - Extract `city`, `state`, `country` components

4. **Detect Venue**
   - Use Google Maps Nearby Search with GPS coordinates
   - Apply venue detection algorithm (type match → name match → tourist attraction → closest place)
   - Store `venueName`, `venueConfidence`, `venueDetectionMethod`

5. **Search for Matching Concert**
   - Query `concerts` table for existing concert matching `(userId, venueId, date)`
   - If found, link photo to concert and mark as processed

6. **Attempt Automatic Concert Creation**
   - Query setlist.fm API with `(venueName, date)` to find artist
   - If setlist found:
     - Create or find artist, venue, songs
     - Create concert with setlist entries
     - Link photo to new concert
   - If no setlist found, store in `unmatched_photos` for manual review

7. **Report Progress**
   - Update in-memory progress tracker with current photo count, filename, stats
   - Frontend polls progress every 500ms to display real-time progress bar

**Performance Optimizations:**

- Batch size of 50 prevents memory exhaustion and provides reasonable progress feedback
- Processed file tracking eliminates redundant API calls
- Parallel EXIF extraction (future enhancement)

### Photo Review Workflow

Photos that cannot be automatically matched are grouped by date and GPS location for efficient manual review.

**Grouping Algorithm:**

1. Fetch all `unmatched_photos` with `reviewed = 'pending'`
2. Group by `date` (YYYY-MM-DD) + `GPS location` (rounded to ~100m accuracy)
3. Select one representative photo per group
4. Display groups in chronological order

**User Actions:**

| Action | Behavior | Backend Operation |
|--------|----------|-------------------|
| Link to Existing Concert | User selects concert from dropdown | Update photo to `photos` table, remove from `unmatched_photos`, offer bulk link for similar photos |
| Create Concert from Photo | User enters artist name, system pre-fills venue and date | Create artist/venue/concert, link photo, remove from unmatched |
| Skip Photo | User marks photo as not a concert | Update `reviewed = 'skipped'` |
| Skip All from Event | User skips entire concert's photos | Find all photos within 200m radius on same date, mark all as skipped |
| Change Venue | User selects different venue from dropdown | Update `venueName`, `venueConfidence = 'high'`, `venueDetectionMethod = 'manual_override'`, trigger concert search |

**Bulk Linking:**

After linking a photo, the system searches for similar photos (same date + within 100m GPS proximity) and prompts the user to link all at once. This dramatically speeds up review for concerts with 50+ photos.

### Concert Management

**Creating Concerts:**

Concerts can be created through three methods:

1. **Automatic (Photo Scan):** setlist.fm match creates concert with full setlist
2. **Manual (Photo Review):** User provides artist name, system fills venue/date from photo EXIF
3. **Manual (Add Concert Page):** User provides all fields manually

**Editing Concerts:**

The edit form requires **any 2 of 3 fields** (artist, venue, date) to allow flexible updates:

- Leave fields blank to keep current values
- Optional "Refresh setlist from setlist.fm" checkbox fetches fresh data
- When refreshing, system tries all 2-field combinations to find best match
- Venue changes update all linked photos automatically

**Deleting Concerts:**

Cascade delete removes:
- All photos linked to concert
- All setlist entries
- Concert record

Artists, venues, and songs are preserved for reuse.

### Photo Management

**Starring Photos:**

- Unstarred photos: Referenced by Google Drive URL (temporary)
- Starred photos: Uploaded to S3 with permanent storage
- S3 key format: `{userId}-photos/{concertId}-{photoId}-{nanoid}.jpg`

**Bulk Operations:**

- Select mode toggle enables checkboxes on all photos
- Bulk hide: Marks photos as hidden (soft delete)
- Bulk delete: Permanently removes photos from database and S3

**Photo Metadata Viewer:**

Click any photo to view:
- GPS coordinates
- Detected venue name and confidence
- Location (city, state, country)
- Timestamp
- Camera model
- Filename
- Starred status

### Search and Filtering

**Dashboard Filters:**

- **Search:** Free text search across artist name, venue name, and city
- **Year Filter:** Dropdown of all years with concerts
- **Unmatched Photos:** Badge showing count with link to review page
- **Skipped Photos:** Badge showing count with link to skipped photos page

**Concert List Sorting:**

- Default: Reverse chronological (newest first)
- Grouped by year with year headers

---

## User Interface

### Page Structure

| Page | Route | Purpose | Key Components |
|------|-------|---------|----------------|
| Dashboard | `/` | Concert list, search, scan photos | ConcertCard, search input, year filter, scan button, progress bar |
| Concert Detail | `/concert/:id` | View concert info, setlist, photos | Photo gallery, setlist display, edit button, venue override |
| Photo Review | `/photos/review` | Review unmatched photos | Photo display, concert dropdown, venue dropdown, skip buttons |
| Skipped Photos | `/photos/skipped` | View and restore skipped photos | Paginated photo grid (20 per page), restore buttons |
| Add Concert | `/concert/new` | Manually create concert | Form with artist, venue, date, location fields |

### Design System

**Theme:**

- Dark mode support with theme toggle (moon/sun icon)
- Theme persistence in `localStorage`
- CSS variables for colors (`--background`, `--foreground`, `--primary`, etc.)

**Color Palette:**

- Background: `hsl(var(--background))`
- Foreground: `hsl(var(--foreground))`
- Primary: `hsl(var(--primary))`
- Muted: `hsl(var(--muted))`
- Destructive: `hsl(var(--destructive))`

**Typography:**

- Font: System font stack (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, etc.)
- Headings: `font-bold` with size variants (`text-3xl`, `text-2xl`, `text-xl`)
- Body: `text-base` with `text-muted-foreground` for secondary text

**Components:**

- **Button:** Variants (default, destructive, outline, secondary, ghost), sizes (default, sm, lg, icon)
- **Card:** Container with header, content, footer sections
- **Dialog:** Modal overlay with title, description, content, footer
- **Badge:** Small label with variants (default, secondary, outline, destructive)
- **Progress:** Horizontal progress bar with percentage
- **Skeleton:** Loading placeholder matching content shape

### Responsive Design

**Breakpoints:**

- Mobile: < 768px (default)
- Tablet: 768px - 1024px (`md:`)
- Desktop: > 1024px (`lg:`)

**Mobile-First Approach:**

- Single column layout on mobile
- Grid layout (2-3 columns) on tablet/desktop
- Collapsible navigation on mobile
- Touch-friendly button sizes (min 44x44px)

---

## Backend Architecture

### tRPC Routers

The backend is organized into logical routers, each handling a specific domain:

| Router | Prefix | Purpose | Key Procedures |
|--------|--------|---------|----------------|
| `auth` | `/api/trpc/auth` | Authentication | `me`, `logout` |
| `artists` | `/api/trpc/artists` | Artist operations | `search`, `getById` |
| `venues` | `/api/trpc/venues` | Venue operations | `search`, `getById`, `getNearby` |
| `concerts` | `/api/trpc/concerts` | Concert CRUD | `list`, `getById`, `create`, `update`, `delete`, `deleteTestConcerts`, `deleteAllData` |
| `photos` | `/api/trpc/photos` | Photo management | `getByConcert`, `toggleStar`, `bulkHide`, `bulkDelete`, `getUnmatched`, `getSkipped`, `linkToExisting`, `skipPhoto`, `skipAllFromEvent`, `unskipPhoto`, `overrideVenue`, `searchConcertsForPhoto`, `createConcertFromPhoto`, `scanFromDrive`, `getScanProgress`, `clearAll`, `getNearbyVenues` |
| `ai` | `/api/trpc/ai` | AI features | `suggestions`, `insights` |
| `driveProxy` | `/api/trpc/driveProxy` | Image proxy | `getImage` |

### Procedure Types

**Public Procedures:** No authentication required (e.g., `auth.me` to check login status)

**Protected Procedures:** Require valid session cookie, inject `ctx.user` with user object

**Admin Procedures:** Require `ctx.user.role === 'admin'` (future feature)

### Error Handling

**tRPC Errors:**

- `UNAUTHORIZED`: Missing or invalid session
- `FORBIDDEN`: Insufficient permissions
- `NOT_FOUND`: Resource doesn't exist
- `BAD_REQUEST`: Invalid input parameters
- `INTERNAL_SERVER_ERROR`: Unexpected server error

**Client-Side Error Display:**

- Toast notifications for mutation errors
- Error boundaries for component crashes
- Loading states during async operations

### Caching Strategy

**React Query Configuration:**

- `staleTime: 0` (default) - Data considered stale immediately
- `cacheTime: 5 * 60 * 1000` (5 minutes) - Unused data garbage collected after 5 minutes
- `refetchOnWindowFocus: false` - Prevent refetch when user returns to tab
- `refetchOnMount: true` - Always fetch fresh data on component mount

**Custom Caching:**

- Venue queries: `staleTime: 5 * 60 * 1000` (5 minutes) to prevent Google Maps rate limits
- Concert list: Invalidated after mutations (create, update, delete)
- Photo counts: Invalidated after scan, link, skip operations

### Background Jobs

**Current Implementation:**

- Photo scanning triggered manually by user
- Progress tracked in-memory (resets on server restart)

**Future Enhancements:**

- Scheduled daily scans using cron jobs
- Persistent job queue (BullMQ or similar)
- Email notifications for new concerts detected
- Webhook integration for real-time Google Drive changes

---

## Deployment

### Environment Variables

**Required:**

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Session cookie signing secret | Random 32-character string |
| `GOOGLE_DRIVE_CREDENTIALS` | Service account JSON | `{"type":"service_account",...}` |
| `GOOGLE_DRIVE_FOLDER_ID` | Target folder ID | `1a2b3c4d5e6f7g8h9i0j` |
| `SETLISTFM_API_KEY` | setlist.fm API key | `abc123-def456-ghi789` |
| `OPENWEATHER_API_KEY` | OpenWeather API key | `xyz789abc123def456` |

**Auto-Injected (Manus Platform):**

- `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL` (OAuth)
- `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` (Maps, LLM, Storage)
- `OWNER_OPEN_ID`, `OWNER_NAME` (App owner info)

### Build Process

**Development:**

```bash
pnpm install
pnpm db:push  # Apply schema changes
pnpm dev      # Start dev server on port 3000
```

**Production:**

```bash
pnpm install --prod
pnpm build    # Build frontend and backend
pnpm start    # Start production server
```

**Database Migrations:**

```bash
pnpm db:push     # Push schema changes (dev)
pnpm db:generate # Generate migration files
pnpm db:migrate  # Apply migrations (prod)
```

### Hosting Requirements

**Minimum Specifications:**

- **CPU:** 1 vCPU
- **RAM:** 512 MB
- **Storage:** 10 GB (database + logs)
- **Bandwidth:** 1 GB/month (low traffic)

**Recommended Specifications:**

- **CPU:** 2 vCPU
- **RAM:** 2 GB
- **Storage:** 50 GB
- **Bandwidth:** 10 GB/month

**Platform Compatibility:**

- Manus built-in hosting (recommended)
- Vercel, Netlify, Railway, Render
- Docker container deployment
- Traditional VPS (Ubuntu 22.04+)

---

## Testing

### Test Coverage

**Backend Tests (Vitest):**

- `server/auth.logout.test.ts` - Authentication flow
- `server/concerts.test.ts` - Concert CRUD operations
- `server/photos.test.ts` - Photo management
- `server/exif.test.ts` - EXIF extraction
- `server/venueDetection.test.ts` - Venue detection algorithm
- `server/setlistMatcher.test.ts` - setlist.fm matching logic

**Test Execution:**

```bash
pnpm test           # Run all tests
pnpm test:watch     # Watch mode
pnpm test:coverage  # Generate coverage report
```

**Current Status:** 28/28 tests passing (100% pass rate)

### Manual Testing Checklist

**Photo Scanning:**

- [ ] Scan 50 photos from Google Drive
- [ ] Verify progress bar updates in real-time
- [ ] Confirm automatic concert creation from setlist.fm match
- [ ] Check unmatched photos appear in review queue
- [ ] Validate EXIF data extraction (date, GPS, camera)

**Photo Review:**

- [ ] Link photo to existing concert
- [ ] Create concert from photo
- [ ] Skip individual photo
- [ ] Skip all photos from event (200m radius)
- [ ] Change venue using dropdown
- [ ] Verify bulk link prompt after first link

**Concert Management:**

- [ ] Create concert manually
- [ ] Edit concert with 2 of 3 fields (artist, venue, date)
- [ ] Refresh setlist from setlist.fm
- [ ] Delete concert (verify cascade delete)
- [ ] Delete all test concerts
- [ ] Delete entire database

**Photo Management:**

- [ ] Star/unstar photo
- [ ] Verify S3 upload on star
- [ ] Bulk select photos
- [ ] Bulk hide photos
- [ ] Bulk delete photos
- [ ] View photo metadata dialog

**Search and Filtering:**

- [ ] Search by artist name
- [ ] Search by venue name
- [ ] Filter by year
- [ ] Verify concert count updates

**Dark Mode:**

- [ ] Toggle dark mode
- [ ] Verify theme persists on refresh
- [ ] Check all pages render correctly in dark mode

---

## Future Enhancements

### Planned Features

**Phase 1 (Q1 2026):**

- Multi-user support with user isolation
- Scheduled daily photo scans
- Email notifications for new concerts
- Export concert history to CSV/PDF
- Social sharing (concert cards as images)

**Phase 2 (Q2 2026):**

- Video support (MP4, MOV) with thumbnail generation
- AI-powered concert recommendations
- Spotify integration (link songs to Spotify tracks)
- Concert statistics dashboard (most-seen artists, venues, etc.)
- Friends feature (see friends' concert history)

**Phase 3 (Q3 2026):**

- Mobile app (React Native)
- Offline mode with sync
- Concert check-in (manual add with current location)
- Ticket stub scanning (OCR)
- Merchandise tracking

### Known Limitations

**Current Constraints:**

- Single-user only (multi-user requires user ID isolation in all queries)
- Google Drive only (no Dropbox, iCloud, or local folder support)
- No video support (MP4/MOV files excluded from scanning)
- No historical weather data (OpenWeather free tier limitation)
- No automatic sync (user must manually trigger scan)
- No mobile app (web-only)

**Technical Debt:**

- In-memory scan progress (resets on server restart)
- No job queue for background tasks
- No rate limiting on tRPC procedures
- No database connection pooling
- No CDN for photo thumbnails
- No image optimization (resize, compress)

---

## Security Considerations

### Authentication

**OAuth Flow:**

1. User clicks "Login" → Redirected to Manus OAuth portal
2. User authenticates with Apple/Google/Email
3. OAuth server redirects to `/api/oauth/callback` with authorization code
4. Backend exchanges code for user info and creates session
5. Session cookie set with `httpOnly`, `secure`, `sameSite: lax`

**Session Management:**

- JWT tokens signed with `JWT_SECRET`
- 30-day expiration
- Automatic renewal on activity
- Logout clears cookie

### Data Protection

**User Isolation:**

- All database queries filter by `userId`
- tRPC context injects `ctx.user` for protected procedures
- No cross-user data access possible

**Photo Privacy:**

- Google Drive photos require authentication (proxied through backend)
- S3 photos use non-enumerable keys (`{userId}-photos/{concertId}-{photoId}-{nanoid}`)
- No public photo URLs without authentication

**API Key Security:**

- All API keys stored in environment variables
- Never exposed to frontend
- Proxied through backend for Google Maps

### Input Validation

**tRPC Input Schemas:**

- All inputs validated with Zod schemas
- Type checking at compile time and runtime
- Automatic sanitization of string inputs

**SQL Injection Prevention:**

- Drizzle ORM parameterizes all queries
- No raw SQL concatenation
- Prepared statements for all database operations

### Rate Limiting

**Current Implementation:**

- None (relies on external API rate limits)

**Recommended:**

- 100 requests per minute per user
- 1000 requests per hour per user
- Exponential backoff for repeated failures

---

## Troubleshooting

### Common Issues

**Issue:** Photo scan returns 0 photos

**Causes:**
- Google Drive folder ID incorrect
- Service account lacks folder access
- All files already processed

**Solutions:**
1. Verify `GOOGLE_DRIVE_FOLDER_ID` in environment variables
2. Share folder with service account email (`client_email` from credentials JSON)
3. Use "Clear & Rescan" button to reset processed files

---

**Issue:** Photos not displaying in review page

**Causes:**
- Google Drive authentication expired
- Image proxy endpoint failing
- CORS issues with direct Drive URLs

**Solutions:**
1. Check backend logs for Drive API errors
2. Verify `GOOGLE_DRIVE_CREDENTIALS` is valid JSON with escaped newlines
3. Use `/api/drive-image/:fileId` proxy endpoint (already implemented)

---

**Issue:** Venue detection returns wrong venue

**Causes:**
- GPS coordinates inaccurate
- Venue not in Google Maps database
- Nearby business has stronger venue indicators

**Solutions:**
1. Use venue override dropdown to manually select correct venue
2. Check venue confidence badge (high/medium/low)
3. Report issue if venue consistently misdetected

---

**Issue:** setlist.fm returns no results

**Causes:**
- Artist name spelling mismatch
- Concert not in setlist.fm database
- Date format incorrect

**Solutions:**
1. Try different artist name variations
2. Manually create concert without setlist
3. Check setlist.fm website to verify concert exists

---

**Issue:** Google Maps API rate limit (429 error)

**Causes:**
- Too many venue queries in short time
- Venue dropdown opened repeatedly
- Multiple users scanning simultaneously

**Solutions:**
1. Implemented: 5-minute client-side caching
2. Implemented: Lazy loading (query only when dropdown opened)
3. Implemented: State reset on photo navigation
4. Future: Server-side caching with Redis

---

## Appendix

### Glossary

| Term | Definition |
|------|------------|
| **Concert** | A live music performance event with artist, venue, and date |
| **EXIF** | Exchangeable Image File Format - metadata embedded in photos |
| **GPS** | Global Positioning System - latitude/longitude coordinates |
| **Setlist** | Ordered list of songs performed at a concert |
| **Venue** | Physical location where a concert takes place |
| **Unmatched Photo** | Photo that couldn't be automatically linked to a concert |
| **Starred Photo** | User-marked favorite photo permanently stored in S3 |
| **tRPC** | TypeScript Remote Procedure Call - type-safe API framework |
| **Drizzle** | TypeScript ORM for SQL databases |

### File Structure

```
concert-history-app/
├── client/                    # Frontend React application
│   ├── public/                # Static assets
│   ├── src/
│   │   ├── pages/             # Page components
│   │   │   ├── Dashboard.tsx
│   │   │   ├── ConcertDetail.tsx
│   │   │   ├── PhotoReview.tsx
│   │   │   └── SkippedPhotos.tsx
│   │   ├── components/        # Reusable UI components
│   │   │   ├── ui/            # shadcn/ui components
│   │   │   ├── ConcertCard.tsx
│   │   │   └── VenueDropdown.tsx
│   │   ├── contexts/          # React contexts
│   │   │   └── ThemeContext.tsx
│   │   ├── hooks/             # Custom hooks
│   │   │   └── useAuth.ts
│   │   ├── lib/               # Utilities
│   │   │   └── trpc.ts        # tRPC client
│   │   ├── App.tsx            # Routes and layout
│   │   ├── main.tsx           # Entry point
│   │   └── index.css          # Global styles
│   └── index.html             # HTML template
├── server/                    # Backend Node.js application
│   ├── _core/                 # Framework code (do not edit)
│   │   ├── context.ts         # tRPC context
│   │   ├── trpc.ts            # tRPC setup
│   │   ├── map.ts             # Google Maps proxy
│   │   ├── llm.ts             # LLM integration
│   │   └── index.ts           # Express server
│   ├── db.ts                  # Database query helpers
│   ├── routers.ts             # tRPC procedure definitions
│   ├── integrations.ts        # External API integrations
│   ├── photoIngestion.ts      # Photo scanning logic
│   ├── scanProgress.ts        # Progress tracking
│   ├── setlistMatcher.ts      # setlist.fm matching
│   ├── aiSuggestions.ts       # AI features
│   └── storage.ts             # S3 storage helpers
├── drizzle/                   # Database schema and migrations
│   ├── schema.ts              # Table definitions
│   └── migrations/            # SQL migration files
├── shared/                    # Shared types and constants
│   └── const.ts
├── package.json               # Dependencies
├── tsconfig.json              # TypeScript config
├── vite.config.ts             # Vite config
├── drizzle.config.ts          # Drizzle config
└── README.md                  # User-facing documentation
```

### API Endpoint Reference

**Base URL:** `https://your-domain.com/api/trpc`

**Authentication:** Session cookie (`manus_session`)

**Example Request:**

```typescript
// Frontend
const { data } = trpc.concerts.list.useQuery();

// Backend equivalent
GET /api/trpc/concerts.list
Cookie: manus_session=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Example Response:**

```json
{
  "result": {
    "data": [
      {
        "id": 1,
        "userId": 1,
        "artistId": 1,
        "venueId": 1,
        "concertDate": "2024-02-03T00:00:00.000Z",
        "temperature": 65,
        "createdAt": "2024-12-13T00:00:00.000Z",
        "artist": {
          "id": 1,
          "name": "U2"
        },
        "venue": {
          "id": 1,
          "name": "Sphere",
          "city": "Las Vegas",
          "state": "NV",
          "country": "USA"
        }
      }
    ]
  }
}
```

---

**Document Version:** 1.0  
**Last Updated:** December 13, 2025  
**Prepared by:** Manus AI  
**For:** Development team and future maintainers
