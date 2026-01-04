# Concert History App - Installation Instructions

## For Another AI Platform

### Prerequisites
- Node.js 18+ and pnpm
- MySQL database
- Google Drive API credentials
- API keys: setlist.fm, OpenWeather, Visual Crossing

---

## Step 1: Extract Archive

```bash
tar -xzf concert-history-app-export.tar.gz
cd concert-history-app
```

---

## Step 2: Install Dependencies

```bash
pnpm install
```

---

## Step 3: Set Up Environment Variables

Create `.env` file in project root:

```env
# Database
DATABASE_URL=mysql://user:password@localhost:3306/concert_history

# Google Drive (service account JSON)
GOOGLE_DRIVE_CREDENTIALS={"type":"service_account","project_id":"..."}
GOOGLE_DRIVE_FOLDER_ID=your_folder_id_here

# External APIs
SETLISTFM_API_KEY=your_setlistfm_key
OPENWEATHER_API_KEY=your_openweather_key
VISUAL_CROSSING_API_KEY=your_visualcrossing_key

# Auth (if not using Manus OAuth)
JWT_SECRET=random_secure_string_here
OAUTH_SERVER_URL=https://your-oauth-server.com
VITE_APP_ID=your_app_id

# Owner info
OWNER_OPEN_ID=user_id
OWNER_NAME=User Name

# Storage (if not using Manus S3)
# Add your S3 credentials here
```

---

## Step 4: Set Up Database

```bash
# Push schema to database
pnpm db:push

# Verify schema
pnpm db:studio  # Opens Drizzle Studio at http://localhost:4983
```

---

## Step 5: Configure Google Drive Access

### Option A: Service Account (Recommended)
1. Go to Google Cloud Console
2. Create a new project
3. Enable Google Drive API
4. Create service account
5. Download JSON key
6. Share your Google Photos folder with service account email
7. Copy JSON content to `GOOGLE_DRIVE_CREDENTIALS` env var

### Option B: OAuth (More Complex)
- Requires implementing OAuth flow
- See Google Drive API documentation

---

## Step 6: Get API Keys

### setlist.fm
1. Go to https://www.setlist.fm/settings/api
2. Register for API key
3. Add to `.env` as `SETLISTFM_API_KEY`

### OpenWeather (Historical Weather)
1. Go to https://openweathermap.org/api
2. Sign up for free account
3. Get API key
4. Add to `.env` as `OPENWEATHER_API_KEY`

### Visual Crossing (Alternative Weather)
1. Go to https://www.visualcrossing.com/
2. Sign up for free account
3. Get API key
4. Add to `.env` as `VISUAL_CROSSING_API_KEY`

---

## Step 7: Start Development Server

```bash
pnpm dev
```

Server starts at http://localhost:3000

---

## Step 8: Test Basic Functionality

1. Open http://localhost:3000
2. Log in (or create test user in database)
3. Click "Scan Photos"
4. Should process 5 photos and show summary

---

## Troubleshooting

### "Database not available"
- Check `DATABASE_URL` is correct
- Verify MySQL is running
- Run `pnpm db:push` to create tables

### "Google Drive credentials invalid"
- Verify JSON format in `GOOGLE_DRIVE_CREDENTIALS`
- Check service account has access to folder
- Verify `GOOGLE_DRIVE_FOLDER_ID` is correct

### "No photos found"
- Check folder ID is correct
- Verify folder contains photos
- Check service account permissions

### "Setlist.fm API error"
- Verify API key is valid
- Check rate limits (5000 requests/day)
- Ensure photos have GPS coordinates

---

## Production Deployment

### Database
- Use managed MySQL (AWS RDS, PlanetScale, etc.)
- Enable SSL connections
- Set up backups

### Environment
- Use proper secret management (not .env file)
- Enable HTTPS
- Set up monitoring/logging

### Performance
- Consider CDN for photo serving
- Cache API responses
- Use Redis for session storage

---

## Differences from Manus Platform

When running outside Manus:

1. **No automatic secret injection** - must configure all env vars manually
2. **No built-in OAuth** - need to implement your own auth or use Manus OAuth
3. **No S3 integration** - need to configure your own storage
4. **No automatic deployments** - need to set up CI/CD

---

## Quick Verification

Run these commands to verify setup:

```bash
# Check dependencies
pnpm list

# Check database connection
pnpm db:studio

# Run tests
pnpm test

# Build for production
pnpm build

# Type check
pnpm exec tsc --noEmit
```

---

## Need Help?

1. Read `AI_HANDOFF.md` for comprehensive documentation
2. Read `QUICK_START_FOR_AI.md` for common tasks
3. Check `todo.md` for known issues
4. Review server logs for errors

---

## Architecture Overview

```
┌─────────────────┐
│  Google Drive   │ ← Photos with EXIF/GPS
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  Photo Scanner  │ ← server/photoIngestion.ts
└────────┬────────┘
         │
         ├─→ Overpass API (venue geocoding)
         ├─→ setlist.fm API (concert matching)
         └─→ Weather API (historical weather)
         │
         ↓
┌─────────────────┐
│  MySQL Database │ ← concerts, artists, venues, photos
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  tRPC API       │ ← server/routers.ts
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  React Frontend │ ← client/src/
└─────────────────┘
```

---

## File Structure

```
concert-history-app/
├── server/              ← Backend
│   ├── photoIngestion.ts   ← Core logic
│   ├── routers.ts          ← API endpoints
│   ├── db.ts               ← Database ops
│   ├── integrations.ts     ← External APIs
│   └── concertgeocoder.ts  ← Venue geocoding
├── client/              ← Frontend
│   └── src/
│       ├── pages/          ← UI pages
│       └── components/     ← UI components
├── drizzle/             ← Database
│   └── schema.ts           ← Schema definition
└── shared/              ← Shared types
```

---

## Success Criteria

✅ Server starts without errors
✅ Database tables created
✅ Can log in to app
✅ "Scan Photos" processes photos
✅ Concerts appear on dashboard
✅ Can view concert details
✅ Photos display correctly

---

## Next Steps After Installation

1. Run initial scan to test functionality
2. Review `todo.md` for current priorities
3. Implement auto-scan feature (most requested)
4. Add merge duplicates tool
5. Improve venue geocoding accuracy

Good luck! 🎉
