# Concert History Database

A full-stack web application for tracking and organizing your concert memories with automatic photo ingestion, setlist data, weather information, and AI-powered recommendations.

## Features

### Core Functionality
- **Concert Tracking**: Record every concert you've attended with artist, venue, date, and location details
- **Smart Deduplication**: Automatically prevents duplicate concert entries based on date, venue, and user
- **Photo Management**: Link photos to concerts with star/favorite functionality and photo count tracking
- **Search & Filters**: Find concerts by artist name, venue, city, or year
- **Weather Integration**: Automatic weather data fetching for concert dates and locations
- **Setlist Integration**: Connect to setlist.fm API to fetch concert setlists

### Advanced Photo Scanning
- **Google Drive Integration**: Automatically scan photos from Google Drive folder (1000 files per page)
- **EXIF Metadata Scanning**: Extract date, time, and GPS coordinates from photos
- **Database-First Matching**: Checks your existing concerts BEFORE searching setlist.fm for faster, more accurate matching
- **OSM Venue Detection**: Automatic venue identification using OpenStreetMap within 600m radius
- **Intelligent Grouping**: Photos grouped by date + GPS location (~100m precision) for efficient batch processing
- **Proximity Auto-Linking**: Photos within 500m on same date automatically link to existing concerts
- **Headliner Detection**: For multi-show dates (opening acts), uses song count + photo timestamp to pick correct artist
- **Midnight Concert Handling**: Photos taken 00:00-04:00 automatically grouped with previous day's concert
- **Real-Time Progress**: Live scan progress with file names, locations, venues, and match status
- **Cached File Counts**: Fast dashboard loading with cached Drive file counts (no repeated API calls)
- **Venue Caching**: OSM venues cached to database for instant future lookups
- **Setlist.fm Integration**: Automatic concert matching using venue name + date + GPS coordinates

### Photo Review & Management
- **Unmatched Photo Review**: Review photos that couldn't be auto-matched
- **Artist Search**: Search setlist.fm by artist name + photo date to bypass bad/missing GPS data
- **Manual Venue Input**: Type any venue name manually, not limited to GPS-nearby venues only
- **Bulk Actions**: Link similar photos by date/location in one click
- **Venue Suggestions**: AI-detected venue names shown in dropdown
- **Manual Linking**: Link photos to concerts or create new concerts from review page
- **Skip Management**: Skip photos and unskip later if needed
- **Photo Starring**: Mark favorite photos for permanent S3 storage

### Dashboard Features
- **Concert Cards**: Display concerts with photo counts, dates, starred photos, and weather
- **Scan Statistics**: Real-time file counts (processed vs remaining) without slow API calls
- **Progress Tracking**: See exactly how many of your 18,000+ files have been scanned
- **Batch Scanning**: Choose scan batch size (1, 5, 10, 25, 50, 100 photos)
- **Database Reset**: Complete database wipe with double-confirmation safety (user-scoped only)
- **Last Scan Results**: View detailed statistics from your most recent photo scan or re-scan
- **AI Insights**: Personalized concert recommendations and attendance pattern analysis
- **Mobile-First Design**: Fully responsive interface optimized for all devices

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS 4, shadcn/ui
- **Backend**: Node.js, Express, tRPC 11
- **Database**: MySQL/TiDB with Drizzle ORM
- **Authentication**: Manus OAuth
- **Storage**: AWS S3 for starred photos
- **APIs**: setlist.fm, OpenWeather, Google Drive
- **AI**: LLM integration for suggestions and insights

## Getting Started

### Prerequisites

The following API credentials are required:

1. **setlist.fm API Key**
   - Sign up at https://www.setlist.fm/
   - Get your API key from https://www.setlist.fm/settings/api

2. **OpenWeather API Key**
   - Sign up at https://openweathermap.org/
   - Get your API key from https://home.openweathermap.org/api_keys
   - Free tier is sufficient (1,000 calls/day)

3. **Google Drive API Credentials** (Optional, for photo scanning)
   - Go to https://console.cloud.google.com/
   - Create a new project or select existing
   - Enable Google Drive API
   - Create Service Account credentials
   - Download the JSON key file
   - Share your Google Drive photo folder with the service account email

4. **Google Drive Folder ID**
   - Open your Google Drive folder in a browser
   - Copy the folder ID from the URL: `https://drive.google.com/drive/folders/YOUR_FOLDER_ID_HERE`

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Configure environment variables (already set up in Manus platform):
   - `SETLISTFM_API_KEY`
   - `OPENWEATHER_API_KEY`
   - `GOOGLE_DRIVE_CREDENTIALS` (JSON string)
   - `GOOGLE_DRIVE_FOLDER_ID`

4. Push database schema:
   ```bash
   pnpm db:push
   ```

5. Start development server:
   ```bash
   pnpm dev
   ```

## Usage

### Adding Concerts Manually

1. Click "Add Concert" button on the dashboard
2. Fill in the concert details:
   - Artist name (required)
   - Venue name (required)
   - City (required)
   - State/Province (optional)
   - Country (required)
   - Concert date (required)
   - Latitude/Longitude (optional, for weather data)
3. Click "Add Concert"

Weather data will be automatically fetched if coordinates are provided.

### Scanning Photos from Google Drive

1. Ensure Google Drive credentials are properly configured
2. Select batch size (1-100 photos) from dropdown
3. Click "Scan Photos" button on the dashboard
4. Watch real-time progress showing:
   - Current file being processed
   - Detected location (city, state, country)
   - Detected venue name (e.g., "Madison Square Garden")
   - Match status ("Matching concert...", "Linked to concert", "Auto-linked (nearby photo)", "Unmatched")
   - Running stats (linked, new concerts, unmatched)
   - Completion percentage

5. The app will:
   - **Fetch files**: Query Google Drive folder (1000 files per API page)
   - **Extract EXIF**: Get date/time and GPS coordinates from photos
   - **Group photos**: Batch by date + location (~100m radius)
   - **Detect venues**: Query OSM for nearby venues (600m radius, cached)
   - **Search Setlist.fm**: Look for concerts using venue + date + GPS
   - **Auto-link**: Match to existing concerts within 500m on same date
   - **Handle midnight**: Photos at 00:00-04:00 grouped with previous day
   - **Cache venues**: Save OSM venues to database for instant future lookups
   - **Update cache**: Store total file count for fast dashboard stats

6. After scan completes:
   - Review summary showing linked photos and new concerts
   - Click "Review Unmatched" to manually link remaining photos
   - Dashboard stats update to show remaining files

### Reviewing & Matching Unmatched Photos

When photos can't be auto-matched (wrong GPS, missing from setlist.fm, etc.):

1. Click "Review" button on the dashboard to see unmatched photos
2. For each photo, you have several options:

#### Option 1: Artist Search (Best for Bad GPS)
- Type the artist name in the "Search by Artist" field
- Click "Search" (or press Enter)
- If found, the concert details will pre-fill in a dialog
- Click "Create Concert" to link the photo

**Use this when:**
- GPS coordinates are wrong or missing
- Concert isn't in setlist.fm's location database
- You know the artist but venue detection failed

#### Option 2: Manual Venue Input
- Type the exact venue name in the venue input field
- Press Enter or click "Use"
- System will search setlist.fm with that venue name
- Photo links automatically if concert is found

**Use this when:**
- You know the exact venue name
- Venue is slightly outside the GPS radius
- Auto-detected venue name is incorrect

#### Option 3: Select from Nearby Venues
- Open the venue dropdown
- Choose from GPS-detected nearby venues
- System searches for concerts at that venue

#### Option 4: Create Concert Manually
- Click "Create Concert from Photo"
- Fill in artist, venue, and date
- Click "Create Concert"

**Use this when:**
- Concert doesn't exist in setlist.fm at all
- You want full control over the concert details

### Starring Photos

1. Navigate to a concert detail page
2. Hover over a photo in the gallery
3. Click the star icon to mark as favorite
4. Starred photos are saved to S3 storage for permanent backup

### Resetting Your Database

To completely wipe and start fresh:

1. Click "Reset Database" button on the dashboard (red button)
2. Confirm the first warning (shows what will be deleted)
3. Confirm the second "FINAL WARNING"
4. Database is cleared (concerts, photos, unmatched photos, processed files)
5. Global data preserved (artists, venues, songs - shared across users)

**Note:** This only deletes YOUR data, not other users' concerts.

### Viewing Scan Results

After any scan or re-scan operation:

1. Click "Last Scan" or "Last Re-scan Results" button on the dashboard
2. View detailed statistics:
   - Total photos processed
   - Concerts matched/created
   - Venues detected
   - Photos linked vs unmatched
   - Scan duration
3. Use this to track scan effectiveness and troubleshoot issues

### Viewing AI Insights

The dashboard automatically displays:
- **Concert Insights**: AI-generated analysis of your attendance patterns
- **Artist Suggestions**: Personalized recommendations based on your history

## Database Schema

### Tables

- **users**: User accounts and authentication
- **artists**: Musical artists and bands
- **venues**: Concert venues with location data and GPS coordinates
- **concerts**: Concert events with weather and metadata
- **songs**: Song titles linked to artists
- **setlists**: Song order and set information for concerts
- **photos**: Photo records with EXIF data, GPS, and starring status
- **unmatched_photos**: Photos pending review with venue detection and location data
- **processed_files**: Tracks which Drive files have been scanned
- **venue_aliases**: User-defined venue nicknames for better matching
- **scan_cache**: Cached total Drive file counts for fast dashboard stats

### Key Relationships

- Each concert belongs to one user, artist, and venue
- Photos are linked to concerts and users
- Setlists connect concerts to songs
- Unmatched photos store detected venue names for review
- Venue aliases help match variations of venue names
- Processed files prevent duplicate scanning
- Scan cache eliminates slow Google Drive API calls
- Unique constraint on (userId, venueId, concertDate) prevents duplicates

### New Features in Database Design

**Intelligent Photo Processing:**
- Photos grouped by date + GPS (~100m precision) before processing
- Midnight photos (00:00-04:00) automatically adjusted to previous day
- Proximity-based auto-linking (500m radius, same date)
- Venue detection cached to database (600m radius)

**Performance Optimizations:**
- OSM venue lookups cached with GPS coordinates
- Total Drive file count cached (no repeated API pagination)
- Processed file tracking prevents re-scanning
- Batch venue detection per photo group (not per photo)

## API Endpoints

All API endpoints are accessed via tRPC procedures:

### Concerts
- `concerts.list` - Get all user concerts
- `concerts.getById` - Get concert details with photos and setlist
- `concerts.search` - Search concerts by filters
- `concerts.create` - Create new concert
- `concerts.deleteAllData` - Delete all user concerts, photos, and scanned files (reset database)

### Photos
- `photos.getByConcert` - Get photos for a concert
- `photos.toggleStar` - Star/unstar a photo
- `photos.scanFromDrive` - Trigger Google Drive scan with optional batch limit
- `photos.getScanProgress` - Get real-time scan progress (polls every 500ms)
- `photos.getScanStats` - Get scan statistics (total/processed/remaining files)
- `photos.getLastScanResult` - Get detailed results from last scan/re-scan operation
- `photos.getUnmatched` - Get unmatched photos for review
- `photos.getUnmatchedCount` - Get count of photos pending review
- `photos.searchConcertsForPhoto` - Search setlist.fm by venue OR artist name + date
- `photos.linkToExisting` - Link unmatched photo to existing concert
- `photos.linkToNew` - Create new concert and link unmatched photo
- `photos.skipPhoto` - Skip photo from review
- `photos.unskipPhoto` - Un-skip previously skipped photo
- `photos.bulkLinkSimilar` - Link all photos with same date/location to concert
- `photos.getNearbyVenues` - Get OSM venues near GPS coordinates (600m)
- `photos.overrideVenue` - Manually set venue name for unmatched photo
- `photos.rescanUnmatched` - Re-run venue detection on unmatched photos

### AI
- `ai.suggestions` - Get personalized artist recommendations
- `ai.insights` - Get concert attendance insights

### Artists & Venues
- `artists.search` - Search artists
- `venues.search` - Search venues

## Testing

Run the test suite:

```bash
pnpm test
```

Tests cover:
- Concert CRUD operations
- Photo management
- Deduplication logic
- Search and filtering
- Access control
- API integrations

## Deployment

1. Save a checkpoint:
   - The app automatically creates checkpoints
   - Use the Manus UI to publish

2. Click "Publish" in the Manus UI header

3. Your app will be deployed with:
   - Custom domain support
   - SSL/HTTPS enabled
   - Database persistence
   - S3 storage configured

## Known Limitations

1. **Google Drive Integration**: Requires properly formatted JSON credentials and service account setup
2. **Weather Data**: Uses current weather API (free tier) instead of historical data
3. **Setlist Data**: Depends on setlist.fm database completeness and accuracy
4. **Photo Storage**: Only starred photos are backed up to S3
5. **OSM Venue Detection**: Limited to 600m radius - may miss venues slightly further away
6. **Setlist.fm Rate Limiting**: 500ms delay between API calls to respect rate limits
7. **GPS Accuracy**: Concert matching relies on photo GPS metadata quality

## Completed Enhancements

- [✓] OSM venue detection during photo scanning (not just review)
- [✓] Real-time scan progress with detailed status updates
- [✓] Proximity-based auto-linking (500m radius)
- [✓] Midnight concert handling (00:00-04:00 grouped with previous day)
- [✓] Cached file counts for instant dashboard loading
- [✓] Venue caching to database for performance
- [✓] Photo count display on concert cards
- [✓] Batch size selection for scanning
- [✓] Intelligent photo grouping by date + GPS
- [✓] Database-first concert matching (checks existing concerts before setlist.fm)
- [✓] Artist + date search (bypass bad/missing GPS data)
- [✓] Manual venue text input (not limited to GPS-nearby venues)
- [✓] Headliner detection for multi-show dates (song count + timestamp heuristics)
- [✓] Database reset functionality with double-confirmation
- [✓] Last scan results viewer with detailed statistics
- [✓] Global background scan indicator (visible on all pages)

## Future Enhancements

- [ ] Scheduled background job for automatic Google Drive scanning
- [ ] Concert milestone notifications (e.g., 100th concert)
- [ ] Export concert history to PDF/CSV
- [ ] Social sharing features
- [ ] Advanced concert statistics dashboard with charts
- [ ] Ticket stub photo recognition via OCR
- [ ] Spotify integration for artist discovery
- [ ] Multi-artist concert support (festivals)
- [ ] Configurable proximity radius for auto-linking
- [ ] Historical weather data instead of current conditions
- [ ] Duplicate photo detection across concerts
- [ ] Bulk photo download by concert or date range

## Support

For issues or questions:
- Check the todo.md file for known issues
- Review test files for usage examples
- Consult the tRPC router definitions in `server/routers.ts`

## License

MIT
