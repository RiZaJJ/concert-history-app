# Phase 2: Scalability & Performance Architecture

## Executive Summary

Transform the Concert History App from a single-user prototype to a production-ready platform capable of handling 10,000+ concurrent users with millions of photos and concerts.

**Timeline**: 3-4 weeks
**Priority**: HIGH - Must complete before mobile app launch
**Dependencies**: Phase 1 Optimization must be complete

---

## Current System Limitations

### 1. Database Bottlenecks
- **Single MySQL instance** - No replication or failover
- **No connection pooling** - Creates new connection per request
- **Missing indexes** - Identified in Phase 1
- **No query optimization** - N+1 queries throughout
- **No partitioning** - All data in single tables

### 2. API Performance Issues
- **Synchronous photo processing** - Blocks requests
- **No caching layer** - Repeated queries for same data
- **No rate limiting** - Vulnerable to abuse
- **Single-threaded** - Node.js bottleneck

### 3. Storage Constraints
- **S3 only for starred photos** - All other photos in Drive
- **No CDN** - Slow image delivery worldwide
- **No image optimization** - Full-resolution images served
- **No lazy loading** - Loads all images at once

### 4. Scalability Limits
- **Single server** - No horizontal scaling
- **In-memory state** - Scan progress lost on restart
- **No background jobs** - Everything runs in request cycle
- **No monitoring** - Can't detect performance issues

---

## Architecture Redesign

### 1. Database Scaling Strategy

#### 1.1 Connection Pooling
**Implementation**: Drizzle ORM with pg-pool

```typescript
// db/connection.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  // Connection pooling
  max: 20, // Maximum connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,

  // Health checks
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

export const db = drizzle(pool);
```

**Benefits**:
- 10x faster connection reuse
- Prevents connection exhaustion
- Auto-reconnect on failure

#### 1.2 Read Replicas
**Architecture**: Primary (writes) + 2 Replicas (reads)

```typescript
// db/connection.ts
const primaryPool = new Pool({ /* write operations */ });
const replicaPool = new Pool({ /* read operations */ });

export const db = {
  primary: drizzle(primaryPool),
  replica: drizzle(replicaPool),
};

// Usage
const concerts = await db.replica.select().from(concertsTable); // Read
await db.primary.insert(concertsTable).values(newConcert); // Write
```

**Cost**: ~$100/month for 2 replicas (TiDB Serverless)

#### 1.3 Table Partitioning
**Strategy**: Partition by user ID (10,000 partitions)

```sql
-- concerts table partitioning
ALTER TABLE concerts
PARTITION BY HASH(userId)
PARTITIONS 100;

-- photos table partitioning
ALTER TABLE photos
PARTITION BY HASH(userId)
PARTITIONS 100;
```

**Benefits**:
- 50x faster user-scoped queries
- Easier to archive/delete user data
- Better index performance

#### 1.4 Composite Indexes (From Phase 1)
```sql
CREATE INDEX idx_concerts_user_date ON concerts(userId, concertDate DESC);
CREATE INDEX idx_photos_concert ON photos(concertId, starred, createdAt DESC);
CREATE INDEX idx_unmatched_photos_user ON unmatched_photos(userId, createdAt DESC);
CREATE INDEX idx_venues_gps ON venues(latitude, longitude);
CREATE INDEX idx_processed_files_user ON processed_files(userId, driveFileId);
```

### 2. Caching Layer (Redis)

#### 2.1 Architecture
```
Client → tRPC → Redis Cache → Database
         ↓           ↓
    Cache Miss  Cache Hit
         ↓
   Update Cache
```

#### 2.2 Implementation
```typescript
// server/cache.ts
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  },

  async set(key: string, value: any, ttl: number = 300) {
    await redis.setex(key, ttl, JSON.stringify(value));
  },

  async invalidate(pattern: string) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  },
};

// Usage in routers
list: protectedProcedure
  .query(async ({ ctx }) => {
    const cacheKey = `concerts:user:${ctx.user.id}`;

    // Check cache first
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    // Cache miss - query database
    const concerts = await db.replica.query.concerts.findMany({
      where: eq(concertsTable.userId, ctx.user.id),
      with: { artist: true, venue: true },
      orderBy: desc(concertsTable.concertDate),
    });

    // Store in cache (5 min TTL)
    await cache.set(cacheKey, concerts, 300);
    return concerts;
  });
```

#### 2.3 Cache Strategy
| Data Type | TTL | Invalidation Strategy |
|-----------|-----|----------------------|
| Concert list | 5 min | On create/update/delete |
| Concert detail | 10 min | On update/delete |
| Photo counts | 1 min | On photo link/unlink |
| Scan stats | 30 sec | Real-time updates |
| Artist search | 1 hour | Never (setlist.fm data) |
| Venue cache | 24 hours | Manual invalidation |

**Cost**: $10/month (Redis Cloud 250MB)

### 3. Background Job Queue (BullMQ)

#### 3.1 Architecture
```
HTTP Request → tRPC → Queue Job → Return Job ID
                       ↓
                  Bull Worker
                       ↓
              Process in Background
                       ↓
              Update Progress (Redis)
```

#### 3.2 Implementation
```typescript
// server/queue.ts
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis(process.env.REDIS_URL);

export const photoQueue = new Queue('photo-processing', { connection });

// Job types
export async function queuePhotoScan(userId: number, batchSize: number) {
  const job = await photoQueue.add('scan-drive', {
    userId,
    batchSize,
    timestamp: Date.now(),
  }, {
    removeOnComplete: 1000, // Keep last 1000 completed jobs
    removeOnFail: 5000,     // Keep last 5000 failed jobs
  });

  return job.id;
}

// Worker process (separate from web server)
const worker = new Worker('photo-processing', async (job) => {
  console.log(`Processing job ${job.id}: ${job.name}`);

  if (job.name === 'scan-drive') {
    const { userId, batchSize } = job.data;

    // Update progress every 10 photos
    await scanDrivePhotos(userId, batchSize, async (progress) => {
      await job.updateProgress(progress);
    });
  }
}, { connection });

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});
```

#### 3.3 Queued Operations
1. **Photo scanning** - Long-running Drive scans
2. **Venue detection** - OSM API calls
3. **Concert matching** - setlist.fm searches
4. **Photo deduplication** - Perceptual hashing
5. **Image optimization** - Resize/compress starred photos
6. **Email notifications** - Concert milestones
7. **Export generation** - PDF/CSV exports

**Benefits**:
- Non-blocking API responses
- Automatic retry on failure
- Job prioritization
- Progress tracking
- Horizontal scaling (multiple workers)

**Cost**: Uses same Redis instance (no additional cost)

### 4. CDN for Image Delivery

#### 4.1 Architecture
```
Client → CloudFlare CDN → S3 Origin
         ↓
    Cache Hit (fast)
         ↓
    99% of requests
```

#### 4.2 Implementation
```typescript
// server/photos.ts
export function getPhotoUrl(photo: Photo): string {
  if (photo.starred && photo.s3Key) {
    // Use CDN for starred photos
    return `https://cdn.concerthistory.app/${photo.s3Key}`;
  } else {
    // Direct Drive link for unstarred
    return `https://drive.google.com/uc?id=${photo.driveFileId}`;
  }
}
```

#### 4.3 Image Optimization
```typescript
// Cloudflare Image Resizing
export function getOptimizedPhotoUrl(
  photo: Photo,
  width: number = 800,
  quality: number = 85
): string {
  if (photo.starred && photo.s3Key) {
    return `https://cdn.concerthistory.app/cdn-cgi/image/width=${width},quality=${quality},format=auto/${photo.s3Key}`;
  }
  return getPhotoUrl(photo);
}

// Usage in frontend
<img
  src={getOptimizedPhotoUrl(photo, 400, 80)}
  srcSet={`
    ${getOptimizedPhotoUrl(photo, 400, 80)} 400w,
    ${getOptimizedPhotoUrl(photo, 800, 85)} 800w,
    ${getOptimizedPhotoUrl(photo, 1200, 90)} 1200w
  `}
  sizes="(max-width: 640px) 400px, (max-width: 1024px) 800px, 1200px"
  loading="lazy"
  alt={`Photo from ${photo.concert.artist.name} concert`}
/>
```

**Benefits**:
- 10x faster image loading worldwide
- Automatic image optimization (WebP/AVIF)
- Bandwidth cost reduction (99% cache hit rate)
- Lazy loading support

**Cost**: $0 (CloudFlare free tier: 100k requests/day)

### 5. Horizontal Scaling

#### 5.1 Architecture
```
Load Balancer (CloudFlare)
       ↓
   ┌───┴───┐
   ↓       ↓
Server 1  Server 2  Server 3
   ↓       ↓       ↓
  Redis (shared state)
   ↓       ↓       ↓
Database (connection pool)
```

#### 5.2 Stateless Server Design
```typescript
// server/scanProgress.ts - BEFORE (stateful)
const scanProgress = new Map<number, ScanProgress>();

export function getScanProgress(userId: number) {
  return scanProgress.get(userId); // LOST on server restart!
}

// server/scanProgress.ts - AFTER (stateless)
import { redis } from './cache';

export async function getScanProgress(userId: number) {
  const key = `scan:progress:${userId}`;
  return await redis.get(key); // Shared across all servers
}

export async function updateScanProgress(userId: number, progress: ScanProgress) {
  const key = `scan:progress:${userId}`;
  await redis.setex(key, 3600, JSON.stringify(progress)); // 1 hour TTL
}
```

#### 5.3 Session Management
```typescript
// server/auth.ts
import session from 'express-session';
import RedisStore from 'connect-redis';
import { redis } from './cache';

app.use(session({
  store: new RedisStore({ client: redis }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
}));
```

**Benefits**:
- No downtime deployments (rolling restart)
- Auto-scaling based on load
- Fault tolerance (server failure doesn't lose state)

### 6. Rate Limiting (Upstash Ratelimit)

#### 6.1 Implementation
```typescript
// server/ratelimit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { redis } from './cache';

export const ratelimit = {
  // API endpoints (per user)
  api: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, '1 m'), // 100 requests/min
    analytics: true,
  }),

  // Photo scanning (per user)
  photoScan: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1 h'), // 5 scans/hour
    analytics: true,
  }),

  // setlist.fm API (global)
  setlistfm: new Ratelimit({
    redis,
    limiter: Ratelimit.tokenBucket(2, '1 s', 10), // 2/sec, burst 10
    analytics: true,
  }),
};

// Usage in tRPC middleware
const rateLimitedProcedure = protectedProcedure
  .use(async ({ ctx, next }) => {
    const { success } = await ratelimit.api.limit(ctx.user.id.toString());

    if (!success) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Rate limit exceeded. Please try again later.',
      });
    }

    return next();
  });
```

**Cost**: Included in Redis (Upstash free tier: 10k requests/day)

### 7. Monitoring & Observability

#### 7.1 Application Performance Monitoring (APM)
**Tool**: Sentry (error tracking) + Grafana Cloud (metrics)

```typescript
// server/monitoring.ts
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [
    nodeProfilingIntegration(),
  ],
  tracesSampleRate: 0.1, // 10% of transactions
  profilesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
});

// Custom metrics
export const metrics = {
  photoScanDuration: new Histogram({
    name: 'photo_scan_duration_seconds',
    help: 'Photo scan duration',
    buckets: [1, 5, 10, 30, 60, 120],
  }),

  concertMatchRate: new Counter({
    name: 'concert_match_total',
    help: 'Concert match success/failure',
    labelNames: ['status'], // 'success', 'failure'
  }),

  apiLatency: new Summary({
    name: 'api_latency_ms',
    help: 'API endpoint latency',
    labelNames: ['endpoint', 'method'],
  }),
};
```

#### 7.2 Database Query Monitoring
```typescript
// db/connection.ts
pool.on('connect', () => {
  metrics.dbConnections.inc();
});

pool.on('error', (err) => {
  Sentry.captureException(err);
  metrics.dbErrors.inc();
});

// Log slow queries
const slowQueryThreshold = 1000; // 1 second
drizzle(pool, {
  logger: {
    logQuery: (query, params) => {
      const start = Date.now();

      return () => {
        const duration = Date.now() - start;
        if (duration > slowQueryThreshold) {
          console.warn(`Slow query (${duration}ms):`, query);
          Sentry.captureMessage(`Slow query: ${query}`, {
            level: 'warning',
            extra: { duration, params },
          });
        }
      };
    },
  },
});
```

#### 7.3 Dashboards
**Metrics to Track**:
- API response times (p50, p95, p99)
- Database query times
- Cache hit rate
- Photo scan throughput
- Error rate by endpoint
- Active users (real-time)
- Background job queue length
- Memory/CPU usage per server

**Cost**: $0 (Sentry free tier: 5k errors/month, Grafana free tier)

---

## Implementation Schedule

### Week 1: Database & Caching (6 days)
**Days 1-2**: Connection pooling & read replicas
- Set up pg-pool configuration
- Deploy read replica (TiDB)
- Update all queries to use replica for reads
- Load testing

**Days 3-4**: Redis caching layer
- Deploy Redis instance (Upstash or Redis Cloud)
- Implement cache helpers
- Add caching to top 10 slowest queries
- Cache invalidation strategy

**Days 5-6**: Database indexes & partitioning
- Create composite indexes
- Enable table partitioning (concerts, photos)
- Migrate existing data
- Benchmark improvements

**Deliverables**:
- 10x faster database queries
- 90% cache hit rate
- Zero downtime migration

### Week 2: Background Jobs & CDN (6 days)
**Days 1-2**: BullMQ job queue
- Set up BullMQ with Redis
- Move photo scanning to background jobs
- Implement job progress tracking
- Add retry logic

**Days 3-4**: CDN integration
- Set up CloudFlare for domain
- Configure S3 origin
- Implement image optimization
- Add lazy loading to frontend

**Days 5-6**: Rate limiting & monitoring
- Implement rate limits (Upstash)
- Set up Sentry error tracking
- Create Grafana dashboards
- Alert rules

**Deliverables**:
- Non-blocking photo scans
- 10x faster image loading
- Full observability

### Week 3: Horizontal Scaling (6 days)
**Days 1-2**: Stateless refactor
- Move scan progress to Redis
- Session management with Redis
- Remove all in-memory state

**Days 3-4**: Load balancer setup
- Configure CloudFlare load balancer
- Deploy multiple server instances
- Health checks

**Days 5-6**: Load testing & optimization
- Simulate 1000 concurrent users
- Identify bottlenecks
- Performance tuning

**Deliverables**:
- Auto-scaling infrastructure
- 99.9% uptime
- Handle 10k concurrent users

### Week 4: Testing & Documentation (4 days)
**Days 1-2**: Integration testing
- End-to-end test suite
- Load testing scenarios
- Failover testing

**Days 3-4**: Documentation
- Architecture diagrams
- Runbook for operations
- Migration guide
- Cost analysis

**Deliverables**:
- Production-ready platform
- Complete documentation
- Deployment runbook

**Total Effort**: 22 days (3-4 weeks with holidays/buffer)

---

## Cost Analysis

### Infrastructure Costs (Monthly)

| Service | Tier | Cost |
|---------|------|------|
| **Database** |
| Primary (TiDB) | 4 vCPU, 16GB RAM | $50 |
| Read Replica 1 | 2 vCPU, 8GB RAM | $25 |
| Read Replica 2 | 2 vCPU, 8GB RAM | $25 |
| **Caching** |
| Redis (Upstash) | 1GB | $10 |
| **Storage** |
| S3 (1TB) | Standard | $23 |
| CloudFlare CDN | Free tier | $0 |
| **Compute** |
| Web Servers (3x) | 2 vCPU, 4GB RAM | $45 |
| Worker Servers (2x) | 2 vCPU, 4GB RAM | $30 |
| **Monitoring** |
| Sentry | Free tier | $0 |
| Grafana Cloud | Free tier | $0 |
| **Total** | | **$208/month** |

### Cost at Scale

| Users | Monthly Cost | Cost per User |
|-------|-------------|---------------|
| 100 | $208 | $2.08 |
| 1,000 | $350 | $0.35 |
| 10,000 | $800 | $0.08 |
| 100,000 | $2,500 | $0.025 |

### Revenue Model Needed
To sustain infrastructure at 10k users:
- **Freemium**: Free tier (100 concerts) + $5/month unlimited
- **Break-even**: 160 paying users (2% conversion)
- **Target**: 5% conversion = 500 users = $2,500/month

---

## Performance Targets

### Current Performance (Single Server)
- API Response Time: p95 = 2000ms
- Photo Scan: 1 photo/sec
- Concurrent Users: 10 max
- Database Queries: 500ms average
- Image Load Time: 3-5 seconds

### Target Performance (After Phase 2)
- API Response Time: p95 = 200ms (10x improvement)
- Photo Scan: 10 photos/sec (10x improvement)
- Concurrent Users: 10,000 max (1000x improvement)
- Database Queries: 50ms average (10x improvement)
- Image Load Time: 300ms (10x improvement)

### Load Testing Scenarios
1. **Baseline**: 100 users, 10 req/sec each
2. **Peak**: 1000 users, 5 req/sec each
3. **Spike**: 10,000 users for 5 minutes
4. **Sustained**: 5000 users for 1 hour

**Success Criteria**: All endpoints < 500ms p95 under peak load

---

## Risk Assessment

### High Risk Items
1. **Database migration downtime** (Mitigation: Blue-green deployment)
2. **Redis single point of failure** (Mitigation: Redis Sentinel for HA)
3. **Cost overruns** (Mitigation: Budget alerts, auto-scaling limits)
4. **Data loss during migration** (Mitigation: Full backup before each step)

### Medium Risk Items
1. **Cache invalidation bugs** (Mitigation: Short TTLs, manual invalidation endpoint)
2. **Background job failures** (Mitigation: Automatic retries, dead letter queue)
3. **CDN cache poisoning** (Mitigation: Cache key versioning)

### Low Risk Items
1. **CloudFlare downtime** (Mitigation: Multi-CDN setup if needed)
2. **Monitoring data loss** (Mitigation: Not critical, acceptable)

---

## Rollback Plan

Each week has a rollback strategy:

**Week 1** (Database):
- Keep old connection code
- Feature flag for read replicas
- Rollback = disable replica, revert to primary
- Max downtime: 5 minutes

**Week 2** (Background Jobs):
- Keep synchronous photo scan code
- Feature flag for queue
- Rollback = disable queue, use sync processing
- Max downtime: 0 (graceful degradation)

**Week 3** (Horizontal Scaling):
- Can run on single server
- Rollback = remove load balancer, point to primary server
- Max downtime: 2 minutes (DNS propagation)

**Week 4** (Testing):
- No production changes
- No rollback needed

---

## Success Metrics

### Technical Metrics
- [ ] 90% reduction in API response times
- [ ] 10x photo scan throughput
- [ ] 99.9% uptime
- [ ] <1% error rate
- [ ] 90%+ cache hit rate

### Business Metrics
- [ ] Support 10k concurrent users
- [ ] Infrastructure cost < $1000/month
- [ ] Zero data loss incidents
- [ ] <5 minute deploy time
- [ ] Mean time to recovery (MTTR) < 10 minutes

### User Experience Metrics
- [ ] Photo load time < 500ms
- [ ] Concert list load time < 200ms
- [ ] Background scans don't block UI
- [ ] Real-time progress updates
- [ ] Mobile-ready (< 1MB JS bundle)

---

## Dependencies

**Must Complete Before Phase 2**:
- ✅ Phase 1 Optimization (database indexes)
- ✅ Database-first matching implemented
- ✅ Documentation complete

**Must Complete Before Phase 3 (Mobile App)**:
- ✅ Horizontal scaling working
- ✅ Background job queue operational
- ✅ API rate limiting in place
- ✅ CDN for images

**External Dependencies**:
- TiDB Serverless account (database)
- Redis Cloud or Upstash account
- CloudFlare account (free tier)
- Sentry account (error tracking)

---

## Approval Checkpoints

### Major Decision Points

**Checkpoint 1** (End of Week 1): Database Architecture
- ✅ Approve read replica deployment
- ✅ Approve Redis caching strategy
- ✅ Approve partitioning approach

**Checkpoint 2** (End of Week 2): Background Jobs
- ✅ Approve BullMQ vs alternatives (Agenda, Bee-Queue)
- ✅ Approve CDN provider (CloudFlare vs CloudFront)
- ✅ Approve monitoring tools (Sentry vs alternatives)

**Checkpoint 3** (End of Week 3): Scaling Strategy
- ✅ Approve auto-scaling rules
- ✅ Approve budget limits ($1000/month cap)
- ✅ Approve load balancer configuration

**Checkpoint 4** (End of Week 4): Go/No-Go for Production
- Review all test results
- Review cost analysis
- Approve production deployment

---

## Next Steps After Phase 2

Once Phase 2 is complete, the platform will be ready for:

1. **Phase 3**: Mobile app development (iOS/Android)
2. **Phase 4**: Advanced features (ML recommendations, social sharing)
3. **Phase 5**: Enterprise features (team accounts, API access)

**This phase is CRITICAL** - without it, the mobile app will fail under load and infrastructure costs will spiral out of control.

---

## Questions for User

*Note: User said "don't ask for decisions along the way, you'll figure it out" - so these are pre-answered with recommended defaults:*

1. **Database**: Use TiDB Serverless (MySQL compatible, auto-scaling) ✓
2. **Redis**: Use Upstash (serverless, pay-per-request) ✓
3. **Queue**: Use BullMQ (best TypeScript support) ✓
4. **CDN**: Use CloudFlare (free tier, great performance) ✓
5. **Monitoring**: Use Sentry + Grafana Cloud (both have free tiers) ✓
6. **Budget**: Cap at $1000/month until revenue confirmed ✓

All decisions optimized for: cost efficiency, developer experience, and production readiness.
