# Phase 3: Mobile App Development (iOS & Android)

## Executive Summary

Build native mobile apps for iOS and Android with deep integration into device photo libraries, offline-first architecture, and seamless sync with the web platform.

**Timeline**: 8-10 weeks
**Priority**: HIGH - Key differentiator from competitors
**Dependencies**: Phase 2 Scalability must be complete (API ready for mobile load)

---

## Strategic Goals

### Primary Objectives
1. **Photo Library Integration**: Access user's entire photo library (10,000+ photos)
2. **Offline-First**: Work without internet, sync when available
3. **Background Processing**: Scan photos while app is closed
4. **Native Performance**: 60 FPS UI, instant photo loading
5. **Cross-Platform Parity**: Feature parity between iOS, Android, and web

### Success Criteria
- Import 1000+ photos in < 5 minutes
- Offline mode works for all core features
- App size < 50MB
- 4.5+ star rating on both app stores
- 50% of web users also use mobile app

---

## Technology Stack Decision

### Option 1: React Native (RECOMMENDED)
**Pros**:
- Share 80% of code between iOS/Android
- Reuse existing TypeScript/React knowledge
- Share business logic with web app
- Faster development (4-6 weeks vs 8-10 weeks)
- Hot reload for development
- Large ecosystem (Expo, React Navigation)

**Cons**:
- Slightly worse performance than native
- Larger app size (~30MB vs ~15MB native)
- Some native modules needed for photo library

**Cost**: Free (open source)

### Option 2: Native Development (Swift + Kotlin)
**Pros**:
- Best possible performance
- Full access to platform APIs
- Smaller app size
- No bridge overhead

**Cons**:
- Build everything twice (iOS + Android)
- 2x development time
- Need two separate codebases
- Harder to keep in sync with web

**Cost**: Free (but 2x developer time)

### Option 3: Flutter
**Pros**:
- Single codebase for iOS/Android
- Great performance (compiles to native)
- Beautiful UI out of the box

**Cons**:
- New language (Dart) to learn
- Can't share code with web app (TypeScript)
- Smaller ecosystem than React Native

**Cost**: Free (open source)

### DECISION: React Native with Expo
**Rationale**:
- Fastest time to market (4-6 weeks)
- Share tRPC client and business logic with web
- Good enough performance for this use case
- Expo makes photo library integration easier
- Can eject to bare React Native if needed

---

## Architecture

### High-Level Architecture
```
┌─────────────────────────────────────┐
│         Mobile App (React Native)   │
│                                     │
│  ┌──────────┐      ┌──────────┐   │
│  │   UI     │      │  Native  │   │
│  │ (React)  │◄────►│ Modules  │   │
│  └──────────┘      └──────────┘   │
│       ▲                 ▲          │
│       │                 │          │
│  ┌────┴─────────────────┴─────┐   │
│  │   State Management (Zustand)│   │
│  └────┬─────────────────┬─────┘   │
│       │                 │          │
│  ┌────▼──────┐     ┌───▼─────┐   │
│  │   tRPC    │     │  Local  │   │
│  │  Client   │     │   DB    │   │
│  └────┬──────┘     │(SQLite) │   │
│       │            └───┬─────┘   │
│       │                │          │
└───────┼────────────────┼──────────┘
        │                │
        ▼                ▼
   API Server      Local Storage
   (Phase 2)       (Offline Data)
```

### Core Components

#### 1. Photo Library Access
**iOS**: Photos framework (PHAsset)
**Android**: MediaStore API

```typescript
// src/native/PhotoLibrary.ts
import * as MediaLibrary from 'expo-media-library';
import * as Location from 'expo-location';

export class PhotoLibrary {
  async requestPermissions(): Promise<boolean> {
    const { status: mediaStatus } = await MediaLibrary.requestPermissionsAsync();
    const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();

    return mediaStatus === 'granted' && locationStatus === 'granted';
  }

  async getAllPhotos(limit: number = 1000): Promise<Photo[]> {
    const { assets } = await MediaLibrary.getAssetsAsync({
      mediaType: 'photo',
      first: limit,
      sortBy: MediaLibrary.SortBy.creationTime,
    });

    const photos = await Promise.all(
      assets.map(async (asset) => {
        const exif = await MediaLibrary.getAssetInfoAsync(asset);

        return {
          id: asset.id,
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          creationTime: asset.creationTime,
          location: exif.location, // GPS coordinates
          exif: exif.exif, // Full EXIF data
        };
      })
    );

    return photos;
  }

  async getPhotosSince(timestamp: number): Promise<Photo[]> {
    // Only sync photos added since last sync
    const { assets } = await MediaLibrary.getAssetsAsync({
      mediaType: 'photo',
      createdAfter: timestamp,
      sortBy: MediaLibrary.SortBy.creationTime,
    });

    return this.processAssets(assets);
  }
}
```

**Permissions Required**:
- iOS: `NSPhotoLibraryUsageDescription`, `NSLocationWhenInUseUsageDescription`
- Android: `READ_EXTERNAL_STORAGE`, `ACCESS_FINE_LOCATION`

#### 2. Offline-First Database (WatermelonDB)
**Why WatermelonDB**: Built for React Native, sync primitives, great performance

```typescript
// src/db/schema.ts
import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'concerts',
      columns: [
        { name: 'artist_name', type: 'string' },
        { name: 'venue_name', type: 'string' },
        { name: 'concert_date', type: 'number' }, // timestamp
        { name: 'city', type: 'string' },
        { name: 'state', type: 'string', isOptional: true },
        { name: 'country', type: 'string' },
        { name: 'latitude', type: 'number', isOptional: true },
        { name: 'longitude', type: 'number', isOptional: true },
        { name: 'synced', type: 'boolean' },
        { name: 'server_id', type: 'number', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'photos',
      columns: [
        { name: 'local_uri', type: 'string' },
        { name: 'concert_id', type: 'string', isIndexed: true },
        { name: 'taken_at', type: 'number' },
        { name: 'latitude', type: 'number', isOptional: true },
        { name: 'longitude', type: 'number', isOptional: true },
        { name: 'starred', type: 'boolean' },
        { name: 'synced', type: 'boolean' },
        { name: 'server_id', type: 'number', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'sync_queue',
      columns: [
        { name: 'operation', type: 'string' }, // 'create', 'update', 'delete'
        { name: 'table', type: 'string' },
        { name: 'record_id', type: 'string' },
        { name: 'payload', type: 'string' }, // JSON
        { name: 'attempts', type: 'number' },
        { name: 'created_at', type: 'number' },
      ],
    }),
  ],
});

// src/db/models/Concert.ts
import { Model } from '@nozbe/watermelondb';
import { field, relation, readonly, date } from '@nozbe/watermelondb/decorators';

export class Concert extends Model {
  static table = 'concerts';
  static associations = {
    photos: { type: 'has_many', foreignKey: 'concert_id' },
  };

  @field('artist_name') artistName!: string;
  @field('venue_name') venueName!: string;
  @date('concert_date') concertDate!: Date;
  @field('city') city!: string;
  @field('synced') synced!: boolean;
  @field('server_id') serverId?: number;

  @readonly @date('updated_at') updatedAt!: Date;
}
```

#### 3. Background Sync Service
```typescript
// src/sync/BackgroundSync.ts
import BackgroundFetch from 'react-native-background-fetch';
import { syncManager } from './SyncManager';

export class BackgroundSync {
  static async configure() {
    await BackgroundFetch.configure(
      {
        minimumFetchInterval: 15, // 15 minutes
        stopOnTerminate: false,
        enableHeadless: true,
        startOnBoot: true,
      },
      async (taskId) => {
        console.log('[BackgroundSync] Running background sync...');

        try {
          await syncManager.syncAll();
          BackgroundFetch.finish(taskId);
        } catch (error) {
          console.error('[BackgroundSync] Sync failed:', error);
          BackgroundFetch.finish(taskId);
        }
      },
      (taskId) => {
        console.warn('[BackgroundSync] Task timeout:', taskId);
        BackgroundFetch.finish(taskId);
      }
    );

    // Schedule initial sync
    await BackgroundFetch.scheduleTask({
      taskId: 'com.concerthistory.sync',
      delay: 5000, // 5 seconds
      periodic: true,
      forceAlarmManager: true,
    });
  }

  static async syncNow() {
    await syncManager.syncAll();
  }
}
```

#### 4. Sync Manager (Conflict Resolution)
```typescript
// src/sync/SyncManager.ts
import { database } from '../db';
import { trpc } from '../api/trpc';

export class SyncManager {
  private isSyncing = false;
  private lastSyncTime = 0;

  async syncAll() {
    if (this.isSyncing) {
      console.log('[Sync] Already syncing, skipping');
      return;
    }

    this.isSyncing = true;

    try {
      // 1. Push local changes to server
      await this.pushChanges();

      // 2. Pull server changes to local
      await this.pullChanges();

      // 3. Sync photos (upload starred photos)
      await this.syncPhotos();

      this.lastSyncTime = Date.now();
      console.log('[Sync] Sync complete');
    } catch (error) {
      console.error('[Sync] Sync failed:', error);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  async pushChanges() {
    const queue = await database.get('sync_queue').query().fetch();

    for (const item of queue) {
      try {
        const payload = JSON.parse(item.payload);

        switch (item.table) {
          case 'concerts':
            if (item.operation === 'create') {
              const result = await trpc.concerts.create.mutate(payload);

              // Update local record with server ID
              await database.write(async () => {
                const concert = await database.get('concerts').find(item.recordId);
                await concert.update((c) => {
                  c.serverId = result.id;
                  c.synced = true;
                });
              });
            }
            break;

          case 'photos':
            if (item.operation === 'update' && payload.starred) {
              // Upload starred photo to S3
              await this.uploadPhoto(item.recordId);
            }
            break;
        }

        // Remove from queue
        await database.write(async () => {
          await item.destroyPermanently();
        });
      } catch (error) {
        console.error(`[Sync] Failed to sync ${item.table}:${item.operation}`, error);

        // Increment attempt count
        await database.write(async () => {
          await item.update((i) => {
            i.attempts += 1;
          });
        });

        // Give up after 5 attempts
        if (item.attempts >= 5) {
          console.error('[Sync] Giving up on sync item:', item);
          await database.write(async () => {
            await item.destroyPermanently();
          });
        }
      }
    }
  }

  async pullChanges() {
    // Get all concerts updated since last sync
    const serverConcerts = await trpc.concerts.getUpdatedSince.query({
      timestamp: this.lastSyncTime,
    });

    await database.write(async () => {
      for (const concert of serverConcerts) {
        // Check if we have this concert locally
        const existing = await database
          .get('concerts')
          .query(Q.where('server_id', concert.id))
          .fetch();

        if (existing.length > 0) {
          // Update existing
          await existing[0].update((c) => {
            c.artistName = concert.artist.name;
            c.venueName = concert.venue.name;
            c.concertDate = new Date(concert.concertDate);
            c.synced = true;
          });
        } else {
          // Create new
          await database.get('concerts').create((c) => {
            c.serverId = concert.id;
            c.artistName = concert.artist.name;
            c.venueName = concert.venue.name;
            c.concertDate = new Date(concert.concertDate);
            c.city = concert.venue.city;
            c.synced = true;
          });
        }
      }
    });
  }

  async uploadPhoto(localId: string) {
    const photo = await database.get('photos').find(localId);

    // Get pre-signed S3 URL from server
    const { uploadUrl, s3Key } = await trpc.photos.getUploadUrl.mutate({
      filename: `${localId}.jpg`,
    });

    // Read photo file
    const file = await FileSystem.readAsStringAsync(photo.localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Upload to S3
    await fetch(uploadUrl, {
      method: 'PUT',
      body: Buffer.from(file, 'base64'),
      headers: {
        'Content-Type': 'image/jpeg',
      },
    });

    // Update server with S3 key
    await trpc.photos.markUploaded.mutate({
      photoId: photo.serverId!,
      s3Key,
    });

    // Mark as synced locally
    await database.write(async () => {
      await photo.update((p) => {
        p.synced = true;
      });
    });
  }
}

export const syncManager = new SyncManager();
```

#### 5. Photo Scanning Service (Background Task)
```typescript
// src/services/PhotoScanner.ts
import * as TaskManager from 'expo-task-manager';
import { PhotoLibrary } from '../native/PhotoLibrary';
import { database } from '../db';
import { concertMatcher } from './ConcertMatcher';

const PHOTO_SCAN_TASK = 'photo-scan-background';

export class PhotoScanner {
  static async startBackgroundScan() {
    // Register background task
    await TaskManager.defineTask(PHOTO_SCAN_TASK, async () => {
      try {
        console.log('[PhotoScanner] Running background scan...');

        const photoLib = new PhotoLibrary();
        const lastSyncTime = await this.getLastScanTime();

        // Get new photos since last scan
        const newPhotos = await photoLib.getPhotosSince(lastSyncTime);
        console.log(`[PhotoScanner] Found ${newPhotos.length} new photos`);

        // Match each photo to concerts
        for (const photo of newPhotos) {
          const concert = await concertMatcher.findConcert(
            photo.creationTime,
            photo.location?.latitude,
            photo.location?.longitude
          );

          await database.write(async () => {
            await database.get('photos').create((p) => {
              p.localUri = photo.uri;
              p.takenAt = new Date(photo.creationTime);
              p.latitude = photo.location?.latitude;
              p.longitude = photo.location?.longitude;
              p.concertId = concert?.id;
              p.synced = false;
            });
          });
        }

        await this.setLastScanTime(Date.now());

        return BackgroundFetch.Result.NewData;
      } catch (error) {
        console.error('[PhotoScanner] Background scan failed:', error);
        return BackgroundFetch.Result.Failed;
      }
    });

    // Schedule task
    await BackgroundFetch.registerTaskAsync(PHOTO_SCAN_TASK, {
      minimumInterval: 60 * 60, // 1 hour
      stopOnTerminate: false,
      startOnBoot: true,
    });
  }

  static async scanNow(onProgress?: (progress: number) => void) {
    const photoLib = new PhotoLibrary();
    const allPhotos = await photoLib.getAllPhotos(10000);

    for (let i = 0; i < allPhotos.length; i++) {
      const photo = allPhotos[i];

      const concert = await concertMatcher.findConcert(
        photo.creationTime,
        photo.location?.latitude,
        photo.location?.longitude
      );

      await database.write(async () => {
        await database.get('photos').create((p) => {
          p.localUri = photo.uri;
          p.takenAt = new Date(photo.creationTime);
          p.latitude = photo.location?.latitude;
          p.longitude = photo.location?.longitude;
          p.concertId = concert?.id;
          p.synced = false;
        });
      });

      if (onProgress) {
        onProgress((i + 1) / allPhotos.length * 100);
      }
    }
  }

  private static async getLastScanTime(): Promise<number> {
    // Get from AsyncStorage
    const lastScan = await AsyncStorage.getItem('last_photo_scan');
    return lastScan ? parseInt(lastScan) : 0;
  }

  private static async setLastScanTime(timestamp: number) {
    await AsyncStorage.setItem('last_photo_scan', timestamp.toString());
  }
}
```

---

## Feature Breakdown

### Phase 3A: Core Features (Weeks 1-4)

#### Week 1: Project Setup & Photo Library
- [ ] Initialize Expo project with TypeScript
- [ ] Set up React Navigation
- [ ] Configure photo library permissions (iOS/Android)
- [ ] Build photo grid UI (FlashList for performance)
- [ ] Implement photo import (1000 photos in <30 seconds)

#### Week 2: Offline Database & Sync
- [ ] Set up WatermelonDB with schema
- [ ] Implement sync queue
- [ ] Build conflict resolution logic
- [ ] Create sync UI (progress indicator)
- [ ] Test offline mode thoroughly

#### Week 3: Concert Matching
- [ ] Port concert matching logic from web (tRPC client)
- [ ] Implement local venue detection (GPS → OSM)
- [ ] Build unmatched photo review screen
- [ ] Add manual linking UI
- [ ] Test matching accuracy (>80% auto-match rate)

#### Week 4: Authentication & Core UI
- [ ] Implement Manus OAuth (deep linking)
- [ ] Build dashboard with concert cards
- [ ] Create concert detail screen
- [ ] Add photo starring functionality
- [ ] Implement search & filters

**Deliverable**: MVP app with photo import, offline mode, and concert matching

### Phase 3B: Advanced Features (Weeks 5-6)

#### Week 5: Background Processing
- [ ] Implement background photo scanning
- [ ] Set up push notifications
- [ ] Add background sync
- [ ] Build notification settings
- [ ] Test battery usage (<5% drain per day)

#### Week 6: Performance & Polish
- [ ] Optimize photo loading (progressive JPEG, blur-up)
- [ ] Add image caching (react-native-fast-image)
- [ ] Implement pull-to-refresh
- [ ] Add skeleton loaders
- [ ] Smooth animations (Reanimated 3)

**Deliverable**: Production-ready app with background processing

### Phase 3C: App Store Submission (Weeks 7-8)

#### Week 7: iOS App Store
- [ ] Create app icon and screenshots
- [ ] Write App Store description
- [ ] Record demo video
- [ ] Submit to TestFlight
- [ ] Beta testing (10 users)

#### Week 8: Android Play Store
- [ ] Create Play Store assets
- [ ] Generate signed APK/AAB
- [ ] Submit to internal testing
- [ ] Beta testing (10 users)
- [ ] Address any store feedback

**Deliverable**: Apps live on both stores

---

## UI/UX Design

### Navigation Structure
```
Tab Bar Navigator
├── Home (Dashboard)
│   ├── Concert List (grouped by year)
│   ├── Search Bar
│   └── Quick Stats
├── Photos
│   ├── All Photos Grid
│   ├── Unmatched Photos
│   └── Starred Photos
├── Scan
│   ├── Import from Library
│   ├── Scan Progress
│   └── Review Matches
└── Profile
    ├── Settings
    ├── Sync Status
    └── About
```

### Key Screens

#### 1. Dashboard
```
┌─────────────────────────────────┐
│ ◀ Concert History        ⚙️ 🔍  │
├─────────────────────────────────┤
│                                 │
│ 📊 Quick Stats                  │
│ ┌─────┬─────┬─────┐            │
│ │ 127 │ 1.2K│  45 │            │
│ │Shows│Photos│Stars│            │
│ └─────┴─────┴─────┘            │
│                                 │
│ 🎵 Recent Concerts              │
│                                 │
│ ┌───────────────────────────┐  │
│ │ 📅 Dec 15, 2024          │  │
│ │ 🎤 Phish                  │  │
│ │ 📍 Madison Square Garden  │  │
│ │ 📸 23 photos  ⭐ 5        │  │
│ └───────────────────────────┘  │
│                                 │
│ ┌───────────────────────────┐  │
│ │ 📅 Nov 28, 2024          │  │
│ │ 🎤 Dead & Company         │  │
│ │ 📍 Sphere Las Vegas       │  │
│ │ 📸 47 photos  ⭐ 12       │  │
│ └───────────────────────────┘  │
│                                 │
│ [Import Photos from Library]    │
│                                 │
└─────────────────────────────────┘
```

#### 2. Photo Grid
```
┌─────────────────────────────────┐
│ ◀ All Photos            Filter  │
├─────────────────────────────────┤
│ ┌─────┬─────┬─────┬─────┐      │
│ │ 🖼️  │ 🖼️  │ 🖼️  │ 🖼️  │      │
│ └─────┴─────┴─────┴─────┘      │
│ ┌─────┬─────┬─────┬─────┐      │
│ │ 🖼️  │ 🖼️  │ 🖼️⭐ │ 🖼️  │      │
│ └─────┴─────┴─────┴─────┘      │
│ ┌─────┬─────┬─────┬─────┐      │
│ │ 🖼️  │ 🖼️  │ 🖼️  │ 🖼️⭐ │      │
│ └─────┴─────┴─────┴─────┘      │
│                                 │
│ Tap to view • Long press to ⭐  │
└─────────────────────────────────┘
```

#### 3. Photo Scan Progress
```
┌─────────────────────────────────┐
│ ◀ Scanning Photos               │
├─────────────────────────────────┤
│                                 │
│     🔄 Scanning...              │
│                                 │
│ ████████████░░░░░░░░░  65%      │
│                                 │
│ 📸 653 / 1,000 photos           │
│ ✓ 521 matched                   │
│ ⚠️ 132 need review              │
│                                 │
│ Current:                        │
│ IMG_5847.JPG                    │
│ Phish @ Sphere Las Vegas        │
│ Apr 19, 2024                    │
│                                 │
│ [Pause Scan]                    │
│                                 │
│ ⏱️ Est. time remaining: 2 min    │
└─────────────────────────────────┘
```

#### 4. Unmatched Photo Review
```
┌─────────────────────────────────┐
│ ◀ Review Photo     Skip    1/45 │
├─────────────────────────────────┤
│                                 │
│        ┌─────────────┐          │
│        │             │          │
│        │   Photo     │          │
│        │             │          │
│        └─────────────┘          │
│                                 │
│ 📅 Apr 19, 2024  9:47 PM        │
│ 📍 Las Vegas, NV                │
│                                 │
│ 🎤 Search by Artist             │
│ ┌─────────────────────────┐    │
│ │ Phish           [Search]│    │
│ └─────────────────────────┘    │
│                                 │
│ 📍 Nearby Venues                │
│ ┌─────────────────────────┐    │
│ │ ▼ Sphere (0.1 mi)       │    │
│ │   Venetian Theatre      │    │
│ │   T-Mobile Arena        │    │
│ └─────────────────────────┘    │
│                                 │
│ [Create Concert from Photo]     │
│ [Link to Existing Concert]      │
│                                 │
└─────────────────────────────────┘
```

---

## Performance Optimizations

### 1. Photo Loading Strategy
```typescript
// Use progressive JPEG with blur-up effect
import FastImage from 'react-native-fast-image';

<FastImage
  source={{ uri: photo.uri, priority: FastImage.priority.normal }}
  style={{ width: 100, height: 100 }}
  resizeMode={FastImage.resizeMode.cover}
/>

// Implement photo caching
FastImage.preload([
  { uri: photo1.uri },
  { uri: photo2.uri },
  { uri: photo3.uri },
]);
```

### 2. List Virtualization
```typescript
// Use FlashList instead of FlatList (10x faster)
import { FlashList } from '@shopify/flash-list';

<FlashList
  data={photos}
  renderItem={({ item }) => <PhotoCard photo={item} />}
  estimatedItemSize={100}
  numColumns={4}
  // Only renders visible items + small buffer
/>
```

### 3. Database Query Optimization
```typescript
// Use lazy query with pagination
const photos = await database
  .get('photos')
  .query(
    Q.where('concert_id', concertId),
    Q.sortBy('taken_at', Q.desc),
    Q.take(50) // Only load 50 at a time
  )
  .fetch();

// Eager load relationships
const concerts = await database
  .get('concerts')
  .query(
    Q.where('synced', true)
  )
  .extend(Q.on('photos', Q.where('starred', true)))
  .fetch();
```

### 4. Image Compression
```typescript
// Compress images before upload to S3
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

const compressedImage = await manipulateAsync(
  photo.uri,
  [{ resize: { width: 1920 } }], // Max width 1920px
  { compress: 0.8, format: SaveFormat.JPEG }
);
```

---

## Testing Strategy

### Unit Tests (Jest)
```bash
# Test coverage target: 80%
npm run test

# Example test
describe('ConcertMatcher', () => {
  it('should match photo to concert by GPS', async () => {
    const concert = await concertMatcher.findConcert(
      new Date('2024-04-19T21:47:00Z'),
      36.1215, // Sphere latitude
      -115.1691 // Sphere longitude
    );

    expect(concert.artistName).toBe('Phish');
    expect(concert.venueName).toContain('Sphere');
  });
});
```

### Integration Tests (Detox)
```typescript
// E2E test
describe('Photo Import Flow', () => {
  it('should import photos and match to concerts', async () => {
    await element(by.id('import-photos-btn')).tap();
    await element(by.id('grant-permission-btn')).tap();

    // Wait for scan to complete
    await waitFor(element(by.id('scan-complete')))
      .toBeVisible()
      .withTimeout(60000);

    // Verify concert was created
    await element(by.id('dashboard-tab')).tap();
    await expect(element(by.text('Phish'))).toBeVisible();
  });
});
```

### Performance Tests
- App launch time: < 2 seconds
- Photo grid scroll: 60 FPS
- Import 1000 photos: < 5 minutes
- Sync time: < 30 seconds
- Memory usage: < 150MB

---

## App Store Requirements

### iOS App Store
**Required**:
- App icon (1024x1024)
- 5.5" and 6.5" screenshots
- Privacy policy URL
- Support URL
- App description (< 4000 chars)
- Keywords (< 100 chars)
- Age rating (4+)

**App Icon**:
```
🎵 Concert History
(Musical note + camera icon)
Colors: Purple gradient (#8B5CF6 → #6366F1)
```

**Screenshots** (5.5" iPhone):
1. Dashboard with concert cards
2. Photo grid with starred photos
3. Concert detail with setlist
4. Unmatched photo review
5. Scan progress screen

**Description**:
```
Track every concert you've attended with automatic photo organization.

✨ KEY FEATURES:
• Automatic concert detection from photo GPS + date
• Link photos to concerts instantly
• View setlists from setlist.fm
• Star your favorite moments
• Offline-first: works without internet
• Background photo scanning

🎵 NEVER FORGET A SHOW:
Concert History automatically matches your concert photos to artist, venue, and date using GPS coordinates and setlist.fm data.

📸 SMART PHOTO ORGANIZATION:
- Import from photo library
- Auto-match to concerts
- Manual review for edge cases
- Star favorites for quick access

🎸 CONCERT INSIGHTS:
- Track artists you've seen
- Count shows per venue
- Browse by year
- Search everything

Perfect for music lovers, festival goers, and anyone who wants to remember every show!
```

**Keywords**:
```
concert, music, photos, setlist, live music, festival, tour, gig, show, organize
```

### Android Play Store
**Required**:
- App icon (512x512)
- Feature graphic (1024x500)
- Screenshots (phone + tablet)
- Privacy policy
- Content rating questionnaire
- Short description (< 80 chars)
- Full description (< 4000 chars)

**Feature Graphic**:
```
┌────────────────────────────────────────┐
│  🎵 Concert History                    │
│  Automatically organize your concert   │
│  photos by artist, venue, and date     │
│                                        │
│  [Screenshot collage]                  │
└────────────────────────────────────────┘
```

---

## Deployment

### iOS Deployment (TestFlight)
```bash
# 1. Build for iOS
eas build --platform ios --profile production

# 2. Submit to TestFlight
eas submit --platform ios --latest

# 3. Add beta testers in App Store Connect
# 4. Send invites via email
```

### Android Deployment (Play Store)
```bash
# 1. Build AAB
eas build --platform android --profile production

# 2. Submit to Play Store
eas submit --platform android --latest

# 3. Create internal testing track
# 4. Promote to beta → production
```

### Over-The-Air Updates (Expo Updates)
```bash
# Push update without app store review
eas update --branch production --message "Fix concert matching bug"

# Users get update on next app launch
```

**Benefits**:
- Fix bugs in hours (not weeks)
- No app store review delay
- Gradual rollout possible

---

## Cost Analysis

### Development Costs
| Item | Cost |
|------|------|
| Expo EAS Build (500 builds/month) | $99/month |
| Apple Developer Account | $99/year |
| Google Play Developer Account | $25 one-time |
| TestFlight beta testing | Free |
| Expo Updates (OTA) | Free |
| **Total First Year** | **$1,312** |

### Ongoing Costs (Monthly)
| Item | Cost |
|------|------|
| Expo EAS Build | $99 |
| Apple Developer (amortized) | $8 |
| Push notifications (FCM/APNs) | $0 |
| **Total Monthly** | **$107** |

---

## Success Metrics

### Technical Metrics
- [ ] App size < 50MB
- [ ] Launch time < 2 seconds
- [ ] Photo import: 1000 photos in < 5 minutes
- [ ] Crash-free rate > 99.5%
- [ ] 60 FPS scroll performance

### User Metrics
- [ ] 4.5+ star rating on both stores
- [ ] 50% of web users also use mobile
- [ ] 80%+ photo auto-match rate
- [ ] < 5% uninstall rate
- [ ] 70%+ daily active users (of installed base)

### Business Metrics
- [ ] 10,000 downloads in first month
- [ ] 50% conversion to paid tier
- [ ] < $0.10 cost per install (if paid ads)
- [ ] 6 month retention > 40%

---

## Risk Mitigation

### High Risk Items
1. **Photo library permissions rejected**
   - Mitigation: Clear privacy policy, explain why in permission prompt
   - Fallback: Manual photo upload

2. **Background scanning drains battery**
   - Mitigation: Strict limits (1 scan/hour max), user controls
   - Fallback: Disable background, manual scan only

3. **Sync conflicts lose data**
   - Mitigation: Conflict resolution UI, never auto-delete
   - Fallback: Export to JSON before sync

### Medium Risk Items
1. **App store rejection**
   - Mitigation: Follow guidelines strictly, pre-submit checklist
   - Fallback: Resubmit with fixes (usually 2-3 day delay)

2. **Performance issues on old devices**
   - Mitigation: Test on iPhone 8, Galaxy S9
   - Fallback: Reduce photo batch size, disable animations

---

## Timeline Summary

| Week | Phase | Deliverable |
|------|-------|-------------|
| 1 | Setup + Photo Library | Photo import working |
| 2 | Offline DB + Sync | Offline mode functional |
| 3 | Concert Matching | Auto-matching works |
| 4 | Auth + Core UI | MVP complete |
| 5 | Background Processing | Background scan works |
| 6 | Performance + Polish | Production-ready |
| 7 | iOS Submission | TestFlight live |
| 8 | Android Submission | Play Store live |

**Total**: 8 weeks (2 months)

---

## Next Steps After Phase 3

Once mobile apps are live:

1. **User Feedback Loop**: Monitor app store reviews, in-app feedback
2. **Analytics**: Track feature usage, identify drop-off points
3. **Iteration**: Weekly releases with improvements
4. **Marketing**: App Store Optimization (ASO), social media
5. **Phase 4**: Advanced features (AR concert memories, social sharing)

This phase is the KEY DIFFERENTIATOR - no other concert tracking app has native photo library integration with offline-first architecture.
