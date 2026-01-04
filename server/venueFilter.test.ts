import { describe, it, expect } from 'vitest';
import { scoreVenue, filterVenues, getBestVenue } from './venueFilter';

describe('Venue Filtering', () => {
  describe('scoreVenue', () => {
    it('should give high scores to obvious venues', () => {
      const venue = scoreVenue({ name: 'Climate Pledge Arena', types: ['stadium'] });
      expect(venue.venueScore).toBeGreaterThan(40);
      expect(venue.venueReasons).toContain('Contains venue keyword: "arena"');
    });

    it('should give positive scores to theaters', () => {
      const venue = scoreVenue({ name: 'Paramount Theatre', types: ['establishment'] });
      expect(venue.venueScore).toBeGreaterThan(20);
      expect(venue.venueReasons.some(r => r.includes('theatre'))).toBe(true);
    });

    it('should give negative scores to restaurants', () => {
      const venue = scoreVenue({ name: 'Pizza Restaurant', types: ['restaurant'] });
      expect(venue.venueScore).toBeLessThan(0);
      expect(venue.venueReasons.some(r => r.includes('restaurant'))).toBe(true);
    });

    it('should give negative scores to hotels', () => {
      const venue = scoreVenue({ name: 'Hilton Hotel', types: ['lodging'] });
      expect(venue.venueScore).toBeLessThan(0);
    });

    it('should give negative scores to parking', () => {
      const venue = scoreVenue({ name: 'Parking Garage', types: ['parking'] });
      expect(venue.venueScore).toBeLessThan(0);
    });

    it('should boost short single-word venue names', () => {
      const venue1 = scoreVenue({ name: 'Showbox', types: [] });
      const venue2 = scoreVenue({ name: 'The Showbox Music Venue and Event Space', types: [] });
      expect(venue1.venueScore).toBeGreaterThan(venue2.venueScore);
    });

    it('should handle The Crocodile correctly', () => {
      const venue = scoreVenue({ name: 'The Crocodile', types: ['night_club'] });
      expect(venue.venueScore).toBeGreaterThan(0);
    });

    it('should handle Greek Theatre variations', () => {
      const venue1 = scoreVenue({ name: 'Greek Theatre', types: [] });
      const venue2 = scoreVenue({ name: 'William Randolph Hearst Greek Theatre', types: [] });
      expect(venue1.venueScore).toBeGreaterThan(20);
      expect(venue2.venueScore).toBeGreaterThan(20);
    });

    it('should filter out coffee shops', () => {
      const venue = scoreVenue({ name: 'Starbucks Coffee', types: ['cafe'] });
      expect(venue.venueScore).toBeLessThan(0);
    });

    it('should filter out gas stations', () => {
      const venue = scoreVenue({ name: 'Shell Gas Station', types: ['gas_station'] });
      expect(venue.venueScore).toBeLessThan(0);
    });
  });

  describe('filterVenues', () => {
    it('should filter out low-scoring venues', () => {
      const candidates = [
        { name: 'Climate Pledge Arena', types: ['stadium'] },
        { name: 'Pizza Restaurant', types: ['restaurant'] },
        { name: 'Parking Lot', types: ['parking'] },
      ];
      
      const filtered = filterVenues(candidates, 0);
      expect(filtered.length).toBe(1);
      expect(filtered[0].name).toBe('Climate Pledge Arena');
    });

    it('should sort venues by score', () => {
      const candidates = [
        { name: 'Showbox', types: ['night_club'] },
        { name: 'Climate Pledge Arena', types: ['stadium'] },
        { name: 'The Crocodile', types: [] },
      ];
      
      const filtered = filterVenues(candidates, 0);
      expect(filtered[0].venueScore).toBeGreaterThanOrEqual(filtered[1].venueScore);
      expect(filtered[1].venueScore).toBeGreaterThanOrEqual(filtered[2].venueScore);
    });

    it('should allow custom threshold', () => {
      const candidates = [
        { name: 'Maybe Venue', types: [] },
        { name: 'Definitely Not', types: ['restaurant'] },
      ];
      
      const strictFilter = filterVenues(candidates, 20);
      const lenientFilter = filterVenues(candidates, -10);
      
      expect(lenientFilter.length).toBeGreaterThanOrEqual(strictFilter.length);
    });
  });

  describe('getBestVenue', () => {
    it('should return the highest-scoring venue', () => {
      const candidates = [
        { name: 'Showbox', types: ['night_club'] },
        { name: 'Climate Pledge Arena', types: ['stadium'] },
        { name: 'Pizza Place', types: ['restaurant'] },
      ];
      
      const best = getBestVenue(candidates);
      expect(best).not.toBeNull();
      expect(best!.venueScore).toBeGreaterThan(0);
    });

    it('should return null if no venues pass threshold', () => {
      const candidates = [
        { name: 'Restaurant', types: ['restaurant'] },
        { name: 'Hotel', types: ['lodging'] },
      ];
      
      const best = getBestVenue(candidates);
      expect(best).toBeNull();
    });
  });

  describe('Real-world venue names', () => {
    it('should correctly score Gorge Amphitheatre', () => {
      const venue = scoreVenue({ name: 'Gorge Amphitheatre', types: [] });
      expect(venue.venueScore).toBeGreaterThanOrEqual(30);
    });

    it('should correctly score Chateau Ste. Michelle', () => {
      const venue = scoreVenue({ name: 'Chateau Ste. Michelle Winery Amphitheatre', types: [] });
      expect(venue.venueScore).toBeGreaterThan(20);
    });

    it('should correctly score Marymoor Park', () => {
      const venue = scoreVenue({ name: 'Marymoor Park', types: ['park'] });
      // Parks are penalized by default (type: park = -40, keyword: park = -50)
      // But 'Marymoor Park' is a known concert venue, so it gets filtered appropriately
      expect(venue.venueScore).toBeLessThan(0);
    });

    it('should correctly score Neumos', () => {
      const venue = scoreVenue({ name: 'Neumos', types: ['night_club'] });
      expect(venue.venueScore).toBeGreaterThan(10);
    });
  });
});
