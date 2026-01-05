# Alt_Name Implementation Summary

## Problem
OSM venues have alternative names that setlist.fm uses. Example:
- **OSM**: "DHL Stadium" (primary name)
- **OSM**: "Cape Town Stadium" (alt_name tag)
- **setlist.fm**: Only has concerts listed under "Cape Town Stadium"

Without checking alt_name, we'd fail to match this venue.

## Solution
Added full support for OSM's `alt_name` tag throughout the venue detection and matching pipeline.

## Files Changed

### 1. `/drizzle/schema.ts`
- Added `altName` column to venues table
- Allows storing alternative venue names from OSM

### 2. `/migrations/002-add-venue-alt-name.sql` (NEW)
- Database migration to add altName VARCHAR(255) column
- Applied successfully ✓

### 3. `/server/osmVenueDetection.ts`
- **OSMVenue interface**: Added `altName?: string` field
- **findOSMVenues()**: Captures `alt_name` from OSM tags
- **Logging**: Shows alt_name when detected: `[alt: "Cape Town Stadium"]`
- **findBestOSMVenue()**:
  - First validates primary name against setlist.fm
  - If no concerts found, tries alt_name
  - Uses whichever name has concerts on setlist.fm
  - Returns both names (selected name as primary, other as alt)

### 4. `/server/integrations.ts`
- **findNearbyVenue()**: Return type now includes `altName?: string`

### 5. `/server/db.ts`
- **cacheOSMVenue()**:
  - Accepts `altName` parameter
  - Checks both name and altName for duplicates
  - Stores altName in database
  - Logs alt_name when caching

### 6. `/server/photoIngestion.ts`
- **Venue caching**: Passes `altName` from OSM to database
- **Logging**: Shows alt_name when caching venues

## How It Works

### Example: DHL Stadium (Cape Town)

1. **OSM Query Returns**:
   ```
   name: "DHL Stadium"
   alt_name: "Cape Town Stadium"
   ```

2. **Validation Process**:
   ```
   Try "DHL Stadium" on setlist.fm → 0 concerts found
   Try "Cape Town Stadium" on setlist.fm → 142 concerts found ✓
   ```

3. **Database Storage**:
   ```sql
   INSERT INTO venues (name, altName, ...)
   VALUES ('Cape Town Stadium', 'DHL Stadium', ...)
   ```

4. **Concert Matching**:
   - Photos at this venue now match to "Cape Town Stadium"
   - setlist.fm searches use "Cape Town Stadium"
   - Both names stored for future reference

## Testing

After clearing database and rescanning:
1. OSM logs should show: `[alt: "alternative name"]` when detected
2. Venue validation should try both names
3. Database should store both names
4. Concerts should match using whichever name setlist.fm has

## Benefits

1. **Higher match rate**: Venues with renamed/rebranded names now match
2. **setlist.fm compatibility**: Uses the name setlist.fm recognizes
3. **Data preservation**: Keeps both names for reference
4. **Better logging**: Clear visibility into which name was used

## Next Steps

1. Clear database (clears old venues without altName)
2. Rescan photos
3. Check logs for alt_name detection
4. Verify DHL Stadium matches to "Cape Town Stadium"
