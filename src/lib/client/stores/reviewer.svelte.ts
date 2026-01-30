/**
 * Reviewer mode store for managing reviewer identity and capabilities
 *
 * Three modes:
 * - Static mode (VITE_STATIC_MODE=true): Display only
 * - Reviewer mode (VITE_REVIEWER_MODE=true): Annotation capabilities with restrictions
 * - Admin mode (neither set): Full editing in Node.js mode
 */

import { browser } from '$app/environment';

// Mode detection from build-time env
const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';
const isReviewerMode = import.meta.env.VITE_REVIEWER_MODE === 'true';

// Reviewer identity
const REVIEWER_NAME_KEY = 'reviewer-name';
let reviewerName = $state<string | null>(null);

// Initialize reviewer name from localStorage (only in browser)
if (browser) {
  reviewerName = localStorage.getItem(REVIEWER_NAME_KEY);
}

/**
 * Set the reviewer's name and persist to localStorage
 */
function setReviewerName(name: string): void {
  reviewerName = name;
  if (browser) {
    localStorage.setItem(REVIEWER_NAME_KEY, name);
  }
}

/**
 * Clear the reviewer's name from localStorage
 */
function clearReviewerName(): void {
  reviewerName = null;
  if (browser) {
    localStorage.removeItem(REVIEWER_NAME_KEY);
  }
}

/**
 * Check if reviewer has identified themselves
 */
function hasReviewerName(): boolean {
  return reviewerName !== null && reviewerName.trim().length > 0;
}

// Capability definitions
export type Capability =
  | 'viewTranscripts'
  | 'addUserTags'
  | 'removeUserTags'
  | 'removeOriginalTags'
  | 'editNotes'
  | 'toggleShareOnline'
  | 'addReviewerScores'
  | 'addIssueFlags'
  | 'exportAnnotations';

/**
 * Get capabilities based on current mode
 */
function getCapabilities(): Set<Capability> {
  const caps = new Set<Capability>();

  // All modes can view
  caps.add('viewTranscripts');

  if (isReviewerMode) {
    // Reviewer mode capabilities
    caps.add('addUserTags');
    caps.add('removeUserTags');
    caps.add('editNotes');
    caps.add('addReviewerScores');
    caps.add('addIssueFlags');
    caps.add('exportAnnotations');
  } else if (!isStaticMode) {
    // Admin mode (full capabilities)
    caps.add('addUserTags');
    caps.add('removeUserTags');
    caps.add('removeOriginalTags');
    caps.add('editNotes');
    caps.add('toggleShareOnline');
  }

  return caps;
}

/**
 * Check if a specific capability is available
 */
function can(capability: Capability): boolean {
  return getCapabilities().has(capability);
}

// Mode type for display purposes
export type ViewerMode = 'static' | 'reviewer' | 'admin';

function getCurrentMode(): ViewerMode {
  if (isReviewerMode) return 'reviewer';
  if (isStaticMode) return 'static';
  return 'admin';
}

// Export reactive state and functions
export const reviewerStore = {
  get reviewerName() { return reviewerName; },
  get isReviewerMode() { return isReviewerMode; },
  get isStaticMode() { return isStaticMode; },
  get mode() { return getCurrentMode(); },
  setReviewerName,
  clearReviewerName,
  hasReviewerName,
  can,
  getCapabilities
};
