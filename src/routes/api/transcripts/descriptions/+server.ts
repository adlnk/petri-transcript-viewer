import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TRANSCRIPT_DIR } from '$lib/server/config';

// Check if we're in static mode using build-time env var
const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';

// Cache for descriptions (collected once, reused)
let descriptionsCache: Record<string, string> | null = null;
let descriptionsCacheLoading: Promise<Record<string, string>> | null = null;

// Dynamic import for node mode (only loaded when needed)
let collectDimensionDescriptions: typeof import('$lib/server/data-loading/cached-bulk-loader').collectDimensionDescriptions;

async function loadDescriptions(): Promise<Record<string, string>> {
  // Return cached if available
  if (descriptionsCache) {
    return descriptionsCache;
  }

  // If already loading, wait for that promise (avoid duplicate work)
  if (descriptionsCacheLoading) {
    return descriptionsCacheLoading;
  }

  // Start loading
  descriptionsCacheLoading = (async () => {
    if (!collectDimensionDescriptions) {
      const loaderModule = await import('$lib/server/data-loading/cached-bulk-loader');
      collectDimensionDescriptions = loaderModule.collectDimensionDescriptions;
    }

    console.log('📝 [DESCRIPTIONS-API] Loading dimension descriptions...');
    const startTime = Date.now();
    const descriptions = await collectDimensionDescriptions(TRANSCRIPT_DIR);
    console.log(`✅ [DESCRIPTIONS-API] Loaded ${Object.keys(descriptions).length} descriptions in ${Date.now() - startTime}ms`);

    descriptionsCache = descriptions;
    return descriptions;
  })();

  try {
    return await descriptionsCacheLoading;
  } finally {
    descriptionsCacheLoading = null;
  }
}

export const GET: RequestHandler = async () => {
  try {
    // Static mode: return empty (client loads from bundled dimension-descriptions.json)
    if (isStaticMode) {
      return json({});
    }

    // Node mode: use cached descriptions (loads once per server lifecycle)
    const descriptions = await loadDescriptions();
    return json(descriptions);

  } catch (err: any) {
    console.error('Descriptions API error:', err);
    throw error(500, { message: 'Failed to load dimension descriptions' });
  }
};
