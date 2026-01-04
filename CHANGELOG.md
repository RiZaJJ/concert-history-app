# Changelog

All notable changes to the Concert History Database project.

## [2.0.0] - 2026-01-03

### Major Features Added

#### Enhanced Scan Progress Display
- **Real-time detailed progress**: Scan progress now shows current filename, location (city/state/country), detected venue name, and match status
- **Live status updates**: "Matching concert...", "Linked to concert", "Auto-linked (nearby photo)", "Linked to new concert!", "Unmatched - needs review"
- **Running statistics**: Real-time counts for linked photos, new concerts discovered, and unmatched photos
- **Visual improvements**: Animated spinner, color-coded status messages, progress percentage, clean labeled sections

#### Intelligent Photo Auto-Linking
- **Proximity-based linking**: Photos within 500m on the same date automatically link to existing concerts
- **Batched processing**: Photos grouped by date + GPS location (~100m precision) for efficient API usage
- **50 photos from same concert**: Now requires only 1-5 API calls instead of 150+

#### Midnight Concert Handling
- **Automatic date adjustment**: Photos taken between 00:00-04:00 automatically grouped with previous day's concert
- **Handles late-night shows**: Concerts that run past midnight now correctly group all photos together
- **Applied to all matching logic**: Both photo grouping and proximity searches use midnight adjustment

#### Cached File Count System
- **Instant dashboard loading**: File counts now load in ~50ms instead of 5-10 seconds
- **New `scan_cache` table**: Stores total Google Drive file count per user
- **Automatic updates**: Cache refreshed during each scan
- **No repeated API pagination**: Eliminates slow Google Drive queries on every page load
- **Simple math**: `remainingFiles = totalFiles - processedCount`

#### OSM Venue Detection During Scan
- **Venue detection at scan time**: Now detects venues via OpenStreetMap during photo ingestion (not just review)
- **Database caching**: Detected venues cached with GPS coordinates for instant future lookups
- **Batched per photo group**: ONE OSM query per date/location group (not per photo)
- **600m search radius**: Finds nearby music venues, stadiums, theaters, and attractions
- **Passed to Setlist.fm**: Concert searches now include venue name for better matching
- **Saved in unmatched photos**: Even if no concert found, venue name stored for manual review

#### Photo Count on Concert Cards
- **Dashboard display**: Each concert card now shows total photo count
- **New database function**: `getPhotosCount(concertId)` for efficient counting
- **Proper pluralization**: Shows "1 photo" or "X photos"
- **Icon display**: Camera icon next to photo count

### Performance Optimizations

#### Intelligent Photo Grouping
- Photos grouped by `YYYY-MM-DD|lat,lng` before processing
- ~100m GPS precision for grouping (lat/lng rounded to 3 decimals)
- Reduces API calls by 90-95% for batch photo uploads

#### Venue Caching Strategy
- First check: Database cache (600m radius) - instant!
- Second check: OSM API query if not cached
- Auto-cache: OSM results saved to database for future
- Result: Second scan of same venue = 0 API calls

#### File Count Caching
- Google Drive pagination eliminated for dashboard stats
- 18,000+ file library queried once, cached forever (until next scan)
- Dashboard loads 100x faster

#### Scan Statistics API
- New `getScanStats` endpoint returns total/processed/remaining counts
- Uses cached values (no API calls)
- Updates automatically after each scan

### API Changes

#### New tRPC Endpoints
- `photos.getScanProgress` - Get real-time scan progress (polls every 500ms)
- `photos.getScanStats` - Get scan statistics (total/processed/remaining files)
- `photos.getNearbyVenues` - Get OSM venues near GPS coordinates (600m)

#### Enhanced Endpoints
- `photos.scanFromDrive` - Now accepts optional batch limit (1-100)
- `concerts.list` - Now includes `photoCount` for each concert

#### New Database Functions
- `getPhotosCount(concertId)` - Count total photos for a concert
- `getProcessedFilesCount(userId)` - Count processed files
- `getScanCache(userId)` - Get cached Drive file count
- `updateScanCache(userId, totalFiles)` - Update file count cache
- `findNearbyPhotoOnSameDate(userId, date, lat, lng)` - Find nearby photos for auto-linking

### Database Schema Changes

#### New Tables
- **`scan_cache`**: Caches total Google Drive file counts per user
  - `userId` (unique), `totalDriveFiles`, `lastUpdated`
  - Eliminates slow API pagination on dashboard loads

#### Enhanced Tables
- **`unmatched_photos`**: Now stores detected venue info
  - `venueName`, `venueDetectionMethod`, `venueConfidence`
  - Populated during scan (not just review)

### Infrastructure Changes

#### OpenStreetMap Integration
- Replaced Google Maps API for venue detection
- No API key required (public OSM Overpass API)
- More comprehensive venue coverage
- Database caching for performance

#### OpenWeather Reverse Geocoding
- Using OpenWeather for GPS → city/state/country
- Faster than Google Maps
- Simpler response structure
- Free tier sufficient

### Bug Fixes

- Fixed venue detection not running during photo scan (only in review)
- Fixed slow dashboard loading due to repeated Google Drive queries
- Fixed date conversion issues with UTC offsets
- Fixed duplicate venue entries in database

### Technical Debt Reduction

- Removed automatic radius increases (user explicitly controls all distance settings)
- Consolidated venue detection logic (removed duplicate code between scan and review)
- Improved scan progress tracking architecture (cleaner state management)
- Better error handling in photo ingestion pipeline

### Developer Experience

- Updated README.md with comprehensive feature documentation
- Updated TECHNICAL_SPEC.md with detailed architecture and API information
- Added performance benchmarks and optimization explanations
- Documented all new database tables and functions

---

## [1.0.0] - 2025-12-13

### Initial Release

- Concert tracking with artist, venue, and date
- Photo management with EXIF metadata extraction
- Google Drive integration for photo scanning
- Setlist.fm integration for concert data
- Weather data integration
- AI-powered suggestions and insights
- Star/favorite photo functionality
- S3 storage for starred photos
- Photo review workflow for unmatched photos
- Venue alias system
- Dark mode support

---

## Legend

- **Major version** (X.0.0): Breaking changes or major feature additions
- **Minor version** (0.X.0): New features, backward compatible
- **Patch version** (0.0.X): Bug fixes, backward compatible
