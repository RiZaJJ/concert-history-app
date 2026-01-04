/**
 * Convert a date string (YYYY-MM-DD) or Date object to a Date at noon UTC
 * This prevents timezone shifts when displaying dates across different timezones
 * 
 * Example: "2023-06-23" becomes "2023-06-23T12:00:00.000Z"
 * This will display as June 23 in all timezones (not June 22 or 24)
 */
export function dateToNoonUTC(date: Date | string): Date {
  let dateStr: string;
  
  if (date instanceof Date) {
    // Extract YYYY-MM-DD from Date object
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    dateStr = `${year}-${month}-${day}`;
  } else {
    // Extract YYYY-MM-DD from string
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
      throw new Error(`Invalid date format: ${date}`);
    }
    dateStr = `${match[1]}-${match[2]}-${match[3]}`;
  }
  
  // Create date at noon UTC
  return new Date(`${dateStr}T12:00:00.000Z`);
}

/**
 * Extract date string (YYYY-MM-DD) from a Date object stored at noon UTC
 */
export function extractDateString(date: Date | string): string {
  if (typeof date === 'string') {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  
  const dateObj = new Date(date);
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getUTCDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}
