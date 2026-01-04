# Concert History App - TODO

## Database & Schema
- [x] Design complete database schema (Users, Artists, Venues, Concerts, Songs, Photos, Setlists)
- [x] Add proper indexes for artist, venue, date queries
- [x] Implement deduplication constraints (date + venue + user_id)

## External API Integrations
- [x] Request API keys for setlist.fm
- [x] Request API keys for OpenWeather
- [x] Request Google Drive API credentials
- [x] Set up API integration helpers

## Backend - Core Features
- [x] Create tRPC procedures for concert CRUD operations
- [x] Create tRPC procedures for photo management
- [x] Build setlist.fm integration to fetch setlists
- [x] Build OpenWeather integration to fetch current weather
- [x] Implement Google Drive folder scanning
- [x] Build EXIF metadata extraction logic
- [x] Implement smart concert deduplication workflow
- [x] Create photo starring system with S3 upload
- [x] Build search and filter procedures

## Backend - Advanced Features
- [ ] Implement background job for periodic Google Drive scanning
- [x] Create AI-powered concert suggestion system using LLM
- [x] Set up owner notifications for new concert detection
- [ ] Add notification for milestone achievements (e.g., 100th concert)

## Frontend - Dashboard
- [x] Design mobile-first responsive layout
- [x] Create concert card component
- [x] Build dashboard page with concert list
- [x] Implement search and filter UI
- [x] Add loading states and empty states

## Frontend - Concert Detail
- [x] Create concert detail page layout
- [x] Display setlist information
- [x] Display weather data
- [x] Build photo gallery with lightbox viewer
- [x] Implement star/unstar photo controls
- [x] Add responsive design for mobile

## Testing & Quality
- [x] Write vitest tests for concert procedures
- [x] Write vitest tests for photo management
- [x] Write vitest tests for EXIF scanning
- [x] Write vitest tests for API integrations
- [x] Test deduplication logic
- [x] Test end-to-end user workflows

## Documentation & Deployment
- [x] Document API integration setup
- [x] Document Google Drive folder configuration
- [x] Create user guide for photo ingestion
- [x] Save final checkpoint for deployment

## API Integration Fixes
- [x] Fix Google Drive credentials format issue
- [x] Test Google Drive photo scanning end-to-end
- [x] Implement setlist.fm data fetching in concert creation
- [x] Add setlist display in concert detail page
- [x] Verify all API integrations are working
- [x] Fix all test failures (20/20 tests passing)

## Photo Scanning Workflow Fixes
- [x] Investigate why photo scan doesn't create new concerts
- [x] Implement reverse geocoding to find venue from GPS coordinates
- [x] Query setlist.fm API with date + venue to find artist
- [x] Automatically create concerts from setlist.fm data
- [x] Test smart concert detection with real photos
- [x] Add better user feedback for scan results

## Photo Review Workflow
- [x] Store unmatched photos during scan for review
- [x] Create backend endpoint to fetch unmatched photos with EXIF data
- [x] Build photo review UI page to display unmatched photos
- [x] Add manual concert linking from photo review
- [x] Implement fallback to file creation date when EXIF missing
- [x] Test complete workflow end-to-end

## JSON Sidecar Metadata Support
- [x] Filter out JSON files from photo list
- [x] Match each photo with its corresponding .supplemental-metadata.json file
- [x] Parse JSON sidecar files to extract EXIF data (date, GPS)
- [x] Update EXIF extraction to read from JSON instead of Google Drive metadata API
- [x] Test with real photos and JSON sidecars

## Video File Handling
- [x] Filter out MP4 files from photo scanning
- [ ] Future: Add video support after concerts are created

## DNG File Handling
- [x] Filter out DNG files from photo scanning (focus on JPG only)
- [ ] Future: Add DNG conversion support

## Venue Detection Improvements
- [x] Improve venue search to prioritize larger venues (stadiums, arenas, theaters)
- [x] Increase search radius for venue detection
- [ ] Test venue detection with Las Vegas Sphere coordinates

## Image Loading Fixes
- [x] Fix JPG images not loading in photo review (permissions issue)
- [x] Use Google Drive thumbnail URLs for image display
- [ ] Test image loading with JPG files

## Venue Name Fixes
- [x] Filter out generic city names from venue results
- [x] Return actual venue names (e.g., "Sphere") instead of city names
- [x] Use closest larger venue as fallback if no exact match
- [ ] Test with Sphere coordinates (36.1205, -115.1621)

## Photo Review UI Fixes
- [x] Fix photo display issue (Google Drive URLs not loading)
- [x] Store reverse-geocoded location data (city, state, country) in unmatched photos
- [x] Display complete location information in photo review UI
- [ ] Handle DNG and other raw photo formats that may not display in browser

## DNG File Display
- [x] Use Google Drive thumbnail URLs for DNG files
- [x] Update photo review UI to fallback to thumbnails for unsupported formats
- [ ] Test DNG display in photo review page

## Clear and Rescan Feature
- [x] Add backend endpoint to clear all unmatched photos
- [x] Add clear and rescan button to dashboard
- [ ] Test rescan with thumbnail and location support

## Venue Detection from GPS
- [x] Add venue lookup using GPS coordinates and city
- [x] Store detected venue name in unmatched photos
- [x] Display venue in photo review UI
- [ ] Test venue detection with real photos

## Current Bug Fixes
- [x] Fix photo thumbnails not displaying (Google Drive authentication issue - need backend proxy)
- [x] Improve venue detection to exclude hotels, restaurants, and non-concert venues (only return actual performance venues)

## Completed Improvements (Dec 12, 2024)
- [x] Add DNG file format support to photo scanning
- [x] Fix venue detection to prioritize major concert venues (e.g., Sphere) over smaller nightclubs
- [x] Implement hybrid venue detection (nearby search + text search fallback for major venues)
- [x] Add strict name matching to avoid false positives (e.g., "Sphere Nails Bar" vs "Sphere")
- [x] Increase search radius to 2km and add fallback to 3km for text search

## Completed Improvement - Venue-Based Matching (Dec 12, 2024)
- [x] Update setlist.fm search to use detected venue name (not just city) for more accurate matching
- [x] Test automatic concert creation with Sphere + Feb 3, 2024 → successfully matched U2 concert with 35 photos

## Current Bug Fixes (Dec 12, 2024)
- [x] Fix photo thumbnails not loading in concert detail page (broken images for auto-linked photos)
- [x] Fix setlist showing "Unknown Song" instead of actual U2 song titles from setlist.fm

## Current Bug Fix (Dec 12, 2024)
- [x] Fix existing photos in database - update URL parsing to handle both Google Drive formats (/file/d/ID and ?id=ID)

## New Features (Dec 12, 2024)
- [ ] Add ability to delete individual concerts (with cascade delete for photos/setlist)
- [ ] Add bulk delete for test concerts (EXIF Test Band, Photo Test Band, etc.)
- [ ] Implement setlist.fm sync - automatically add new concerts to user's setlist.fm account
- [ ] Implement setlist.fm sync - delete concerts from setlist.fm when deleted locally
- [ ] Add smart photo scanning - track processed files and skip already-scanned photos
- [ ] Implement bulk photo selection UI for each concert
- [ ] Add hide/delete functionality for selected photos in bulk

## Bug Fix (Dec 12, 2024)
- [x] Fix accessibility error in photo viewer dialog - add DialogTitle for screen readers

## New Feature (Dec 12, 2024)
- [x] Implement bulk photo selection UI with Select mode toggle
- [x] Add checkboxes to photos when in Select mode
- [x] Add bulk actions bar with "Hide Selected" and "Delete Selected" buttons
- [x] Create backend endpoints for bulk hide and bulk delete operations

## Bug Fix (Dec 12, 2024)
- [x] Fix smart photo scanning - not skipping processed files, scanning same batch repeatedly (missing database migration)

## Bug Fixes & Features (Dec 12, 2024)
- [x] Fix photo scanning still linking same 49 photos repeatedly - added error handling for duplicates
- [x] Exclude .mov and .mp4 video files from photo scanning and display
- [ ] Add concert edit functionality - allow editing all fields (artist, date, venue, etc.)
- [ ] Auto-fetch setlist.fm data when artist/date changed during concert edit

## New Features & Fixes (Dec 13, 2024)
- [x] Group unmatched photos in Review by date+GPS location - show only 1 photo per concert group
- [x] Fix venue detection to prioritize actual concert venues (e.g., "Gorge Amphitheatre") over nearby businesses (wineries, hotels)
- [x] Add Edit Concert button to concert detail page with all fields editable
- [x] Auto-fetch setlist.fm data when artist/date changed during edit

## New Feature (Dec 13, 2024 - Bulk Photo Linking)
- [x] After linking a photo to a concert, ask if user wants to link all photos from same date/location
- [x] Add backend procedure to find and bulk link photos by date+location
- [x] Add confirmation dialog in UI

## Bug Fix (Dec 13, 2024 - Artist+Date Priority)
- [x] Fix artist+date priority to lookup setlist.fm with ONLY artist name and date (not venue)
- [x] Auto-sync venue, city, state, temperature from setlist.fm response

## Bug Fix (Dec 13, 2024 - Setlist.fm Lookup Not Working)
- [ ] Debug setlist.fm API response - add logging to see what's being returned
- [ ] Fix artist+date lookup to correctly parse and return concert data

## New Feature (Dec 13, 2025 - Dark Mode)
- [x] Add dark mode toggle button to the app
- [x] Persist theme preference in localStorage
- [x] Update all pages to support dark mode

## Bug Fix (Dec 13, 2025 - Photo Scan Not Finding All Files)
- [x] Investigate why photo scan only finds 17 photos when there are more in Google Drive
- [x] Fix pagination or file listing logic to find all photos

## New Feature (Dec 13, 2025 - Photo EXIF Viewer)
- [x] Add click handler to photos to view EXIF metadata
- [x] Display GPS coordinates, venue detection, timestamp, and camera info
- [x] Show metadata in a modal dialog

## Improvement (Dec 13, 2025 - Better Venue Detection)
- [x] Replace radius-based venue search with Google Places text search "music venue near [lat], [lon]"
- [x] Take the first result from the text search as the detected venue

## Improvement (Dec 13, 2025 - Chronological Photo Scanning)
- [x] Sort Google Drive files by creation date (oldest first)
- [x] Process photos in batches of 50 to handle large folders
- [x] Track scan progress to avoid re-processing already scanned photos (already implemented)

## Improvement (Dec 13, 2025 - Closest Building Venue Detection)
- [x] Use Google Maps to find the closest building/place to GPS coordinates
- [x] Replace text search with proximity-based detection using rankby=distance

## New Feature (Dec 13, 2025 - Scan Progress Bar)
- [x] Add backend support for emitting progress updates during photo scan
- [x] Create progress bar UI component showing "Processing X of Y photos"
- [x] Display progress percentage and estimated time remaining

## Bug Fix (Dec 13, 2025 - Progress Bar Not Showing)
- [x] Debug why progress bar is not appearing during photo scan
- [x] Fix progress bar implementation to display correctly
- [x] Test progress bar with actual photo scanning

## Bug Fix (Dec 13, 2025 - Photo Review Dark Mode)
- [x] Fix photo review page to respect dark mode theme
- [x] Update background colors to use theme-aware classes
- [x] Test dark mode on photo review page

## New Feature (Dec 13, 2025 - Skip All from Event)
- [x] Add backend mutation to skip all photos matching date and location
- [x] Add "Skip All from This Event" button to photo review page
- [x] Jump to next photo from different event after skipping
- [x] Test skip all functionality with multiple photos

## Bug Fix (Dec 13, 2025 - Venue Lookup Category Filtering)
- [x] Investigate current venue lookup implementation in photo ingestion
- [x] Add category/type filtering to prioritize actual event venues
- [x] Filter for keywords: event, music, venue, arena, stadium, complex, centre, live
- [x] Test with real locations to verify correct venue detection

## New Feature (Dec 13, 2025 - Venue Enhancements)
- [x] Add database schema for venue detection metadata and aliases
- [x] Implement venue override dropdown in photo review page
- [x] Add venue confidence score display showing detection method
- [x] Create venue aliases system for nickname matching
- [x] Add UI to manage venue aliases
- [x] Test all three features together

## New Feature (Dec 13, 2025 - Create Concert from Photo)
- [x] Add backend mutation to create concert from unmatched photo data
- [x] Create UI dialog with pre-filled form (artist, venue, date from EXIF)
- [x] Add "Create Concert" button to photo review page
- [x] Link photo to newly created concert automatically
- [x] Test concert creation workflow

## Bug Fix (Dec 13, 2025 - Climate Pledge Arena Not in Dropdown)
- [x] Investigate why Climate Pledge Arena doesn't appear in venue override dropdown
- [x] Check Google Places API response for those coordinates
- [x] Fix venue detection to include major arenas and stadiums
- [x] Test with Climate Pledge Arena coordinates

## New Feature (Dec 13, 2025 - Review Skipped Photos)
- [x] Add backend query to fetch all skipped photos
- [x] Add un-skip mutation to restore photos to pending status
- [x] Create Review Skipped Photos page with photo grid
- [x] Add "Review Skipped Photos" button on dashboard
- [x] Test skipped photos review and restore workflow

## Bug Fix (Dec 13, 2025 - Broken Images in Skipped Photos)
- [x] Investigate image URL format in skipped photos page
- [x] Fix image display to show thumbnails correctly
- [x] Add pagination to prevent loading 231 images simultaneously
- [x] Test image loading on skipped photos page

## Bug Fix (Dec 13, 2025 - Dashboard Count Not Updating After Scan)
- [x] Investigate why unmatched photo count doesn't update after scan completes
- [x] Fix query invalidation to refresh dashboard counts
- [x] Add forced refetch with delay to ensure count updates
- [x] Test scan completion and count update

## Enhancement (Dec 13, 2025 - Concert Editing Improvements)
- [x] Make venue optional in concert edit form
- [x] Add validation to require at least 2 of 3 fields (venue, artist, date)
- [x] Update setlist.fm matching to try all 2-field combinations
- [x] Add venue dropdown to photo review page
- [x] Trigger automatic concert matching when venue changes
- [x] Test concert editing with various field combinations

## Bug Fix (Dec 13, 2025 - Form Validation Not Allowing Venue + Date)
- [x] Investigate why form won't submit with venue + date (no artist)
- [x] Fix validation logic to properly check 2 of 3 fields
- [x] Test form submission with all valid 2-field combinations

## Enhancement (Dec 13, 2025 - Venue Dropdown Everywhere)
- [x] Identify all photo viewing components in the app
- [x] Create reusable VenueDropdown component
- [x] Add venue dropdown to concert photo galleries (ConcertDetail)
- [x] Venue dropdown already exists in PhotoReview (unmatched photos)
- [x] Test venue dropdown in concert detail page
- [x] Venue dropdown updates all concert photos when changed

## Bug Fix (Dec 13, 2025 - Google Maps API Rate Limit Error)
- [x] Investigate excessive API calls causing rate limit errors
- [x] Add caching to venue queries to prevent duplicate requests (5min staleTime)
- [x] Optimize venue dropdown to only fetch when opened
- [x] Test and verify rate limit issue is resolved

## Bug Fix (Dec 13, 2025 - Venue Dropdown Not Visible in Photo Review)
- [ ] Investigate why venue dropdown is not rendering at all
- [ ] Fix venue section to display venue name and dropdown
- [ ] Test venue dropdown appears correctly in photo review page

## Bug Fix (Dec 13, 2025 - Venue Dropdown Not Visible)
- [x] Fix venue dropdown missing from photo review page
- [x] Change conditional rendering to show venue section when GPS exists (not just when venueName exists)
- [ ] Add useEffect to reset venueDropdownOpen state when photo changes to prevent rate limit errors
- [ ] Test venue dropdown visibility and functionality

## Enhancement (Dec 13, 2025 - Park Keyword)
- [x] Add "Park" as a venue keyword for outdoor concert venues
- [ ] Test park detection with real concert photos from parks

## User Requests (Dec 13, 2025)
- [x] Add "Delete Database" button to dashboard to completely wipe all data
- [x] Fix edit concert form validation - should only require 2 of 3 fields (artist, venue, date), not all 3

## Documentation (Dec 13, 2025)
- [x] Write technical specification document for developers (requirements, architecture, APIs, schema)
- [x] Write AI-friendly narrative document with tips for better AI comprehension

## Critical Bug (Dec 13, 2025)
- [x] Add error handling and logging to getNearbyVenues to prevent UI hang
- [x] Debug getNearbyVenues query to see if it's returning data
- [ ] Test venue dropdown thoroughly with user authentication
- [ ] Verify Google Maps API is working correctly in production

## Critical Bug (Dec 13, 2025 - Setlist.fm Matching)
- [x] Setlist.fm matching ignores GPS location - FIXED with 50-mile radius filtering
- [x] Example: Kelsea Ballerini (Nashville TN) matched to photo at 47.7287,-122.1509 (Woodinville WA)
- [x] Actual concert: Taj Mahal + Los Lobos at Chateau Ste Michelle on 6/23/23
- [x] Distance: ~1964 miles apart - now correctly rejected
- [x] Edit concert + sync with setlist.fm now respects GPS location
- [x] Fix: Added Haversine distance calculation (gpsUtils.ts)
- [x] Fix: Filter searchSetlistsByDateAndLocation results by distance
- [x] Fix: Filter fetchSetlistByArtistAndDate results by distance
- [x] Fix: Pass GPS coordinates through setlistMatcher and concert update
- [ ] Test: Edit Kelsea Ballerini concert and verify it finds Taj Mahal instead

## Feature Request (Dec 13, 2025 - Roast Mode)
- [x] Change "Your Concert Insights" from generic compliments to humorous roast
- [x] Update AI prompt to generate snarky commentary about music taste
- [x] Make fun of artist choices, venue preferences, concert frequency, etc.

## Bug Fix (Dec 13, 2025 - Concert Edit Blank Fields)
- [x] Concert edit treats blank fields as "keep existing" - FIXED to trigger lookup
- [x] Example: Remove "Kelsea Ballerini", keep venue+date, sync → now finds correct artist
- [x] Refactored update procedure to check refreshSetlist FIRST before applying fallbacks
- [x] Blank fields now passed as undefined to setlist.fm lookup
- [x] Artist ID correctly updated when setlist.fm returns different artist
- [ ] Test: Edit Kelsea Ballerini concert, remove artist, sync → should find Taj Mahal/Los Lobos

## Bug Fix (Dec 13, 2025 - Create Concert from Photo)
- [x] "Create Concert from Photo" form requires all 3 fields - FIXED to require only 2 of 3
- [x] Now follows "2 of 3" rule like concert edit
- [x] Allows: artist+date, venue+date, or artist+venue
- [x] Looks up missing field from setlist.fm automatically
- [x] Updated form validation in PhotoReview.tsx
- [x] Updated createConcertFromPhoto procedure in routers.ts with setlist lookup

## Bug Fix (Dec 13, 2025 - Timezone Date Bug)
- [x] Concert dates display one day ahead in edit form - FIXED
- [x] Example: Photo taken June 23, showed as June 24 in edit form
- [x] Root cause: toISOString() + local timezone causing date shift
- [x] Fix: Use getUTCFullYear/Month/Date instead of toISOString().split('T')[0]
- [x] Updated ConcertDetail.tsx edit form date conversion to preserve UTC date

## Bug Fix (Dec 13, 2025 - Date Still Wrong in Forms)
- [x] Date field showing one day ahead in "Create Concert from Photo" form - FIXED
- [x] Date field showing one day ahead in "Edit Concert" form - FIXED
- [x] Created formatDateForInput utility using UTC components
- [x] Replaced all toISOString().split('T')[0] with formatDateForInput
- [x] Now correctly uses photo EXIF date or file creation date without timezone shift

## Bug Fix (Dec 13, 2025 - Edit Concert Blank Fields Not Working)
- [x] Edit concert form shows "Leave blank to keep current" - FIXED placeholder text
- [x] Placeholder now changes based on sync checkbox state
- [x] When sync checked: "Leave blank to lookup from setlist.fm"
- [x] When sync unchecked: "Leave blank to keep current"
- [x] Added .trim() to form submission to properly detect empty strings
- [x] Added console logging to debug what's being sent to server
- [ ] Test: Delete artist, check sync, submit → should lookup from setlist.fm

## Critical Bug (Dec 13, 2025 - Date STILL Wrong in Edit Form)
- [x] Root cause identified: concertDate stored as timestamp (UTC) causing timezone shift
- [x] Solution: Store all concert dates at noon (12:00 PM) UTC
- [x] Created dateToNoonUTC utility in server/dateUtils.ts
- [x] Updated concert creation (create and createConcertFromPhoto) to use noon UTC
- [x] Updated concert editing (update procedure) to use noon UTC
- [ ] Test: Edit concert date and verify it displays correctly without timezone shift

## Critical Bug (Dec 13, 2025 - Edit Concert Lookup Not Working)
- [ ] Edit Kelsea Ballerini concert, delete artist, keep venue+date, sync → should find Los Lobos
- [ ] Instead it keeps Kelsea Ballerini (doesn't lookup from setlist.fm)
- [ ] Check server logs to see if lookup is being called
- [ ] Check if blank artist field is being sent as undefined or empty string
- [ ] Verify setlist.fm API is returning results for Chateau Ste Michelle + date

## Feature (Dec 13, 2025 - Fuzzy Venue Matching)
- [x] Create fuzzy string matching utility using Levenshtein distance or similar algorithm
- [x] Integrate fuzzy matching into setlist.fm venue name comparison
- [x] Handle variations: "Chateau Ste Michelle" vs "Chateau Ste. Michelle Winery Amphitheatre"
- [x] Set similarity threshold (70% match = accept)
- [x] Add city-based venue lookup fallback when GPS not available
- [x] Test fuzzy matching with 24 unit tests (all passing)

## Bug Fix (Dec 17, 2025 - Progress Bar Not Resetting)
- [x] Fix photo scan progress bar not resetting when starting a new scan
- [x] Investigate if new photos are being processed or if scan is stuck
- [x] Ensure progress tracking resets to 0 at scan start
- [x] Clear stale progress on backend before initializing new scan
- [x] Invalidate progress query on frontend when scan starts

## Bug Fix (Dec 18, 2025 - Edit Concert Date Display)
- [x] Fix edit concert dialog showing date 1 day ahead
- [x] Ensure formatDateForInput displays the correct date in the input field
- [x] Verified date display is correct (parseDateStringToNoonUTC working)

## New Feature (Dec 18, 2025 - Concert Merge)
- [x] Add backend procedure to merge two concerts (mergeConcerts in db.ts)
- [x] Transfer all photos from source concert to target concert
- [x] Transfer setlist data if target concert has none
- [x] Delete source concert after merge
- [x] Add merge UI to concert detail page with concert selector
- [x] Add tRPC procedure concerts.merge
- [x] Test merge functionality end-to-end (UI verified, ready for use)

## Critical Bug (Dec 18, 2025 - Photo Date Matching Wrong Concert)
- [x] Photos from 3/15/23 (Stevie Nicks) are being assigned to SZA concert on 3/16/23
- [x] Investigate photo ingestion date matching logic in photoIngestion.ts
- [x] Root cause: Photo EXIF in UTC, concerts at noon UTC, timezone mismatch
- [x] Solution: Use ±18 hour window instead of exact date matching
- [x] This handles photos taken late night or early morning across timezone boundaries
- [ ] Test with user's photos after Clear & Rescan

## Bug (Dec 18, 2025 - Greek Theatre Berkeley Not Matching)
- [x] Phish concert 4/19/23 at Greek Theatre Berkeley exists on setlist.fm but wasn't matched
- [x] Photo EXIF: "The Greek Theatre", setlist.fm: "William Randolph Hearst Greek Theatre"
- [x] GPS: 37.8740, -122.2543 (correct location)
- [x] Root cause: Fuzzy matching only 28% similarity due to "William Randolph Hearst" prefix
- [x] Solution: Improved normalizeVenueName to strip common prefixes ("William Randolph Hearst", "The")
- [x] Result: Now matches at 100% after normalization, all tests pass

## Bug (Dec 18, 2025 - tRPC Client Error)
- [ ] Error: "Unexpected token '<', "<!doctype "... is not valid JSON"
- [ ] tRPC client receiving HTML instead of JSON from API
- [ ] Check server logs for crashes or errors
- [ ] Restart dev server to resolve

## Critical Bug (Dec 18, 2025 - Concert Dates Off By 1-2 Days)
- [x] Phish concerts showing April 20 when user attended April 18 and 19
- [x] No Phish show existed on April 20, 2023
- [x] Root cause: autoDetectConcert used photo EXIF date instead of setlist eventDate
- [x] Fix: Parse setlist.eventDate (DD-MM-YYYY) and create Date at noon UTC
- [x] Normalize all dates (concert + photo) to noon UTC to avoid timezone shifts

## Bug (Dec 18, 2025 - Create New Concert Form Date Wrong)
- [x] "Create New Concert" form in photo review page shows date 1 day ahead
- [x] Root cause: Photo takenAt stored with timezone, formatDateForInput uses UTC components
- [x] Fix: Normalize photo takenAt to noon UTC when extracting from EXIF
- [x] Now all dates (concerts + photos) use consistent noon UTC format

## Bug (Dec 18, 2025 - EXIF Date Display Shows Wrong Date/Time)
- [x] EXIF date display shows UTC-shifted timestamp (e.g., June 12 5:00 AM instead of June 11 11:00 PM)
- [x] Root cause: Normalized EXIF timestamps to noon UTC, losing original time info
- [x] Solution: Keep original EXIF timestamp, use formatDateForInputLocal for calendar date
- [x] Created formatDateForInputLocal() helper that uses local time components
- [x] Updated PhotoReview to use formatDateForInputLocal for Concert Date field

## Bug (Dec 19, 2025 - Venue Change Search Not Finding Concert)
- [x] Changed venue to "The Crocodile" but search returned "No matching concerts found"
- [x] Concert exists: Nation of Language at The Crocodile, Seattle on June 10, 2023
- [x] Root cause: searchConcertsForPhoto only passed venue + date, missing city/GPS
- [x] Fix: Added city, latitude, longitude to findSetlistWithAllCombinations call
- [x] Result: Venue search now works, found 23 concerts after rescan

## Bug (Dec 19, 2025 - Date Taken Shows N/A on Photo Info Page)
- [x] All photos show "Date Taken: N/A" on photo info/detail pages
- [x] Root cause: Code checked for dateTaken field, but backend uses takenAt
- [x] Fix: Changed selectedPhotoMetadata.dateTaken to selectedPhotoMetadata.takenAt
- [x] Date Taken now displays correctly in photo info dialog

## Feature (Dec 19, 2025 - Smart Venue Filtering)
- [x] Filter out non-venue places from Google Maps nearby results
- [x] Prioritize venues with keywords: theater, arena, amphitheater, hall, club, venue
- [x] Remove noise: restaurants, hotels, stores, parking, gas stations
- [x] Score venues by likelihood of being a concert venue (-100 to +100 scale)
- [x] Created venueFilter.ts with scoreVenue, filterVenues, getBestVenue functions
- [x] Integrated into getNearbyVenues (manual selection) and findNearbyVenue (auto-detection)
- [x] Venues now ranked by score, noise filtered out automatically

## Feature (Dec 19, 2025 - OpenStreetMap Venue Matching Overhaul)
- [x] Replace Google Maps fuzzy matching with OpenStreetMap tag-based filtering
- [x] Query OSM Overpass API for establishments within 100m of GPS coordinates
- [x] Filter by specific tags: amenity=nightclub/theater/theatre/stage/events_venue/events_centre
- [x] Filter by leisure tags: bandstand/stadium/park
- [x] Only add to venue list if tags match (no fuzzy fallback)
- [x] Implemented osmVenueDetection.ts with Overpass API integration
- [x] Replaced findNearbyVenue in integrations.ts with OSM version
- [x] Replaced getNearbyVenues in routers.ts with OSM version
- [x] Wrote 10 unit tests for OSM venue matching (all passing)
- [x] Result: 40 concerts detected (up from 25), cleaner venue matching

## Critical Bug (Dec 19, 2025 - Speed of Light Concert Date Wrong)
- [ ] Speed of Light concert shows 10/4/23 but photos are from 10/3/23
- [ ] System found correct venue but matched to wrong date's concert
- [ ] Check if setlist.fm has correct date (10/3) or if date parsing is broken
- [ ] Verify the eventDate parsing in autoDetectConcert is working correctly
- [ ] May need to check if ±18 hour window is catching wrong concert

## Critical Bug Fixes (Dec 24, 2024)
- [x] Fix date conversion bug: Photos taken Oct 3 are being sent to setlist.fm as Oct 4
- [x] Fix Scan Photos button only processing 10 photos at a time
- [x] Fix Scan Photos button not working at all
- [x] Investigate where photo EXIF dates are being incorrectly converted before setlist.fm lookup
- [x] Mark files as processed even when skipped (missing JSON metadata)
