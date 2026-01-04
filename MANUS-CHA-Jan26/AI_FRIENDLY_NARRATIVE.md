# Concert History Database - AI-Friendly Project Narrative

**Version:** 1.0  
**Last Updated:** December 13, 2025  
**Author:** Manus AI  
**Purpose:** Optimized project description for AI agents to quickly understand and extend the application

---

## What This Document Is

This document describes the Concert History Database application in a structured format optimized for AI comprehension. It focuses on **intent, patterns, and decision rationale** rather than implementation details. Use this document when briefing AI agents to add features, fix bugs, or understand the codebase.

---

## Project Overview

### Core Purpose

The Concert History Database automatically tracks live concert attendance by analyzing photos from Google Drive. The system extracts EXIF metadata (GPS coordinates, timestamps) from photos, identifies concert venues using Google Maps, matches events to setlists from setlist.fm, and organizes everything into a searchable database with minimal manual input.

### User Workflow

The typical user journey follows this pattern:

1. **Upload photos** to a designated Google Drive folder (done outside the app)
2. **Trigger photo scan** from the dashboard (one-click button)
3. **Review unmatched photos** when automatic matching fails
4. **Browse concert history** with search, filters, and AI-generated insights
5. **View concert details** including setlists, photos, venue info, and weather

### Key Design Principles

The application prioritizes **automation over manual entry**, **intelligent defaults over configuration**, and **graceful degradation when external APIs fail**. Every feature should reduce friction for users who want to document their concert history without spending hours entering data manually.

---

## Architecture Patterns

### Technology Choices and Rationale

The stack uses **React 19 + tRPC 11 + Drizzle ORM** to achieve end-to-end type safety without code generation. This choice eliminates an entire class of bugs (type mismatches between frontend and backend) and enables refactoring with confidence. The tRPC pattern replaces traditional REST APIs with typed procedures that feel like local function calls.

**Superjson serialization** allows passing complex types (Date objects, BigInt) between client and server without manual transformation. This simplifies the codebase significantly—database timestamps remain Date objects throughout the stack, eliminating conversion logic.

**Single-user initially, multi-user ready** describes the current state. All database queries filter by `userId`, but the UI assumes one user. Adding multi-user support requires only authentication UI changes, not database restructuring.

### Data Flow Architecture

The application follows a **unidirectional data flow** pattern:

```
User Action → tRPC Mutation → Database Update → React Query Invalidation → UI Refresh
```

React Query handles caching, background refetching, and optimistic updates automatically. The frontend never directly manipulates cached data except for optimistic updates (starring photos, hiding photos). All other mutations trigger cache invalidation and refetch.

### External API Integration Strategy

The system integrates four external APIs with different reliability characteristics:

| API | Purpose | Failure Mode | Fallback Strategy |
|-----|---------|--------------|-------------------|
| Google Drive | Photo source | Critical - no photos | User notification, retry |
| Google Maps | Venue detection | Degraded - manual entry | Show form, skip automation |
| setlist.fm | Setlist data | Optional - missing songs | Create concert without setlist |
| OpenWeather | Historical weather | Optional - no temperature | Skip weather field |

**Rate limiting** is the primary concern. Google Maps has strict quotas, so the app implements client-side caching (5 minutes), lazy loading (queries only when dropdowns open), and state resets (prevent auto-fetching on navigation).

---

## Database Design Philosophy

### Entity Relationships

The schema follows **normalized relational design** with clear ownership boundaries:

- **Users** own concerts, photos, and unmatched photos
- **Concerts** reference artists and venues (many-to-one)
- **Setlists** join concerts and songs (many-to-many)
- **Photos** belong to concerts (many-to-one)

**Cascade deletes** ensure referential integrity. Deleting a concert removes all photos and setlist entries. Deleting a user removes all their data.

### Deduplication Strategy

The system aggressively deduplicates entities to prevent data fragmentation:

- **Artists**: Unique by name (case-insensitive comparison)
- **Venues**: Unique by (name, city) composite key
- **Songs**: Unique by (title, artistId) composite key
- **Concerts**: Unique by (userId, venueId, concertDate) to prevent duplicates

When creating entities, the pattern is always **find-or-create**: query for existing entity, create only if not found, use the ID either way.

### Temporary vs Permanent Storage

The application distinguishes between **temporary** and **permanent** photo storage:

- **Unstarred photos**: Google Drive URLs (temporary, depend on Drive access)
- **Starred photos**: S3 storage (permanent, independent of Drive)

This hybrid approach balances cost (S3 storage fees) with reliability (starred photos never disappear). The S3 key format includes random suffixes to prevent enumeration attacks: `{userId}-photos/{concertId}-{photoId}-{nanoid}.jpg`

---

## Feature Implementation Patterns

### Photo Scanning Algorithm

The photo scanning process follows a **batch processing pattern** with progress tracking:

1. **Fetch batch** (50 files) from Google Drive, excluding already-processed files
2. **Extract EXIF** in parallel (future optimization: currently sequential)
3. **Reverse geocode** GPS coordinates to get city/state/country
4. **Detect venue** using multi-tier algorithm (type match → name match → tourist attraction → closest place)
5. **Search for match** in existing concerts by (userId, venueId, date)
6. **Attempt auto-creation** via setlist.fm API if no match found
7. **Store unmatched** photos for manual review if auto-creation fails

**Progress tracking** uses an in-memory object updated after each photo. The frontend polls every 500ms to display real-time progress. This approach is simple but resets on server restart—acceptable for the current use case.

### Venue Detection Algorithm

Venue detection uses a **confidence-based priority system**:

**High Confidence:**
- Place type matches: `stadium`, `arena`, `performing_arts`, `night_club`, `event_venue`
- Place name contains keywords: `stadium`, `arena`, `venue`, `theater`, `amphitheater`, `concert`, `music`, `pavilion`, `ballroom`, `park`

**Medium Confidence:**
- Place type is `tourist_attraction` (many venues fall into this category)
- Excludes obvious non-venues: `parking`, `store`, `restaurant`, `cafe`, `lodging`, `school`, `hospital`, `bank`, `gas_station`, `car_*`, `pharmacy`, `supermarket`

**Low Confidence:**
- Closest place within 500m radius (fallback when no venue indicators found)

The algorithm stores both the detected venue name and the confidence level, allowing users to override low-confidence detections.

### Smart Setlist Matching

When creating or editing concerts, the system tries **all possible 2-field combinations** to find setlist matches:

1. **Artist + Date**: Most reliable for unique shows
2. **Artist + Venue**: Useful for recurring residencies  
3. **Venue + Date**: Fallback when artist name uncertain

This exhaustive search maximizes match rates. The first successful match is used, with priority given to artist+date combinations (most specific).

### Bulk Operations Pattern

The application implements **optimistic updates** for instant feedback:

**Pattern for starring a photo:**
1. Immediately update UI (star icon fills)
2. Send mutation to backend
3. On success: Upload to S3, update database
4. On error: Rollback UI change, show toast notification

**Pattern for bulk operations:**
1. Enable "select mode" with checkboxes
2. User selects multiple photos
3. Confirm action with dialog
4. Execute mutations sequentially (not parallel to avoid rate limits)
5. Show progress toast with count
6. Invalidate cache and refetch

---

## UI/UX Design Patterns

### Progressive Disclosure

The interface reveals complexity gradually:

- **Dashboard**: Simple concert cards with search and filters
- **Concert Detail**: Full information with edit button
- **Photo Review**: Focused workflow with minimal distractions
- **Skipped Photos**: Paginated view with restore actions

Users never see all features at once. Each page has a single primary action (scan photos, review photo, view concert).

### Optimistic Updates vs Loading States

The application uses **optimistic updates** for:
- Starring/unstarring photos
- Hiding photos
- Toggling select mode

These actions feel instant because the UI updates before the server responds. If the server fails, the UI rolls back and shows an error toast.

The application uses **loading states** for:
- Photo scanning (progress bar)
- Concert creation (button spinner)
- Page navigation (skeleton screens)

These actions require server completion before proceeding, so users see explicit feedback.

### Error Handling Philosophy

The system follows a **fail gracefully, inform clearly** approach:

**User-facing errors:**
- Toast notifications for mutations (red for errors, green for success)
- Inline error messages for form validation
- Empty states with actionable suggestions ("No concerts yet. Scan photos to get started!")

**Developer-facing errors:**
- Console logging for debugging (prefix with feature name: `[getNearbyVenues]`)
- Error boundaries to catch React crashes
- Sentry integration (future enhancement)

**Never:**
- Show raw error messages to users
- Let the app crash without recovery
- Hide errors silently (always log to console)

---

## Code Organization Principles

### File Structure Philosophy

The codebase separates **framework code** (in `_core` directories) from **application code** (everywhere else):

**Framework code** (do not edit unless extending infrastructure):
- `server/_core/`: OAuth, tRPC setup, Express server, API proxies
- `client/src/_core/`: Auth hooks, tRPC client

**Application code** (edit freely):
- `server/routers.ts`: tRPC procedure definitions
- `server/db.ts`: Database query helpers
- `client/src/pages/`: Page components
- `client/src/components/`: Reusable UI components

This separation prevents accidental breakage of authentication, API routing, or other infrastructure concerns.

### Naming Conventions

The codebase follows these conventions consistently:

| Type | Convention | Example |
|------|-----------|---------|
| React components | PascalCase | `ConcertCard`, `PhotoReview` |
| tRPC routers | camelCase | `concerts`, `photos`, `ai` |
| tRPC procedures | camelCase | `list`, `getById`, `create` |
| Database functions | camelCase | `getConcertById`, `createArtist` |
| Files | PascalCase (components), camelCase (utilities) | `Dashboard.tsx`, `photoIngestion.ts` |

### Component Composition Strategy

The application uses **shadcn/ui components** as building blocks:

**Always use shadcn/ui for:**
- Buttons, inputs, forms
- Dialogs, dropdowns, popovers
- Cards, badges, progress bars
- Skeletons, loading states

**Create custom components for:**
- Domain-specific UI (ConcertCard, PhotoGallery)
- Complex interactions (venue dropdown with search)
- Reusable patterns (empty states, error messages)

**Never:**
- Reinvent basic UI components
- Use inline styles (always use Tailwind classes)
- Create one-off components for single-use UI

---

## Common Pitfalls and Solutions

### Infinite Query Loops

**Problem:** Creating new objects in render that are used as query inputs causes infinite re-renders.

**Example:**
```tsx
// ❌ Bad: New Date() creates new reference every render
const { data } = trpc.items.getByDate.useQuery({ date: new Date() });
```

**Solution:**
```tsx
// ✅ Good: Stabilize with useState
const [date] = useState(() => new Date());
const { data } = trpc.items.getByDate.useQuery({ date });
```

### Google Maps Rate Limiting

**Problem:** Venue dropdown queries Google Maps API on every photo, hitting rate limits quickly.

**Solutions implemented:**
- Client-side caching (5-minute staleTime)
- Lazy loading (query only when dropdown opens)
- State reset on photo navigation (prevent auto-fetching)

**Future enhancement:** Server-side caching with Redis

### Photo URLs Expiring

**Problem:** Google Drive URLs expire after ~1 hour, breaking photo display.

**Solutions:**
- Proxy all Drive images through backend (`/api/drive-image/:fileId`)
- Backend refreshes Drive access token automatically
- Starred photos uploaded to S3 for permanent storage

### Database Connection Pooling

**Problem:** Opening new database connection on every request exhausts connections.

**Solution:** Lazy singleton pattern in `server/db.ts`:
```typescript
let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    _db = drizzle(process.env.DATABASE_URL);
  }
  return _db;
}
```

---

## AI Agent Optimization Tips

### How to Brief AI Agents Effectively

When asking an AI agent to work on this codebase, provide:

1. **Context**: "This is a concert history app that auto-tracks concerts from photos"
2. **Current state**: "We have 25 concerts, photo scanning works, venue detection has rate limit issues"
3. **Goal**: "Add a feature to export concert history to CSV"
4. **Constraints**: "Must work on mobile, keep existing UI patterns, don't break authentication"

**Avoid vague requests** like "make it better" or "add more features." Be specific about the problem you're solving.

### Key Concepts to Emphasize

When describing features, emphasize these concepts:

**For backend work:**
- "All queries must filter by userId for security"
- "Use find-or-create pattern for deduplication"
- "Return empty arrays instead of throwing errors for graceful degradation"

**For frontend work:**
- "Use shadcn/ui components for consistency"
- "Implement optimistic updates for instant feedback"
- "Show loading states for async operations"

**For API integrations:**
- "Check rate limits and implement caching"
- "Provide fallback UI when APIs fail"
- "Log errors to console for debugging"

### Common Feature Request Patterns

**Adding a new entity (e.g., "Add support for festivals"):**
1. Create database table in `drizzle/schema.ts`
2. Run `pnpm db:push` to apply schema
3. Add query helpers in `server/db.ts`
4. Create tRPC router in `server/routers.ts`
5. Build UI components in `client/src/pages/`
6. Add navigation in `client/src/App.tsx`

**Adding a new external API (e.g., "Integrate Spotify"):**
1. Add API key to environment variables
2. Create integration helper in `server/integrations.ts`
3. Add tRPC procedures to call the API
4. Handle rate limits and errors gracefully
5. Update UI to display API data

**Adding a new filter/search (e.g., "Filter by artist genre"):**
1. Add genre field to artists table
2. Update artist creation to fetch genre from external API
3. Add genre filter to dashboard UI
4. Update concerts.list query to support genre filter

---

## Testing Strategy

### Current Test Coverage

The application includes **backend unit tests** using Vitest:

- `server/auth.logout.test.ts`: Authentication flow
- `server/concerts.test.ts`: Concert CRUD operations (future)
- `server/photos.test.ts`: Photo management (future)
- `server/venueDetection.test.ts`: Venue detection algorithm (future)

**Frontend tests** are not currently implemented but should follow these patterns:

- Component tests with React Testing Library
- Integration tests for user flows (scan photos → review → view concert)
- Mock tRPC procedures with MSW (Mock Service Worker)

### Manual Testing Checklist

Before deploying changes, test these critical paths:

**Photo Scanning:**
1. Scan 50 photos from Google Drive
2. Verify automatic concert creation from setlist.fm
3. Check unmatched photos appear in review queue
4. Confirm progress bar updates in real-time

**Photo Review:**
1. Link photo to existing concert
2. Create concert from photo
3. Skip individual photo
4. Change venue using dropdown
5. Verify bulk link prompt

**Concert Management:**
1. Edit concert with 2 of 3 fields (artist, venue, date)
2. Delete concert and verify cascade delete
3. Search concerts by artist/venue
4. Filter by year

**Mobile Responsiveness:**
1. Open app on iPhone/Android
2. Test touch interactions (tap, swipe, pinch-zoom)
3. Verify responsive layout (single column on mobile)
4. Add to home screen and test full-screen mode

---

## Performance Optimization Guidelines

### Current Performance Characteristics

The application handles:
- **1000+ photos** without pagination (future enhancement needed)
- **100+ concerts** with instant search
- **50-photo batch** scanning in ~2-3 minutes
- **Real-time progress** updates every 500ms

### Optimization Priorities

**High Priority (implement when scaling):**
- Pagination for photo galleries (20-50 per page)
- Virtual scrolling for long concert lists
- Image lazy loading and thumbnail generation
- Database indexing on frequently queried fields

**Medium Priority (implement when users complain):**
- Server-side caching with Redis
- CDN for photo thumbnails
- Background job queue for photo scanning
- Parallel EXIF extraction

**Low Priority (nice to have):**
- Service worker for offline mode
- Progressive web app (PWA) features
- Image compression before S3 upload
- Database connection pooling

### Performance Monitoring

**Current approach:** Manual observation and user reports

**Recommended approach:**
- Add performance timing to tRPC procedures
- Log slow queries (>1 second) to console
- Track API rate limit errors
- Monitor database query performance

---

## Security Considerations

### Authentication and Authorization

The application uses **Manus OAuth** for authentication, which handles:
- User registration and login
- Session management (JWT tokens)
- Password reset and email verification

**Authorization** is role-based:
- `admin`: Full access (delete database, manage all users)
- `user`: Own data only (concerts, photos, unmatched photos)

All tRPC procedures use `protectedProcedure` to require authentication. The context injects `ctx.user` with the authenticated user object.

### Data Privacy

**User isolation:** All database queries filter by `userId` to prevent cross-user data access.

**Photo privacy:** Google Drive photos are proxied through the backend to prevent direct URL access. S3 photos use non-enumerable keys to prevent guessing.

**API key security:** All API keys are stored in environment variables and never exposed to the frontend. Google Maps queries are proxied through the backend.

### Input Validation

**tRPC input schemas** validate all user input with Zod:
- Type checking (string, number, date, boolean)
- Format validation (email, URL, date format)
- Range validation (min/max length, min/max value)

**SQL injection prevention:** Drizzle ORM parameterizes all queries automatically.

---

## Deployment Checklist

### Pre-Deployment

- [ ] Run all tests (`pnpm test`)
- [ ] Check TypeScript compilation (`pnpm tsc --noEmit`)
- [ ] Verify environment variables are set
- [ ] Test photo scanning with real Google Drive folder
- [ ] Test on mobile device (iPhone/Android)
- [ ] Review console for errors and warnings

### Post-Deployment

- [ ] Verify authentication works
- [ ] Test photo scanning end-to-end
- [ ] Check external API integrations (Maps, setlist.fm)
- [ ] Monitor error logs for 24 hours
- [ ] Collect user feedback

### Rollback Plan

If deployment fails:
1. Use `webdev_rollback_checkpoint` to restore previous version
2. Investigate errors in console logs
3. Fix issues locally and test thoroughly
4. Redeploy with fixes

---

## Future Roadmap

### Phase 1: Core Stability (Q1 2026)

**Goal:** Make the app rock-solid for single-user use

- Implement comprehensive error handling
- Add retry logic for API failures
- Improve venue detection accuracy
- Add pagination for large photo collections
- Write full test suite

### Phase 2: Multi-User Support (Q2 2026)

**Goal:** Support multiple users with data isolation

- Add user management UI
- Implement role-based access control
- Add user settings page
- Support custom Google Drive folders per user
- Add social features (share concerts, follow friends)

### Phase 3: Mobile App (Q3 2026)

**Goal:** Native mobile experience

- Build React Native app
- Implement offline mode with sync
- Add camera integration (take photo → auto-create concert)
- Support push notifications for new concerts
- Add widget for home screen

### Phase 4: AI Features (Q4 2026)

**Goal:** Intelligent recommendations and insights

- AI-powered concert recommendations
- Automatic photo tagging (band members, instruments)
- Sentiment analysis of concert reviews
- Personalized concert discovery
- Social graph analysis (who do you see concerts with?)

---

## How to Make This Document More Useful

### For AI Agents

**What helps:**
- Clear problem statements ("Users can't find concerts from 2020")
- Specific constraints ("Must work on mobile Safari")
- Expected behavior ("Show loading spinner while scanning")
- Error scenarios ("What happens if Google Drive is down?")

**What doesn't help:**
- Vague goals ("Make it better")
- Missing context ("Add a button")
- Conflicting requirements ("Make it fast and feature-rich")

### For Human Developers

**What helps:**
- Code examples showing patterns
- Rationale for design decisions
- Common pitfalls and solutions
- Testing strategies

**What doesn't help:**
- Line-by-line code walkthroughs
- Implementation details that change frequently
- Overly technical jargon without explanation

### Continuous Improvement

This document should evolve with the project. When adding features:

1. **Update this document first** with the new pattern/concept
2. **Implement the feature** following the documented pattern
3. **Add to testing checklist** if it's a critical path
4. **Document pitfalls** if you encountered issues

---

## Appendix: Quick Reference

### Essential Commands

```bash
# Development
pnpm install          # Install dependencies
pnpm dev              # Start dev server
pnpm db:push          # Apply schema changes
pnpm test             # Run tests

# Deployment
pnpm build            # Build for production
pnpm start            # Start production server
pnpm db:migrate       # Run migrations

# Debugging
pnpm tsc --noEmit     # Check TypeScript errors
pnpm db:studio        # Open database GUI
```

### Key File Locations

| Purpose | File Path |
|---------|-----------|
| Database schema | `drizzle/schema.ts` |
| tRPC procedures | `server/routers.ts` |
| Database queries | `server/db.ts` |
| External APIs | `server/integrations.ts` |
| Photo scanning | `server/photoIngestion.ts` |
| Routes | `client/src/App.tsx` |
| Dashboard | `client/src/pages/Dashboard.tsx` |
| Photo review | `client/src/pages/PhotoReview.tsx` |

### Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection | Yes |
| `JWT_SECRET` | Session signing | Yes |
| `GOOGLE_DRIVE_CREDENTIALS` | Service account JSON | Yes |
| `GOOGLE_DRIVE_FOLDER_ID` | Target folder | Yes |
| `SETLISTFM_API_KEY` | Setlist data | Yes |
| `OPENWEATHER_API_KEY` | Weather data | Optional |

### tRPC Router Reference

| Router | Key Procedures |
|--------|----------------|
| `auth` | `me`, `logout` |
| `concerts` | `list`, `getById`, `create`, `update`, `delete`, `deleteAllData` |
| `photos` | `getByConcert`, `toggleStar`, `getUnmatched`, `linkToExisting`, `createConcertFromPhoto`, `scanFromDrive` |
| `ai` | `suggestions`, `insights` |

---

**Document Version:** 1.0  
**Last Updated:** December 13, 2025  
**Prepared by:** Manus AI  
**For:** AI agents and human developers working on this project
