import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TRANSCRIPT_LIST_METADATA } from '$lib/server/data/bundled-transcripts';

// Check if we're in static mode using build-time env var
const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';

// Dynamic imports for node mode (only loaded when needed)
let loadCachedTranscriptsMetadataOnly: typeof import('$lib/server/data-loading/cached-bulk-loader').loadCachedTranscriptsMetadataOnly;
let TRANSCRIPT_DIR: string;

async function ensureNodeImports() {
  if (!loadCachedTranscriptsMetadataOnly) {
    const bulkLoader = await import('$lib/server/data-loading/cached-bulk-loader');
    loadCachedTranscriptsMetadataOnly = bulkLoader.loadCachedTranscriptsMetadataOnly;
    const config = await import('$lib/server/config');
    TRANSCRIPT_DIR = config.TRANSCRIPT_DIR;
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
          t._filePath.startsWith(subdirectoryPath + '/') || t._filePath.startsWith(subdirectoryPath)
        );
        return json(filtered);
      }

      return json(TRANSCRIPT_LIST_METADATA);
    }

    // Node mode: use filesystem loading
    await ensureNodeImports();

    const { default: path } = await import('path');
    const subdirectoryPath = url.searchParams.get('rootDir');
    const rootDir = subdirectoryPath
      ? path.resolve(TRANSCRIPT_DIR, subdirectoryPath)
      : TRANSCRIPT_DIR;

    const result = await loadCachedTranscriptsMetadataOnly(rootDir);
    return json(result.transcripts);

  } catch (err: any) {
    console.error('Metadata list API error:', err);
    throw error(500, { message: 'Failed to load transcript metadata list' });
  }
};
