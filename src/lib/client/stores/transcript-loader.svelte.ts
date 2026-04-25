/**
 * Runtime transcript loading for annotator mode.
 *
 * Uses the File System Access API (Chrome/Edge) to let the user pick a
 * folder of transcript JSON files. Parsed transcripts are held in memory
 * and served to the list/detail views in place of bundled static data.
 */

import { browser } from '$app/environment';
import type { TranscriptDisplayFull, TranscriptDisplay } from '$lib/shared/types';

// Re-use the raw-to-display transform from the detail view loader
// (imported dynamically to avoid circular deps)
let createTranscriptDisplayFromRaw: ((transcript: any, filePath: string) => TranscriptDisplayFull) | null = null;

async function getTransformFn() {
  if (!createTranscriptDisplayFromRaw) {
    const mod = await import('$lib/client/utils/transcript.svelte');
    createTranscriptDisplayFromRaw = mod.createTranscriptDisplayFromRaw;
  }
  return createTranscriptDisplayFromRaw;
}

// State
let loaded = $state(false);
let loading = $state(false);
let error = $state<string | null>(null);
let transcriptCount = $state(0);
let folderName = $state<string | null>(null);

// In-memory transcript stores
let metadataList: TranscriptDisplay[] = [];
let fullTranscripts = new Map<string, TranscriptDisplayFull>();

// Dimension metadata extracted from loaded transcripts
let scoreDescriptions: Record<string, string> = {};
let scoreInstructions: Record<string, string> = {};

/**
 * Check if File System Access API is available
 */
function isSupported(): boolean {
  return browser && 'showDirectoryPicker' in window;
}

/**
 * Open a folder picker and load all transcript JSON files.
 */
async function loadFromDirectory(): Promise<void> {
  if (!isSupported()) {
    error = 'File System Access API not supported. Use Chrome or Edge.';
    return;
  }

  loading = true;
  error = null;

  try {
    // @ts-ignore — showDirectoryPicker is not in all TS libs
    const dirHandle: FileSystemDirectoryHandle = await window.showDirectoryPicker({
      mode: 'read',
    });

    folderName = dirHandle.name;
    const transform = await getTransformFn();

    const newMetadata: TranscriptDisplay[] = [];
    const newFull = new Map<string, TranscriptDisplayFull>();
    const newDescriptions: Record<string, string> = {};
    const newInstructions: Record<string, string> = {};
    let count = 0;
    let errors = 0;

    // Iterate over files in the directory
    // @ts-ignore — values() is async iterable
    for await (const entry of dirHandle.values()) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;

      try {
        const file = await (entry as FileSystemFileHandle).getFile();
        const text = await file.text();
        const raw = JSON.parse(text);

        // Skip non-transcript JSON (e.g., metadata files)
        if (!raw.metadata || !raw.messages) continue;

        const filePath = entry.name;
        const display = transform(raw, filePath);

        // In annotator mode: replace summary with seed prompt preview (avoid biasing)
        // Priority: seed_instruction > description > first user message
        let seedText = raw.metadata?.seed_instruction || '';
        // AuditBench seeds are just labels (e.g., "AuditBench emotional_bond...") — not real prompts
        if (!seedText || seedText.startsWith('AuditBench ')) {
          seedText = raw.metadata?.description || '';
        }
        if (!seedText) {
          // Fall back to first user message content
          const firstUser = raw.messages?.find((m: any) => m.role === 'user');
          if (firstUser) {
            const content = typeof firstUser.content === 'string'
              ? firstUser.content
              : firstUser.content?.[0]?.text || '';
            seedText = content;
          }
        }
        if (seedText) {
          const preview = seedText.length > 300
            ? seedText.slice(0, 300) + '...'
            : seedText;
          (display as any).summary = preview;
          (display as any).compactSummary = preview;
        } else {
          (display as any).summary = '(no seed instruction)';
          (display as any).compactSummary = '(no seed instruction)';
        }
        // Strip model name to avoid bias
        (display as any).model = '';

        newFull.set(filePath, display);
        newMetadata.push(display);

        // Accumulate dimension descriptions from first transcript that has them
        const descs = raw.metadata?.judge_output?.score_descriptions;
        if (descs && Object.keys(newDescriptions).length === 0) {
          Object.assign(newDescriptions, descs);
        }
        const instrs = raw.metadata?.judge_output?.score_instructions;
        if (instrs && Object.keys(newInstructions).length === 0) {
          Object.assign(newInstructions, instrs);
        }

        count++;
      } catch (err) {
        errors++;
        console.warn(`Failed to parse ${entry.name}:`, err);
      }
    }

    if (count === 0) {
      error = 'No valid transcript JSON files found in the selected folder.';
      loading = false;
      return;
    }

    // Commit to state
    metadataList = newMetadata;
    fullTranscripts = newFull;
    scoreDescriptions = newDescriptions;
    scoreInstructions = newInstructions;
    transcriptCount = count;
    loaded = true;

    if (errors > 0) {
      console.warn(`Loaded ${count} transcripts, ${errors} files failed to parse`);
    }
  } catch (err: any) {
    // User cancelled the picker
    if (err.name === 'AbortError') {
      error = null;
    } else {
      error = err.message || 'Failed to load transcripts';
    }
  } finally {
    loading = false;
  }
}

/**
 * Get the metadata list for the table view.
 */
function getMetadataList(): TranscriptDisplay[] {
  return metadataList;
}

/**
 * Get a full transcript by file path (for detail view).
 */
function getFullTranscript(filePath: string): TranscriptDisplayFull | undefined {
  return fullTranscripts.get(filePath);
}

/**
 * Get dimension descriptions extracted from loaded transcripts.
 */
function getScoreDescriptions(): Record<string, string> {
  return scoreDescriptions;
}

/**
 * Get dimension instructions extracted from loaded transcripts.
 */
function getScoreInstructions(): Record<string, string> {
  return scoreInstructions;
}

/**
 * Reset state (unload transcripts).
 */
function reset(): void {
  loaded = false;
  loading = false;
  error = null;
  transcriptCount = 0;
  folderName = null;
  metadataList = [];
  fullTranscripts = new Map();
  scoreDescriptions = {};
  scoreInstructions = {};
}

export const transcriptLoader = {
  get loaded() { return loaded; },
  get loading() { return loading; },
  get error() { return error; },
  get transcriptCount() { return transcriptCount; },
  get folderName() { return folderName; },
  isSupported,
  loadFromDirectory,
  getMetadataList,
  getFullTranscript,
  getScoreDescriptions,
  getScoreInstructions,
  reset,
};
