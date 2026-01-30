/**
 * IndexedDB-backed annotation storage for reviewer mode
 *
 * Stores reviewer annotations (scores, tags, notes, issue flags) locally
 * since bundled transcript files are read-only in static builds.
 *
 * Includes auto-backup to localStorage and periodic auto-export.
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { ReviewerAnnotations, ReviewerAnnotationsExport, ReviewerScore, ReviewerIssueFlag } from '$lib/shared/types';

const DB_NAME = 'transcript-reviewer';
const DB_VERSION = 1;
const STORE_NAME = 'annotations';

// Backup keys for localStorage
const BACKUP_KEY = 'transcript-reviewer-backup';
const BACKUP_TIMESTAMP_KEY = 'transcript-reviewer-backup-timestamp';
const LAST_EXPORT_KEY = 'transcript-reviewer-last-export';
const AUTO_EXPORT_INTERVAL_KEY = 'transcript-reviewer-auto-export-interval';

// Default auto-export interval: 30 minutes (in ms)
const DEFAULT_AUTO_EXPORT_INTERVAL = 30 * 60 * 1000;

let dbInstance: IDBPDatabase | null = null;
let autoExportTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Get or create the IndexedDB database
 */
async function getDb(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'filePath' });
      }
    },
  });

  return dbInstance;
}

// Note: saveAnnotation is defined at the bottom of the file with auto-backup wrapper

/**
 * Get annotation for a specific transcript
 */
export async function getAnnotation(filePath: string): Promise<ReviewerAnnotations | undefined> {
  const db = await getDb();
  const record = await db.get(STORE_NAME, filePath);
  if (!record) return undefined;

  // Remove filePath from the returned object (it's the key, not part of the annotation)
  const { filePath: _, ...annotation } = record;
  return annotation as ReviewerAnnotations;
}

/**
 * Get all annotations as a Map
 */
export async function getAllAnnotations(): Promise<Map<string, ReviewerAnnotations>> {
  const db = await getDb();
  const all = await db.getAll(STORE_NAME);
  const map = new Map<string, ReviewerAnnotations>();

  for (const record of all) {
    const { filePath, ...annotation } = record;
    map.set(filePath, annotation as ReviewerAnnotations);
  }

  return map;
}

/**
 * Delete annotation for a transcript
 */
export async function deleteAnnotation(filePath: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, filePath);
}

/**
 * Export all annotations as JSON and trigger download
 */
export async function exportAnnotationsAsJson(reviewerName: string): Promise<void> {
  const annotations = await getAllAnnotations();

  const exportData: ReviewerAnnotationsExport = {
    exportedAt: new Date().toISOString(),
    reviewerName,
    // Remove redundant reviewerName from each annotation since it's at top level
    annotations: Array.from(annotations.entries()).map(([filePath, annotation]) => {
      const { reviewerName: _, ...rest } = annotation;
      return { filePath, ...rest };
    })
  };

  // Create and download file
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reviewer-annotations-${reviewerName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Helper functions for updating specific parts of annotations

/**
 * Add or update a reviewer score
 */
export async function addReviewerScore(
  filePath: string,
  reviewerName: string,
  score: Omit<ReviewerScore, 'reviewerName' | 'timestamp'>
): Promise<void> {
  const existing = await getAnnotation(filePath);
  const scores = existing?.reviewerScores || [];

  // Remove existing score for this dimension if any
  const filtered = scores.filter(s => s.dimension !== score.dimension);

  const newScore: ReviewerScore = {
    ...score,
    reviewerName,
    timestamp: new Date().toISOString()
  };

  await saveAnnotation(filePath, {
    ...existing,
    reviewerName,
    reviewerScores: [...filtered, newScore]
  });
}

/**
 * Remove a reviewer score
 */
export async function removeReviewerScore(
  filePath: string,
  reviewerName: string,
  dimension: string
): Promise<void> {
  const existing = await getAnnotation(filePath);
  if (!existing) return;

  const scores = (existing.reviewerScores || []).filter(s => s.dimension !== dimension);

  await saveAnnotation(filePath, {
    ...existing,
    reviewerName,
    reviewerScores: scores
  });
}

/**
 * Set issue flags
 */
export async function setIssueFlags(
  filePath: string,
  reviewerName: string,
  flags: ReviewerIssueFlag[]
): Promise<void> {
  const existing = await getAnnotation(filePath);

  await saveAnnotation(filePath, {
    ...existing,
    reviewerName,
    issueFlags: flags
  });
}

/**
 * Set user tags (reviewer-added tags)
 */
export async function setUserTags(
  filePath: string,
  reviewerName: string,
  tags: string[]
): Promise<void> {
  const existing = await getAnnotation(filePath);

  await saveAnnotation(filePath, {
    ...existing,
    reviewerName,
    userTags: tags
  });
}

/**
 * Set user notes
 */
export async function setUserNotes(
  filePath: string,
  reviewerName: string,
  notes: string
): Promise<void> {
  const existing = await getAnnotation(filePath);

  await saveAnnotation(filePath, {
    ...existing,
    reviewerName,
    userNotes: notes || undefined
  });
}

/**
 * Get count of annotated transcripts
 */
export async function getAnnotationCount(): Promise<number> {
  const db = await getDb();
  return db.count(STORE_NAME);
}

// ============================================================================
// Auto-backup to localStorage
// ============================================================================

/**
 * Save a backup of all annotations to localStorage
 * Called automatically after each save operation
 */
async function saveBackupToLocalStorage(): Promise<void> {
  try {
    const annotations = await getAllAnnotations();
    const backup = {
      annotations: Array.from(annotations.entries()).map(([filePath, annotation]) => ({
        filePath,
        ...annotation
      })),
      timestamp: new Date().toISOString()
    };
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
    localStorage.setItem(BACKUP_TIMESTAMP_KEY, backup.timestamp);
  } catch (err) {
    console.warn('Failed to save backup to localStorage:', err);
  }
}

/**
 * Check if there's a localStorage backup that could be recovered
 */
export function hasRecoverableBackup(): boolean {
  return localStorage.getItem(BACKUP_KEY) !== null;
}

/**
 * Get info about the localStorage backup
 */
export function getBackupInfo(): { timestamp: string; count: number } | null {
  const backupStr = localStorage.getItem(BACKUP_KEY);
  if (!backupStr) return null;

  try {
    const backup = JSON.parse(backupStr);
    return {
      timestamp: backup.timestamp || 'Unknown',
      count: backup.annotations?.length || 0
    };
  } catch {
    return null;
  }
}

/**
 * Recover annotations from localStorage backup
 * Use this if IndexedDB was cleared but localStorage backup exists
 */
export async function recoverFromBackup(): Promise<number> {
  const backupStr = localStorage.getItem(BACKUP_KEY);
  if (!backupStr) {
    throw new Error('No backup found in localStorage');
  }

  const backup = JSON.parse(backupStr);
  const db = await getDb();

  let recovered = 0;
  for (const record of backup.annotations || []) {
    await db.put(STORE_NAME, record);
    recovered++;
  }

  return recovered;
}

/**
 * Clear the localStorage backup
 */
export function clearBackup(): void {
  localStorage.removeItem(BACKUP_KEY);
  localStorage.removeItem(BACKUP_TIMESTAMP_KEY);
}

// ============================================================================
// Auto-export functionality
// ============================================================================

/**
 * Get the auto-export interval in milliseconds
 */
export function getAutoExportInterval(): number {
  const stored = localStorage.getItem(AUTO_EXPORT_INTERVAL_KEY);
  if (stored) {
    const parsed = parseInt(stored, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_AUTO_EXPORT_INTERVAL;
}

/**
 * Set the auto-export interval in minutes (0 to disable)
 */
export function setAutoExportInterval(minutes: number): void {
  if (minutes <= 0) {
    localStorage.removeItem(AUTO_EXPORT_INTERVAL_KEY);
    stopAutoExport();
  } else {
    localStorage.setItem(AUTO_EXPORT_INTERVAL_KEY, String(minutes * 60 * 1000));
    // Restart timer with new interval
    stopAutoExport();
    startAutoExport();
  }
}

/**
 * Get the timestamp of the last auto-export
 */
export function getLastExportTime(): string | null {
  return localStorage.getItem(LAST_EXPORT_KEY);
}

/**
 * Perform an auto-export (silent, saves to downloads)
 */
async function performAutoExport(reviewerName: string): Promise<void> {
  const count = await getAnnotationCount();
  if (count === 0) return; // Nothing to export

  await exportAnnotationsAsJson(reviewerName);
  localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
}

/**
 * Start the auto-export timer
 */
export function startAutoExport(reviewerName?: string): void {
  if (autoExportTimer) return; // Already running

  const interval = getAutoExportInterval();
  if (interval <= 0) return; // Disabled

  // Store reviewer name for use in timer callback
  const name = reviewerName || localStorage.getItem('reviewer-name') || 'reviewer';

  autoExportTimer = setInterval(async () => {
    try {
      const count = await getAnnotationCount();
      if (count > 0) {
        console.log(`Auto-exporting ${count} annotations...`);
        await performAutoExport(name);
      }
    } catch (err) {
      console.warn('Auto-export failed:', err);
    }
  }, interval);

  console.log(`Auto-export enabled: every ${Math.round(interval / 60000)} minutes`);
}

/**
 * Stop the auto-export timer
 */
export function stopAutoExport(): void {
  if (autoExportTimer) {
    clearInterval(autoExportTimer);
    autoExportTimer = null;
  }
}

/**
 * Check if auto-export is currently running
 */
export function isAutoExportRunning(): boolean {
  return autoExportTimer !== null;
}

// ============================================================================
// Enhanced save with auto-backup
// ============================================================================

// Wrap the original saveAnnotation to include backup
const originalSaveAnnotation = async (
  filePath: string,
  annotation: Omit<ReviewerAnnotations, 'lastModified'> & { lastModified?: string }
): Promise<void> => {
  const db = await getDb();
  const record = {
    filePath,
    ...annotation,
    lastModified: new Date().toISOString()
  };
  await db.put(STORE_NAME, record);
};

// Override saveAnnotation to include backup
export async function saveAnnotation(
  filePath: string,
  annotation: Omit<ReviewerAnnotations, 'lastModified'> & { lastModified?: string }
): Promise<void> {
  // Deep clone to convert Svelte 5 Proxy objects (from $state) to plain objects
  // IndexedDB's structured clone algorithm can't handle Proxy objects
  const plainAnnotation = JSON.parse(JSON.stringify(annotation));
  await originalSaveAnnotation(filePath, plainAnnotation);
  // Trigger backup after successful save (don't await to avoid slowing down saves)
  saveBackupToLocalStorage().catch(() => {});
}
