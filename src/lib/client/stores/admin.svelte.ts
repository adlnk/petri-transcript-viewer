/**
 * Admin mode store for managing edit capabilities
 * Currently: local (node mode) = admin, online (static mode) = display only
 * Future: could add auth-gated admin mode online
 */

// Check if we're in static mode (display only)
const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';

// Admin mode state
let isAdminMode = $state(!isStaticMode);
let transcriptDir = $state<string | null>(null);
let adminInfoLoaded = $state(false);

/**
 * Load admin info from server (only works in admin mode)
 */
async function loadAdminInfo(): Promise<void> {
  if (isStaticMode || adminInfoLoaded) return;

  try {
    const response = await fetch('/api/admin/info');
    if (response.ok) {
      const data = await response.json();
      transcriptDir = data.transcriptDir || null;
    }
  } catch (err) {
    console.warn('Failed to load admin info:', err);
  }

  adminInfoLoaded = true;
}

/**
 * Get admin mode state
 */
export function getAdminMode() {
  return {
    get isAdminMode() { return isAdminMode; },
    get transcriptDir() { return transcriptDir; },
    get loaded() { return adminInfoLoaded; },
    loadAdminInfo
  };
}

// Export reactive getters for use in components
export const adminMode = {
  get isAdminMode() { return isAdminMode; },
  get transcriptDir() { return transcriptDir; },
  get loaded() { return adminInfoLoaded; },
  loadAdminInfo
};
