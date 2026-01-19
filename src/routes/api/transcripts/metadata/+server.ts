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

interface MetadataUpdateRequest {
  filePath: string;
  user_tags?: string[];
  share_online?: boolean;
}

/**
 * POST /api/transcripts/metadata
 * Update transcript metadata (user_tags, share_online)
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

    const body: MetadataUpdateRequest = await request.json();
    const { filePath, user_tags, share_online } = body;

    if (!filePath) {
      throw error(400, { message: 'Missing required parameter: filePath' });
    }

    // Validate the file path
    if (!validateFilePath(filePath)) {
      throw error(400, { message: `Invalid or unsafe file path: ${filePath}` });
    }

    // Handle both absolute and relative paths
    // If filePath is already absolute and under TRANSCRIPT_DIR, use it directly
    // Otherwise, resolve it relative to TRANSCRIPT_DIR
    let resolvedPath: string;
    if (path.isAbsolute(filePath) && filePath.startsWith(TRANSCRIPT_DIR)) {
      resolvedPath = filePath;
    } else {
      resolvedPath = path.resolve(TRANSCRIPT_DIR, filePath);
    }

    console.log(`[METADATA API] Request: path=${filePath.split('/').slice(-2).join('/')} user_tags=${JSON.stringify(user_tags)} share_online=${share_online}`);
    console.log(`[METADATA API] Resolved: ${resolvedPath}`);

    // Read existing transcript
    let transcriptData: any;
    try {
      const content = await fs.readFile(resolvedPath, 'utf-8');
      transcriptData = JSON.parse(content);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw error(404, { message: `Transcript not found: ${filePath}` });
      }
      throw error(500, { message: `Failed to read transcript: ${err.message}` });
    }

    // Ensure metadata object exists
    if (!transcriptData.metadata) {
      transcriptData.metadata = {};
    }

    // Update fields if provided
    if (user_tags !== undefined) {
      transcriptData.metadata.user_tags = user_tags;
    }
    if (share_online !== undefined) {
      transcriptData.metadata.share_online = share_online;
    }

    // Update timestamp
    transcriptData.metadata.updated_at = new Date().toISOString();

    // Write back to file (pretty-printed)
    try {
      await fs.writeFile(resolvedPath, JSON.stringify(transcriptData, null, 2), 'utf-8');
      console.log('[METADATA API] ✅ Wrote to:', resolvedPath);
    } catch (err: any) {
      console.error('[METADATA API] ❌ Write failed:', err.message);
      throw error(500, { message: `Failed to write transcript: ${err.message}` });
    }

    // Invalidate cache
    const cache = getTranscriptCache();
    cache.invalidateTranscript(resolvedPath);

    console.log('[METADATA API] ✅ Complete. user_tags:', transcriptData.metadata.user_tags, 'share_online:', transcriptData.metadata.share_online);

    return json({
      success: true,
      metadata: transcriptData.metadata
    });

  } catch (err: any) {
    if (err.status) {
      throw err;
    }
    console.error('Metadata update error:', err);
    throw error(500, { message: 'Internal server error while updating metadata' });
  }
};
