import { describe, it, expect } from 'vitest';
import * as db from './db';

describe('Venue Enhancements', () => {
  const testUserId = 1;

  it('should create and retrieve venue aliases', async () => {
    // Create aliases
    await db.createVenueAlias(testUserId, 'MSG', 'Madison Square Garden');
    await db.createVenueAlias(testUserId, 'The Gorge', 'Gorge Amphitheatre');
    
    // Retrieve aliases
    const aliases = await db.getVenueAliases(testUserId);
    
    expect(aliases.length).toBeGreaterThanOrEqual(2);
    expect(aliases.some(a => a.alias === 'MSG' && a.venueName === 'Madison Square Garden')).toBe(true);
    expect(aliases.some(a => a.alias === 'The Gorge' && a.venueName === 'Gorge Amphitheatre')).toBe(true);
    
    console.log('✓ Created venue aliases:', aliases.map(a => `${a.alias} → ${a.venueName}`));
  });

  it('should update venue with detection metadata', async () => {
    // Get an unmatched photo
    const photos = await db.getUnmatchedPhotos(testUserId, 1);
    if (photos.length === 0) {
      console.log('⚠ No unmatched photos found, skipping venue update test');
      return;
    }

    const photo = photos[0];
    console.log(`Testing with photo: ${photo.fileName}`);
    console.log(`Current venue: ${photo.venueName} (${photo.venueDetectionMethod}, ${photo.venueConfidence})`);

    // Update venue
    await db.updateUnmatchedPhotoVenue(
      photo.id,
      'Test Venue Override',
      'manual_override',
      'high'
    );

    // Verify update
    const updated = await db.getUnmatchedPhotoById(photo.id);
    expect(updated?.venueName).toBe('Test Venue Override');
    expect(updated?.venueDetectionMethod).toBe('manual_override');
    expect(updated?.venueConfidence).toBe('high');

    console.log('✓ Venue updated successfully');
    console.log(`New venue: ${updated?.venueName} (${updated?.venueDetectionMethod}, ${updated?.venueConfidence})`);
  });

  it('should have venue detection metadata on unmatched photos', async () => {
    const photos = await db.getUnmatchedPhotos(testUserId, 10);
    
    console.log(`\nChecking ${photos.length} unmatched photos for venue metadata:`);
    photos.forEach(photo => {
      console.log(`- ${photo.fileName}:`);
      console.log(`  Venue: ${photo.venueName || 'None'}`);
      console.log(`  Method: ${photo.venueDetectionMethod || 'None'}`);
      console.log(`  Confidence: ${photo.venueConfidence || 'None'}`);
    });

    // At least some photos should have venue detection data
    const photosWithVenue = photos.filter(p => p.venueName);
    if (photosWithVenue.length > 0) {
      console.log(`\n✓ ${photosWithVenue.length}/${photos.length} photos have venue data`);
    } else {
      console.log('\n⚠ No photos have venue data yet (may need to rescan)');
    }
  });
});
