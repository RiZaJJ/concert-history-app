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
}

// Store progress by userId
const progressStore = new Map<number, ScanProgress>();

export function initScanProgress(userId: number, totalPhotos: number): void {
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
