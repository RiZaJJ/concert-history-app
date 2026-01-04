import { describe, it, expect } from 'vitest';
import * as db from './db';

describe('Create Concert from Photo', () => {
  const testUserId = 1;

  it('should create concert from unmatched photo data', async () => {
    // Get an unmatched photo
    const photos = await db.getUnmatchedPhotos(testUserId, 1);
    if (photos.length === 0) {
      console.log('⚠ No unmatched photos found, skipping test');
      return;
    }

    const photo = photos[0];
    console.log(`\nTesting with photo: ${photo.fileName}`);
    console.log(`Location: ${photo.city}, ${photo.country}`);
    console.log(`Date: ${photo.takenAt || photo.fileCreatedAt}`);
    console.log(`Venue: ${photo.venueName || 'Unknown'}`);

    // Create artist
    const artistName = 'Test Artist ' + Date.now();
    await db.createArtist({ name: artistName });
    const artist = await db.getArtistByName(artistName);
    expect(artist).toBeDefined();
    console.log(`✓ Created artist: ${artistName}`);

    // Create venue
    const venueName = photo.venueName || 'Test Venue';
    const city = photo.city || 'Unknown City';
    const country = photo.country || 'Unknown Country';
    
    await db.createVenue({
      name: venueName,
      city: city,
      state: photo.state || null,
      country: country,
      latitude: photo.latitude || null,
      longitude: photo.longitude || null,
    });
    const venue = await db.findVenueByNameAndCity(venueName, city);
    expect(venue).toBeDefined();
    console.log(`✓ Created venue: ${venueName} in ${city}`);

    // Create concert
    const concertDate = photo.takenAt || photo.fileCreatedAt;
    if (!concertDate) {
      console.log('⚠ No date available for concert');
      return;
    }

    const concert = await db.createConcert({
      userId: testUserId,
      artistId: artist!.id,
      venueId: venue!.id,
      concertDate: new Date(concertDate),
    });
    expect(concert).toBeDefined();
    expect(concert.id).toBeGreaterThan(0);
    console.log(`✓ Created concert: ${artistName} at ${venueName} on ${new Date(concertDate).toLocaleDateString()}`);

    // Link photo to concert
    await db.createPhoto({
      concertId: concert.id,
      userId: testUserId,
      sourceUrl: photo.sourceUrl,
      filename: photo.fileName,
      mimeType: photo.mimeType,
      takenAt: photo.takenAt || photo.fileCreatedAt,
      latitude: photo.latitude,
      longitude: photo.longitude,
    });
    console.log(`✓ Linked photo to concert`);

    // Mark photo as linked
    await db.updateUnmatchedPhotoStatus(photo.id, 'linked', concert.id);
    console.log(`✓ Marked photo as linked`);

    // Verify photo is no longer unmatched
    const updatedPhoto = await db.getUnmatchedPhotoById(photo.id);
    expect(updatedPhoto?.status).toBe('linked');
    expect(updatedPhoto?.linkedConcertId).toBe(concert.id);

    console.log('\n✓ Complete workflow: photo → concert → linked successfully!');
  });
});
