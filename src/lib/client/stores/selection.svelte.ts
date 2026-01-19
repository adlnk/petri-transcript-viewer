/**
 * Selection store for bulk operations in admin mode
 */

// Set of selected transcript file paths
let selectedPaths = $state<Set<string>>(new Set());

// Version counter that increments on every change - used to trigger reactivity in consumers
let version = $state(0);

/**
 * Toggle selection for a single transcript
 */
export function toggleSelection(filePath: string): void {
  const newSet = new Set(selectedPaths);
  if (newSet.has(filePath)) {
    newSet.delete(filePath);
  } else {
    newSet.add(filePath);
  }
  selectedPaths = newSet;
  version++;
}

/**
 * Select multiple transcripts
 */
export function selectMultiple(filePaths: string[]): void {
  const newSet = new Set(selectedPaths);
  filePaths.forEach(path => newSet.add(path));
  selectedPaths = newSet;
  version++;
}

/**
 * Deselect multiple transcripts
 */
export function deselectMultiple(filePaths: string[]): void {
  const newSet = new Set(selectedPaths);
  filePaths.forEach(path => newSet.delete(path));
  selectedPaths = newSet;
  version++;
}

/**
 * Select all from a list of file paths
 */
export function selectAll(filePaths: string[]): void {
  selectedPaths = new Set(filePaths);
  version++;
}

/**
 * Clear all selections
 */
export function clearSelection(): void {
  selectedPaths = new Set();
  version++;
}

/**
 * Check if a transcript is selected
 */
export function isSelected(filePath: string): boolean {
  return selectedPaths.has(filePath);
}

/**
 * Get selection state
 */
export const selection = {
  get paths() { return selectedPaths; },
  get count() { return selectedPaths.size; },
  get isEmpty() { return selectedPaths.size === 0; },
  get version() { return version; },  // For triggering reactivity in consumers
  isSelected,
  toggle: toggleSelection,
  selectAll,
  selectMultiple,
  deselectMultiple,
  clear: clearSelection,
  getSelectedPaths: () => Array.from(selectedPaths)
};
