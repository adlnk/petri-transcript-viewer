import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Check if we're in static mode using build-time env var
const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';

// Dynamic import for node mode (only loaded when needed)
let collectDimensionDescriptions: typeof import('$lib/server/data-loading/cached-bulk-loader').collectDimensionDescriptions;

export const GET: RequestHandler = async () => {
  try {
    // Static mode: return empty (client loads from bundled dimension-descriptions.json)
    if (isStaticMode) {
      return json({});
    }

    // Node mode: collect descriptions from all transcripts
    if (!collectDimensionDescriptions) {
      const loaderModule = await import('$lib/server/data-loading/cached-bulk-loader');
      collectDimensionDescriptions = loaderModule.collectDimensionDescriptions;
    }

    // Get transcript directory from env (default to ./transcripts)
    const transcriptDir = process.env.TRANSCRIPT_DIR || './transcripts';
    const descriptions = await collectDimensionDescriptions(transcriptDir);

    return json(descriptions);

  } catch (err: any) {
    console.error('Descriptions API error:', err);
    throw error(500, { message: 'Failed to load dimension descriptions' });
  }
};
