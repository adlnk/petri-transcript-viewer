import type { TranscriptMetadata, TranscriptDisplay } from '$lib/shared/types';
import { base } from '$app/paths';
import { debugLog } from '$lib/client/utils/debug';

// Check if we're in static mode
const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';

// Cache for individually loaded transcripts (lazy loading)
const transcriptCache = new Map<string, TranscriptDisplay>();

async function fetchIndividualTranscript(filePath: string): Promise<TranscriptDisplay> {
  // Check cache first
  const cached = transcriptCache.get(filePath);
  if (cached) return cached;

  // Fetch individual transcript file from static/transcripts/
  const url = `${base}/transcripts/${filePath}`;
  debugLog('[DEBUG] Fetching individual transcript:', url);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load transcript: ${response.status}`);
  }

  const rawTranscript = await response.json();

  // Transform raw transcript to TranscriptDisplay format
  const transcriptDisplay = createTranscriptDisplayFromRaw(rawTranscript, filePath);

  // Cache for future use
  transcriptCache.set(filePath, transcriptDisplay);

  return transcriptDisplay;
}

// Transform raw transcript JSON to TranscriptDisplay format (mirrors bundle-transcripts.ts logic)
function createTranscriptDisplayFromRaw(transcript: any, filePath: string): TranscriptDisplay {
  const targetModel = extractTargetModel(transcript);
  const pathParts = filePath.split('/');
  const behaviorDir = pathParts.length > 1 ? pathParts[pathParts.length - 2] : '';
  const fileName = pathParts[pathParts.length - 1];
  const transcriptNumber = fileName.endsWith('.json') ? fileName.slice(0, -5) : fileName;

  return {
    id: transcript.metadata?.transcript_id || transcriptNumber,
    wordId: transcript.metadata?.word_id,
    model: extractModelName(targetModel),
    split: behaviorDir,
    concerningScore: transcript.metadata?.judge_output?.scores?.concerning || 0,
    summary: transcript.metadata?.judge_output?.summary || transcript.metadata?.description || 'No summary available',
    scores: transcript.metadata?.judge_output?.scores || {},
    scoreDescriptions: transcript.metadata?.judge_output?.score_descriptions,
    judgeSummary: transcript.metadata?.judge_output?.summary || 'No judgment summary available',
    justification: transcript.metadata?.judge_output?.justification || 'No justification available',
    characterAnalysis: transcript.metadata?.judge_output?.character_analysis,
    tags: transcript.metadata?.tags || [],
    userTags: transcript.metadata?.user_tags || [],
    shareOnline: transcript.metadata?.share_online,
    systemPrompt: extractSystemPrompt(transcript),
    transcript: transcript,
    _filePath: filePath
  };
}

function extractSystemPrompt(transcript: any): string | undefined {
  if (!transcript?.events || !Array.isArray(transcript.events)) {
    return undefined;
  }
  for (const event of transcript.events) {
    if (event.type === 'transcript_event') {
      if (event.edit?.operation === 'add' && event.edit?.message?.role === 'system') {
        const content = event.edit.message.content;
        return typeof content === 'string' ? content : JSON.stringify(content);
      }
    }
  }
  return undefined;
}

function extractTargetModel(transcript: any): string {
  if (transcript.metadata?.target_model && transcript.metadata.target_model !== 'unknown') {
    return transcript.metadata.target_model;
  }
  const systemPrompt = extractSystemPrompt(transcript);
  if (systemPrompt) {
    const match = systemPrompt.match(/The target AI is a `([^`]+)` model/);
    if (match && match[1]) {
      return match[1];
    }
  }
  return 'unknown';
}

function extractModelName(targetModel: string): string {
  if (!targetModel || targetModel === 'unknown') {
    return 'unknown';
  }
  const parts = targetModel.split(':');
  if (parts.length > 1) {
    return parts[1];
  }
  return targetModel;
}

export interface TranscriptLoaderState {
  metadata: TranscriptMetadata | null;
  transcript: TranscriptDisplay | null;
  metadataLoading: boolean;
  transcriptLoading: boolean;
  metadataError: string | null;
  transcriptError: string | null;
}

export function createTranscriptLoader(filePath: string) {
  let metadata = $state<TranscriptMetadata | null>(null);
  let transcript = $state<TranscriptDisplay | null>(null);
  let metadataLoading = $state(false);
  let transcriptLoading = $state(false);
  let metadataError = $state<string | null>(null);
  let transcriptError = $state<string | null>(null);

  const loadMetadata = async (): Promise<TranscriptMetadata | null> => {
    if (metadata) return metadata;

    metadataLoading = true;
    metadataError = null;

    try {
      // Static mode: fetch individual transcript and extract metadata
      if (isStaticMode) {
        const transcriptData = await fetchIndividualTranscript(filePath);

        // Extract metadata from the full transcript data
        const { transcript: _fullTranscript, ...meta } = transcriptData;
        metadata = meta as TranscriptMetadata;
        return metadata;
      }

      // Node mode: use API endpoint
      // Always use cache: 'no-store' - transcripts are editable so we need fresh data
      const url = `/api/transcripts?filePath=${encodeURIComponent(filePath)}&metadataOnly=true`;
      const response = await fetch(url, { cache: 'no-store' });

      if (!response.ok) {
        if (response.status === 404) {
          metadataError = `Transcript at "${filePath}" not found`;
        } else {
          let details = '';
          try {
            const errJson = await response.clone().json();
            details = errJson?.message || errJson?.error || '';
          } catch {
            try {
              details = await response.text();
            } catch {}
          }
          const extra = details ? ` - ${details}` : '';
          throw new Error(`Failed to load metadata: ${response.status} ${response.statusText}${extra}`);
        }
        return null;
      }

      const result = await response.json();
      if (result.success) {
        metadata = result.data;
        return metadata;
      } else {
        throw new Error(result.error || 'Unknown API error');
      }
    } catch (err) {
      metadataError = err instanceof Error ? err.message : 'Unknown error loading metadata';
      return null;
    } finally {
      metadataLoading = false;
    }
  };

  const loadTranscript = async (forceReload = false): Promise<TranscriptDisplay | null> => {
    if (transcript && !forceReload) return transcript;

    // Clear cache for this file if force reloading
    if (forceReload) {
      transcriptCache.delete(filePath);
      transcript = null;
      metadata = null;
    }

    transcriptLoading = true;
    transcriptError = null;

    try {
      // Static mode: fetch individual transcript on-demand
      if (isStaticMode) {
        transcript = await fetchIndividualTranscript(filePath);

        // If metadata wasn't loaded yet, extract it
        if (!metadata && transcript && 'transcript' in transcript && transcript.transcript?.metadata) {
          metadata = transcript.transcript.metadata;
        }

        return transcript;
      }

      // Node mode: use API endpoint
      // Always use cache: 'no-store' - transcripts are editable so we need fresh data
      const url = `/api/transcripts?filePath=${encodeURIComponent(filePath)}`;
      const response = await fetch(url, { cache: 'no-store' });

      if (!response.ok) {
        if (response.status === 404) {
          transcriptError = `Transcript at "${filePath}" not found`;
        } else {
          let details = '';
          try {
            const errJson = await response.clone().json();
            details = errJson?.message || errJson?.error || '';
          } catch {
            try {
              details = await response.text();
            } catch {}
          }
          const extra = details ? ` - ${details}` : '';
          throw new Error(`Failed to load transcript: ${response.status} ${response.statusText}${extra}`);
        }
        return null;
      }

      const result = await response.json();
      if (result.success) {
        transcript = result.data;

        // Extract display metadata from the TranscriptDisplayFull object
        // (NOT from transcript.transcript.metadata which is raw snake_case)
        if (transcript) {
          const { transcript: _raw, ...displayMeta } = transcript;
          metadata = displayMeta as TranscriptMetadata;
        }

        return transcript;
      } else {
        throw new Error(result.error || 'Unknown API error');
      }
    } catch (err) {
      transcriptError = err instanceof Error ? err.message : 'Unknown error loading transcript';
      return null;
    } finally {
      transcriptLoading = false;
    }
  };

  const reset = () => {
    metadata = null;
    transcript = null;
    metadataLoading = false;
    transcriptLoading = false;
    metadataError = null;
    transcriptError = null;
  };

  return {
    // Reactive getters
    get metadata() { return metadata; },
    get transcript() { return transcript; },
    get metadataLoading() { return metadataLoading; },
    get transcriptLoading() { return transcriptLoading; },
    get metadataError() { return metadataError; },
    get transcriptError() { return transcriptError; },
    get hasMetadata() { return metadata !== null; },
    get hasTranscript() { return transcript !== null; },
    get isLoading() { return metadataLoading || transcriptLoading; },
    get hasError() { return metadataError !== null || transcriptError !== null; },
    
    // Actions
    loadMetadata,
    loadTranscript,
    reset,
    
    // Convenience method to load both if needed
    loadBoth: async () => {
      await loadMetadata();
      await loadTranscript();
    }
  };
}

// Removed batch loader utilities for simplicity