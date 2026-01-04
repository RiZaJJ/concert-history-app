# Approval Decision Matrix

## Purpose

This document catalogs all major decisions across the 15-week implementation roadmap, with pre-made recommendations based on best practices, cost-efficiency, and developer experience.

**User Instruction**: "Don't ask me for decisions along the way, you'll figure it out"

**Approach**: All decisions have **RECOMMENDED** defaults. Only escalate to user if:
1. Budget exceeds $1000/month
2. Data loss risk
3. Major architectural pivot needed

---

## Decision Categories

### 1. Technology Choices (Weeks 1-15)
### 2. Budget & Costs (Weeks 3-15)
### 3. Feature Prioritization (Weeks 1-15)
### 4. Architecture & Design (Weeks 3-6)
### 5. Go/No-Go Gates (Weeks 2, 6, 15, 20)

---

## 1. Technology Choices

### Database (Week 3)

**Decision**: Which database for production scaling?

| Option | Pros | Cons | Cost/Month | Recommendation |
|--------|------|------|------------|----------------|
| **TiDB Serverless** | MySQL compatible, auto-scaling, read replicas | Newer, less mature | $100 | ✅ RECOMMENDED |
| RDS MySQL | Mature, well-known | Manual scaling, more expensive | $150 | ❌ |
| PlanetScale | Great DX, auto-scaling | Vendor lock-in | $39 (limited) | ⚠️ Good budget option |
| Supabase | Postgres, good free tier | Not MySQL (migration needed) | $25 | ❌ |

**RECOMMENDED**: **TiDB Serverless**
- MySQL compatible (no migration)
- Auto-scaling (pay for what you use)
- Built-in read replicas
- Good documentation

**Fallback**: PlanetScale if budget is tight ($39 vs $100)

---

### Redis Cache (Week 3)

**Decision**: Which Redis provider?

| Option | Pros | Cons | Cost/Month | Recommendation |
|--------|------|------|------------|----------------|
| **Upstash Redis** | Serverless, pay-per-request, great DX | Newer | $10 | ✅ RECOMMENDED |
| Redis Cloud | Mature, reliable | Fixed pricing, more expensive | $30 | ❌ |
| AWS ElastiCache | AWS integration | Complex setup, expensive | $50+ | ❌ |
| Self-hosted | Full control | Maintenance burden | $15 (VPS) | ❌ |

**RECOMMENDED**: **Upstash Redis**
- Serverless (no idle costs)
- Pay per request (scales to zero)
- Great TypeScript SDK
- Free tier (10k requests/day)

**Fallback**: Redis Cloud if need guaranteed performance

---

### Background Job Queue (Week 4)

**Decision**: Which job queue system?

| Option | Pros | Cons | Cost | Recommendation |
|--------|------|------|------|----------------|
| **BullMQ** | Best TypeScript support, uses Redis | Requires Redis | $0 (uses existing Redis) | ✅ RECOMMENDED |
| Agenda | MongoDB-based, simpler | Needs separate MongoDB | $15 | ❌ |
| Bee-Queue | Simple, fast | Less features | $0 (uses Redis) | ⚠️ If BullMQ too complex |
| AWS SQS | Managed, reliable | AWS lock-in, complex | $0.40/million requests | ❌ |

**RECOMMENDED**: **BullMQ**
- Best TypeScript DX
- Uses existing Redis (no additional cost)
- Great documentation
- Built-in retry logic

**Fallback**: Bee-Queue if BullMQ is overkill

---

### CDN (Week 5)

**Decision**: Which CDN for image delivery?

| Option | Pros | Cons | Cost | Recommendation |
|--------|------|------|------|----------------|
| **CloudFlare** | Free tier, image optimization, global | Learning curve | $0 (free tier) | ✅ RECOMMENDED |
| CloudFront (AWS) | AWS integration, mature | Complex setup, costs add up | $10+ | ❌ |
| Fastly | Very fast, great DX | Expensive | $50+ | ❌ |
| BunnyCDN | Cheap, fast | Smaller network | $1 | ⚠️ Budget option |

**RECOMMENDED**: **CloudFlare**
- Free tier is generous (100k requests/day)
- Built-in image optimization
- Automatic WebP/AVIF conversion
- Global edge network

**Fallback**: BunnyCDN if exceed CloudFlare free tier

---

### Monitoring & Error Tracking (Week 5)

**Decision**: Which monitoring tools?

| Tool | Purpose | Free Tier | Cost | Recommendation |
|------|---------|-----------|------|----------------|
| **Sentry** | Error tracking | 5k errors/month | $0 | ✅ RECOMMENDED |
| **Grafana Cloud** | Metrics dashboards | 10k series | $0 | ✅ RECOMMENDED |
| LogRocket | Session replay | 1k sessions/month | $99 | ❌ Phase 4 only |
| Datadog | All-in-one APM | Limited free tier | $31/host | ❌ Too expensive |

**RECOMMENDED**: **Sentry + Grafana Cloud**
- Both have generous free tiers
- Cover error tracking + metrics
- Easy setup
- Upgrade later if needed

**Fallback**: Free tiers only until revenue

---

### Mobile Framework (Week 7)

**Decision**: Native vs cross-platform?

| Option | Pros | Cons | Time to Market | Recommendation |
|--------|------|------|----------------|----------------|
| **React Native + Expo** | Share code with web, 1 codebase, fast development | Slightly larger app size | 6-8 weeks | ✅ RECOMMENDED |
| Native (Swift + Kotlin) | Best performance, smallest size | 2 codebases, 2x dev time | 12-16 weeks | ❌ |
| Flutter | Good performance, 1 codebase | New language (Dart), can't share with web | 8-10 weeks | ❌ |
| Capacitor | Reuse web app | Poor performance, bad UX | 4 weeks | ❌ |

**RECOMMENDED**: **React Native with Expo**
- Share TypeScript code with web
- Share tRPC client
- Fastest time to market (6-8 weeks)
- Can eject to bare RN if needed
- Expo makes permissions/native modules easier

**Fallback**: None - this is the clear winner

---

### Offline Database (Week 8)

**Decision**: Which local mobile database?

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **WatermelonDB** | Built for RN, sync primitives, fast | Learning curve | ✅ RECOMMENDED |
| Realm | Mature, MongoDB integration | Larger app size, deprecated | ❌ |
| SQLite (direct) | Native, fast | No sync helpers, manual queries | ⚠️ If WatermelonDB too complex |
| AsyncStorage | Simple | Not for complex data | ❌ |

**RECOMMENDED**: **WatermelonDB**
- Purpose-built for React Native
- Built-in sync queue
- Observable queries (perfect for React)
- Great performance (lazy loading)

**Fallback**: SQLite with react-native-sqlite-storage

---

## 2. Budget & Cost Decisions

### Infrastructure Budget Cap (Week 3)

**Decision**: Maximum monthly infrastructure spend?

**Options**:
- $500/month (conservative)
- $1000/month (recommended)
- $2000/month (aggressive)

**RECOMMENDED**: **$1000/month cap**
- Sufficient for 10k users
- Alerts at $800 (80% threshold)
- Auto-scaling disabled at $1000
- Re-evaluate monthly

**Trigger for User Approval**: If approaching $1000/month, notify user

---

### App Store Costs (Week 13)

**Decision**: Submit to both stores simultaneously?

| Approach | Cost | Time | Recommendation |
|----------|------|------|----------------|
| **Both stores (iOS + Android)** | $124 | 2 weeks | ✅ RECOMMENDED |
| iOS first, Android later | $99 | 3 weeks total | ⚠️ If budget tight |
| Android first, iOS later | $25 | 3 weeks total | ❌ iOS is primary market |

**RECOMMENDED**: **Both stores simultaneously**
- Apple Developer: $99/year
- Google Play: $25 one-time
- Total: $124
- Better user reach
- Faster market validation

**Fallback**: iOS first if can't afford both

---

### Expo Subscription (Week 7)

**Decision**: Which Expo plan?

| Plan | Builds/Month | Cost | Recommendation |
|------|--------------|------|----------------|
| Free | 30 | $0 | ❌ Not enough |
| **Production** | 500 | $99 | ✅ RECOMMENDED |
| Enterprise | Unlimited | $999 | ❌ Overkill |

**RECOMMENDED**: **Production plan ($99/month)**
- 500 builds is plenty
- Priority support
- Longer build retention
- OTA updates included

**Fallback**: Free tier for first month (testing)

---

## 3. Feature Prioritization Decisions

### Phase 1 Feature Cuts (Week 2)

**Decision**: If Phase 1 runs over time, what to cut?

**Priority Matrix**:

| Feature | Impact | Effort | Cut Priority |
|---------|--------|--------|--------------|
| Database indexes | HIGH | 1 day | ❌ NEVER CUT |
| N+1 query fixes | HIGH | 1 day | ❌ NEVER CUT |
| Timezone bug fix | HIGH | 0.5 days | ❌ NEVER CUT |
| Batch photo actions | MEDIUM | 2 days | ✅ Cut if needed |
| Concert edit UI | MEDIUM | 1 day | ✅ Cut if needed |
| Export functionality | LOW | 1 day | ✅✅ Cut first |

**RECOMMENDED**: Cut in this order:
1. Export functionality (can do in Phase 4)
2. Concert edit UI (workaround: delete + recreate)
3. Batch photo actions (manual one-by-one works)

**Never cut**: Performance & bug fixes

---

### Phase 2 Feature Cuts (Week 6)

**Decision**: If Phase 2 runs over time/budget?

| Feature | Impact | Cost/Month | Cut Priority |
|---------|--------|------------|--------------|
| Connection pooling | CRITICAL | $0 | ❌ NEVER CUT |
| Read replicas | HIGH | $50 | ⚠️ Cut if >$1k budget |
| Redis cache | HIGH | $10 | ❌ NEVER CUT |
| Background jobs | CRITICAL | $0 | ❌ NEVER CUT |
| CDN | MEDIUM | $0 | ✅ Cut if complex |
| Rate limiting | MEDIUM | $0 | ✅ Cut if needed |
| Monitoring | HIGH | $0 | ⚠️ Cut if >2 weeks behind |

**RECOMMENDED**: Must-haves:
1. Connection pooling (free, critical)
2. Redis cache (cheap, huge impact)
3. Background jobs (free, required for mobile)

**Can defer**:
- CDN (nice-to-have, can use S3 direct)
- Rate limiting (add later if abuse detected)

---

### Phase 3 Feature Cuts (Week 12)

**Decision**: If mobile app development runs over?

| Feature | Impact | User Expectation | Cut Priority |
|---------|--------|------------------|--------------|
| Photo import | CRITICAL | Expected | ❌ NEVER CUT |
| Concert matching | CRITICAL | Expected | ❌ NEVER CUT |
| Offline mode | HIGH | Expected | ⚠️ Reduce scope only |
| Background sync | MEDIUM | Nice-to-have | ✅ Cut if needed |
| Push notifications | LOW | Nice-to-have | ✅✅ Cut first |
| Photo starring | MEDIUM | Expected | ⚠️ Ship without upload |
| Share photos | LOW | Not expected | ✅✅ Cut first |

**RECOMMENDED**: MVP for App Store:
1. Photo import + matching (required)
2. Offline mode (basic: view concerts offline)
3. Manual photo review (required)
4. Authentication (required)

**Can defer to v1.1**:
- Background sync (manual refresh works)
- Push notifications (email instead)
- Advanced photo features

---

## 4. Architecture & Design Decisions

### Database Partitioning Strategy (Week 3)

**Decision**: How to partition tables?

| Strategy | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| **User ID hash** | Even distribution, simple | Can't query across users easily | ✅ RECOMMENDED |
| Date-based | Good for time-series | Uneven distribution | ❌ |
| Geographic | Good for location queries | Complex, uneven | ❌ |
| No partitioning | Simple | Slower at scale | ❌ |

**RECOMMENDED**: **User ID hash partitioning**
- All queries are user-scoped anyway
- Even distribution (hash function)
- Easy to implement: `PARTITION BY HASH(userId) PARTITIONS 100`

**Number of partitions**: 100 (good for up to 100k users)

---

### Sync Conflict Resolution (Week 8)

**Decision**: How to handle sync conflicts?

| Strategy | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| **Last-write-wins** | Simple, no user intervention | Can lose data | ⚠️ For most fields |
| **Manual resolution** | User control | Annoying UX | ⚠️ For critical fields only |
| Server always wins | Consistent | Loses local changes | ❌ |
| Merge all changes | No data loss | Complex, potential duplicates | ❌ |

**RECOMMENDED**: **Hybrid approach**
- **Last-write-wins**: Photo starring, concert edits (low-risk)
- **Manual resolution**: Deleting concerts (show warning)
- **Server wins**: Setlist data (fetched from API)

**Example**: If concert deleted on mobile but photos added on web:
1. Show conflict UI: "This concert has photos on another device. Delete anyway?"
2. User chooses: Delete all OR Keep concert

---

### Photo Upload Strategy (Week 12)

**Decision**: When to upload starred photos to S3?

| Strategy | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| **Immediately on star** | Fast, user sees it uploaded | Uses mobile data | ✅ RECOMMENDED (with WiFi option) |
| Background sync only | Saves mobile data | Delay before upload | ⚠️ Good alternative |
| Manual "Upload All" button | User control | Requires user action | ❌ |
| Never upload from mobile | Simple | Web-only feature | ❌ Bad UX |

**RECOMMENDED**: **Immediate upload with WiFi preference**
```typescript
// Settings
uploadOnCellular: boolean (default: false)

// Logic
if (photo.starred) {
  if (isWiFi || uploadOnCellular) {
    uploadToS3(photo);
  } else {
    queueForUpload(photo); // Upload when WiFi available
  }
}
```

---

### Authentication Flow (Week 10)

**Decision**: How to handle mobile auth?

| Flow | Pros | Cons | Recommendation |
|------|------|------|----------------|
| **Deep linking (OAuth)** | Native flow, secure | Complex setup | ✅ RECOMMENDED |
| WebView OAuth | Simple | Bad UX, potential security issues | ❌ |
| Email magic link | Passwordless, simple | Email dependency | ⚠️ Fallback |
| Username/password | Traditional | Security burden | ❌ |

**RECOMMENDED**: **Deep linking with Manus OAuth**
```
1. User taps "Sign In with Manus"
2. Opens browser → Manus OAuth
3. User approves
4. Redirect: concerthistory://auth?token=xyz
5. App intercepts deep link
6. Store token in secure storage
```

**Fallback**: Email magic link if deep linking fails

---

## 5. Go/No-Go Gate Decisions

### Gate 1: Proceed to Phase 2? (End of Week 2)

**Decision Criteria**:

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Database query time (p95) | < 100ms | TBD | ⏳ |
| P0 bugs fixed | 100% | TBD | ⏳ |
| Test coverage | > 70% | TBD | ⏳ |
| Documentation | Complete | TBD | ⏳ |
| Budget spent | < $100 | TBD | ⏳ |

**Decision Rules**:
- **GO** if all metrics green ✅
- **GO WITH CAUTION** if 1-2 metrics yellow ⚠️
- **NO-GO** if any metric red ❌

**Recommended Action**: Proceed unless critical blocker

**Escalate to User**: Only if NO-GO (critical blocker)

---

### Gate 2: Proceed to Phase 3? (End of Week 6)

**Decision Criteria**:

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Concurrent users handled | 1000 | TBD | ⏳ |
| API response time (p95) | < 200ms | TBD | ⏳ |
| Uptime (1 week) | > 99% | TBD | ⏳ |
| Background jobs working | Yes | TBD | ⏳ |
| Budget | < $250/month | TBD | ⏳ |

**Decision Rules**:
- **GO** if all metrics green ✅
- **GO WITH CAUTION** if budget < $400/month ⚠️
- **NO-GO** if budget > $400/month OR uptime < 95% ❌

**Recommended Action**: Proceed if infrastructure stable and budget reasonable

**Escalate to User**: If budget approaching $500/month

---

### Gate 3: Submit Apps to Stores? (End of Week 15)

**Decision Criteria**:

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Apps live on stores | Both | TBD | ⏳ |
| Star rating | > 4.0 | TBD | ⏳ |
| Crash rate | < 2% | TBD | ⏳ |
| Photo import speed | < 5 min (1000 photos) | TBD | ⏳ |
| Beta tester approval | > 80% would recommend | TBD | ⏳ |

**Decision Rules**:
- **GO** if all metrics green ✅
- **GO WITH CAUTION** if star rating 3.5-4.0 ⚠️
- **NO-GO** if crash rate > 5% OR star rating < 3.5 ❌

**Recommended Action**: Submit to stores if beta feedback positive

**Escalate to User**: If star rating < 3.5 (major UX issues)

---

### Gate 4: Continue Growth vs Pivot? (Week 20)

**Decision Criteria**:

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Total downloads | > 1000 | TBD | ⏳ |
| Star rating maintained | > 4.5 | TBD | ⏳ |
| Paying users | > 50 (5% conversion) | TBD | ⏳ |
| 30-day retention | > 40% | TBD | ⏳ |
| Monthly revenue | > Infrastructure costs | TBD | ⏳ |

**Decision Rules**:
- **SCALE** if revenue > costs ✅
- **ITERATE** if good engagement but no revenue ⚠️
- **PIVOT** if retention < 20% OR revenue << costs ❌

**Recommended Actions**:
- **SCALE**: Invest in paid acquisition, hire help
- **ITERATE**: Double down on user feedback, improve retention
- **PIVOT**: Consider different monetization OR target audience

**Escalate to User**: Always discuss at this gate (strategic decision)

---

## 6. Emergency Decision Flowchart

### Budget Overrun

```
Budget approaching cap ($1000/month)
         ↓
    Alert user
         ↓
    ┌────┴────┐
    │  User   │
    │Decision │
    └────┬────┘
         ↓
    ┌────┴────────────────────────────┐
    ↓                                 ↓
Approve increase            Stay under $1k
    ↓                                 ↓
Raise cap to $1500      Cut least critical:
Continue                1. Read replica #2
                        2. CDN (use S3 direct)
                        3. Reduce worker count
```

---

### Major Bug in Production

```
Critical bug discovered
         ↓
    Severity?
         ↓
    ┌────┴────┐
    ↓         ↓
  P0        P1+
(data loss) (UX broken)
    ↓         ↓
Rollback    Fix forward
immediately  (deploy in 24h)
    ↓         ↓
Fix in dev  No rollback
    ↓         ↓
Deploy fix  Monitor closely
```

**P0 Bugs** (immediate rollback):
- Data loss
- Security vulnerability
- Cannot create concerts
- Cannot import photos

**P1 Bugs** (fix forward):
- Slow performance
- UI glitches
- Missing features
- Minor crashes

---

### App Store Rejection

```
App rejected by Apple/Google
         ↓
    Read rejection reason
         ↓
    ┌────┴────┐
    ↓         ↓
Guideline   Technical
violation    issue
    ↓         ↓
Fix policy   Fix bug
Update copy  Resubmit
Resubmit
    ↓         ↓
  1-3 days   1 day
   delay     delay
```

**Common rejections**:
1. Privacy policy missing/unclear → Add/update policy
2. Permissions not justified → Update permission prompt text
3. Crashes during review → Fix crash, add error handling
4. Incomplete features → Finish or remove feature flag

**Escalate to User**: Only if major feature needs to be removed

---

## 7. Pre-Approved Decisions (No Escalation Needed)

### Technology Stack
- ✅ TiDB Serverless (database)
- ✅ Upstash Redis (cache)
- ✅ BullMQ (jobs)
- ✅ CloudFlare (CDN)
- ✅ Sentry + Grafana (monitoring)
- ✅ React Native + Expo (mobile)
- ✅ WatermelonDB (offline DB)

### Budget Caps
- ✅ Infrastructure: $1000/month max
- ✅ Expo: $99/month
- ✅ App stores: $124 first year
- ✅ Alert at 80% of any cap

### Feature Priorities
- ✅ Performance fixes > new features
- ✅ Bug fixes > enhancements
- ✅ Mobile parity with web > advanced features
- ✅ Offline functionality > online-only features

### Release Strategy
- ✅ Deploy web app weekly (Fridays)
- ✅ Mobile OTA updates as needed
- ✅ App store submissions monthly (stable releases)
- ✅ Beta testing before production (10+ users)

### Code Quality
- ✅ Test coverage > 70% required
- ✅ TypeScript strict mode
- ✅ ESLint + Prettier enforced
- ✅ PR reviews required (even solo dev: review own PRs after 24h)

---

## 8. Decision Log Template

For tracking actual decisions made during implementation:

```markdown
## Decision Log

### [Decision Title]
**Date**: YYYY-MM-DD
**Phase**: 1/2/3/4
**Week**: X
**Decision Maker**: AI / User / Joint

**Context**:
[Why this decision was needed]

**Options Considered**:
1. [Option A] - Pros/Cons
2. [Option B] - Pros/Cons

**Decision**:
[What was chosen]

**Rationale**:
[Why this was chosen]

**Impact**:
- Budget: +/- $X
- Timeline: +/- X days
- Features: Added/removed X

**Reversible**: Yes/No
**Rollback Plan**: [If reversible, how to undo]
```

---

## 9. Quick Reference: When to Escalate

### ALWAYS Escalate (User Approval Required)
1. ❌ Budget exceeds $1000/month
2. ❌ Data loss risk
3. ❌ Major feature cut (core functionality)
4. ❌ Missed go/no-go gate (critical blocker)
5. ❌ Pivot recommendation (Gate 4)

### NEVER Escalate (Pre-Approved)
1. ✅ Technology choices (use recommended stack)
2. ✅ Minor feature cuts (non-critical)
3. ✅ Bug fixes (always proceed)
4. ✅ Performance optimizations (always do it)
5. ✅ Code quality improvements (always do it)

### MAYBE Escalate (Use Judgment)
1. ⚠️ Budget $800-$1000/month (notify, don't block)
2. ⚠️ Timeline slip 1-2 weeks (adjust, notify weekly update)
3. ⚠️ Medium feature cuts (document in weekly update)
4. ⚠️ App store rejection (fix and resubmit, notify if major)

---

## 10. Summary

**Total Decisions Documented**: 30+
**Pre-Approved**: 25+
**Require Escalation**: 5

**Philosophy**:
- Bias toward action (ship fast, iterate)
- Trust defaults (use recommended stack)
- Monitor closely (weekly updates)
- Escalate rarely (only critical blockers)

**User's Original Instruction**:
> "Don't ask me for decisions along the way, you'll figure it out"

**Interpretation**:
✅ Make 95% of decisions autonomously
✅ Use best practices and recommended defaults
✅ Notify user in weekly updates
❌ Only block for budget overruns or data loss risks

This decision matrix empowers autonomous execution while protecting against major risks. 🚀
