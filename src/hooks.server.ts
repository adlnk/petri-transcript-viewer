import type { Handle } from '@sveltejs/kit';

// Check if we're in static build mode using build-time env var
const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';

// Only import cache modules in node mode
let initializeGlobalCache: typeof import('$lib/server/cache/transcript-cache').initializeGlobalCache;
let shutdownGlobalCache: typeof import('$lib/server/cache/transcript-cache').shutdownGlobalCache;
let getTranscriptCache: typeof import('$lib/server/cache/transcript-cache').getTranscriptCache;
let TRANSCRIPT_DIR: string;

// Initialize cache on server startup (node mode only)
let cacheInitialized = false;

async function initializeCache() {
  if (cacheInitialized || isStaticMode) return;

  try {
    // Dynamic imports for node mode
    const cacheModule = await import('$lib/server/cache/transcript-cache');
    initializeGlobalCache = cacheModule.initializeGlobalCache;
    shutdownGlobalCache = cacheModule.shutdownGlobalCache;
    getTranscriptCache = cacheModule.getTranscriptCache;

    const config = await import('$lib/server/config');
    TRANSCRIPT_DIR = config.TRANSCRIPT_DIR;

    console.log(`[SERVER] Initializing transcript cache for directory: ${TRANSCRIPT_DIR}`);

    // Initialize transcript cache with file watcher
    await initializeGlobalCache(TRANSCRIPT_DIR);

    cacheInitialized = true;

    console.log('[SERVER] Transcript cache initialized successfully');
  } catch (error) {
    console.error('[SERVER] Failed to initialize transcript cache:', error);
    // Don't throw - server should still work without cache
  }
}

// Graceful shutdown handler (node mode only)
if (!isStaticMode) {
  process.on('SIGTERM', async () => {
    console.log('[SERVER] Received SIGTERM, shutting down gracefully...');
    if (shutdownGlobalCache) await shutdownGlobalCache();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('[SERVER] Received SIGINT, shutting down gracefully...');
    if (shutdownGlobalCache) await shutdownGlobalCache();
    process.exit(0);
  });
}

export const handle: Handle = async ({ event, resolve }) => {
  // Skip cache initialization in static mode
  if (isStaticMode) {
    return resolve(event);
  }

  // Initialize cache on first request (node mode)
  if (!cacheInitialized) {
    await initializeCache();
  }

  // Add cache statistics to locals for debugging
  if (event.url.pathname.startsWith('/api/') && getTranscriptCache) {
    const cache = getTranscriptCache();
    event.locals.cacheStats = cache.getStats();
  }

  const response = await resolve(event);

  // Add cache statistics to response headers for debugging (in development)
  if (process.env.NODE_ENV === 'development' && event.locals.cacheStats) {
    const stats = event.locals.cacheStats;
    response.headers.set('X-Cache-Metadata-Count', stats.metadataCount.toString());
    response.headers.set('X-Cache-Transcript-Count', stats.fullTranscriptCount.toString());
    response.headers.set('X-Cache-Hit-Rate',
      stats.cacheHits + stats.cacheMisses > 0
        ? (stats.cacheHits / (stats.cacheHits + stats.cacheMisses) * 100).toFixed(1) + '%'
        : '0%'
    );
  }

  return response;
};

// Type augmentation for locals
declare global {
  namespace App {
    interface Locals {
      cacheStats?: {
        metadataCount: number;
        fullTranscriptCount: number;
        cacheHits: number;
        cacheMisses: number;
        fileWatcherActive: boolean;
      };
    }
  }
}
