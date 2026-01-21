/**
 * Navigation store for transcript prev/next navigation
 * Maintains the sorted list of transcript paths from the list view
 */

// Sorted list of transcript file paths (in display order from table)
let sortedPaths = $state<string[]>([]);

// Current subdirectory path context
let currentPathContext = $state<string>('');

/**
 * Update the navigation list with sorted transcript paths
 * Called by TranscriptTable when sort order changes
 */
function setSortedPaths(paths: string[], pathContext: string = '') {
  sortedPaths = paths;
  currentPathContext = pathContext;
}

/**
 * Get navigation info for a given transcript path
 */
function getNavigation(currentFilePath: string) {
  const index = sortedPaths.findIndex(p => p === currentFilePath);

  if (index === -1) {
    return {
      hasPrev: false,
      hasNext: false,
      prevPath: null,
      nextPath: null,
      currentIndex: -1,
      totalCount: sortedPaths.length
    };
  }

  return {
    hasPrev: index > 0,
    hasNext: index < sortedPaths.length - 1,
    prevPath: index > 0 ? sortedPaths[index - 1] : null,
    nextPath: index < sortedPaths.length - 1 ? sortedPaths[index + 1] : null,
    currentIndex: index,
    totalCount: sortedPaths.length
  };
}

/**
 * Clear navigation state
 */
function clear() {
  sortedPaths = [];
  currentPathContext = '';
}

export const transcriptNavigation = {
  get sortedPaths() { return sortedPaths; },
  get currentPathContext() { return currentPathContext; },
  get count() { return sortedPaths.length; },
  setSortedPaths,
  getNavigation,
  clear
};
