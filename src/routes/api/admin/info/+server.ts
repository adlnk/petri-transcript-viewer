import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Check if we're in static mode (display mode = no admin)
const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';

// Dynamic imports for node mode
let TRANSCRIPT_DIR: string;

async function ensureNodeImports() {
  if (!TRANSCRIPT_DIR) {
    const config = await import('$lib/server/config');
    TRANSCRIPT_DIR = config.TRANSCRIPT_DIR;
  }
}

/**
 * GET /api/admin/info
 * Returns admin mode information (only available in node mode)
 */
export const GET: RequestHandler = async () => {
  // Static mode = display only, no admin
  if (isStaticMode) {
    return json({
      isAdminMode: false,
      transcriptDir: null
    });
  }

  try {
    await ensureNodeImports();

    return json({
      isAdminMode: true,
      transcriptDir: TRANSCRIPT_DIR
    });

  } catch (err: any) {
    console.error('Admin info error:', err);
    throw error(500, { message: 'Failed to load admin info' });
  }
};
