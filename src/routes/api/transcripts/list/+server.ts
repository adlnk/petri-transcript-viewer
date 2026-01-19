import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TRANSCRIPT_LIST_METADATA } from '$lib/server/data/bundled-transcripts';
import { TRANSCRIPT_DIR } from '$lib/server/config';

// Check if we're in static mode using build-time env var
const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';

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

    // Node mode: load metadata using cached bulk loader
    await ensureLoaderReady();

    const subdirectoryPath = url.searchParams.get('rootDir');
    const loadDir = subdirectoryPath
      ? `${TRANSCRIPT_DIR}/${subdirectoryPath}`
      : TRANSCRIPT_DIR;

    const result = await loadCachedTranscriptsMetadataOnly(loadDir, false);
    return json(result.transcripts);

  } catch (err: any) {
    console.error('Metadata list API error:', err);
    throw error(500, { message: 'Failed to load transcript metadata list' });
  }
};
