# Concert History App - Project Context

## Overview
Single-user, local-first concert photo management app with automatic photo-to-concert matching using GPS, EXIF data, and setlist.fm integration.

**Current Phase**: Week 1 Complete (Database Optimization)
**Next Phase**: Week 2 (Accuracy Improvements - 95%+ auto-match rate)

## Strategic Goals
- **Accuracy First**: 95%+ photo auto-match rate (currently ~70%)
- **Local-First**: Runs on user's computer, <$25/month budget
- **Database Portability**: Export/import for future cloud migration
- **Performance**: <50ms database queries, <500ms API responses

---

## Architecture

### Tech Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS 4, shadcn/ui components
- **Backend**: Node.js 20+, Express, tRPC 11
- **Database**: MySQL 8.0 (local), planned TiDB Serverless (cloud)
- **Storage**: Google Drive (photos), AWS S3 (starred photos backup)
- **APIs**: setlist.fm, OpenWeather, OpenStreetMap (OSM)

### Project Structure
```
/Users/rmitra/CHA WORKING-V1/
├── client/src/          # React frontend
│   ├── pages/           # Route components (Dashboard, PhotoReview, etc.)
│   └── components/      # Reusable UI components
├── server/              # Node.js backend
│   ├── routers.ts       # tRPC API endpoints
│   ├── db.ts            # Database functions (Drizzle ORM)
│   ├── photoIngestion.ts# Photo scanning & matching logic
│   ├── integrations.ts  # External API clients
│   └── fuzzyMatch.ts    # Venue name matching algorithm
├── drizzle/             # Database schema & migrations
│   └── schema.ts        # MySQL schema definitions
├── migrations/          # SQL migration files
└── MANUS-CHA-Jan26/     # Planning & documentation
    ├── REVISED_ROADMAP_LOCAL_FIRST.md
    ├── PHASE_2_SCALABILITY.md
    └── WEEK_1_IMPLEMENTATION_SUMMARY.md
```

---

## Database Schema

### Core Tables

**concerts** (user's attended concerts)
- Primary key: `id`
- Unique constraint: `(userId, venueId, concertDate)` - prevents duplicates
- Foreign keys: `userId → users.id`, `artistId → artists.id`, `venueId → venues.id`
- Important: `concertDate` stored at **noon UTC** for timezone consistency

**photos** (linked concert photos)
- Primary key: `id`
- Foreign keys: `concertId → concerts.id`, `userId → users.id`
- Fields: `sourceUrl` (Drive), `s3Url` (if starred), `takenAt` (EXIF timestamp), `latitude`, `longitude`
- Boolean: `isStarred` (triggers S3 upload)

**unmatched_photos** (pending manual review)
- Primary key: `id`
- Foreign key: `userId → users.id`
- Fields: `driveFileId`, `takenAt`, `latitude`, `longitude`, `city`, `state`, `venueName` (OSM-detected)
- Enum: `reviewed` ('pending', 'skipped', 'linked')

**venues** (concert locations, OSM-cached)
- Primary key: `id`
- Fields: `name`, `city`, `state`, `country`, `latitude`, `longitude`, `capacity`
- GPS index: `(latitude, longitude)` for proximity queries

**artists** (musical artists/bands)
- Primary key: `id`
- Fields: `name`, `mbid` (MusicBrainz ID from setlist.fm), `imageUrl`

**venue_aliases** (user-defined venue nicknames)
- Primary key: `id`
- Foreign key: `userId → users.id`
- Maps: `alias` (e.g., "MSG") → `venueName` (e.g., "Madison Square Garden")

**processed_files** (Google Drive scan tracking)
- Composite index: `(userId, fileId)` - prevents duplicate processing

### Key Indexes (Week 1)
```sql
-- Dashboard query optimization
CREATE INDEX idx_concerts_user_date ON concerts(userId, concertDate DESC);

-- Photo queries optimization
CREATE INDEX idx_photos_concert_starred_created ON photos(concertId, isStarred, createdAt DESC);

-- Photo review page
CREATE INDEX idx_unmatched_photos_user_created ON unmatched_photos(userId, createdAt DESC);

-- GPS venue lookups
CREATE INDEX idx_venues_gps ON venues(latitude, longitude);
```

---

## Concert Matching Algorithm

### Two-Stage Process

**Stage 1: Database-First Matching** (NEW - Week 1)
1. Find venues within 1200m of photo GPS coordinates (cached in database)
2. For each nearby venue, check if user has concert at that venue on photo date
3. If found: Return existing concert (0 API calls, 50ms)
4. If not found: Proceed to Stage 2

**Stage 2: External API Search** (setlist.fm)
1. Search setlist.fm by venue + date + GPS coordinates
2. Fuzzy match venue names (70% similarity threshold)
3. Create new concert if match found
4. Link photo to concert

### Fuzzy Venue Matching
**Algorithm**: Levenshtein distance with normalization
- Threshold: 70% similarity
- Normalization: Lowercase, remove punctuation, remove common words (amphitheatre, theater), unicode normalization (é → e)
- Example: "Sphere" matches "Sphere at The Venetian Resort" ✓

### Headliner Detection (Multi-Show Dates)
**Heuristic**: Song count + photo timestamp
- Photos before 8:30 PM → Select artist with FEWER songs (opener)
- Photos after 8:30 PM → Select artist with MORE songs (headliner)
- Fallback: Use first setlist if heuristic fails

### Manual Matching Tools
1. **Artist Search**: Search setlist.fm by artist name + date (bypasses GPS)
2. **Manual Venue Input**: Type any venue name (not limited to GPS-nearby)
3. **Venue Dropdown**: Select from OSM-detected venues (600m radius)
4. **Create from Photo**: Manual concert creation with pre-filled EXIF data

---

## Code Conventions

### Database Operations
- **Always use Drizzle ORM** - Never raw SQL unless absolutely necessary
- **Prefer JOINs over N+1 queries** - See `getUserConcertsWithDetails()` example
- **Log all queries** - Use `logDbRead()` and `logDbWrite()` for observability
- **Normalize dates** - Always use `dateToNoonUTC()` for concert date comparisons

Example:
```typescript
// ❌ BAD: N+1 query pattern
const concerts = await db.getUserConcerts(userId);
for (const concert of concerts) {
  concert.artist = await db.getArtistById(concert.artistId); // N queries!
}

// ✅ GOOD: Single query with JOIN
const concerts = await db.getUserConcertsWithDetails(userId); // 1 query
```

### Date Handling
- **Concert dates**: Always stored at noon UTC (`YYYY-MM-DDTHH:00:00.000Z`)
- **Photo timestamps**: Exact EXIF timestamp (may be any time)
- **Comparison**: Use `dateToNoonUTC()` to normalize before comparing

```typescript
// ❌ BAD: Direct date comparison
const concert = await db.findConcert(userId, venueId, photoDate); // Fails!

// ✅ GOOD: Normalize to noon UTC first
const normalizedDate = dateToNoonUTC(photoDate);
const concert = await db.findConcert(userId, venueId, normalizedDate); // Works!
```

### Error Handling
- Throw `TRPCError` with descriptive messages
- Include context in error messages (IDs, timestamps, user-facing descriptions)
- Log errors before throwing

```typescript
if (!concert || concert.userId !== ctx.user.id) {
  throw new TRPCError({
    code: "NOT_FOUND",
    message: "Concert not found or you don't have permission to access it"
  });
}
```

### File Naming
- **Backend**: `camelCase.ts` (e.g., `photoIngestion.ts`, `fuzzyMatch.ts`)
- **Frontend**: `PascalCase.tsx` for components (e.g., `Dashboard.tsx`, `PhotoReview.tsx`)
- **Tests**: `*.test.ts` alongside source files
- **Migrations**: `XXX-description.sql` (e.g., `001-composite-indexes.sql`)

---

## Current Implementation Status

### Week 1: Database Optimization ✅ COMPLETE
- [x] Composite indexes (10x faster queries)
- [x] Fixed N+1 query problem (401 queries → 1 query)
- [x] Fixed timezone normalization bug
- [x] Fixed venue encoding bug (unicode characters)
- [x] Fixed race condition in concurrent scans
- [x] Added performance monitoring logs

### Week 2: Accuracy Improvements ⏳ NEXT
- [ ] Confidence scoring (0-1 score for each match)
- [ ] Venue alias system (user-defined mappings)
- [ ] GPS accuracy detection (adjust search radius)
- [ ] Photo deduplication (perceptual hashing)
- [ ] Improved headliner detection

### Week 3: Export/Import & Backup
- [ ] JSON export (human-readable)
- [ ] SQL dump (MySQL-compatible)
- [ ] Automated daily backups
- [ ] Incremental backups
- [ ] Import validation & conflict resolution

### Week 4: UX Improvements
- [ ] Bulk photo actions (multi-select, batch link)
- [ ] Keyboard shortcuts (j/k navigation, x select)
- [ ] Smart suggestions (ML-based)
- [ ] Batch review workflow

---

## Performance Targets

### Database Queries
- **Target**: <50ms p95 (currently ~500ms before Week 1)
- **Dashboard load**: <500ms total (currently ~3 seconds)
- **Photo matching**: <100ms per photo

### API Responses
- **tRPC endpoints**: <200ms p95
- **Photo import**: 10 photos/second (currently ~1/second)

### Accuracy
- **Auto-match rate**: 95%+ (currently ~70%)
- **False positive rate**: <1% (wrong concert)
- **Manual review time**: <30 seconds per photo

---

## Budget Constraints

### Monthly Budget: <$25
- **Infrastructure**: $0 (local MySQL, Node.js server)
- **APIs**: $0 (all free tiers: setlist.fm, OpenWeather, Google Drive)
- **AI costs**: <$10 (cached responses, batch processing, user can disable)
- **S3 storage**: $1-5 (only starred photos)

### AI Cost Optimization
- Cache all AI responses in SQLite
- Batch insights weekly (not real-time)
- Use smaller models for simple tasks
- User setting to disable AI features

---

## Testing Philosophy

### User Testing (Every Friday)
- **Week 1**: 15 minutes (performance, no bugs)
- **Week 2**: 1-2 hours (accuracy validation - CRITICAL)
- **Week 3**: 15 minutes (export/import verification)
- **Week 4**: 30 minutes (UX validation)

### Real Data Testing
- User's actual dataset: 18,000+ photos
- Measure actual accuracy (% auto-matched)
- Spot-check known concerts (Phish @ Sphere, Dead & Company, etc.)

### Performance Benchmarks
- Query timing logs (`[Performance] concerts.list took Xms`)
- Before/after comparisons for each optimization
- Console logs show execution times

---

## External API Usage

### setlist.fm API
- **Rate limit**: 500ms delay between calls (respect TOS)
- **Caching**: Store results to reduce API calls
- **Search strategies**:
  1. Artist + date (no GPS filter)
  2. Venue + date + GPS (fuzzy matching)
  3. City + date + venue (fallback)

### OpenWeather API
- **Free tier**: 1000 calls/day (sufficient)
- **Usage**: Fetch weather for concert date/location
- **Caching**: Store in database, never re-fetch

### Google Drive API
- **Service account**: JSON credentials in env var
- **Folder ID**: User's photo folder
- **Batch size**: User-configurable (1-100 photos per scan)
- **Deduplication**: Track processed files in `processed_files` table

### OpenStreetMap (OSM)
- **Overpass API**: Venue detection within 600m radius
- **Caching**: Store venues in database for instant future lookups
- **Rate limit**: Respectful delays between queries

---

## Common Patterns

### Photo Scanning Workflow
1. Fetch files from Google Drive (paginated, 1000 per page)
2. Filter out already-processed files
3. Extract EXIF data (date, GPS) in batches
4. Group photos by date + GPS (~100m precision)
5. For each group:
   - Check database for existing concerts (Stage 1)
   - If not found, search setlist.fm (Stage 2)
   - Auto-link photos within 500m on same date
6. Unmatched photos → manual review queue

### Manual Photo Review Workflow
1. Load unmatched photos (ordered by date + GPS for grouping)
2. Display: Photo, EXIF data, detected venue, nearby venues
3. User options:
   - Search by artist name
   - Type venue manually
   - Select from dropdown
   - Create concert manually
   - Skip for later
   - Link to existing concert

### Venue Detection Workflow
1. Extract GPS from photo EXIF
2. Check OSM cache in database (600m radius)
3. If cached: Return venue immediately
4. If not cached: Query OSM Overpass API
5. Cache result in `venues` table
6. Return venue with confidence level ('high', 'medium', 'low')

---

## Future Migration Path (Cloud Deployment)

When ready to scale beyond single user:

### Steps (1 day timeline)
1. Export database: `npm run export -- --format sql`
2. Provision infrastructure: TiDB Serverless, Redis, CloudFlare
3. Import database: `mysql < backup.sql`
4. Update env vars: `DATABASE_URL`, `REDIS_URL`
5. Deploy servers

### Architecture Changes
- MySQL → TiDB Serverless (auto-scaling)
- In-memory cache → Redis
- Simple queue → BullMQ (job queue)
- Local server → CloudFlare + load balancer

**All planning documented in**: `PHASE_2_SCALABILITY.md`

---

## Common Gotchas

### Date/Timezone Issues
- **Always normalize concert dates to noon UTC** before storing or comparing
- Photo EXIF timestamps are in local timezone → convert to UTC
- Midnight concerts (00:00-04:00) → adjust to previous day

### Fuzzy Matching Edge Cases
- Venue name variations: "MSG" vs "Madison Square Garden"
- Unicode characters: "Théâtre" vs "Theatre" (fixed in Week 1)
- Apostrophes: "O'Reilly Theater" vs "OReilly Theater" (fixed in Week 1)

### GPS Accuracy
- Phone GPS typically accurate to 5-50 meters
- Bad GPS can be kilometers off (user reports Seattle GPS for Las Vegas concert!)
- Solution: Artist search bypasses GPS, manual venue input

### setlist.fm Limitations
- Not all concerts in database (especially new venues like The Sphere)
- Venue names may differ from OSM
- Some artists don't submit setlists
- Solution: Manual concert creation → future photos auto-link via database-first matching

---

## Key Files Reference

**Entry Points**:
- `/server/index.ts` - Server startup
- `/client/src/main.tsx` - React app entry

**Critical Backend Files**:
- `/server/routers.ts` - All tRPC API endpoints
- `/server/db.ts` - Database CRUD operations
- `/server/photoIngestion.ts` - Photo scanning & matching logic
- `/server/integrations.ts` - External API clients (setlist.fm, OSM, etc.)
- `/server/fuzzyMatch.ts` - Venue name matching algorithm

**Critical Frontend Files**:
- `/client/src/pages/Dashboard.tsx` - Main dashboard (concert cards)
- `/client/src/pages/PhotoReview.tsx` - Unmatched photo review UI
- `/client/src/pages/ConcertDetail.tsx` - Individual concert page

**Schema & Migrations**:
- `/drizzle/schema.ts` - MySQL schema (Drizzle ORM)
- `/migrations/` - SQL migration files (001-xxx.sql, 002-xxx.sql, etc.)

**Planning Docs**:
- `/MANUS-CHA-Jan26/REVISED_ROADMAP_LOCAL_FIRST.md` - Main implementation plan
- `/MANUS-CHA-Jan26/WEEK_1_IMPLEMENTATION_SUMMARY.md` - Week 1 details
- `/MANUS-CHA-Jan26/TESTING_PLAN.md` - User testing guide

---

## Developer Notes

### Running the App
```bash
# Start dev server (auto-restart on changes)
npm run dev
# or
tsx watch server/index.ts

# Frontend runs on: http://localhost:5173
# Backend runs on: http://localhost:5000
```

### Database Migrations
```bash
# Apply migration
mysql -u root -p concert_history < migrations/001-composite-indexes.sql

# Or use Drizzle
npx drizzle-kit push
```

### Useful Commands
```bash
# Export database
npm run export -- --format json --output ~/backups/backup.json

# Import database
npm run import -- --file ~/backups/backup.json

# Run tests
npm run test
```

---

## Current User

**User ID**: 1 (single user, local deployment)
**Name**: rmitra
**Dataset**: ~18,000 photos in Google Drive
**Use case**: Personal concert history tracking

---

Last updated: January 4, 2026 (Week 1 complete)
