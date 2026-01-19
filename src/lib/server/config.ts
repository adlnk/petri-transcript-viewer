import path from 'path';
import dotenv from 'dotenv';
import { DEFAULT_TRANSCRIPT_DIR } from '$lib/shared/constants';

// Load .env.local if present (Vite doesn't expose these to process.env in SSR)
// process.cwd() is the project root when running npm run dev
const envLocalPath = path.join(process.cwd(), '.env.local');
const envPath = path.join(process.cwd(), '.env');
const localResult = dotenv.config({ path: envLocalPath });
const envResult = dotenv.config({ path: envPath });

console.log(`[CONFIG] Loaded .env.local: ${localResult.error ? 'failed' : 'success'}`);
console.log(`[CONFIG] TRANSCRIPT_DIR from env: ${process.env.TRANSCRIPT_DIR || '(not set)'}`);

/**
 * The absolute path to the base transcript directory.
 * Resolved once at startup from the TRANSCRIPT_DIR environment variable or a default.
 */
export const TRANSCRIPT_DIR = path.resolve(process.env.TRANSCRIPT_DIR || DEFAULT_TRANSCRIPT_DIR);

console.log(`[CONFIG] Transcript directory resolved to: ${TRANSCRIPT_DIR}`);
