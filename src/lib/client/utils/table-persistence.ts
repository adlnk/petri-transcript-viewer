import type { VisibilityState, ColumnSizingState, ColumnFiltersState } from '@tanstack/svelte-table';
import { STORAGE_KEYS } from '$lib/shared/constants';

/**
 * Load column visibility from localStorage
 */
export function loadColumnVisibility(): VisibilityState {
  if (typeof window === 'undefined') return {};
  
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.COLUMN_VISIBILITY);
    if (!stored) return {};
    
    const visibleColumns = JSON.parse(stored) as string[];
    const visibility: VisibilityState = {};
    
    // Set all columns to false first, then set visible ones to true
    visibleColumns.forEach(columnId => {
      visibility[columnId] = true;
    });
    
    return visibility;
  } catch (error) {
    console.warn('Failed to load column visibility from localStorage:', error);
    return {};
  }
}

/**
 * Save column visibility to localStorage
 */
export function saveColumnVisibility(columnVisibility: VisibilityState): void {
  if (typeof window === 'undefined') return;
  
  try {
    const visibleColumns = Object.entries(columnVisibility)
      .filter(([_, visible]) => visible)
      .map(([key, _]) => key);
    
    localStorage.setItem(STORAGE_KEYS.COLUMN_VISIBILITY, JSON.stringify(visibleColumns));
  } catch (error) {
    console.warn('Failed to save column visibility to localStorage:', error);
  }
}

/**
 * Load column sizing from localStorage
 */
export function loadColumnSizing(): ColumnSizingState {
  if (typeof window === 'undefined') return {};
  
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.COLUMN_SIZING);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.warn('Failed to load column sizing from localStorage:', error);
    return {};
  }
}

/**
 * Save column sizing to localStorage
 */
export function saveColumnSizing(columnSizing: ColumnSizingState): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEYS.COLUMN_SIZING, JSON.stringify(columnSizing));
  } catch (error) {
    console.warn('Failed to save column sizing to localStorage:', error);
  }
}

/**
 * Load column filters from localStorage
 */
export function loadColumnFilters(): ColumnFiltersState {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEYS.FILTER_STATE);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.warn('Failed to load column filters from localStorage:', error);
    return [];
  }
}

/**
 * Save column filters to localStorage
 */
export function saveColumnFilters(columnFilters: ColumnFiltersState): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEYS.FILTER_STATE, JSON.stringify(columnFilters));
  } catch (error) {
    console.warn('Failed to save column filters to localStorage:', error);
  }
}

/**
 * Clear column filters from localStorage
 */
export function clearColumnFilters(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(STORAGE_KEYS.FILTER_STATE);
  } catch (error) {
    console.warn('Failed to clear column filters from localStorage:', error);
  }
}