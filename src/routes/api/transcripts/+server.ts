import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { BUNDLED_TRANSCRIPTS } from '$lib/server/data/bundled-transcripts';

// Check if we're in static mode using build-time env var
const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';

// Dynamic imports for node mode (only loaded when needed)
let validateFilePath: typeof import('$lib/server/utils/server-file-utils').validateFilePath;
let getTranscriptCache: typeof import('$lib/server/cache/transcript-cache').getTranscriptCache;
let TRANSCRIPT_DIR: string;

async function ensureNodeImports() {
  if (!validateFilePath) {
    const serverFileUtils = await import('$lib/server/utils/server-file-utils');
    validateFilePath = serverFileUtils.validateFilePath;
    const transcriptCache = await import('$lib/server/cache/transcript-cache');
    getTranscriptCache = transcriptCache.getTranscriptCache;
    const config = await import('$lib/server/config');
    TRANSCRIPT_DIR = config.TRANSCRIPT_DIR;
  }
}

export const GET: RequestHandler = async ({ url }) => {
  try {
    const filePath = url.searchParams.get('filePath');
    const metadataOnly = url.searchParams.get('metadataOnly') === 'true';

    if (!filePath) {
      throw error(400, {
        message: 'Missing required parameter: filePath'
      });
    }

    // Static mode: use bundled data
    if (isStaticMode) {
      const transcript = BUNDLED_TRANSCRIPTS[filePath];

      if (!transcript) {
        throw error(404, {
          message: `Transcript not found: ${filePath}`
        });
      }

      if (metadataOnly) {
        // Return without the full transcript data
        const { transcript: _fullTranscript, ...metadata } = transcript;
        return json({
          success: true,
          data: metadata
        }, {
          headers: {
            'Cache-Control': 'public, max-age=300',
          }
        });
      }

      return json({
        success: true,
        data: transcript
      }, {
        headers: {
          'Cache-Control': 'public, max-age=60',
        }
      });
    }

    // Node mode: use filesystem loading
    await ensureNodeImports();

    const { default: path } = await import('path');

    // Validate the relative file path
    if (!validateFilePath(filePath)) {
      throw error(400, {
        message: `Invalid or unsafe file path: ${filePath}`
      });
    }

    const resolvedPath = path.resolve(TRANSCRIPT_DIR, filePath);
    const cache = getTranscriptCache();

    if (metadataOnly) {
      const metadata = await cache.getMetadata(resolvedPath);

      if (metadata === null) {
        throw error(404, {
          message: `Transcript not found: ${filePath}`
        });
      }

      return json({
        success: true,
        data: metadata
      }, {
        headers: {
          'Cache-Control': 'public, max-age=300',
        }
      });

    } else {
      const transcript = await cache.getFullTranscript(resolvedPath);

      if (transcript === null) {
        throw error(404, {
          message: `Transcript not found: ${filePath}`
        });
      }

      return json({
        success: true,
        data: transcript
      }, {
        headers: {
          'Cache-Control': 'public, max-age=60',
        }
      });
    }

  } catch (err: any) {
    if (err.status) {
      throw err;
    }

    if (err?.code === 'TRANSCRIPT_VALIDATION_FAILED' && err.validation) {
      const { errors: validationErrors } = err.validation;
      const details = validationErrors?.map?.((e: any, i: number) => {
        const pathStr = e.path || 'root';
        return `${i + 1}. ${pathStr}: ${e.message}`;
      })?.join('\n');
      console.error('Transcript validation error:', details);
      throw error(422, {
        message: 'Transcript schema validation failed',
        details,
      } as any);
    }

    console.error('Transcript API error:', err);

    throw error(500, {
      message: 'Internal server error while loading transcript'
    });
  }
};
