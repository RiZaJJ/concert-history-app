/**
 * In-memory store for tracking photo scan progress
 */

interface ScanProgress {
  userId: number;
  isScanning: boolean;
  currentPhoto: number;
  totalPhotos: number;
  processed: number;
  linked: number;
  skipped: number;
  newConcerts: number;
  unmatched: number;
  startedAt: Date;
  currentFileName?: string;
  currentCity?: string;
  currentState?: string;
  currentCountry?: string;
  currentArtist?: string;
  currentVenue?: string;
  currentStatus?: string; // e.g., "Extracting metadata", "Matching concert", "Linked", "Unmatched"
}

interface LastScanResult {
  userId: number;
  scanType: 'drive' | 'rescan';
  completedAt: Date;
  totalPhotos: number;
  processed: number;
  linked: number;
  skipped: number;
  newConcerts: number;
  unmatched: number;
  venuesDetected?: number; // For rescan
  concertsMatched?: number; // For rescan
  duration: number; // in milliseconds
}

// Store progress by userId
const progressStore = new Map<number, ScanProgress>();

// Store last scan results by userId
const lastScanResults = new Map<number, LastScanResult>();

export function initScanProgress(userId: number, totalPhotos: number): void {
  // BUGFIX: Prevent race condition - check if a scan is already in progress
  const existing = progressStore.get(userId);
  if (existing && existing.isScanning) {
    const scanDuration = Date.now() - existing.startedAt.getTime();
    const scanDurationMinutes = Math.round(scanDuration / 1000 / 60);
    throw new Error(
      `A scan is already in progress for this user (started ${scanDurationMinutes} minutes ago). ` +
      `Please wait for it to complete or refresh the page if it seems stuck.`
    );
  }

  progressStore.set(userId, {
    userId,
    isScanning: true,
    currentPhoto: 0,
    totalPhotos,
    processed: 0,
    linked: 0,
    skipped: 0,
    newConcerts: 0,
    unmatched: 0,
    startedAt: new Date(),
  });
}

export function updateScanProgress(
  userId: number,
  updates: Partial<Omit<ScanProgress, 'userId' | 'startedAt'>>
): void {
  const current = progressStore.get(userId);
  if (current) {
    progressStore.set(userId, {
      ...current,
      ...updates,
    });
  }
}

export function completeScanProgress(userId: number): void {
  const current = progressStore.get(userId);
  if (current) {
    progressStore.set(userId, {
      ...current,
      isScanning: false,
    });
  }
}

export function getScanProgress(userId: number): ScanProgress | null {
  return progressStore.get(userId) || null;
}

export function clearScanProgress(userId: number): void {
  progressStore.delete(userId);
}

export function saveLastScanResult(userId: number, result: Omit<LastScanResult, 'userId'>): void {
  lastScanResults.set(userId, {
    userId,
    ...result,
  });
}

export function getLastScanResult(userId: number): LastScanResult | null {
  return lastScanResults.get(userId) || null;
}
