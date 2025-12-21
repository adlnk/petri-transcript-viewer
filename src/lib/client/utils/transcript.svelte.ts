import type { TranscriptMetadata, TranscriptDisplay } from '$lib/shared/types';
import { base } from '$app/paths';

// Check if we're in static mode
const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';

// Cache for static bundled data
let staticDataCache: { transcripts: Record<string, any>; metadata: any[] } | null = null;

async function getStaticBundledData() {
  if (staticDataCache) return staticDataCache;

  const response = await fetch(`${base}/data/bundled-transcripts.json`);
  if (!response.ok) {
    throw new Error(`Failed to load bundled data: ${response.status}`);
  }
  staticDataCache = await response.json();
  return staticDataCache;
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
      // Static mode: use bundled data
      if (isStaticMode) {
        const bundledData = await getStaticBundledData();
        const transcriptData = bundledData.transcripts[filePath];

        if (!transcriptData) {
          metadataError = `Transcript at "${filePath}" not found`;
          return null;
        }

        // Extract metadata from the full transcript data
        const { transcript: _fullTranscript, ...meta } = transcriptData;
        metadata = meta;
        return metadata;
      }

      // Node mode: use API endpoint
      const url = `/api/transcripts?filePath=${encodeURIComponent(filePath)}&metadataOnly=true`;
      const response = await fetch(url);

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

  const loadTranscript = async (): Promise<TranscriptDisplay | null> => {
    if (transcript) return transcript;

    transcriptLoading = true;
    transcriptError = null;

    try {
      // Static mode: use bundled data
      if (isStaticMode) {
        const bundledData = await getStaticBundledData();
        const transcriptData = bundledData.transcripts[filePath];

        if (!transcriptData) {
          transcriptError = `Transcript at "${filePath}" not found`;
          return null;
        }

        transcript = transcriptData;

        // If metadata wasn't loaded yet, extract it
        if (!metadata && transcript && 'transcript' in transcript && transcript.transcript?.metadata) {
          metadata = transcript.transcript.metadata;
        }

        return transcript;
      }

      // Node mode: use API endpoint
      const url = `/api/transcripts?filePath=${encodeURIComponent(filePath)}`;
      const response = await fetch(url);

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

        // If metadata wasn't loaded yet, extract it from the full transcript (when present)
        if (!metadata && transcript && 'transcript' in transcript && transcript.transcript?.metadata) {
          metadata = transcript.transcript.metadata;
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