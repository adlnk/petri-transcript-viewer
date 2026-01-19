import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TRANSCRIPT_LIST_METADATA } from '$lib/server/data/bundled-transcripts';

// Check if we're in static mode using build-time env var
const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';

// Dynamic imports for node mode (only loaded when needed)
let getMetadataIndex: typeof import('$lib/server/cache/metadata-index').getMetadataIndex;
let initializeMetadataIndex: typeof import('$lib/server/cache/metadata-index').initializeMetadataIndex;
let indexInitialized = false;

async function ensureIndexReady() {
  if (!getMetadataIndex) {
    const indexModule = await import('$lib/server/cache/metadata-index');
    getMetadataIndex = indexModule.getMetadataIndex;
    initializeMetadataIndex = indexModule.initializeMetadataIndex;
  }

  if (!indexInitialized) {
    await initializeMetadataIndex();
    indexInitialized = true;
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

    // Node mode: use persistent metadata index
    await ensureIndexReady();

    const index = getMetadataIndex();
    const subdirectoryPath = url.searchParams.get('rootDir');

    if (subdirectoryPath) {
      return json(index.getByDirectory(subdirectoryPath));
    }

    return json(index.getAll());

  } catch (err: any) {
    console.error('Metadata list API error:', err);
    throw error(500, { message: 'Failed to load transcript metadata list' });
  }
};
