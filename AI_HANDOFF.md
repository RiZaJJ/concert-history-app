# Concert History App - AI Handoff Documentation

## Project Overview

**Purpose**: Automatically build a concert history database by scanning Google Photos for concert photos, extracting GPS/EXIF data, matching to concerts via setlist.fm API, and organizing with venue/weather information.

**Current Status**: Fully functional with 140+ concerts processed. Active development addressing duplicate detection, venue geocoding accuracy, and scan performance.

---

## Architecture

### Tech Stack
- **Frontend**: React 19 + Tailwind CSS 4 + Wouter (routing) + shadcn/ui components
- **Backend**: Express 4 + tRPC 11 (type-safe API)
- **Database**: MySQL/TiDB (Drizzle ORM)
- **Auth**: Manus OAuth (built-in)
- **Storage**: S3 (via Manus platform)
- **External APIs**:
  - Google Drive API (photo access)
  - setlist.fm API (concert matching)
  - Overpass API (venue geocoding)
  - Visual Crossing Weather API (historical weather)

### Data Flow

1. **Photo Scan** (`server/photoIngestion.ts`)
   - Fetch photos from Google Drive
   - Extract EXIF (GPS coordinates, timestamp)
   - Geocode venue from GPS → Overpass API
   - Search setlist.fm by date + location
   - Create concert record (or link to existing)
   - Fetch historical weather data
   - Link photo to concert

2. **Duplicate Prevention**
   - Check if artist exists by name (reuse ID)
   - Check if venue exists by name+city (reuse ID)
   - Check if concert exists by artistId+venueId+date
   - Batch-level cache prevents duplicates within single scan

3. **Frontend Display** (`client/src/pages/Dashboard.tsx`)
   - Grid of concert cards (artist, venue, date, weather)
   - Search/filter by artist, venue, city
   - Click concert → detail page with photos
   - AI-generated "Concert Insights" (humorous analysis)

---

## Key Files & Responsibilities

### Backend (`server/`)

| File | Purpose |
|------|---------|
| `photoIngestion.ts` | **CORE LOGIC** - Photo scanning, EXIF extraction, concert matching, duplicate detection |
| `integrations.ts` | External API wrappers (setlist.fm, weather) |
| `concertgeocoder.ts` | Venue geocoding (Overpass API) - searches for music venues within 100m |
| `db.ts` | Database operations (CRUD for concerts, artists, venues, photos) |
| `routers.ts` | tRPC API endpoints (scan, getConcerts, updateConcert, etc.) |

### Frontend (`client/src/`)

| File | Purpose |
|------|---------|
| `pages/Dashboard.tsx` | Main concert list view with search/filter |
| `pages/ConcertDetail.tsx` | Single concert view with photo gallery |
| `pages/UnmatchedPhotos.tsx` | Photos that couldn't be matched to concerts |
| `components/ui/*` | shadcn/ui components (button, card, dialog, etc.) |

### Database Schema (`drizzle/schema.ts`)

```
users (id, openId, name, email, role)
artists (id, name, mbid, imageUrl)
venues (id, name, city, state, country, latitude, longitude)
concerts (id, userId, artistId, venueId, concertDate, weatherCondition, temperature, notes, setlistFmId)
  - UNIQUE INDEX: (userId, venueId, concertDate) ← prevents duplicates
photos (id, userId, concertId, driveFileId, takenAt, latitude, longitude, venueName, city, country)
songs (id, artistId, title)
setlist_songs (id, concertId, songId, setNumber, songOrder)
processed_files (id, userId, filename, processedAt) ← tracks scanned files
```

---

## Current Issues & Solutions

### 1. **Duplicate Concerts** ✅ FIXED (checkpoint 2066aa10)
- **Problem**: Multiple concerts for same artist+venue+date
- **Root Cause**: `createArtist()` and `createVenue()` always created new records instead of reusing existing ones
- **Solution**: Implemented "find or create" pattern - check if artist/venue exists before creating
- **Status**: Fixed in code, but existing duplicates need manual cleanup

### 2. **Scan Timeout** ✅ MITIGATED (checkpoint 7b071a64)
- **Problem**: HTTP timeout → HTML error instead of JSON response
- **Root Cause**: Overpass API slowness (504 errors), combined with setlist.fm + weather API calls
- **Solution**: Reduced batch size from 50 → 15 → 5 photos per scan
- **Trade-off**: More button clicks needed, but each scan succeeds

### 3. **Wrong Venue Matching** ⚠️ PARTIALLY FIXED (checkpoint bc12c8f7)
- **Problem**: Photos from Nectar Lounge matched to Showbox (wrong venue)
- **Root Cause**: Generic Overpass queries matched any nearby place
- **Solution**: Implemented `concertgeocoder.ts` - searches only for music venue types (nightclub, theater, stage) within 100m
- **Status**: Improved but still needs testing

### 4. **Date Conversion Bug** ⚠️ PARTIALLY FIXED
- **Problem**: Photos taken Oct 3 11:24 PM local → matched to Oct 4 concerts
- **Root Cause**: EXIF timestamp is UTC, but setlist.fm needs local date
- **Solution**: Subtract 12 hours from UTC timestamp before extracting date (heuristic for US timezones)
- **Limitation**: Fails for photos taken 12 AM - 6 AM local time
- **Better Solution**: Use timezone from venue location (not implemented)

---

## API Keys & Environment Variables

**All secrets are injected by Manus platform** - no manual setup needed when running in Manus environment.

Required for external deployment:
```
DATABASE_URL=mysql://...
GOOGLE_DRIVE_CREDENTIALS={"type":"service_account",...}
GOOGLE_DRIVE_FOLDER_ID=1abc...
SETLISTFM_API_KEY=abc123...
OPENWEATHER_API_KEY=def456...
VISUAL_CROSSING_API_KEY=ghi789...
JWT_SECRET=random_string
OAUTH_SERVER_URL=https://api.manus.im
VITE_APP_ID=...
```

---

## Development Workflow

### Running Locally
```bash
cd concert-history-app
pnpm install
pnpm db:push  # Push schema to database
pnpm dev      # Start dev server on port 3000
```

### Database Migrations
```bash
pnpm db:push     # Push schema changes to database
pnpm db:studio   # Open Drizzle Studio (database GUI)
```

### Testing
```bash
pnpm test        # Run all vitest tests
pnpm test photos # Run specific test file
```

### Key Commands
- **Scan Photos**: Processes next 5 unprocessed photos from Google Drive
- **Delete Database**: Clears all concerts/photos (keeps processed_files for incremental scanning)
- **Clear & Rescan**: Deletes database + clears processed_files → full rescan

---

## Known Limitations

1. **Batch Processing**: Scan processes 5 photos at a time (manual button clicks required)
2. **Duplicate Cleanup**: Existing duplicates need manual merge tool (not implemented)
3. **Timezone Handling**: 12-hour heuristic fails for late-night/early-morning photos
4. **Overpass API Rate Limiting**: 504 errors during heavy usage
5. **No Photo Upload**: Only scans existing Google Drive folder (no upload UI)

---

## Immediate Next Steps (from todo.md)

### High Priority
- [ ] **Auto-scan feature**: "Scan All Remaining" button that loops until all photos processed
- [ ] **Merge duplicates tool**: UI to manually combine duplicate concerts
- [ ] **Photo reassignment**: Move photos between concerts when auto-match fails
- [ ] **Progress tracking**: Show "Processed 450/3000 photos" across page refreshes

### Medium Priority
- [ ] **Timezone detection**: Use venue location to determine timezone for accurate date matching
- [ ] **Venue whitelist**: Pre-configure favorite venues for priority matching
- [ ] **Photo count badges**: Show number of photos on concert cards
- [ ] **Bulk operations**: Select multiple concerts for batch delete/merge

### Low Priority
- [ ] **Setlist display**: Show song list on concert detail page (data already fetched)
- [ ] **Artist images**: Fetch from MusicBrainz API
- [ ] **Export functionality**: Download concert history as CSV/JSON
- [ ] **Social sharing**: Share concert cards as images

---

## Code Patterns & Conventions

### tRPC Procedures
```typescript
// Protected procedure (requires auth)
myProcedure: protectedProcedure
  .input(z.object({ id: z.number() }))
  .query(async ({ input, ctx }) => {
    // ctx.user.id is authenticated user
    return await db.getConcert(input.id);
  }),
```

### Database Operations
```typescript
// Always use "find or create" pattern
let artist = await db.getArtistByName(artistName);
if (!artist) {
  artist = await db.createArtist({ name: artistName });
}
```

### Frontend Data Fetching
```typescript
// Query (read)
const { data, isLoading } = trpc.concerts.list.useQuery();

// Mutation (write)
const scanMutation = trpc.photos.scanFromDrive.useMutation({
  onSuccess: (result) => {
    // Invalidate cache to refetch
    trpc.useUtils().concerts.list.invalidate();
  }
});
```

---

## Debugging Tips

### Check Scan Progress
```sql
-- See how many files processed
SELECT COUNT(*) FROM processed_files WHERE userId = 1;

-- See recent concerts
SELECT c.id, a.name as artist, v.name as venue, c.concertDate 
FROM concerts c 
JOIN artists a ON c.artistId = a.id 
JOIN venues v ON c.venueId = v.id 
ORDER BY c.createdAt DESC LIMIT 10;

-- Find duplicates
SELECT artistId, venueId, concertDate, COUNT(*) as count
FROM concerts
GROUP BY artistId, venueId, concertDate
HAVING count > 1;
```

### Server Logs
- Look for `[Geocoding]`, `[Setlist.fm]`, `[Weather]` prefixes
- `Concert already exists` = duplicate detection working
- `Created new artist/venue` = first time seeing this entity
- `504` errors = Overpass API timeout

### Common Issues
- **No concerts created**: Check if Google Drive folder has photos with GPS data
- **Wrong venue**: Check Overpass API response in logs
- **Timeout errors**: Reduce batch size further (currently 5)
- **Duplicates**: Run "Clear & Rescan" with latest code

---

## Testing Strategy

### Unit Tests (`server/*.test.ts`)
- `auth.logout.test.ts` - Auth flow
- `photos.test.ts` - Photo CRUD
- `newFeatures.test.ts` - Concert updates
- `venueEnhancements.test.ts` - Venue aliases

### Integration Testing
1. Click "Scan Photos" → should process 5 photos
2. Check scan summary dialog shows correct counts
3. Verify no duplicate concerts created
4. Check concert detail page shows photos
5. Test search/filter functionality

---

## Deployment Notes

**Current Deployment**: Manus platform (automatic)
- Push code → auto-deploy
- Database migrations run automatically
- Secrets injected from platform

**External Deployment** (if needed):
1. Set up MySQL database
2. Configure all environment variables
3. Set up Google Drive service account
4. Deploy backend + frontend separately or together
5. Configure OAuth callback URLs

---

## Contact & Support

- **Original Developer**: Manus AI Agent
- **User**: Daveashish Mitra (dktkn6y6c7@privaterelay.appleid.com)
- **Google Drive Folder**: Contains ~3000+ concert photos from 2023-2024
- **Primary Venues**: Seattle area (Showbox, Triple Door, Nectar Lounge, etc.)

---

## Quick Start for New AI

1. **Read this file first** (you're doing it!)
2. **Review `server/photoIngestion.ts`** - core logic
3. **Check `todo.md`** - current issues and priorities
4. **Run `pnpm dev`** - start local development
5. **Test "Scan Photos"** - verify basic functionality
6. **Review recent commits** - understand latest changes

**Key Question to Ask User**: "What specific issue are you experiencing, or what feature would you like to add?"

Most common requests:
- Fix duplicate concerts
- Improve venue matching accuracy
- Speed up photo scanning
- Add merge/cleanup tools
- Better date/timezone handling
