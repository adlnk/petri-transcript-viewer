import type { TranscriptDisplay } from '$lib/shared/types';
import { scanDirectoryForTranscripts, checkPathAccess } from './file-scanner';
import type { LoadingResult, LoadingError, LoadingStats } from './types';
import { getTranscriptCache } from '$lib/server/cache/transcript-cache';
import { DEFAULT_CONCURRENCY } from '$lib/shared/constants';
import { extractModelName } from '$lib/shared/utils/transcript-utils';
import path from 'path';

// Server-side check
if (typeof window !== 'undefined') {
  throw new Error('cached-bulk-loader can only be used on the server side');
}

/**
 * Load transcripts metadata using cache for optimal performance
 */
export async function loadCachedTranscriptsMetadataOnly(
  outputDir: string = './transcripts',
  includeErrors: boolean = true
): Promise<LoadingResult> {
  console.log(`📂 [CACHED-LOADER] Starting cached metadata loading from: ${outputDir}`);
  
  // Check if directory exists
  const directoryExists = await checkPathAccess(outputDir);
  if (!directoryExists) {
    const error: LoadingError = {
      type: 'file_not_found',
      message: `Directory not found: ${outputDir}`,
      file: outputDir
    };
    
    return {
      transcripts: [],
      errors: [error],
      directories: [],
      stats: {
        totalFiles: 0,
        successfulFiles: 0,
        failedFiles: 1,
        validationErrors: 0,
        parseErrors: 0,
        totalDirectories: 0,
        emptyDirectories: 0,
      }
    };
  }

  // Scan directory for transcript files and directory structure
  console.log('🔍 [CACHED-LOADER] Scanning directory structure...');
  const scanResult = await scanDirectoryForTranscripts(outputDir);
  console.log(`📁 [CACHED-LOADER] Found ${scanResult.files.length} files and ${scanResult.directories.length} directories`);
  
  // Get cache instance
  const cache = getTranscriptCache();
  
  // Process files through cache with concurrency control
  console.log('⚙️ [CACHED-LOADER] Loading metadata through cache...');
  const transcripts: TranscriptDisplay[] = [];
  const errors: LoadingError[] = [...scanResult.errors];
  
  // Process files in batches to control concurrency
  const concurrency = DEFAULT_CONCURRENCY;
  const chunks = chunkArray(scanResult.files, concurrency);
  
  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map(async (relativePath) => {
        try {
          // Convert relative path to absolute path for cache operations
          const absolutePath = path.resolve(outputDir, relativePath);
          const metadata = await cache.getMetadata(absolutePath);
          if (metadata) {
            // Convert metadata to TranscriptDisplay format for consistency
            // We need to create a minimal TranscriptDisplay object from metadata
            const pathParts = relativePath.split('/');
            const behaviorDir = pathParts.length > 1 ? pathParts[pathParts.length - 2] : '';
            const fileName = pathParts[pathParts.length - 1];
            const transcriptNumber = fileName.endsWith('.json') ? fileName.slice(0, -5) : fileName;
            
            // Create optimized transcript object for homepage (remove heavy fields)
            // scoreDescriptions are NOT included here - loaded separately via /api/transcripts/descriptions
            const summary = metadata.judge_output?.summary || metadata.description || 'No summary available';
            const transcript: TranscriptDisplay = {
              id: metadata.transcript_id || transcriptNumber,
              wordId: metadata.word_id,  // Human-readable word ID
              model: extractModelName(metadata.target_model || ''),
              split: behaviorDir,
              concerningScore: metadata.judge_output?.scores?.concerning || 0,
              summary: summary.length > 200 ? summary.substring(0, 200) + '...' : summary, // Truncate long summaries
              compactSummary: metadata.judge_output?.compact_summary,  // 1-2 sentence summary
              scores: metadata.judge_output?.scores || {},
              // scoreDescriptions: REMOVED - sent via separate /api/transcripts/descriptions endpoint
              judgeSummary: undefined, // Remove heavy field - available in detail view
              justification: undefined, // Remove heavy field - available in detail view
              tags: metadata.tags || [],
              userTags: metadata.user_tags || [],           // Admin mode: manually added tags
              shareOnline: metadata.share_online ?? false,  // Admin mode: share online flag
              systemPrompt: undefined, // Cannot extract system prompt from metadata-only (no events)
              transcript: undefined as any, // Remove heavy field - available in detail view
              _filePath: relativePath // Store relative path
            };
            
            return transcript;
          }
          return null;
        } catch (error) {
          throw { filePath: relativePath, error };
        }
      })
    );
    
    // Process results
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        transcripts.push(result.value);
      } else if (result.status === 'rejected') {
        const rejection = result.reason as { filePath: string; error: any };
        errors.push({
          type: 'unknown_error',
          message: `Failed to load metadata: ${rejection.filePath}`,
          file: rejection.filePath,
          details: rejection.error instanceof Error ? rejection.error.message : String(rejection.error)
        });
      }
    }
  }
  
  console.log(`✅ [CACHED-LOADER] Successfully loaded ${transcripts.length} transcript metadata`);
  console.log(`❌ [CACHED-LOADER] Failed to load ${errors.length - scanResult.errors.length} files`);
  
  // Calculate statistics
  const stats: LoadingStats = {
    totalFiles: scanResult.files.length,
    successfulFiles: transcripts.length,
    failedFiles: errors.length - scanResult.errors.length,
    validationErrors: errors.filter(e => e.type === 'validation_error').length,
    parseErrors: errors.filter(e => e.type === 'parse_error').length,
    totalDirectories: scanResult.directories.length,
    emptyDirectories: scanResult.directories.filter(d => d.isEmpty).length,
  };
  
  console.log('📈 [CACHED-LOADER] Final statistics:', stats);
  
  return {
    transcripts,
    errors: includeErrors ? errors : [],
    directories: scanResult.directories,
    stats
  };
}

/**
 * Load full transcripts using cache (for when full transcript data is needed)
 */
export async function loadCachedTranscriptsWithErrors(
  outputDir: string = './transcripts',
  includeErrors: boolean = true
): Promise<LoadingResult> {
  console.log(`📂 [CACHED-LOADER] Starting cached full transcript loading from: ${outputDir}`);
  
  // Check if directory exists
  const directoryExists = await checkPathAccess(outputDir);
  if (!directoryExists) {
    const error: LoadingError = {
      type: 'file_not_found',
      message: `Directory not found: ${outputDir}`,
      file: outputDir
    };
    
    return {
      transcripts: [],
      errors: [error],
      directories: [],
      stats: {
        totalFiles: 0,
        successfulFiles: 0,
        failedFiles: 1,
        validationErrors: 0,
        parseErrors: 0,
        totalDirectories: 0,
        emptyDirectories: 0,
      }
    };
  }

  // Scan directory for transcript files and directory structure
  console.log('🔍 [CACHED-LOADER] Scanning directory structure...');
  const scanResult = await scanDirectoryForTranscripts(outputDir);
  console.log(`📁 [CACHED-LOADER] Found ${scanResult.files.length} files and ${scanResult.directories.length} directories`);
  
  // Get cache instance
  const cache = getTranscriptCache();
  
  // Process files through cache with concurrency control
  console.log('⚙️ [CACHED-LOADER] Loading full transcripts through cache...');
  const transcripts: TranscriptDisplay[] = [];
  const errors: LoadingError[] = [...scanResult.errors];
  
  // Process files in batches to control concurrency
  const concurrency = DEFAULT_CONCURRENCY;
  const chunks = chunkArray(scanResult.files, concurrency);
  
  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map(async (relativePath) => {
        try {
          // Convert relative path to absolute path for cache operations
          const absolutePath = path.resolve(outputDir, relativePath);
          const transcript = await cache.getFullTranscript(absolutePath);
          return transcript;
        } catch (error) {
          throw { filePath: relativePath, error };
        }
      })
    );
    
    // Process results
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        transcripts.push(result.value);
      } else if (result.status === 'rejected') {
        const rejection = result.reason as { filePath: string; error: any };
        errors.push({
          type: 'unknown_error',
          message: `Failed to load transcript: ${rejection.filePath}`,
          file: rejection.filePath,
          details: rejection.error instanceof Error ? rejection.error.message : String(rejection.error)
        });
      }
    }
  }
  
  console.log(`✅ [CACHED-LOADER] Successfully loaded ${transcripts.length} full transcripts`);
  console.log(`❌ [CACHED-LOADER] Failed to load ${errors.length - scanResult.errors.length} files`);
  
  // Calculate statistics
  const stats: LoadingStats = {
    totalFiles: scanResult.files.length,
    successfulFiles: transcripts.length,
    failedFiles: errors.length - scanResult.errors.length,
    validationErrors: errors.filter(e => e.type === 'validation_error').length,
    parseErrors: errors.filter(e => e.type === 'parse_error').length,
    totalDirectories: scanResult.directories.length,
    emptyDirectories: scanResult.directories.filter(d => d.isEmpty).length,
  };
  
  console.log('📈 [CACHED-LOADER] Final statistics:', stats);
  
  return {
    transcripts,
    errors: includeErrors ? errors : [],
    directories: scanResult.directories,
    stats
  };
}

/**
 * Utility function to chunk an array
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// Cache for collected dimension descriptions (loaded once per process)
let cachedDimensionDescriptions: Record<string, string> | null = null;

/**
 * Collect all unique dimension descriptions from all transcripts.
 * Results are cached for the lifetime of the server process.
 * Used by /api/transcripts/descriptions endpoint.
 */
export async function collectDimensionDescriptions(
  outputDir: string = './transcripts'
): Promise<Record<string, string>> {
  // Return cached if available
  if (cachedDimensionDescriptions) {
    return cachedDimensionDescriptions;
  }

  console.log('📝 [CACHED-LOADER] Collecting dimension descriptions from all transcripts...');

  const directoryExists = await checkPathAccess(outputDir);
  if (!directoryExists) {
    console.warn(`Directory not found for descriptions: ${outputDir}`);
    return {};
  }

  const scanResult = await scanDirectoryForTranscripts(outputDir);
  const cache = getTranscriptCache();
  const allDescriptions: Record<string, string> = {};

  // Process files in batches
  const concurrency = DEFAULT_CONCURRENCY;
  const chunks = chunkArray(scanResult.files, concurrency);

  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map(async (relativePath) => {
        const absolutePath = path.resolve(outputDir, relativePath);
        const metadata = await cache.getMetadata(absolutePath);
        return metadata?.judge_output?.score_descriptions || null;
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        for (const [name, description] of Object.entries(result.value)) {
          if (!allDescriptions[name] && description) {
            allDescriptions[name] = description;
          }
        }
      }
    }
  }

  console.log(`📝 [CACHED-LOADER] Collected ${Object.keys(allDescriptions).length} unique dimension descriptions`);
  cachedDimensionDescriptions = allDescriptions;
  return allDescriptions;
}

