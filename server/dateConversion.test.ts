import { describe, it, expect } from 'vitest';

/**
 * Test date conversion logic for setlist.fm API calls
 * 
 * Problem: Photos taken at night (e.g., Oct 3 11:24 PM PDT) are stored as UTC timestamps
 * (Oct 4 8:24 AM UTC). When we extract date components using getDate(), getMonth(), etc.,
 * we get the UTC date (Oct 4) instead of the local date (Oct 3).
 * 
 * Solution: Subtract 12 hours from the UTC timestamp before extracting date components.
 * This shifts the date back to the correct local calendar date for most US timezones.
 */

function convertToLocalDate(date: Date): string {
  // Subtract 12 hours to account for timezone offset
  const localDate = new Date(date.getTime() - (12 * 60 * 60 * 1000));
  const day = String(localDate.getUTCDate()).padStart(2, '0');
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const year = localDate.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

describe('Date Conversion for Setlist.fm', () => {
  it('should convert Oct 4 8:24 AM UTC to Oct 3 (photo taken Oct 3 11:24 PM PDT)', () => {
    // Photo taken Oct 3, 2023 at 11:24 PM PDT (UTC-7)
    // Stored as: Oct 4, 2023 at 8:24 AM UTC
    const photoTimestamp = new Date('2023-10-04T08:24:04.000Z');
    const dateStr = convertToLocalDate(photoTimestamp);
    
    // Should search setlist.fm for Oct 3, not Oct 4
    expect(dateStr).toBe('03-10-2023');
  });

  it('should convert Oct 4 9:02 AM UTC to Oct 3 (photo taken Oct 3 11:02 PM PDT)', () => {
    // Another photo from same concert
    const photoTimestamp = new Date('2023-10-04T09:02:09.000Z');
    const dateStr = convertToLocalDate(photoTimestamp);
    
    expect(dateStr).toBe('03-10-2023');
  });

  it('should handle afternoon concerts (no timezone shift needed)', () => {
    // Photo taken Oct 3, 2023 at 2:00 PM PDT (UTC-7)
    // Stored as: Oct 3, 2023 at 9:00 PM UTC
    const photoTimestamp = new Date('2023-10-03T21:00:00.000Z');
    const dateStr = convertToLocalDate(photoTimestamp);
    
    // Should still be Oct 3 after subtracting 12 hours
    expect(dateStr).toBe('03-10-2023');
  });

  it('should handle early morning concerts (e.g., 1 AM)', () => {
    // Photo taken Oct 4, 2023 at 1:00 AM PDT (UTC-7)
    // Stored as: Oct 4, 2023 at 8:00 AM UTC
    const photoTimestamp = new Date('2023-10-04T08:00:00.000Z');
    const dateStr = convertToLocalDate(photoTimestamp);
    
    // Should search for Oct 3 (the night the concert started)
    expect(dateStr).toBe('03-10-2023');
  });

  it('should handle Eastern timezone concerts', () => {
    // Photo taken Oct 3, 2023 at 11:00 PM EDT (UTC-4)
    // Stored as: Oct 4, 2023 at 3:00 AM UTC
    const photoTimestamp = new Date('2023-10-04T03:00:00.000Z');
    const dateStr = convertToLocalDate(photoTimestamp);
    
    // Should search for Oct 3
    expect(dateStr).toBe('03-10-2023');
  });

  it('should handle daytime photos without shifting to previous day', () => {
    // Photo taken Oct 3, 2023 at 3:00 PM PDT (UTC-7)
    // Stored as: Oct 3, 2023 at 10:00 PM UTC
    const photoTimestamp = new Date('2023-10-03T22:00:00.000Z');
    const dateStr = convertToLocalDate(photoTimestamp);
    
    // Should still be Oct 3
    expect(dateStr).toBe('03-10-2023');
  });
});
