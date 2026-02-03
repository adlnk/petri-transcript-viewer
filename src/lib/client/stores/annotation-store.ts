/**
 * IndexedDB-backed annotation storage for reviewer mode
 *
 * Stores reviewer annotations (scores, tags, notes, issue flags) locally
 * since bundled transcript files are read-only in static builds.
 *
 * Includes auto-backup to localStorage and periodic auto-export.
 */

import { openDB, type IDBPDatabase } from 'idb';

// File System Access API type augmentation (not fully in TypeScript's lib)
declare global {
  interface FileSystemFileHandle {
    queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
    requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  }
}
import type { ReviewerAnnotations, ReviewerAnnotationsExport, ReviewerScore, ReviewerIssueFlag } from '$lib/shared/types';

const DB_NAME = 'transcript-reviewer';
const DB_VERSION = 2;  // Bumped for file handle store
const STORE_NAME = 'annotations';
const FILE_HANDLE_STORE = 'file-handles';
const SAVE_FILE_HANDLE_KEY = 'auto-save-handle';

// Backup keys for localStorage
const BACKUP_KEY = 'transcript-reviewer-backup';
const BACKUP_TIMESTAMP_KEY = 'transcript-reviewer-backup-timestamp';
const LAST_EXPORT_KEY = 'transcript-reviewer-last-export';
const AUTO_EXPORT_INTERVAL_KEY = 'transcript-reviewer-auto-export-interval';
const AUTO_EXPORT_START_TIME_KEY = 'transcript-reviewer-auto-export-start';

// Default auto-export interval: 30 minutes (in ms)
const DEFAULT_AUTO_EXPORT_INTERVAL = 30 * 60 * 1000;

let dbInstance: IDBPDatabase | null = null;
let autoExportTimer: ReturnType<typeof setInterval> | null = null;
let autoExportStartTime: number | null = null;

/**
 * Get or create the IndexedDB database
 */
async function getDb(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'filePath' });
      }
      // v2: Add store for file handles (used for silent auto-save)
      if (oldVersion < 2 && !db.objectStoreNames.contains(FILE_HANDLE_STORE)) {
        db.createObjectStore(FILE_HANDLE_STORE);
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
 * Build the export data structure
 */
function buildExportData(annotations: Map<string, ReviewerAnnotations>, reviewerName: string): ReviewerAnnotationsExport {
  return {
    exportedAt: new Date().toISOString(),
    reviewerName,
    annotations: Array.from(annotations.entries()).map(([filePath, annotation]) => {
      const { reviewerName: _, ...rest } = annotation;
      return { filePath, ...rest };
    })
  };
}

/**
 * Export all annotations as JSON and trigger download dialog
 * Use this for user-initiated exports where they want to choose the location
 */
export async function exportAnnotationsAsJson(reviewerName: string): Promise<void> {
  const annotations = await getAllAnnotations();
  const exportData = buildExportData(annotations, reviewerName);

  // Create and download file (triggers save dialog)
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

// ============================================================================
// Silent auto-save using File System Access API
// ============================================================================

/**
 * Check if File System Access API is supported
 */
function isFileSystemAccessSupported(): boolean {
  return 'showSaveFilePicker' in window;
}

/**
 * Public check for File System Access API support
 */
export function canUseSilentSave(): boolean {
  return isFileSystemAccessSupported();
}

/**
 * Get stored file handle for auto-save
 */
async function getStoredFileHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const db = await getDb();
    return await db.get(FILE_HANDLE_STORE, SAVE_FILE_HANDLE_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Store file handle for future auto-saves
 */
async function storeFileHandle(handle: FileSystemFileHandle): Promise<void> {
  const db = await getDb();
  await db.put(FILE_HANDLE_STORE, handle, SAVE_FILE_HANDLE_KEY);
}

/**
 * Clear stored file handle
 */
export async function clearSaveFileHandle(): Promise<void> {
  const db = await getDb();
  await db.delete(FILE_HANDLE_STORE, SAVE_FILE_HANDLE_KEY);
}

/**
 * Check if we have a valid save location configured
 */
export async function hasSaveLocation(): Promise<boolean> {
  if (!isFileSystemAccessSupported()) return false;
  const handle = await getStoredFileHandle();
  return handle !== null;
}

/**
 * Prompt user to choose a save location (first-time setup)
 * Returns true if location was set, false if cancelled
 */
export async function setupSaveLocation(reviewerName: string): Promise<boolean> {
  if (!isFileSystemAccessSupported()) {
    console.warn('File System Access API not supported');
    return false;
  }

  try {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: `reviewer-annotations-${reviewerName.toLowerCase().replace(/\s+/g, '-')}.json`,
      types: [{
        description: 'JSON Files',
        accept: { 'application/json': ['.json'] }
      }]
    });
    await storeFileHandle(handle);
    return true;
  } catch (err: any) {
    // User cancelled or error
    if (err.name !== 'AbortError') {
      console.warn('Failed to setup save location:', err);
    }
    return false;
  }
}

/**
 * Save annotations silently to the configured location
 * Returns: 'saved' | 'no-location' | 'permission-denied' | 'error'
 */
export async function saveAnnotationsSilently(reviewerName: string): Promise<'saved' | 'no-location' | 'permission-denied' | 'error'> {
  if (!isFileSystemAccessSupported()) {
    return 'no-location';
  }

  const handle = await getStoredFileHandle();
  if (!handle) {
    return 'no-location';
  }

  try {
    // Verify we still have permission (may have been revoked)
    const permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      // Try to request permission
      const newPermission = await handle.requestPermission({ mode: 'readwrite' });
      if (newPermission !== 'granted') {
        return 'permission-denied';
      }
    }

    const annotations = await getAllAnnotations();
    const exportData = buildExportData(annotations, reviewerName);

    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(exportData, null, 2));
    await writable.close();

    return 'saved';
  } catch (err: any) {
    console.warn('Silent save failed:', err);
    if (err.name === 'NotAllowedError') {
      return 'permission-denied';
    }
    return 'error';
  }
}

/**
 * Save annotations - tries silent save first, falls back to prompting for location
 * Returns true if saved successfully
 */
export async function saveAnnotations(reviewerName: string): Promise<boolean> {
  const count = await getAnnotationCount();
  if (count === 0) return true; // Nothing to save

  // Try silent save first
  const result = await saveAnnotationsSilently(reviewerName);

  if (result === 'saved') {
    localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
    return true;
  }

  if (result === 'no-location' || result === 'permission-denied') {
    // Need to set up or re-authorize location
    const success = await setupSaveLocation(reviewerName);
    if (success) {
      // Try again with new handle
      const retryResult = await saveAnnotationsSilently(reviewerName);
      if (retryResult === 'saved') {
        localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
        return true;
      }
    }
  }

  return false;
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
 * Set notes for issue flags
 */
export async function setIssueFlagNotes(
  filePath: string,
  reviewerName: string,
  notes: Record<string, string>
): Promise<void> {
  const existing = await getAnnotation(filePath);

  await saveAnnotation(filePath, {
    ...existing,
    reviewerName,
    issueFlagNotes: notes
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
 * Set analysis notes (comments on judge output)
 */
export async function setAnalysisNotes(
  filePath: string,
  reviewerName: string,
  notes: string
): Promise<void> {
  const existing = await getAnnotation(filePath);

  await saveAnnotation(filePath, {
    ...existing,
    reviewerName,
    analysisNotes: notes || undefined
  });
}

/**
 * Set review complete status
 */
export async function setReviewComplete(
  filePath: string,
  reviewerName: string,
  complete: boolean
): Promise<void> {
  const existing = await getAnnotation(filePath);

  await saveAnnotation(filePath, {
    ...existing,
    reviewerName,
    reviewComplete: complete
  });

  // Update the reactive cache
  annotationCache.update(filePath, complete);
}

/**
 * Get count of annotated transcripts
 */
export async function getAnnotationCount(): Promise<number> {
  const db = await getDb();
  return db.count(STORE_NAME);
}

/**
 * Get the latest modification time across all annotations
 * Returns ISO string or null if no annotations
 */
export async function getLatestModificationTime(): Promise<string | null> {
  const annotations = await getAllAnnotations();
  if (annotations.size === 0) return null;

  let latest: string | null = null;
  for (const annotation of annotations.values()) {
    const modified = (annotation as any).lastModified;
    if (modified && (!latest || modified > latest)) {
      latest = modified;
    }
  }
  return latest;
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
 * Perform an auto-save (silent, to configured location)
 * Falls back to download dialog if no location configured
 */
async function performAutoExport(reviewerName: string): Promise<void> {
  const count = await getAnnotationCount();
  if (count === 0) return; // Nothing to save

  // Try silent save first
  const result = await saveAnnotationsSilently(reviewerName);

  if (result === 'saved') {
    localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
    console.log('Auto-save completed silently');
    return;
  }

  // If no location set up yet, skip auto-save (don't interrupt user with dialog)
  // User needs to do a manual save first to set up the location
  if (result === 'no-location') {
    console.log('Auto-save skipped: no save location configured. Use Save button to set up.');
    return;
  }

  // Permission denied - location was set up but permission revoked
  // Skip for now, user will need to re-authorize on next manual save
  if (result === 'permission-denied') {
    console.log('Auto-save skipped: permission denied. Use Save button to re-authorize.');
    return;
  }

  console.warn('Auto-save failed');
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

  // Restore start time from localStorage if available, otherwise start fresh
  const storedStartTime = localStorage.getItem(AUTO_EXPORT_START_TIME_KEY);
  if (storedStartTime) {
    const parsed = parseInt(storedStartTime, 10);
    // Check if the stored time is still valid (not too old)
    const elapsed = Date.now() - parsed;
    if (elapsed < interval) {
      autoExportStartTime = parsed;
    } else {
      // Stored time is stale, start fresh
      autoExportStartTime = Date.now();
      localStorage.setItem(AUTO_EXPORT_START_TIME_KEY, String(autoExportStartTime));
    }
  } else {
    autoExportStartTime = Date.now();
    localStorage.setItem(AUTO_EXPORT_START_TIME_KEY, String(autoExportStartTime));
  }

  // Calculate initial delay to sync with the persisted start time
  const elapsed = Date.now() - autoExportStartTime;
  const initialDelay = Math.max(0, interval - elapsed);

  // Use setTimeout for the first tick, then setInterval for subsequent ones
  const startInterval = () => {
    autoExportTimer = setInterval(async () => {
      try {
        const count = await getAnnotationCount();
        if (count > 0) {
          console.log(`Auto-exporting ${count} annotations...`);
          await performAutoExport(name);
        }
        // Reset start time for next cycle
        autoExportStartTime = Date.now();
        localStorage.setItem(AUTO_EXPORT_START_TIME_KEY, String(autoExportStartTime));
      } catch (err) {
        console.warn('Auto-export failed:', err);
      }
    }, interval);
  };

  if (initialDelay > 0) {
    // Wait for remaining time, then do first export and start regular interval
    setTimeout(async () => {
      try {
        const count = await getAnnotationCount();
        if (count > 0) {
          console.log(`Auto-exporting ${count} annotations...`);
          await performAutoExport(name);
        }
        autoExportStartTime = Date.now();
        localStorage.setItem(AUTO_EXPORT_START_TIME_KEY, String(autoExportStartTime));
      } catch (err) {
        console.warn('Auto-export failed:', err);
      }
      startInterval();
    }, initialDelay);
  } else {
    startInterval();
  }

  console.log(`Auto-export enabled: every ${Math.round(interval / 60000)} minutes`);
}

/**
 * Stop the auto-export timer
 */
export function stopAutoExport(): void {
  if (autoExportTimer) {
    clearInterval(autoExportTimer);
    autoExportTimer = null;
    autoExportStartTime = null;
    localStorage.removeItem(AUTO_EXPORT_START_TIME_KEY);
  }
}

/**
 * Check if auto-export is currently running
 */
export function isAutoExportRunning(): boolean {
  return autoExportTimer !== null;
}

/**
 * Get seconds until next auto-export (for countdown display)
 * Returns null if auto-export is disabled
 */
export function getSecondsUntilNextExport(): number | null {
  const interval = getAutoExportInterval();
  if (interval <= 0) return null;

  // Try in-memory first, then localStorage
  let startTime = autoExportStartTime;
  if (!startTime) {
    const stored = localStorage.getItem(AUTO_EXPORT_START_TIME_KEY);
    if (stored) {
      startTime = parseInt(stored, 10);
    }
  }

  if (!startTime) return null;

  const elapsed = Date.now() - startTime;
  const remaining = Math.max(0, interval - elapsed);

  return Math.ceil(remaining / 1000);
}

/**
 * Reset the auto-export countdown (call after manual export)
 */
export function resetAutoExportCountdown(): void {
  autoExportStartTime = Date.now();
  localStorage.setItem(AUTO_EXPORT_START_TIME_KEY, String(autoExportStartTime));
}

/**
 * Manually trigger a backup to localStorage
 */
export async function manualBackup(): Promise<void> {
  await saveBackupToLocalStorage();
}

/**
 * Import annotations from a JSON file
 * Returns the number of annotations imported
 */
export async function importAnnotationsFromJson(file: File): Promise<number> {
  const text = await file.text();
  const data = JSON.parse(text);

  // Validate structure
  if (!data.annotations || !Array.isArray(data.annotations)) {
    throw new Error('Invalid export file: missing annotations array');
  }

  const db = await getDb();
  let imported = 0;

  // Get the reviewer name from the export (or from individual annotations)
  const exportReviewerName = data.reviewerName;

  for (const annotation of data.annotations) {
    const { filePath, ...rest } = annotation;
    if (!filePath) continue;

    // Add reviewer name back if it was stripped at export
    const record = {
      filePath,
      reviewerName: rest.reviewerName || exportReviewerName,
      ...rest,
      lastModified: rest.lastModified || new Date().toISOString()
    };

    await db.put(STORE_NAME, record);
    imported++;
  }

  // Update backup after import
  await saveBackupToLocalStorage();

  return imported;
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

// ============================================================================
// Reactive annotation cache for table view
// ============================================================================

import { writable, type Readable } from 'svelte/store';

interface CacheState {
  completedPaths: Set<string>;
  loaded: boolean;
}

// Internal writable store
const cacheStore = writable<CacheState>({
  completedPaths: new Set(),
  loaded: false,
});

// Current state (for synchronous access)
let currentState: CacheState = {
  completedPaths: new Set(),
  loaded: false,
};

// Keep currentState in sync with store
cacheStore.subscribe(state => {
  currentState = state;
});

/**
 * Reactive cache for annotation completion status
 * Uses Svelte store for reactivity
 */
export const annotationCache = {
  /**
   * Check if a transcript is marked as review complete
   */
  isComplete(filePath: string): boolean {
    return currentState.completedPaths.has(filePath);
  },

  /**
   * Update a single entry in the cache
   */
  update(filePath: string, complete: boolean): void {
    cacheStore.update(state => {
      const newPaths = new Set(state.completedPaths);
      if (complete) {
        newPaths.add(filePath);
      } else {
        newPaths.delete(filePath);
      }
      return { ...state, completedPaths: newPaths };
    });
  },

  /**
   * Load all annotations into the cache
   * Call this when the table mounts
   */
  async load(): Promise<void> {
    const annotations = await getAllAnnotations();
    const newPaths = new Set<string>();
    for (const [filePath, annotation] of annotations) {
      if (annotation.reviewComplete) {
        newPaths.add(filePath);
      }
    }
    cacheStore.set({
      completedPaths: newPaths,
      loaded: true,
    });
  },

  /**
   * Check if cache has been loaded
   */
  isLoaded(): boolean {
    return currentState.loaded;
  },

  /**
   * Get count of completed reviews
   */
  getCompletedCount(): number {
    return currentState.completedPaths.size;
  },

  /**
   * Get all completed file paths
   */
  getCompletedPaths(): Set<string> {
    return new Set(currentState.completedPaths);
  },

  /**
   * Subscribe to cache changes (Svelte store protocol)
   */
  subscribe: cacheStore.subscribe,
};
