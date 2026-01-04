import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

// Mock axios
vi.mock('axios');

describe('OSM Venue Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findOSMVenues', () => {
    it('should query Overpass API with correct parameters', async () => {
      const { findOSMVenues } = await import('./osmVenueDetection');
      
      const mockResponse = {
        data: {
          elements: [
            {
              type: 'node',
              id: 123,
              lat: 47.6062,
              lon: -122.3321,
              tags: {
                name: 'The Crocodile',
                amenity: 'nightclub',
              },
            },
          ],
        },
      };

      vi.mocked(axios.post).mockResolvedValue(mockResponse);

      const venues = await findOSMVenues('47.6062', '-122.3321', 100);

      expect(axios.post).toHaveBeenCalledWith(
        'https://overpass-api.de/api/interpreter',
        expect.stringContaining('around:100'),
        expect.objectContaining({
          headers: { 'Content-Type': 'text/plain' },
        })
      );

      expect(venues).toHaveLength(1);
      expect(venues[0].name).toBe('The Crocodile');
      expect(venues[0].matchedTag).toBe('amenity=nightclub');
    });

    it('should filter out unnamed venues', async () => {
      const { findOSMVenues } = await import('./osmVenueDetection');
      
      const mockResponse = {
        data: {
          elements: [
            {
              type: 'node',
              id: 123,
              lat: 47.6062,
              lon: -122.3321,
              tags: {
                amenity: 'nightclub',
                // No name field
              },
            },
          ],
        },
      };

      vi.mocked(axios.post).mockResolvedValue(mockResponse);

      const venues = await findOSMVenues('47.6062', '-122.3321', 100);

      expect(venues).toHaveLength(0);
    });

    it('should handle multiple venue types', async () => {
      const { findOSMVenues } = await import('./osmVenueDetection');
      
      const mockResponse = {
        data: {
          elements: [
            {
              type: 'node',
              id: 1,
              lat: 47.6062,
              lon: -122.3321,
              tags: { name: 'Showbox', amenity: 'nightclub' },
            },
            {
              type: 'way',
              id: 2,
              center: { lat: 47.6063, lon: -122.3322 },
              tags: { name: 'Paramount Theatre', amenity: 'theater' },
            },
            {
              type: 'node',
              id: 3,
              lat: 47.6064,
              lon: -122.3323,
              tags: { name: 'Gas Works Park', leisure: 'park' },
            },
          ],
        },
      };

      vi.mocked(axios.post).mockResolvedValue(mockResponse);

      const venues = await findOSMVenues('47.6062', '-122.3321', 100);

      expect(venues).toHaveLength(3);
      expect(venues[0].matchedTag).toBe('amenity=nightclub');
      expect(venues[1].matchedTag).toBe('amenity=theater');
      expect(venues[2].matchedTag).toBe('leisure=park');
    });

    it('should sort venues by distance', async () => {
      const { findOSMVenues } = await import('./osmVenueDetection');
      
      const mockResponse = {
        data: {
          elements: [
            {
              type: 'node',
              id: 1,
              lat: 47.6100, // Far
              lon: -122.3400,
              tags: { name: 'Far Venue', amenity: 'nightclub' },
            },
            {
              type: 'node',
              id: 2,
              lat: 47.6062, // Close
              lon: -122.3321,
              tags: { name: 'Close Venue', amenity: 'theater' },
            },
          ],
        },
      };

      vi.mocked(axios.post).mockResolvedValue(mockResponse);

      const venues = await findOSMVenues('47.6062', '-122.3321', 500);

      expect(venues[0].name).toBe('Close Venue');
      expect(venues[1].name).toBe('Far Venue');
      expect(venues[0].distance).toBeLessThan(venues[1].distance);
    });

    it('should return empty array on API error', async () => {
      const { findOSMVenues } = await import('./osmVenueDetection');
      
      vi.mocked(axios.post).mockRejectedValue(new Error('API error'));

      const venues = await findOSMVenues('47.6062', '-122.3321', 100);

      expect(venues).toEqual([]);
    });
  });

  describe('findBestOSMVenue', () => {
    it('should return the closest venue', async () => {
      const { findBestOSMVenue } = await import('./osmVenueDetection');
      
      const mockResponse = {
        data: {
          elements: [
            {
              type: 'node',
              id: 1,
              lat: 47.6062,
              lon: -122.3321,
              tags: { name: 'The Crocodile', amenity: 'nightclub' },
            },
          ],
        },
      };

      vi.mocked(axios.post).mockResolvedValue(mockResponse);

      const venue = await findBestOSMVenue('47.6062', '-122.3321');

      expect(venue).not.toBeNull();
      expect(venue!.name).toBe('The Crocodile');
      expect(venue!.method).toBe('osm_amenity_nightclub');
      expect(venue!.confidence).toBe('high');
    });

    it('should adjust confidence based on distance', async () => {
      const { findBestOSMVenue } = await import('./osmVenueDetection');
      
      const mockResponse = {
        data: {
          elements: [
            {
              type: 'node',
              id: 1,
              lat: 47.6070, // ~90m away
              lon: -122.3330,
              tags: { name: 'Far Venue', amenity: 'nightclub' },
            },
          ],
        },
      };

      vi.mocked(axios.post).mockResolvedValue(mockResponse);

      const venue = await findBestOSMVenue('47.6062', '-122.3321');

      expect(venue).not.toBeNull();
      expect(venue!.confidence).toBe('low'); // Distance > 75m
    });

    it('should return null when no venues found', async () => {
      const { findBestOSMVenue } = await import('./osmVenueDetection');
      
      const mockResponse = {
        data: {
          elements: [],
        },
      };

      vi.mocked(axios.post).mockResolvedValue(mockResponse);

      const venue = await findBestOSMVenue('47.6062', '-122.3321');

      expect(venue).toBeNull();
    });
  });

  describe('Real-world venue tags', () => {
    it('should match amenity=nightclub', async () => {
      const { findOSMVenues } = await import('./osmVenueDetection');
      
      const mockResponse = {
        data: {
          elements: [
            {
              type: 'node',
              id: 1,
              lat: 47.6062,
              lon: -122.3321,
              tags: { name: 'Neumos', amenity: 'nightclub' },
            },
          ],
        },
      };

      vi.mocked(axios.post).mockResolvedValue(mockResponse);

      const venues = await findOSMVenues('47.6062', '-122.3321', 100);

      expect(venues).toHaveLength(1);
      expect(venues[0].matchedTag).toBe('amenity=nightclub');
    });

    it('should match leisure=stadium', async () => {
      const { findOSMVenues } = await import('./osmVenueDetection');
      
      const mockResponse = {
        data: {
          elements: [
            {
              type: 'way',
              id: 1,
              center: { lat: 47.5951, lon: -122.3316 },
              tags: { name: 'Climate Pledge Arena', leisure: 'stadium' },
            },
          ],
        },
      };

      vi.mocked(axios.post).mockResolvedValue(mockResponse);

      const venues = await findOSMVenues('47.5951', '-122.3316', 100);

      expect(venues).toHaveLength(1);
      expect(venues[0].matchedTag).toBe('leisure=stadium');
    });
  });
});
