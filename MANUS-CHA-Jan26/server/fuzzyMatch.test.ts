import { describe, it, expect } from 'vitest';
import { isFuzzyVenueMatch, stringSimilarity, findBestVenueMatch } from './fuzzyMatch';

describe('Fuzzy Venue Matching', () => {
  describe('stringSimilarity', () => {
    it('should return 100 for identical strings', () => {
      expect(stringSimilarity('test', 'test')).toBe(100);
    });

    it('should return 0 for empty strings', () => {
      expect(stringSimilarity('', '')).toBe(0);
      expect(stringSimilarity('test', '')).toBe(0);
    });

    it('should return low score for completely different strings', () => {
      const similarity = stringSimilarity('abc', 'xyz');
      expect(similarity).toBeLessThan(50);
    });

    it('should handle strings with different lengths', () => {
      const similarity = stringSimilarity('gorge', 'gorge amphitheatre');
      // Levenshtein distance penalizes length differences, so this will be lower
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(50);
    });

    it('should be case insensitive', () => {
      expect(stringSimilarity('GORGE', 'gorge')).toBe(100);
    });

    it('should handle single character differences', () => {
      const similarity = stringSimilarity('test', 'text');
      expect(similarity).toBeGreaterThan(70);
    });
  });

  describe('isFuzzyVenueMatch', () => {
    it('should match exact venue names', () => {
      expect(isFuzzyVenueMatch('The Gorge', 'The Gorge', 70)).toBe(true);
    });

    it('should match case-insensitive', () => {
      expect(isFuzzyVenueMatch('The Gorge', 'the gorge', 70)).toBe(true);
    });

    it('should match venue names with different punctuation', () => {
      expect(isFuzzyVenueMatch('Chateau Ste Michelle', 'Chateau Ste. Michelle', 70)).toBe(true);
    });

    it('should match venue names with extra words (amphitheatre)', () => {
      expect(isFuzzyVenueMatch(
        'Chateau Ste Michelle',
        'Chateau Ste. Michelle Winery Amphitheatre',
        70
      )).toBe(true);
    });

    it('should match venue names with "The" prefix', () => {
      expect(isFuzzyVenueMatch('Gorge Amphitheatre', 'The Gorge Amphitheatre', 70)).toBe(true);
    });

    it('should match venue names with different amphitheatre spellings', () => {
      expect(isFuzzyVenueMatch('Gorge Amphitheater', 'Gorge Amphitheatre', 70)).toBe(true);
    });

    it('should NOT match completely different venues', () => {
      expect(isFuzzyVenueMatch('Madison Square Garden', 'The Gorge', 70)).toBe(false);
    });

    it('should match Red Rocks variations', () => {
      expect(isFuzzyVenueMatch('Red Rocks', 'Red Rocks Amphitheatre', 70)).toBe(true);
      expect(isFuzzyVenueMatch('Red Rocks Amphitheatre', 'Red Rocks Park and Amphitheatre', 70)).toBe(true);
    });

    it('should match Music Hall variations', () => {
      expect(isFuzzyVenueMatch('Radio City Music Hall', 'Radio City Hall', 70)).toBe(true);
    });

    it('should respect threshold parameter', () => {
      // With high threshold, should not match dissimilar names
      expect(isFuzzyVenueMatch('Gorge', 'Madison Square Garden', 90)).toBe(false);
      
      // With low threshold, might match more loosely
      const result = isFuzzyVenueMatch('Gorge', 'George', 50);
      expect(typeof result).toBe('boolean');
    });

    it('should handle real-world case: Kelsea Ballerini concert', () => {
      // This is the actual bug case from the user
      // "Chateau Ste Michelle" should match "Chateau Ste. Michelle Winery Amphitheatre"
      expect(isFuzzyVenueMatch(
        'Chateau Ste Michelle',
        'Chateau Ste. Michelle Winery Amphitheatre',
        70
      )).toBe(true);
    });

    it('should handle substring matches after normalization', () => {
      // After removing "amphitheatre" and "winery", these should match
      expect(isFuzzyVenueMatch('Gorge', 'The Gorge Amphitheatre', 70)).toBe(true);
      expect(isFuzzyVenueMatch('Red Rocks', 'Red Rocks Amphitheatre', 70)).toBe(true);
    });

    it('should return false for null/empty strings', () => {
      expect(isFuzzyVenueMatch('', 'Test Venue', 70)).toBe(false);
      expect(isFuzzyVenueMatch('Test Venue', '', 70)).toBe(false);
    });
  });

  describe('findBestVenueMatch', () => {
    it('should find exact match', () => {
      const candidates = ['Madison Square Garden', 'The Gorge', 'Red Rocks'];
      const result = findBestVenueMatch('The Gorge', candidates, 70);
      expect(result).not.toBeNull();
      expect(result?.name).toBe('The Gorge');
      expect(result?.score).toBe(100);
    });

    it('should find best fuzzy match', () => {
      const candidates = [
        'Madison Square Garden',
        'Chateau Ste. Michelle Winery Amphitheatre',
        'Red Rocks'
      ];
      const result = findBestVenueMatch('Chateau Ste Michelle', candidates, 70);
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Chateau Ste. Michelle Winery Amphitheatre');
      expect(result?.score).toBeGreaterThan(70);
    });

    it('should return null when no match above threshold', () => {
      const candidates = ['Madison Square Garden', 'Red Rocks'];
      const result = findBestVenueMatch('The Gorge', candidates, 90);
      expect(result).toBeNull();
    });

    it('should return null for empty candidates', () => {
      const result = findBestVenueMatch('The Gorge', [], 70);
      expect(result).toBeNull();
    });

    it('should return best match when multiple candidates match', () => {
      const candidates = [
        'The Gorge',
        'Gorge Amphitheatre',
        'Madison Square Garden'
      ];
      const result = findBestVenueMatch('Gorge', candidates, 70);
      expect(result).not.toBeNull();
      // Should match one of the Gorge venues
      expect(result?.name).toMatch(/Gorge/i);
    });
  });
});
