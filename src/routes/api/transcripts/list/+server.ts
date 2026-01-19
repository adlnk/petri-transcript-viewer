import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { TranscriptDisplay } from '$lib/shared/types';
import { TRANSCRIPT_LIST_METADATA } from '$lib/server/data/bundled-transcripts';
import { TRANSCRIPT_DIR } from '$lib/server/config';

// Check if we're in static mode using build-time env var
const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';

// Server-side response cache for node mode
// Avoids re-scanning directory and re-building list on every request
interface ListCache {
  transcripts: TranscriptDisplay[];
  timestamp: number;
}
const listCache = new Map<string, ListCache>();
const LIST_CACHE_TTL_MS = 60 * 1000; // 1 minute TTL (file watcher handles updates)

// Dynamic imports for node mode (only loaded when needed)
let loadCachedTranscriptsMetadataOnly: typeof import('$lib/server/data-loading/cached-bulk-loader').loadCachedTranscriptsMetadataOnly;

async function ensureLoaderReady() {
  if (!loadCachedTranscriptsMetadataOnly) {
    const loaderModule = await import('$lib/server/data-loading/cached-bulk-loader');
    loadCachedTranscriptsMetadataOnly = loaderModule.loadCachedTranscriptsMetadataOnly;
  }
}

export const GET: RequestHandler = async ({ url }) => {
  try {
    // Static mode: use bundled data
    if (isStaticMode) {
      const subdirectoryPath = url.searchParams.get('rootDir');

      // Filter by subdirectory if specified
      if (subdirectoryPath) {
        const filtered = TRANSCRIPT_LIST_METADATA.filter(t =>
          t._filePath?.startsWith(subdirectoryPath + '/') || t._filePath?.startsWith(subdirectoryPath)
        );
        return json(filtered);
      }

      return json(TRANSCRIPT_LIST_METADATA);
    }

    // Node mode: use server-side response cache
    const subdirectoryPath = url.searchParams.get('rootDir');
    const cacheKey = subdirectoryPath || '__root__';
    const now = Date.now();

    // Check cache first
    const cached = listCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < LIST_CACHE_TTL_MS) {
      console.log(`📦 [LIST-API] Cache hit for "${cacheKey}" (age: ${now - cached.timestamp}ms)`);
      return json(cached.transcripts);
    }

    // Cache miss - load from disk
    console.log(`🔄 [LIST-API] Cache miss for "${cacheKey}", loading from disk...`);
    await ensureLoaderReady();

    const loadDir = subdirectoryPath
      ? `${TRANSCRIPT_DIR}/${subdirectoryPath}`
      : TRANSCRIPT_DIR;

    const startTime = Date.now();
    const result = await loadCachedTranscriptsMetadataOnly(loadDir, false);
    const loadTime = Date.now() - startTime;
    console.log(`✅ [LIST-API] Loaded ${result.transcripts.length} transcripts in ${loadTime}ms`);

    // Cache the result
    listCache.set(cacheKey, {
      transcripts: result.transcripts,
      timestamp: now
    });

    return json(result.transcripts);

  } catch (err: any) {
    console.error('Metadata list API error:', err);
    throw error(500, { message: 'Failed to load transcript metadata list' });
  }
};
