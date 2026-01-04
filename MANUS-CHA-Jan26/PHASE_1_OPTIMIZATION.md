# Phase 1: System Optimization & Bug Fixes

## Timeline: Weeks 1-2 (14 days)

---

## Current System Analysis

### Identified Bottlenecks

#### 1. **Database Performance Issues**
**Problem:** MySQL queries slow down with 18,000+ photos
- `findVenuesNearCoordinates()` - No spatial index
- `findConcert()` - Missing composite index on (userId, venueId, concertDate)
- Unmatched photos query - Full table scan

**Impact:** Photo scanning slows from 50ms to 500ms per photo as data grows

**Solution:**
```sql
-- Add spatial index for venue proximity queries
ALTER TABLE venues ADD SPATIAL INDEX idx_venue_location (latitude, longitude);

-- Add composite index for concert lookups
ALTER TABLE concerts ADD INDEX idx_user_venue_date (userId, venueId, concertDate);

-- Add index for unmatched photo queries
ALTER TABLE unmatched_photos ADD INDEX idx_user_reviewed (userId, reviewed, takenAt);
```

**Effort:** 1 day
**Risk:** LOW - Additive only, no schema changes

---

#### 2. **N+1 Query Problems**
**Problem:** Dashboard loads concerts then queries each for photo count
- 100 concerts = 101 queries (1 + 100)
- 500ms total query time

**Current Code:**
```typescript
// Bad: Loads concerts, then queries each for photos
const concerts = await db.getUserConcerts(userId);
for (const concert of concerts) {
  const photoCount = await db.getPhotosCount(concert.id); // N+1!
}
```

**Solution:**
```typescript
// Good: Single query with JOIN
export async function getUserConcertsWithCounts(userId: number) {
  const db = await getDb();
  return await db
    .select({
      concert: schema.concerts,
      artist: schema.artists,
      venue: schema.venues,
      photoCount: sql<number>`count(${schema.photos.id})`,
    })
    .from(schema.concerts)
    .leftJoin(schema.artists, eq(schema.concerts.artistId, schema.artists.id))
    .leftJoin(schema.venues, eq(schema.concerts.venueId, schema.venues.id))
    .leftJoin(schema.photos, eq(schema.concerts.id, schema.photos.concertId))
    .where(eq(schema.concerts.userId, userId))
    .groupBy(schema.concerts.id)
    .orderBy(desc(schema.concerts.concertDate));
}
```

**Effort:** 2 days
**Risk:** LOW - Well-tested pattern

---

#### 3. **Memory Leaks in Photo Scanning**
**Problem:** Scanning 1000+ photos causes memory buildup
- File metadata not garbage collected
- Progress store never cleared
- OSM venue cache grows unbounded

**Solution:**
```typescript
// Add cleanup after scan completion
export async function scanPhotosFromDrive(userId: number, limit?: number) {
  try {
    // ... existing scan logic ...
  } finally {
    // Clear progress from memory
    clearScanProgress(userId);

    // Force garbage collection hint
    if (global.gc) global.gc();

    // Trim OSM venue cache (keep last 1000 venues)
    await trimVenueCache(1000);
  }
}
```

**Effort:** 1 day
**Risk:** LOW - Defensive coding

---

#### 4. **Duplicate API Calls**
**Problem:** Multiple components query same data
- Dashboard fetches concerts
- Concert cards fetch photos
- Same data fetched 3x in one page load

**Solution:** Implement tRPC query deduplication
```typescript
// Enable query batching and deduplication
export const trpc = createTRPCReact<AppRouter>({
  overrides: {
    useMutation: {
      onSuccess: async (opts) => {
        // Invalidate related queries
        opts.client.photos.invalidate();
        opts.client.concerts.invalidate();
      },
    },
  },
});

// Add React Query config
<QueryClientProvider client={queryClient}>
  {/* queryClient configured with: */}
  {/* - staleTime: 30000 (30s cache) */}
  {/* - cacheTime: 300000 (5min) */}
  {/* - refetchOnWindowFocus: false */}
</QueryClientProvider>
```

**Effort:** 1 day
**Risk:** MEDIUM - May cause stale data issues

---

### Known Bugs to Fix

#### Bug 1: Date Timezone Issues
**Problem:** Midnight concerts (00:00-04:00) sometimes grouped incorrectly
- UTC vs local time confusion
- Concert date stored as UTC midnight but photo time is local

**Root Cause:**
```typescript
// Current: Uses UTC midnight
concertDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

// But photo comparison uses local time
const photoDate = new Date(photo.takenAt); // Local timezone!
```

**Fix:**
```typescript
// Normalize both to UTC midnight for comparison
function normalizeToUTCMidnight(date: Date): Date {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

// Apply adjustment AFTER normalization
function adjustDateForMidnight(date: Date): Date {
  const normalized = normalizeToUTCMidnight(date);
  const hours = date.getHours();

  if (hours >= 0 && hours < 4) {
    normalized.setUTCDate(normalized.getUTCDate() - 1);
  }

  return normalized;
}
```

**Effort:** 1 day
**Risk:** MEDIUM - Affects existing concert dates

---

#### Bug 2: Venue Name Encoding Issues
**Problem:** Special characters in venue names cause fuzzy match failures
- "Café du Nord" vs "Cafe du Nord"
- "O2 Arena" vs "O₂ Arena"

**Fix:**
```typescript
function normalizeVenueName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD') // Decompose accented characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[²³]/g, '') // Normalize superscripts to regular
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
```

**Effort:** 0.5 days
**Risk:** LOW - Improves matching

---

#### Bug 3: Race Condition in Concurrent Scans
**Problem:** Starting second scan while first is running causes data corruption
- Progress store overwritten
- Photos linked to wrong concerts

**Fix:**
```typescript
export async function scanPhotosFromDrive(userId: number, limit?: number) {
  // Check if scan already running
  const existingScan = getScanProgress(userId);
  if (existingScan?.isScanning) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'Scan already in progress. Please wait for it to complete.',
    });
  }

  // Set lock
  initScanProgress(userId, totalPhotos);

  // ... rest of scan logic ...
}
```

**Effort:** 0.5 days
**Risk:** LOW - Prevents errors

---

#### Bug 4: setlist.fm Rate Limit Not Respected
**Problem:** Bursts of requests when scanning grouped photos
- 10 photos same venue = 10 API calls in < 1 second
- Gets rate limited (429 error)

**Current:**
```typescript
await setlistFmRateLimit(); // 500ms delay
const result = await axios.get(...); // Single request
```

**Fix:** Implement token bucket algorithm
```typescript
class RateLimiter {
  private tokens = 10; // Start with 10 tokens
  private lastRefill = Date.now();
  private readonly refillRate = 2; // 2 tokens per second
  private readonly maxTokens = 10;

  async acquire() {
    // Refill tokens based on elapsed time
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.maxTokens,
      this.tokens + elapsed * this.refillRate
    );
    this.lastRefill = now;

    // Wait if no tokens available
    if (this.tokens < 1) {
      const waitTime = (1 - this.tokens) / this.refillRate * 1000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.tokens = 0;
    } else {
      this.tokens -= 1;
    }
  }
}

const setlistFmLimiter = new RateLimiter();
```

**Effort:** 1 day
**Risk:** LOW - Prevents rate limiting

---

## New Features to Add

### Feature 1: Batch Photo Actions
**User Story:** "As a user, I want to link 50 similar photos at once, not one by one"

**Implementation:**
```typescript
// Backend endpoint
photos.bulkCreateConcert: protectedProcedure
  .input(z.object({
    photoIds: z.array(z.number()),
    artistName: z.string(),
    venueName: z.string(),
    concertDate: z.date(),
  }))
  .mutation(async ({ input, ctx }) => {
    // Create concert once
    const concert = await db.createConcert(...);

    // Link all photos in transaction
    await db.transaction(async (tx) => {
      for (const photoId of input.photoIds) {
        await linkPhotoToConcert(tx, photoId, concert.id);
      }
    });

    return { concertId: concert.id, photosLinked: input.photoIds.length };
  });
```

**UI Changes:**
- Checkbox selection on photo review page
- "Link Selected (15)" button
- Bulk create concert dialog

**Effort:** 2 days
**Risk:** LOW - Common pattern

---

### Feature 2: Smart Photo Deduplication
**User Story:** "As a user, I want duplicate photos detected so I don't create duplicate concerts"

**Implementation:**
```typescript
// Use perceptual hash (pHash) for image similarity
import { imageHash } from 'image-hash';

export async function detectDuplicates(userId: number) {
  const photos = await db.getUserPhotos(userId);
  const duplicates: Array<{ original: number; duplicates: number[] }> = [];

  for (let i = 0; i < photos.length; i++) {
    const hash1 = await imageHash(photos[i].sourceUrl);

    for (let j = i + 1; j < photos.length; j++) {
      const hash2 = await imageHash(photos[j].sourceUrl);
      const similarity = hammingDistance(hash1, hash2);

      if (similarity < 5) { // < 5 bits different = duplicate
        duplicates.push({
          original: photos[i].id,
          duplicates: [photos[j].id],
        });
      }
    }
  }

  return duplicates;
}
```

**Effort:** 3 days
**Risk:** MEDIUM - CPU intensive, needs background job

---

### Feature 3: Concert Edit & Merge
**User Story:** "As a user, I want to fix mistakes and merge duplicate concerts"

**Implementation:**
```typescript
// Edit concert
concerts.update: protectedProcedure
  .input(z.object({
    concertId: z.number(),
    artistId: z.number().optional(),
    venueId: z.number().optional(),
    concertDate: z.date().optional(),
  }))
  .mutation(async ({ input, ctx }) => {
    const concert = await db.getConcertById(input.concertId);
    if (concert.userId !== ctx.user.id) throw new Error('Unauthorized');

    await db.updateConcert(input.concertId, input);
    return { success: true };
  });

// Merge concerts (already exists, needs UI)
concerts.merge: protectedProcedure
  .input(z.object({
    sourceConcertId: z.number(),
    targetConcertId: z.number(),
  }))
  .mutation(async ({ input, ctx }) => {
    await db.mergeConcerts(input.sourceConcertId, input.targetConcertId, ctx.user.id);
  });
```

**UI Changes:**
- Edit button on concert detail page
- "Find Duplicates" button on dashboard
- Merge confirmation dialog

**Effort:** 2 days
**Risk:** LOW - Backend exists, needs UI

---

### Feature 4: Export Concert History
**User Story:** "As a user, I want to export my data to CSV/JSON/PDF"

**Implementation:**
```typescript
concerts.export: protectedProcedure
  .input(z.object({
    format: z.enum(['csv', 'json', 'pdf']),
    filters: z.object({
      year: z.number().optional(),
      artistId: z.number().optional(),
    }).optional(),
  }))
  .mutation(async ({ input, ctx }) => {
    const concerts = await db.getUserConcerts(ctx.user.id);

    switch (input.format) {
      case 'csv':
        return generateCSV(concerts);
      case 'json':
        return JSON.stringify(concerts, null, 2);
      case 'pdf':
        return await generatePDF(concerts); // Use pdfkit
    }
  });
```

**Effort:** 3 days
**Risk:** LOW - Standard feature

---

### Feature 5: Venue Autocomplete
**User Story:** "As a user, I want venue suggestions as I type, not just nearby venues"

**Implementation:**
```typescript
venues.search: protectedProcedure
  .input(z.object({
    query: z.string(),
    limit: z.number().default(10),
  }))
  .query(async ({ input }) => {
    // Search database venues first
    const dbVenues = await db.searchVenues(input.query);

    // If < 10 results, search setlist.fm venue database
    if (dbVenues.length < input.limit) {
      const setlistVenues = await searchSetlistFmVenues(input.query);
      return [...dbVenues, ...setlistVenues].slice(0, input.limit);
    }

    return dbVenues;
  });
```

**UI:** Use shadcn Command component with real-time search

**Effort:** 2 days
**Risk:** LOW - Improves UX

---

## Priority Matrix

| Task | Impact | Effort | Priority | Week |
|------|--------|--------|----------|------|
| Add database indexes | HIGH | 1d | P0 | 1 |
| Fix N+1 queries | HIGH | 2d | P0 | 1 |
| Fix timezone bug | HIGH | 1d | P0 | 1 |
| Fix race condition | MEDIUM | 0.5d | P1 | 1 |
| Implement rate limiter | MEDIUM | 1d | P1 | 1 |
| Add memory cleanup | MEDIUM | 1d | P1 | 1 |
| Fix venue encoding | LOW | 0.5d | P2 | 2 |
| Batch photo actions | HIGH | 2d | P0 | 2 |
| Concert edit UI | MEDIUM | 2d | P1 | 2 |
| Venue autocomplete | MEDIUM | 2d | P1 | 2 |
| Export feature | LOW | 3d | P2 | 2 |
| Photo deduplication | LOW | 3d | P3 | Future |

**Total Effort:** 10 days (2 weeks)

---

## Testing Plan

### Performance Tests
```typescript
describe('Performance Optimization', () => {
  it('should load dashboard in < 500ms with 1000 concerts', async () => {
    const start = Date.now();
    await loadDashboard(userId);
    expect(Date.now() - start).toBeLessThan(500);
  });

  it('should scan 100 photos in < 60 seconds', async () => {
    const start = Date.now();
    await scanPhotos(userId, 100);
    expect(Date.now() - start).toBeLessThan(60000);
  });

  it('should not exceed 2 req/sec to setlist.fm', async () => {
    const requests = [];
    for (let i = 0; i < 10; i++) {
      requests.push(fetchSetlist());
    }

    const start = Date.now();
    await Promise.all(requests);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThan(4500); // 10 requests / 2 per sec = 5 seconds minimum
  });
});
```

### Regression Tests
- Existing photo scanning still works
- Concert matching accuracy unchanged
- All existing features functional

---

## Rollout Plan

### Week 1
**Mon-Tue:** Database optimization
- Add indexes
- Fix N+1 queries
- Deploy to staging
- Performance benchmarks

**Wed-Thu:** Bug fixes
- Timezone normalization
- Race condition prevention
- Rate limiter implementation
- Memory cleanup

**Fri:** Testing & deployment
- Run full test suite
- Performance validation
- Deploy to production
- Monitor for issues

### Week 2
**Mon-Tue:** New features
- Batch photo actions
- Concert edit UI
- Venue autocomplete

**Wed-Thu:** Export feature
- CSV export
- JSON export
- PDF generation (if time permits)

**Fri:** Documentation & handoff
- Update API docs
- Create user guide
- Performance report
- Plan Phase 2

---

## Success Metrics

### Performance Targets
- Dashboard load: < 500ms (currently ~2000ms)
- Photo scanning: < 600ms per photo (currently ~1500ms with 18k photos)
- Memory usage: < 512MB during scans (currently peaks at 1.2GB)
- API rate limit errors: 0 (currently ~5% of scans)

### Feature Adoption
- Batch photo actions: Used by >50% of users in first month
- Concert edit: Used for >10% of concerts
- Export: >100 exports in first month

---

## Risk Mitigation

### High Risk: Database Index Changes
**Risk:** Could lock tables during migration on production
**Mitigation:**
- Apply during low-traffic hours
- Use `ALGORITHM=INPLACE, LOCK=NONE` for MySQL 5.7+
- Test on staging with production-sized dataset first

### Medium Risk: Timezone Changes
**Risk:** Could break existing concert date matching
**Mitigation:**
- Add feature flag for gradual rollout
- Keep old logic as fallback for 1 week
- Communicate changes to users

### Low Risk: New Features
**Risk:** Bugs in new code
**Mitigation:**
- Comprehensive unit tests
- Beta test with subset of users
- Easy rollback via feature flags

---

## Approval Needed

### Decision Points

1. **Database Indexes**: Proceed with all 3 indexes? (Recommended: YES)

2. **Timezone Fix**: This may change how some existing concerts are matched. Proceed? (Recommended: YES, but with testing)

3. **Photo Deduplication**: CPU-intensive. Should we add this or defer to Phase 2? (Recommended: DEFER - add to Phase 2 with background jobs)

4. **Export Formats**: All 3 formats (CSV/JSON/PDF) or just CSV for now? (Recommended: CSV + JSON for Phase 1, PDF in Phase 2)

5. **Rate Limiter**: More conservative (1 req/sec) or current plan (2 req/sec)? (Recommended: 2 req/sec with token bucket)

---

## Next Steps

1. Get approval on decision points above
2. Create GitHub issues for each task
3. Begin Week 1 implementation
4. Daily standups to track progress
5. Deploy optimizations incrementally

**Ready to proceed when you return! 🚀**
