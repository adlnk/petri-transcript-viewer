import type { TranscriptDisplay, TableRow } from '$lib/shared/types';
import { buildFolderTreeFromTranscripts } from '$lib/client/utils/client-tree-builder';
import { debugLog } from '$lib/client/utils/debug';
import { base } from '$app/paths';

// Check if we're in static mode
const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';

// Cache for static metadata index (lightweight, no full transcripts)
let metadataIndexCache: { metadata: any[]; transcriptCount: number } | null = null;

// Cache for dimension descriptions (loaded once, never expires)
// In static mode: loaded from /data/dimension-descriptions.json
// In node mode: loaded from /api/transcripts/descriptions
let dimensionDescriptionsCache: Record<string, string> | null = null;
let dimensionDescriptionsLoading: Promise<Record<string, string>> | null = null;

/**
 * Load dimension descriptions from static file or API.
 * Uses singleton pattern - only loads once per session.
 */
async function loadDimensionDescriptions(): Promise<Record<string, string>> {
  // Return cached if available
  if (dimensionDescriptionsCache) {
    return dimensionDescriptionsCache;
  }

  // If already loading, wait for that promise
  if (dimensionDescriptionsLoading) {
    return dimensionDescriptionsLoading;
  }

  // Start loading
  dimensionDescriptionsLoading = (async () => {
    try {
      const url = isStaticMode
        ? `${base}/data/dimension-descriptions.json`
        : '/api/transcripts/descriptions';

      debugLog('📝 [DESCRIPTIONS] Loading dimension descriptions from:', url);
      const response = await fetch(url);

      if (!response.ok) {
        console.warn(`Failed to load dimension descriptions: ${response.status}`);
        return {};
      }

      const descriptions = await response.json();
      debugLog('📝 [DESCRIPTIONS] Loaded', Object.keys(descriptions).length, 'dimension descriptions');
      dimensionDescriptionsCache = descriptions;
      return descriptions;
    } catch (err) {
      console.warn('Failed to load dimension descriptions:', err);
      return {};
    } finally {
      dimensionDescriptionsLoading = null;
    }
  })();

  return dimensionDescriptionsLoading;
}

// Module-level cache for loaded transcript data (persists across navigation)
let dataCache: {
  path: string;
  data: TranscriptDisplay[];
  timestamp: number;
} | null = null;

// Cache TTL: 5 minutes (in node mode, data can change)
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Invalidate the module-level data cache.
 * Call this when metadata is updated elsewhere (e.g., from detail view)
 * to ensure list view shows fresh data on next navigation.
 */
export function invalidateListDataCache() {
  dataCache = null;
  debugLog('🗑️ [CACHE] List data cache invalidated');
}

async function loadMetadataIndex() {
  if (metadataIndexCache) return metadataIndexCache;

  const response = await fetch(`${base}/data/metadata-index.json`);
  if (!response.ok) {
    throw new Error(`Failed to load metadata index: ${response.status}`);
  }
  metadataIndexCache = await response.json();
  return metadataIndexCache;
}

export interface LoadDataResult {
  transcripts: TranscriptDisplay[];
  folderTree: TableRow[];
  loading: boolean;
  error: string | null;
}

export function createTranscriptDataLoader() {
  // Store the raw transcript data (single source of truth)
  let rawTranscripts = $state<TranscriptDisplay[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let loadingErrors = $state<any[]>([]);
  let loadingStats = $state<any>(null);

  // Score descriptions loaded from separate file (not from transcript data)
  let scoreDescriptions = $state<Record<string, string>>({});

  // Derived views built from the raw data (cached automatically by Svelte)
  let transcripts = $derived(rawTranscripts); // Return raw transcripts for list view
  let folderTree = $derived(buildFolderTreeFromTranscripts(rawTranscripts));

  // Load dimension descriptions on startup (fire-and-forget, cached globally)
  loadDimensionDescriptions().then(descriptions => {
    scoreDescriptions = descriptions;
  });

  async function loadData(viewMode: 'list' | 'tree', subdirectoryPath?: string, forceReload = false) {
    const cachePath = subdirectoryPath || '';
    const now = Date.now();

    // Check cache first (unless force reload)
    if (!forceReload && dataCache && dataCache.path === cachePath) {
      const cacheAge = now - dataCache.timestamp;
      if (cacheAge < CACHE_TTL_MS) {
        debugLog('📦 [CACHE] Using cached data', { path: cachePath, ageMs: cacheAge });
        rawTranscripts = dataCache.data;
        loading = false;
        return;
      }
    }

    debugLog('🔄 [DEBUG] Starting unified loadData()...', { viewMode, subdirectoryPath, forceReload });
    loading = true;
    error = null;
    loadingErrors = [];
    loadingStats = null;


    try {
      const includeErrors = true; // Always include errors for debugging

      // Build rootDir parameter based on subdirectoryPath
      let rootDirParam = '';
      if (subdirectoryPath) {
        rootDirParam = `&rootDir=${encodeURIComponent(subdirectoryPath)}`;
      }

      // Always use bulk API to send all metadata at once
      await loadDataBulk(rootDirParam, includeErrors);

      // Cache the result
      dataCache = {
        path: cachePath,
        data: rawTranscripts,
        timestamp: now
      };

    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      console.error('💥 Failed to load data:', err);
      rawTranscripts = [];
      loadingStats = null;
      loadingErrors = [{
        type: 'unknown_error',
        message: error,
        file: 'API Request'
      }];
    } finally {
      loading = false;
      debugLog('🏁 [DEBUG] Loading complete. Final state:', {
        loading,
        error,
        rawTranscriptsLength: rawTranscripts.length,
        derivedTranscriptsLength: transcripts.length,
        derivedFolderTreeLength: folderTree.length
      });
    }
  }

  // Force invalidate cache and reload
  function invalidateCache() {
    dataCache = null;
  }

  async function loadDataBulk(rootDirParam: string, includeErrors: boolean) {
    // Static mode: use metadata index (lazy loading)
    if (isStaticMode) {
      debugLog('[DEBUG] Loading from metadata index');
      const indexData = await loadMetadataIndex();
      let transcriptList = indexData?.metadata || [];

      // Filter by subdirectory if specified
      if (rootDirParam) {
        const subdirPath = decodeURIComponent(rootDirParam.replace(/^&?rootDir=/, ''));
        transcriptList = transcriptList.filter((t: any) =>
          t._filePath.startsWith(subdirPath + '/') || t._filePath.startsWith(subdirPath)
        );
      }

      rawTranscripts = transcriptList;
      loadingStats = null;
      loadingErrors = [];

      debugLog('[DEBUG] Static data loaded:', { transcriptCount: rawTranscripts.length });
      return;
    }

    // Node mode: use API endpoint
    const url = `/api/transcripts/list${rootDirParam ? `?${rootDirParam.slice(1)}` : ''}`;
    debugLog('[DEBUG] Fetching unified data from:', url);
    const response = await fetch(url);
    debugLog('[DEBUG] Response:', response.status, response.ok);

    if (!response.ok) {
      throw new Error(`Failed to load transcripts: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    rawTranscripts = Array.isArray(data) ? data : [];
    loadingStats = null;
    loadingErrors = [];

    debugLog('[DEBUG] Data loaded successfully:', {
      transcriptCount: rawTranscripts.length,
      hasStats: !!loadingStats,
      errorCount: loadingErrors.length
    });
  }

  

  return {
    get transcripts() { return transcripts; },
    get folderTree() { return folderTree; },
    get loading() { return loading; },
    get error() { return error; },
    get loadingErrors() {
      return loadingErrors;
    },
    get loadingStats() { return loadingStats; },
    // Score descriptions loaded from separate file (not from individual transcripts)
    get scoreDescriptions() { return scoreDescriptions; },
    loadData,
    invalidateCache
  };
}