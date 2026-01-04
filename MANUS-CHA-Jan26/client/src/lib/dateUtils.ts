/**
 * Extract date string in YYYY-MM-DD format without timezone shift
 * If input is already a string in YYYY-MM-DD format, return as-is
 * Otherwise use local date components to match user's timezone
 */
/**
 * Parse a YYYY-MM-DD date string and return a Date object at noon UTC
 * This prevents timezone issues when the date is sent to the server
 */
export function parseDateStringToNoonUTC(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  // Create date at noon UTC to avoid timezone shift issues
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

export function formatDateForInput(date: Date | string | null | undefined): string {
  if (!date) return "";
  
  // If it's already a string in YYYY-MM-DD format, use it directly
  if (typeof date === 'string') {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) return "";
  
  // Use UTC components to preserve the date stored in database
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getUTCDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Format a date for input field using LOCAL time components
 * Use this for photo EXIF timestamps that should display in user's timezone
 */
export function formatDateForInputLocal(date: Date | string | null | undefined): string {
  if (!date) return "";
  
  // If it's already a string in YYYY-MM-DD format, use it directly
  if (typeof date === 'string') {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) return "";
  
  // Use LOCAL components to show the calendar date in user's timezone
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}
