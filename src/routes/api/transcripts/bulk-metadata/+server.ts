import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Check if we're in static mode (display mode = no editing)
const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';

// Dynamic imports for node mode
let validateFilePath: typeof import('$lib/server/utils/server-file-utils').validateFilePath;
let getTranscriptCache: typeof import('$lib/server/cache/transcript-cache').getTranscriptCache;
let TRANSCRIPT_DIR: string;
let fs: typeof import('fs').promises;
let path: typeof import('path');

async function ensureNodeImports() {
  if (!validateFilePath) {
    const serverFileUtils = await import('$lib/server/utils/server-file-utils');
    validateFilePath = serverFileUtils.validateFilePath;
    const transcriptCache = await import('$lib/server/cache/transcript-cache');
    getTranscriptCache = transcriptCache.getTranscriptCache;
    const config = await import('$lib/server/config');
    TRANSCRIPT_DIR = config.TRANSCRIPT_DIR;
    fs = (await import('fs')).promises;
    path = await import('path');
  }
}

interface BulkMetadataUpdateRequest {
  filePaths: string[];
  add_tags?: string[];      // Tags to add to user_tags
  remove_tags?: string[];   // Tags to remove from user_tags
  share_online?: boolean;   // Set share_online flag
}

interface BulkUpdateResult {
  filePath: string;
  success: boolean;
  error?: string;
}

/**
 * POST /api/transcripts/bulk-metadata
 * Bulk update transcript metadata (user_tags, share_online)
 * Only available in admin mode (local/node mode)
 */
export const POST: RequestHandler = async ({ request }) => {
  // Admin mode check: static mode = display only
  if (isStaticMode) {
    throw error(405, {
      message: 'Editing requires admin mode. This viewer is in display-only mode.'
    });
  }

  try {
    await ensureNodeImports();

    const body: BulkMetadataUpdateRequest = await request.json();
    const { filePaths, add_tags, remove_tags, share_online } = body;

    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      throw error(400, { message: 'Missing or empty filePaths array' });
    }

    const cache = getTranscriptCache();
    const results: BulkUpdateResult[] = [];

    for (const filePath of filePaths) {
      try {
        // Validate the file path
        if (!validateFilePath(filePath)) {
          results.push({ filePath, success: false, error: 'Invalid file path' });
          continue;
        }

        const resolvedPath = path.resolve(TRANSCRIPT_DIR, filePath);

        // Read existing transcript
        let transcriptData: any;
        try {
          const content = await fs.readFile(resolvedPath, 'utf-8');
          transcriptData = JSON.parse(content);
        } catch (err: any) {
          if (err.code === 'ENOENT') {
            results.push({ filePath, success: false, error: 'File not found' });
            continue;
          }
          results.push({ filePath, success: false, error: `Read error: ${err.message}` });
          continue;
        }

        // Ensure metadata object exists
        if (!transcriptData.metadata) {
          transcriptData.metadata = {};
        }

        // Handle tag additions
        if (add_tags && add_tags.length > 0) {
          const existingTags = transcriptData.metadata.user_tags || [];
          const newTags = [...new Set([...existingTags, ...add_tags])];
          transcriptData.metadata.user_tags = newTags;
        }

        // Handle tag removals
        if (remove_tags && remove_tags.length > 0) {
          const existingTags = transcriptData.metadata.user_tags || [];
          transcriptData.metadata.user_tags = existingTags.filter(
            (tag: string) => !remove_tags.includes(tag)
          );
        }

        // Handle share_online
        if (share_online !== undefined) {
          transcriptData.metadata.share_online = share_online;
        }

        // Update timestamp
        transcriptData.metadata.updated_at = new Date().toISOString();

        // Write back to file
        await fs.writeFile(resolvedPath, JSON.stringify(transcriptData, null, 2), 'utf-8');

        // Invalidate cache
        cache.invalidateTranscript(resolvedPath);

        results.push({ filePath, success: true });

      } catch (err: any) {
        results.push({ filePath, success: false, error: err.message || 'Unknown error' });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return json({
      success: failCount === 0,
      successCount,
      failCount,
      results
    });

  } catch (err: any) {
    if (err.status) {
      throw err;
    }
    console.error('Bulk metadata update error:', err);
    throw error(500, { message: 'Internal server error while updating metadata' });
  }
};
