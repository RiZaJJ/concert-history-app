# Quick Start Guide for AI Agents

## 🚀 Getting Started in 5 Minutes

### Step 1: Extract the Archive
```bash
tar -xzf concert-history-app-export.tar.gz
cd concert-history-app
```

### Step 2: Read These Files First
1. **`AI_HANDOFF.md`** (comprehensive documentation - READ THIS FIRST)
2. **`todo.md`** (current issues and priorities)
3. **`README.md`** (original template documentation)

### Step 3: Understand the Core
- **Main Logic**: `server/photoIngestion.ts` (photo scanning & concert matching)
- **API Endpoints**: `server/routers.ts` (tRPC procedures)
- **Database Schema**: `drizzle/schema.ts` (data model)
- **Frontend**: `client/src/pages/Dashboard.tsx` (main UI)

### Step 4: Install & Run
```bash
pnpm install
pnpm dev  # Starts on port 3000
```

---

## 🎯 Most Common Tasks

### User Reports Duplicate Concerts
**File**: `server/photoIngestion.ts` lines 81-106
**Issue**: Check if "find or create" pattern is working for artists/venues
**Solution**: Verify `getArtistByName()` and `findVenueByNameAndCity()` are called before `createArtist()`/`createVenue()`

### User Reports Wrong Venue Matching
**File**: `server/concertgeocoder.ts`
**Issue**: Geocoding matching wrong venue (e.g., Showbox instead of Nectar Lounge)
**Solution**: Adjust search radius (currently 100m) or venue type filters

### User Reports Scan Timeout
**File**: `server/photoIngestion.ts` line 577
**Issue**: HTTP timeout → HTML error instead of JSON
**Solution**: Reduce `batchSize` (currently 5, was 15, originally 50)

### User Reports Wrong Date Matching
**File**: `server/integrations.ts` lines 91-97
**Issue**: UTC date vs local date conversion
**Solution**: The 12-hour offset heuristic is in `searchSetlistsByDateAndLocation()`

---

## 🔍 Debugging Checklist

### Scan Not Working?
1. Check Google Drive credentials in env
2. Verify photos have GPS EXIF data
3. Check server logs for API errors
4. Look for `[Geocoding]`, `[Setlist.fm]`, `[Weather]` log prefixes

### Duplicates Still Being Created?
1. Check if artist/venue already exists in database
2. Verify "find or create" pattern in `autoDetectConcert()`
3. Look for "Created new artist/venue" vs "Found existing" in logs
4. Check unique index on concerts table: `(userId, venueId, concertDate)`

### Wrong Concert Match?
1. Check venue geocoding result in logs
2. Verify setlist.fm API response
3. Check date conversion (UTC → local)
4. Look for nearby concerts on same date

---

## 📊 Database Quick Queries

```sql
-- Count concerts by artist
SELECT a.name, COUNT(*) as count 
FROM concerts c 
JOIN artists a ON c.artistId = a.id 
GROUP BY a.name 
ORDER BY count DESC;

-- Find duplicates
SELECT artistId, venueId, concertDate, COUNT(*) as count
FROM concerts
GROUP BY artistId, venueId, concertDate
HAVING count > 1;

-- Check scan progress
SELECT COUNT(*) as processed FROM processed_files WHERE userId = 1;

-- Recent concerts
SELECT c.id, a.name as artist, v.name as venue, c.concertDate 
FROM concerts c 
JOIN artists a ON c.artistId = a.id 
JOIN venues v ON c.venueId = v.id 
ORDER BY c.createdAt DESC LIMIT 10;
```

---

## 🛠️ Key Code Patterns

### Adding a New tRPC Endpoint
```typescript
// In server/routers.ts
myNewEndpoint: protectedProcedure
  .input(z.object({ id: z.number() }))
  .mutation(async ({ input, ctx }) => {
    // ctx.user.id = authenticated user
    return await db.doSomething(input.id);
  }),
```

### Calling from Frontend
```typescript
// In client/src/pages/SomePage.tsx
const mutation = trpc.myNewEndpoint.useMutation({
  onSuccess: () => {
    trpc.useUtils().concerts.list.invalidate();
  }
});

mutation.mutate({ id: 123 });
```

### Database Operations
```typescript
// Always check if exists first
let artist = await db.getArtistByName(name);
if (!artist) {
  artist = await db.createArtist({ name });
}
```

---

## 🎓 Understanding the Data Flow

```
User clicks "Scan Photos"
  ↓
Frontend: trpc.photos.scanFromDrive.useMutation()
  ↓
Backend: server/routers.ts → scanFromDrive procedure
  ↓
server/photoIngestion.ts → scanAndIngestPhotos()
  ↓
For each photo (batch of 5):
  1. Extract EXIF (GPS, timestamp)
  2. Geocode venue (Overpass API)
  3. Search setlist.fm (date + location)
  4. Find or create artist
  5. Find or create venue
  6. Check if concert exists
  7. Create concert (if new)
  8. Fetch weather data
  9. Link photo to concert
  10. Mark file as processed
  ↓
Return summary (concerts created, photos linked)
  ↓
Frontend: Show dialog with results
```

---

## 🚨 Critical Files - Don't Break These!

1. **`server/photoIngestion.ts`** - Core scanning logic
2. **`server/db.ts`** - Database operations (breaking = data loss)
3. **`drizzle/schema.ts`** - Schema changes require migration
4. **`server/_core/*`** - Framework code (OAuth, context, etc.)

---

## 💡 Pro Tips

1. **Always test with "Clear & Rescan"** after code changes to photo ingestion
2. **Check `todo.md`** before starting work - might already be documented
3. **Use `console.log`** liberally - logs are your friend
4. **Batch size trades off speed vs reliability** - smaller = slower but more stable
5. **External APIs are slow/flaky** - always handle errors gracefully

---

## 📞 When to Ask User for Clarification

- "Which specific concert/artist is having issues?"
- "Can you share a screenshot of the error?"
- "How many photos are in your Google Drive folder?"
- "What's the expected behavior vs actual behavior?"
- "Have you tried 'Clear & Rescan' with the latest code?"

---

## ✅ Verification Checklist

Before delivering changes:
- [ ] Code compiles (`pnpm build`)
- [ ] Tests pass (`pnpm test`)
- [ ] Scan Photos works (processes 5 photos)
- [ ] No duplicate concerts created
- [ ] Summary dialog shows correct counts
- [ ] No console errors in browser
- [ ] Server logs show expected behavior

---

## 🎯 Current Priority (from todo.md)

**Highest Priority**:
1. Auto-scan feature ("Scan All Remaining" button)
2. Merge duplicates tool (UI to combine duplicate concerts)
3. Fix timezone handling (use venue location instead of 12-hour heuristic)

**User Pain Points**:
- Having to click "Scan Photos" many times (batch size = 5)
- Existing duplicate concerts need cleanup
- Some photos matched to wrong concerts (venue geocoding)

---

## 📦 What's in the Archive

```
concert-history-app/
├── AI_HANDOFF.md          ← READ THIS FIRST
├── QUICK_START_FOR_AI.md  ← You are here
├── todo.md                ← Current issues
├── README.md              ← Template docs
├── package.json           ← Dependencies
├── drizzle/               ← Database schema
├── server/                ← Backend code
│   ├── photoIngestion.ts  ← CORE LOGIC
│   ├── routers.ts         ← API endpoints
│   ├── db.ts              ← Database ops
│   ├── integrations.ts    ← External APIs
│   └── concertgeocoder.ts ← Venue geocoding
├── client/                ← Frontend code
│   └── src/
│       ├── pages/         ← UI pages
│       └── components/    ← Reusable components
└── shared/                ← Shared types
```

**Not included** (too large):
- `node_modules/` - Run `pnpm install`
- `.git/` - Version history
- `dist/` - Build output

---

## 🎬 Ready to Start?

1. Extract archive
2. Read `AI_HANDOFF.md`
3. Run `pnpm install && pnpm dev`
4. Ask user: "What would you like me to work on?"

**Good luck! 🚀**
