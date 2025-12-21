// Placeholder file for bundled transcript data.
// This file is overwritten by scripts/bundle-transcripts.ts during static builds.
// For node mode (local development), this placeholder with empty data is used.

import type { TranscriptDisplayFull, TranscriptDisplayMeta } from '$lib/shared/types';

export const BUNDLED_TRANSCRIPTS: Record<string, TranscriptDisplayFull> = {};

export const TRANSCRIPT_LIST_METADATA: TranscriptDisplayMeta[] = [];

export const BUNDLE_GENERATED_AT = '';
export const BUNDLE_TRANSCRIPT_COUNT = 0;
