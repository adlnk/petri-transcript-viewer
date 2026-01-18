import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { TagTaxonomy, TagsResponse } from '$lib/shared/types';
import { TRANSCRIPT_LIST_METADATA } from '$lib/server/data/bundled-transcripts';

// Check if we're in static mode
const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';

// Dynamic imports for node mode
let loadCachedTranscriptsMetadataOnly: typeof import('$lib/server/data-loading/cached-bulk-loader').loadCachedTranscriptsMetadataOnly;
let TRANSCRIPT_DIR: string;
let fs: typeof import('fs').promises;
let path: typeof import('path');
let yaml: typeof import('yaml');

async function ensureNodeImports() {
  if (!fs) {
    const bulkLoader = await import('$lib/server/data-loading/cached-bulk-loader');
    loadCachedTranscriptsMetadataOnly = bulkLoader.loadCachedTranscriptsMetadataOnly;
    const config = await import('$lib/server/config');
    TRANSCRIPT_DIR = config.TRANSCRIPT_DIR;
    fs = (await import('fs')).promises;
    path = await import('path');
    yaml = await import('yaml');
  }
}

/**
 * Parse tags.yaml and flatten to a list of predefined tags
 */
function flattenTaxonomy(taxonomy: TagTaxonomy): string[] {
  const tags: string[] = [];

  // Add namespaced tags
  if (taxonomy.namespaced) {
    for (const namespace of Object.keys(taxonomy.namespaced)) {
      tags.push(...taxonomy.namespaced[namespace]);
    }
  }

  // Add plain tags
  if (taxonomy.plain) {
    tags.push(...taxonomy.plain);
  }

  return tags;
}

/**
 * Collect all unique tags from transcript metadata
 */
function collectExistingTags(transcripts: Array<{ tags?: string[]; userTags?: string[] }>): string[] {
  const tagSet = new Set<string>();

  for (const t of transcripts) {
    if (t.tags) {
      t.tags.forEach(tag => tagSet.add(tag));
    }
    if (t.userTags) {
      t.userTags.forEach(tag => tagSet.add(tag));
    }
  }

  return Array.from(tagSet).sort();
}

/**
 * GET /api/tags
 * Returns predefined tags from taxonomy + existing tags from transcripts
 */
export const GET: RequestHandler = async () => {
  try {
    let predefined: string[] = [];
    let existing: string[] = [];

    if (isStaticMode) {
      // Static mode: use bundled data
      // Try to load bundled tags.yaml (will be copied during build)
      try {
        const response = await fetch('/data/tags.yaml');
        if (response.ok) {
          const yamlText = await response.text();
          const { default: yamlParse } = await import('yaml');
          const taxonomy = yamlParse.parse(yamlText) as TagTaxonomy;
          predefined = flattenTaxonomy(taxonomy);
        }
      } catch {
        // Bundled tags not available, continue without
        console.warn('[TAGS] No bundled tags.yaml found');
      }

      // Collect existing tags from bundled transcripts
      existing = collectExistingTags(TRANSCRIPT_LIST_METADATA);

    } else {
      // Admin mode (node): read from experiment directory
      await ensureNodeImports();

      // Try to find tags.yaml in the prompts directory relative to transcripts
      // Convention: transcripts are at .../02_character_dimension_attacks/transcripts/
      // and tags.yaml is at .../02_character_dimension_attacks/prompts/tags.yaml
      const transcriptParent = path.dirname(TRANSCRIPT_DIR);
      const tagsYamlPath = path.join(transcriptParent, 'prompts', 'tags.yaml');

      try {
        const yamlContent = await fs.readFile(tagsYamlPath, 'utf-8');
        const taxonomy = yaml.parse(yamlContent) as TagTaxonomy;
        predefined = flattenTaxonomy(taxonomy);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          console.warn('[TAGS] Error reading tags.yaml:', err.message);
        }
        // tags.yaml not found, continue without predefined tags
      }

      // Collect existing tags from loaded transcripts
      const result = await loadCachedTranscriptsMetadataOnly(TRANSCRIPT_DIR);
      existing = collectExistingTags(result.transcripts);
    }

    // Combine and dedupe (predefined first, then any additional existing)
    const allPredefined = new Set(predefined);
    const additionalExisting = existing.filter(tag => !allPredefined.has(tag));

    const response: TagsResponse = {
      predefined,
      existing: additionalExisting
    };

    return json(response);

  } catch (err: any) {
    console.error('Tags API error:', err);
    throw error(500, { message: 'Failed to load tags' });
  }
};
