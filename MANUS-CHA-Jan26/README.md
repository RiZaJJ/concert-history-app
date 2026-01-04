# Concert History Database

A full-stack web application for tracking and organizing your concert memories with automatic photo ingestion, setlist data, weather information, and AI-powered recommendations.

## Features

### Core Functionality
- **Concert Tracking**: Record every concert you've attended with artist, venue, date, and location details
- **Smart Deduplication**: Automatically prevents duplicate concert entries based on date, venue, and user
- **Photo Management**: Link photos to concerts with star/favorite functionality
- **Search & Filters**: Find concerts by artist name, venue, city, or year
- **Weather Integration**: Automatic weather data fetching for concert dates and locations
- **Setlist Integration**: Connect to setlist.fm API to fetch concert setlists

### Advanced Features
- **Google Drive Integration**: Automatically scan photos from Google Drive folder
- **EXIF Metadata Scanning**: Extract date, time, and GPS coordinates from photos
- **AI-Powered Suggestions**: Get personalized concert recommendations based on your history
- **Concert Insights**: AI-generated analysis of your concert attendance patterns
- **Photo Starring**: Mark favorite photos for permanent S3 storage
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
2. Click "Scan Photos" button on the dashboard
3. The app will:
   - Scan your Google Drive folder for photos
   - Extract EXIF metadata (date, time, GPS)
   - Match photos to existing concerts by date and location
   - Link photos to the appropriate concerts
   - Notify you of the results

### Starring Photos

1. Navigate to a concert detail page
2. Hover over a photo in the gallery
3. Click the star icon to mark as favorite
4. Starred photos are saved to S3 storage for permanent backup

### Viewing AI Insights

The dashboard automatically displays:
- **Concert Insights**: AI-generated analysis of your attendance patterns
- **Artist Suggestions**: Personalized recommendations based on your history

## Database Schema

### Tables

- **users**: User accounts and authentication
- **artists**: Musical artists and bands
- **venues**: Concert venues with location data
- **concerts**: Concert events with weather and metadata
- **songs**: Song titles linked to artists
- **setlists**: Song order and set information for concerts
- **photos**: Photo records with EXIF data and starring status

### Key Relationships

- Each concert belongs to one user, artist, and venue
- Photos are linked to concerts and users
- Setlists connect concerts to songs
- Unique constraint on (userId, venueId, concertDate) prevents duplicates

## API Endpoints

All API endpoints are accessed via tRPC procedures:

### Concerts
- `concerts.list` - Get all user concerts
- `concerts.getById` - Get concert details with photos and setlist
- `concerts.search` - Search concerts by filters
- `concerts.create` - Create new concert

### Photos
- `photos.getByConcert` - Get photos for a concert
- `photos.toggleStar` - Star/unstar a photo
- `photos.scanFromDrive` - Trigger Google Drive scan

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

1. **Google Drive Integration**: Requires properly formatted JSON credentials
2. **Weather Data**: Uses current weather API (free tier) instead of historical data
3. **Setlist Data**: Depends on setlist.fm database completeness
4. **Photo Storage**: Only starred photos are backed up to S3

## Future Enhancements

- [ ] Scheduled background job for automatic Google Drive scanning
- [ ] Concert milestone notifications (e.g., 100th concert)
- [ ] Export concert history to PDF/CSV
- [ ] Social sharing features
- [ ] Concert statistics dashboard
- [ ] Ticket stub photo recognition
- [ ] Spotify integration for artist discovery

## Support

For issues or questions:
- Check the todo.md file for known issues
- Review test files for usage examples
- Consult the tRPC router definitions in `server/routers.ts`

## License

MIT
