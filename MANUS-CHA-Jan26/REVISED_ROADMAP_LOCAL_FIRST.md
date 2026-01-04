# Revised Roadmap: Local-First, High-Accuracy System

## Strategic Pivot

**Original Plan**: Scale to 10,000 users with cloud infrastructure ($300+/month)

**Revised Plan**: Optimize for single user (you) with local deployment (<$25/month)

### Key Changes
1. ✅ **All performance targets** (speed, accuracy) - YES
2. ❌ **User scaling** (10k concurrent) - DEFERRED
3. ✅ **Local deployment** (runs on your computer)
4. ✅ **Database portability** (export/import for future migration)
5. ✅ **Budget: <$25/month** (including AI costs)

---

## Cost Breakdown (Revised)

### Current Costs
| Service | Current | Revised | Monthly Savings |
|---------|---------|---------|-----------------|
| Database (TiDB) | $100 | $0 (local MySQL) | $100 |
| Redis | $10 | $0 (local/in-memory) | $10 |
| CDN (CloudFlare) | $0 | $0 (not needed) | $0 |
| Expo EAS | $99 | $0 (free tier) | $99 |
| Hosting | $50 | $0 (local) | $50 |
| **Infrastructure** | **$259** | **$0** | **$259** |

### New Monthly Costs (<$25 Target)
| Service | Purpose | Cost/Month | Optional? |
|---------|---------|------------|-----------|
| **setlist.fm API** | Concert data | $0 (free tier) | Required |
| **OpenWeather API** | Weather data | $0 (free tier) | Required |
| **Google Drive API** | Photo storage | $0 (already have) | Required |
| **AI/LLM calls** | Insights/suggestions | $5-15 | Optional |
| **S3 storage** | Starred photos backup | $1-5 | Optional |
| **Domain (optional)** | Custom domain for mobile | $1/month | Optional |
| **Total** | | **$7-21** | ✅ Under budget |

**AI Cost Optimization**:
- Cache AI responses locally
- Reduce frequency (weekly insights vs real-time)
- Use smaller models for simple tasks
- Option to disable AI features

---

## Revised Architecture (Local-First)

### Current Architecture (Cloud-Ready)
```
Browser → tRPC → Node Server → MySQL (TiDB) → S3
                              → Redis Cache
                              → Background Jobs (BullMQ)
```

### Revised Architecture (Local)
```
Browser → tRPC → Node Server (localhost) → MySQL (local)
                              ↓
                         Local File System
                              ↓
                    Google Drive (photos)
```

**Changes**:
1. ❌ Remove: Redis cache (use in-memory for now)
2. ❌ Remove: BullMQ (use in-process jobs)
3. ❌ Remove: CDN (serve from local)
4. ❌ Remove: Load balancer (single server)
5. ✅ Keep: MySQL (already using)
6. ✅ Add: Database export/import tools
7. ✅ Add: Local backup system

---

## Revised Phases

### Phase 1: Accuracy & Performance (3 Weeks) - PRIORITY
**Focus**: Get to 95%+ photo matching accuracy

#### Week 1: Database Performance (Local Optimization)
**No cloud costs, just local speed improvements**

**Day 1-2: Indexes & Query Optimization**
- [ ] Create composite indexes (same as cloud plan)
- [ ] Fix N+1 queries
- [ ] Benchmark on YOUR dataset (18k photos)
- Target: <50ms queries (10x improvement)

**Day 3-4: Bug Fixes**
- [ ] Fix timezone normalization
- [ ] Fix venue encoding (special characters)
- [ ] Fix race condition in concurrent scans
- [ ] Test with real data

**Day 5: Testing & Validation**
- [ ] Load test with YOUR full dataset
- [ ] Measure actual query times
- [ ] Document improvements

**Cost**: $0

---

#### Week 2: Accuracy Improvements (The Important Part!)
**Goal**: 95%+ auto-match rate on your photos

**Day 1-2: Improved Venue Matching**
- [ ] Expand fuzzy matching threshold (70% → 80%)
- [ ] Add venue aliases/nicknames (manual mappings)
- [ ] Create venue disambiguation UI
- [ ] Test: How many photos now match?

**Day 3-4: Enhanced Concert Detection**
- [ ] Improve headliner detection logic
- [ ] Add confidence scores to matches
- [ ] Flag low-confidence matches for review
- [ ] Better midnight concert handling (0-4am)

**Day 5: Photo Deduplication**
- [ ] Detect duplicate photos (same timestamp + GPS)
- [ ] Perceptual hashing for visual duplicates
- [ ] Manual review UI for potential duplicates
- [ ] Merge duplicates feature

**Deliverable**: Detailed accuracy report
- Before: X% auto-matched
- After: Y% auto-matched
- Remaining issues categorized

**Cost**: $0

---

#### Week 3: Database Portability & Backup
**Goal**: Easy migration to cloud later

**Day 1-2: Export Functionality**
```typescript
// Export entire database to portable format
export interface DatabaseExport {
  version: string;
  exportedAt: Date;
  user: UserData;
  concerts: Concert[];
  photos: Photo[];
  venues: Venue[];
  artists: Artist[];
  metadata: {
    totalConcerts: number;
    totalPhotos: number;
    dateRange: [Date, Date];
  };
}

// Export to JSON
npm run export -- --format json --output ~/backups/concerts-2026-01-04.json

// Export to SQL
npm run export -- --format sql --output ~/backups/concerts-2026-01-04.sql
```

**Features**:
- [ ] JSON export (human-readable, portable)
- [ ] SQL dump (MySQL-compatible)
- [ ] Include all related data (cascading)
- [ ] Compress exports (gzip)
- [ ] Incremental backups (only changes since last export)

**Day 3-4: Import Functionality**
```typescript
// Import from backup
npm run import -- --file ~/backups/concerts-2026-01-04.json

// Validate before import
npm run import -- --file backup.json --dry-run --validate

// Merge with existing data (deduplication)
npm run import -- --file backup.json --merge
```

**Features**:
- [ ] Validate JSON structure before import
- [ ] Detect conflicts (duplicate concerts)
- [ ] Merge strategies (keep newest, keep oldest, manual)
- [ ] Progress indicator for large imports
- [ ] Rollback on error

**Day 5: Backup Automation**
```bash
# Automated daily backups
crontab:
0 2 * * * cd /path/to/app && npm run export -- --auto

# Backup rotation (keep last 30 days)
# Upload to Google Drive (optional)
# Backup verification (checksum)
```

**Deliverable**: Complete backup/restore system

**Cost**: $0 (local storage) or $2/month (Google Drive backup)

---

### Phase 2: Feature Enhancements (2 Weeks) - ACCURACY FOCUS

#### Week 4: Manual Review Tools
**Goal**: Faster, easier manual photo matching

**Day 1-2: Bulk Actions**
- [ ] Multi-select photos (checkbox UI)
- [ ] Bulk link to concert
- [ ] Bulk star/unstar
- [ ] Bulk delete unmatched
- [ ] Keyboard shortcuts (j/k navigation, x select)

**Day 3-4: Smart Suggestions**
- [ ] ML-based concert suggestions (using past matches)
- [ ] "Photos like this one" grouping
- [ ] Venue name autocomplete (from OSM + history)
- [ ] Artist autocomplete (from setlist.fm + history)

**Day 5: Review Workflow**
- [ ] Queue system (sort by confidence)
- [ ] Skip and come back later
- [ ] Undo last action
- [ ] Batch review (10 photos at a time)

**Cost**: $0

---

#### Week 5: Advanced Matching
**Goal**: Handle edge cases better

**Day 1-2: Festival Support**
- [ ] Multi-artist concerts (e.g., Bonnaroo)
- [ ] Multi-day festivals (link to event, not single concert)
- [ ] Stage/set detection (main stage vs tent)

**Day 3-4: GPS Confidence**
- [ ] Calculate GPS accuracy from EXIF
- [ ] Widen search radius for low-accuracy GPS
- [ ] Manual GPS override
- [ ] "GPS looks wrong" detector

**Day 5: Setlist.fm Enhancements**
- [ ] Cache setlist.fm responses (reduce API calls)
- [ ] Manual setlist.fm ID input
- [ ] "Not on setlist.fm" flag
- [ ] Local setlist editing

**Cost**: $0

---

### Phase 3: Mobile App (Revised - Local Sync) (6-8 Weeks)
**Goal**: Mobile app that syncs to YOUR local server

#### Changes from Original Plan:
1. ❌ No Expo EAS ($99/month) - Use free tier
2. ❌ No cloud hosting - Sync to local server (your computer)
3. ✅ Offline-first (same as before)
4. ✅ Background sync when on same WiFi

**Architecture**:
```
Mobile App (Offline DB)
    ↓
    WiFi at home
    ↓
Local Server (your computer: http://192.168.1.X:5000)
    ↓
Local MySQL Database
```

**When you're home**:
- App syncs automatically (background)
- Fast sync (local network)
- No internet required

**When you're away**:
- App works fully offline
- Review photos, create concerts
- Syncs when you get home

**Cost**: $0 (free Expo tier: 30 builds/month is enough)

---

## Database Schema Changes (For Portability)

### Add Migration Metadata
```sql
CREATE TABLE schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  description TEXT
);

CREATE TABLE export_metadata (
  id INT PRIMARY KEY AUTO_INCREMENT,
  exported_at TIMESTAMP,
  export_format VARCHAR(50), -- 'json', 'sql'
  file_path VARCHAR(500),
  checksum VARCHAR(64), -- SHA256
  total_records INT,
  compressed BOOLEAN,
  notes TEXT
);
```

### Add User Preferences (For Export)
```sql
CREATE TABLE user_preferences (
  userId INT PRIMARY KEY,
  preferences JSON, -- All user settings
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);

-- Example preferences:
{
  "autoBackup": true,
  "backupFrequency": "daily",
  "backupLocation": "/Users/rmitra/Backups",
  "exportFormat": "json",
  "compressBackups": true,
  "aiInsightsEnabled": false, // Save AI costs
  "matchingConfidenceThreshold": 0.7
}
```

---

## AI Cost Optimization (<$15/month Target)

### Current AI Usage
| Feature | Frequency | Cost/Request | Monthly Cost |
|---------|-----------|--------------|--------------|
| Concert insights | Real-time | $0.01 | $30 (too high) |
| Artist suggestions | Real-time | $0.01 | $30 (too high) |
| Venue disambiguation | Per photo | $0.005 | $50 (way too high) |
| **Total** | | | **$110** ❌ |

### Optimized AI Usage
| Feature | Frequency | Cost/Request | Monthly Cost |
|---------|-----------|--------------|--------------|
| Concert insights | Weekly batch | $0.01 | $0.50 |
| Artist suggestions | Monthly | $0.01 | $0.10 |
| Venue disambiguation | Cached (1x per venue) | $0.005 | $2 |
| Photo analysis | Optional (manual trigger) | $0.02 | $1 |
| **Total** | | | **$3.60** ✅ |

### Implementation
```typescript
// server/ai.ts
const AI_CONFIG = {
  enabled: process.env.AI_ENABLED === 'true', // User can disable
  cacheResponses: true, // Cache all AI responses
  batchInsights: true, // Generate insights weekly, not real-time
  offlineMode: true, // Pre-generate common responses
};

// Cache AI responses locally (SQLite)
CREATE TABLE ai_cache (
  prompt_hash VARCHAR(64) PRIMARY KEY,
  prompt TEXT,
  response TEXT,
  created_at TIMESTAMP,
  expires_at TIMESTAMP
);

// Only call AI if cache miss
async function getAIInsights(concerts: Concert[]) {
  const cacheKey = hashPrompt(concerts);
  const cached = await getFromCache(cacheKey);

  if (cached && cached.expires_at > new Date()) {
    return cached.response; // Free!
  }

  // Only call AI if cache miss
  const response = await callLLM(concerts);
  await saveToCache(cacheKey, response, { ttl: 7 * 24 * 60 * 60 }); // 1 week
  return response;
}
```

**User Control**:
```typescript
// Settings UI
<Switch
  checked={aiEnabled}
  onCheckedChange={(enabled) => {
    updateUserPreferences({ aiInsightsEnabled: enabled });
  }}
/>
<p>Disable AI to save costs (~$15/month)</p>
```

---

## Local Deployment Optimizations

### 1. In-Memory Caching (Replace Redis)
```typescript
// server/cache.ts
class LocalCache {
  private cache = new Map<string, { value: any; expiresAt: number }>();

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;
    if (item.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  set(key: string, value: any, ttl: number = 300) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl * 1000,
    });
  }

  // Periodic cleanup
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (item.expiresAt < now) {
        this.cache.delete(key);
      }
    }
  }
}

export const cache = new LocalCache();
setInterval(() => cache.cleanup(), 60000); // Cleanup every minute
```

**Benefits**:
- Free (no Redis needed)
- Fast (in-memory)
- Simple (no external service)

**Drawback**:
- Lost on server restart (acceptable for single user)

---

### 2. Background Jobs (Replace BullMQ)
```typescript
// server/queue.ts
class SimpleQueue {
  private queue: Array<{ id: string; job: () => Promise<void> }> = [];
  private processing = false;

  async add(id: string, job: () => Promise<void>) {
    this.queue.push({ id, job });
    if (!this.processing) {
      this.process();
    }
  }

  private async process() {
    this.processing = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      try {
        await item.job();
      } catch (error) {
        console.error(`Job ${item.id} failed:`, error);
      }
    }
    this.processing = false;
  }
}

export const queue = new SimpleQueue();

// Usage
queue.add('scan-photos', async () => {
  await scanDrivePhotos(userId, batchSize);
});
```

**Benefits**:
- Free (no BullMQ/Redis needed)
- Simple (no external dependencies)
- Sufficient for single user

**Drawback**:
- No retry logic (add if needed)
- Lost on server restart (re-queue on startup)

---

### 3. Local MySQL Optimization
```bash
# my.cnf optimization for local dev
[mysqld]
innodb_buffer_pool_size = 1G  # Use available RAM
innodb_log_file_size = 256M
innodb_flush_log_at_trx_commit = 2  # Faster writes
query_cache_size = 128M
tmp_table_size = 128M
```

**Backup MySQL**:
```bash
#!/bin/bash
# backup.sh
mysqldump -u root -p concert_history > backup-$(date +%Y%m%d).sql
gzip backup-$(date +%Y%m%d).sql
# Keep last 30 days
find ~/backups -name "backup-*.sql.gz" -mtime +30 -delete
```

---

## Accuracy Improvements (Detailed)

### 1. Venue Alias System
```typescript
// server/db/schema.ts
export const venueAliases = mysqlTable('venue_aliases', {
  id: serial('id').primaryKey(),
  venueId: int('venueId').notNull().references(() => venues.id),
  alias: varchar('alias', { length: 255 }).notNull(),
  userId: int('userId').references(() => users.id), // User-specific aliases
  createdAt: timestamp('createdAt').defaultNow(),
});

// Examples:
Madison Square Garden → MSG, The Garden
Red Rocks Amphitheatre → Red Rocks
Sphere at The Venetian Resort → Sphere, The Sphere
```

**UI**:
```tsx
// Add alias when matching
<Button onClick={() => {
  addVenueAlias(detectedVenue, actualVenue);
  // Future photos with "Sphere" will match "Sphere at The Venetian Resort"
}}>
  Remember this mapping
</Button>
```

---

### 2. Confidence Scoring
```typescript
interface MatchConfidence {
  concert: Concert;
  confidence: number; // 0-1
  reasons: MatchReason[];
}

interface MatchReason {
  factor: 'gps' | 'date' | 'venue' | 'time' | 'exif';
  score: number;
  detail: string;
}

// Example
{
  concert: { artist: 'Phish', venue: 'Sphere' },
  confidence: 0.85,
  reasons: [
    { factor: 'date', score: 1.0, detail: 'Exact date match' },
    { factor: 'venue', score: 0.9, detail: 'Fuzzy match: Sphere → Sphere at Venetian' },
    { factor: 'gps', score: 0.6, detail: 'GPS 4 miles away (low accuracy)' },
    { factor: 'time', score: 0.9, detail: 'Photo at 9:47 PM (headliner time)' }
  ]
}
```

**Auto-link threshold**: confidence > 0.8
**Review threshold**: 0.5 < confidence < 0.8
**Reject threshold**: confidence < 0.5

---

### 3. GPS Accuracy Detection
```typescript
// Extract GPS accuracy from EXIF
interface PhotoGPS {
  latitude: number;
  longitude: number;
  accuracy?: number; // meters (from EXIF)
  altitude?: number;
  altitudeAccuracy?: number;
}

// Adjust matching radius based on accuracy
function getSearchRadius(gpsAccuracy?: number): number {
  if (!gpsAccuracy) return 1200; // Default: 1200m
  if (gpsAccuracy < 10) return 600; // High accuracy: 600m
  if (gpsAccuracy < 50) return 1200; // Medium: 1200m
  if (gpsAccuracy < 200) return 2000; // Low: 2000m
  return 5000; // Very low: 5000m
}
```

---

## Migration Path to Cloud (Future)

When you're ready to scale:

### Step 1: Export Database
```bash
npm run export -- --format sql --output production-ready.sql
```

### Step 2: Provision Cloud Infrastructure
- TiDB Serverless (database)
- Upstash Redis (cache)
- CloudFlare (CDN)

### Step 3: Import Database
```bash
# On cloud server
mysql -u root -p production_db < production-ready.sql
```

### Step 4: Update Environment Variables
```bash
# .env.production
DATABASE_URL=mysql://user:pass@tidb-server/db
REDIS_URL=redis://upstash-redis-url
```

### Step 5: Deploy
```bash
# Update PHASE_2_SCALABILITY.md instructions
# All the planning is already done!
```

**Estimated Migration Time**: 1 day (database is already portable)

---

## Revised Timeline

### Month 1: Accuracy & Portability (PRIORITY)
**Week 1**: Database performance + bug fixes
**Week 2**: Accuracy improvements (fuzzy matching, confidence scores)
**Week 3**: Export/import + backup automation
**Week 4**: Manual review tools + bulk actions

**Cost**: $0-5 (optional AI for testing)

**Deliverable**: 95%+ photo match accuracy + portable database

---

### Month 2: Feature Enhancements
**Week 5**: Advanced matching (festivals, GPS confidence)
**Week 6**: Setlist.fm caching + local editing
**Week 7**: Photo deduplication
**Week 8**: Polish + documentation

**Cost**: $0-10 (AI costs for insights)

**Deliverable**: Production-ready features

---

### Month 3-4: Mobile App (Optional)
**Week 9-12**: React Native app (local sync)
**Week 13-14**: iOS TestFlight
**Week 15-16**: Android beta

**Cost**: $0 (free Expo tier)

**Deliverable**: Mobile app syncing to local server

---

## Immediate Next Steps (This Week)

### Day 1: Database Indexes
```sql
-- Create indexes (same as cloud plan, but local)
CREATE INDEX idx_concerts_user_date ON concerts(userId, concertDate DESC);
CREATE INDEX idx_photos_concert ON photos(concertId, starred, createdAt DESC);
CREATE INDEX idx_unmatched_photos_user ON unmatched_photos(userId, createdAt DESC);
CREATE INDEX idx_venues_gps ON venues(latitude, longitude);
CREATE INDEX idx_processed_files_user ON processed_files(userId, driveFileId);
```

### Day 2: Query Optimization
```typescript
// Fix N+1 query in dashboard
// BEFORE (N+1):
const concerts = await db.query.concerts.findMany();
for (const concert of concerts) {
  concert.photos = await db.query.photos.findMany({ where: eq(photos.concertId, concert.id) });
}

// AFTER (JOIN):
const concerts = await db.query.concerts.findMany({
  with: {
    photos: true,
    artist: true,
    venue: true,
  },
});
```

### Day 3-4: Bug Fixes
- [ ] Timezone normalization
- [ ] Venue encoding
- [ ] Race conditions

### Day 5: Benchmark
- [ ] Measure actual performance on YOUR dataset
- [ ] Document improvements

---

## Budget Summary (Revised)

### Monthly Costs
| Service | Cost | Required? |
|---------|------|-----------|
| Infrastructure | $0 | ✅ Local |
| APIs (free tiers) | $0 | ✅ Required |
| AI (optimized) | $3-10 | ⚠️ Optional |
| S3 backup | $1-5 | ⚠️ Optional |
| **Total** | **$4-15** | **✅ Under budget!** |

### One-Time Costs
| Item | Cost | When |
|------|------|------|
| Domain (optional) | $12/year | If cloud deployment |
| Apple Developer | $99/year | If iOS app |
| Google Play | $25 | If Android app |

**Total First Year**: $15-25 (well under budget!)

---

## Success Metrics (Revised)

### Accuracy (Primary Focus)
- [ ] 95%+ photo auto-match rate (current: ~70%)
- [ ] <5% false positives (wrong concert)
- [ ] 100% of manually-created concerts auto-link

### Performance (Secondary Focus)
- [ ] Database queries <50ms (current: ~500ms)
- [ ] Photo scan <30 seconds for 100 photos (current: ~2 min)
- [ ] UI response time <100ms (instant feel)

### Portability
- [ ] Full database export in <10 seconds
- [ ] Import complete in <30 seconds
- [ ] Zero data loss in export/import cycle
- [ ] Cloud migration ready (tested with dry-run)

### Budget
- [ ] <$25/month (target: <$15)
- [ ] Zero infrastructure costs
- [ ] AI costs <$10/month

---

## Questions Answered

### "Keep costs below $25/mo including AI costs"
✅ **Target: $4-15/month** (AI: $3-10, S3 backup: $1-5)

### "Ideally it just runs on my computer"
✅ **Fully local deployment**
- MySQL on your computer
- Node server on localhost
- No cloud hosting required
- Mobile app syncs to your local server (WiFi)

### "Make the DB exportable/importable"
✅ **Complete backup/restore system**
- JSON export (human-readable)
- SQL dump (MySQL-compatible)
- Automated daily backups
- Incremental backups
- Compressed exports
- Cloud migration ready

### "Moving to a new environment will be easier"
✅ **Migration path planned**
- All infrastructure decisions documented (PHASE_2_SCALABILITY.md)
- Database schema portable (no vendor lock-in)
- 1-day migration timeline (export → cloud → import)

---

## Summary

**Focus**: Accuracy first, scaling later
**Budget**: <$15/month (mostly optional AI)
**Deployment**: Local (your computer)
**Timeline**: 4 weeks to 95% accuracy + portability
**Future**: Cloud migration ready when needed (1 day)

**Next Step**: Start Week 1 (Database Optimization) - $0 cost 🚀
