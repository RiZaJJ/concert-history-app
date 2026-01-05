# Cache Clearing Verification

## When User Clicks "Delete Database"

### Database Tables Cleared:
1. ✅ **concerts** - All user concerts (including setlists via cascade)
2. ✅ **photos** - All linked photos
3. ✅ **unmatchedPhotos** - All unmatched photos
4. ✅ **processedFiles** - All processed file tracking (resets scan count)
5. ✅ **venueAliases** - User-defined venue mappings
6. ✅ **scanCache** - Google Drive file count cache
7. ✅ **venues** - ALL venue GPS cache (shared, completely reset)
8. ✅ **artists** - ALL artists (shared, completely reset)
9. ✅ **songs** - ALL setlist songs (shared, completely reset)

### In-Memory Caches Cleared:
1. ✅ **progressStore** - Scan progress tracking (`clearScanProgress()`)
2. ✅ **lastScanResults** - Last scan result cache (`clearLastScanResult()`)

### NOT Cleared (Intentionally):
- **users** - User account persists

## Result:
Complete fresh start - all data, caches, and state reset as if the app was just installed.

## Files Modified:
- `/server/db.ts` - Updated `deleteAllData()` to clear all database caches
- `/server/routers.ts` - Updated `deleteAllData` endpoint to clear in-memory caches
- `/server/scanProgress.ts` - Added `clearLastScanResult()` function
- `/server/osmVenueDetection.ts` - Added 'music_venue' tag for better venue detection

## Testing:
After clicking "Delete Database":
1. Database should show 0 concerts, 0 photos, 0 venues, 0 artists
2. Next scan should start from photo 1 of total (not resume from previous)
3. OSM queries should return fresh data (not cached venues)
4. No corrupted venue GPS data should persist
