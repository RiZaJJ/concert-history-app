import { describe, it, expect, beforeEach } from 'vitest';
import {
  initScanProgress,
  updateScanProgress,
  completeScanProgress,
  getScanProgress,
  clearScanProgress,
} from './scanProgress';

describe('Scan Progress Tracking', () => {
  const testUserId = 123;

  beforeEach(() => {
    // Clear any existing progress before each test
    clearScanProgress(testUserId);
  });

  it('should initialize scan progress with correct values', () => {
    initScanProgress(testUserId, 50);

    const progress = getScanProgress(testUserId);
    expect(progress).toBeDefined();
    expect(progress?.userId).toBe(testUserId);
    expect(progress?.isScanning).toBe(true);
    expect(progress?.totalPhotos).toBe(50);
    expect(progress?.currentPhoto).toBe(0);
    expect(progress?.processed).toBe(0);
    expect(progress?.linked).toBe(0);
    expect(progress?.skipped).toBe(0);
    expect(progress?.newConcerts).toBe(0);
    expect(progress?.unmatched).toBe(0);
    expect(progress?.startedAt).toBeInstanceOf(Date);
  });

  it('should update scan progress correctly', () => {
    initScanProgress(testUserId, 50);

    updateScanProgress(testUserId, {
      currentPhoto: 10,
      currentFileName: 'IMG_001.jpg',
      processed: 10,
      linked: 8,
      skipped: 2,
      newConcerts: 1,
      unmatched: 2,
    });

    const progress = getScanProgress(testUserId);
    expect(progress?.currentPhoto).toBe(10);
    expect(progress?.currentFileName).toBe('IMG_001.jpg');
    expect(progress?.processed).toBe(10);
    expect(progress?.linked).toBe(8);
    expect(progress?.skipped).toBe(2);
    expect(progress?.newConcerts).toBe(1);
    expect(progress?.unmatched).toBe(2);
    expect(progress?.isScanning).toBe(true); // Should still be scanning
  });

  it('should complete scan progress', () => {
    initScanProgress(testUserId, 50);
    updateScanProgress(testUserId, {
      currentPhoto: 50,
      processed: 50,
      linked: 45,
      skipped: 5,
    });

    completeScanProgress(testUserId);

    const progress = getScanProgress(testUserId);
    expect(progress?.isScanning).toBe(false);
    expect(progress?.currentPhoto).toBe(50);
    expect(progress?.processed).toBe(50);
  });

  it('should return null for non-existent user progress', () => {
    const progress = getScanProgress(999);
    expect(progress).toBeNull();
  });

  it('should clear scan progress', () => {
    initScanProgress(testUserId, 50);
    expect(getScanProgress(testUserId)).toBeDefined();

    clearScanProgress(testUserId);
    expect(getScanProgress(testUserId)).toBeNull();
  });

  it('should handle multiple users independently', () => {
    const user1 = 100;
    const user2 = 200;

    initScanProgress(user1, 30);
    initScanProgress(user2, 40);

    updateScanProgress(user1, { currentPhoto: 10, processed: 10 });
    updateScanProgress(user2, { currentPhoto: 20, processed: 20 });

    const progress1 = getScanProgress(user1);
    const progress2 = getScanProgress(user2);

    expect(progress1?.currentPhoto).toBe(10);
    expect(progress1?.totalPhotos).toBe(30);
    expect(progress2?.currentPhoto).toBe(20);
    expect(progress2?.totalPhotos).toBe(40);
  });

  it('should preserve startedAt timestamp through updates', () => {
    initScanProgress(testUserId, 50);
    const initialProgress = getScanProgress(testUserId);
    const startTime = initialProgress?.startedAt;

    // Wait a tiny bit
    updateScanProgress(testUserId, { currentPhoto: 10 });

    const updatedProgress = getScanProgress(testUserId);
    expect(updatedProgress?.startedAt).toBe(startTime);
  });
});
