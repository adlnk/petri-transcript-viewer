#!/usr/bin/env tsx
/**
 * Bundle transcripts for static build mode.
 * Reads JSON transcripts from a directory and generates a TypeScript file
 * containing all the data for static serving.
 *
 * Usage: tsx scripts/bundle-transcripts.ts --dir /path/to/transcripts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Transcript {
  metadata: {
    transcript_id?: string;
    target_model?: string;
    description?: string;
    tags?: string[];
    judge_output?: {
      scores?: Record<string, number>;
      score_descriptions?: Record<string, string>;
      summary?: string;
      justification?: string;
      character_analysis?: string;
    };
  };
  events?: Array<{
    type: string;
    edit?: {
      operation?: string;
      message?: {
        role?: string;
        content?: string | object;
      };
    };
  }>;
}

interface TranscriptDisplayMeta {
  id: string;
  model: string;
  split: string;
  concerningScore: number;
  summary: string;
  scores: Record<string, number>;
  scoreDescriptions?: Record<string, string>;
  judgeSummary: string;
  justification: string;
  characterAnalysis?: string;
  tags: string[];
  systemPrompt?: string;
  _filePath: string;
}

interface TranscriptDisplayFull extends TranscriptDisplayMeta {
  transcript: Transcript;
}

// Utility functions (copied from transcript-utils.ts to avoid import issues)
function extractSystemPrompt(transcript: Transcript): string | undefined {
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

function extractTargetModel(transcript: Transcript): string {
  if (transcript.metadata.target_model && transcript.metadata.target_model !== 'unknown') {
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

function createTranscriptDisplay(transcript: Transcript, filePath: string): TranscriptDisplayFull {
  const targetModel = extractTargetModel(transcript);
  const pathParts = filePath.split('/');
  const behaviorDir = pathParts.length > 1 ? pathParts[pathParts.length - 2] : '';
  const fileName = pathParts[pathParts.length - 1];
  const transcriptNumber = fileName.endsWith('.json') ? fileName.slice(0, -5) : fileName;

  return {
    id: transcript.metadata.transcript_id || transcriptNumber,
    model: extractModelName(targetModel),
    split: behaviorDir,
    concerningScore: transcript.metadata.judge_output?.scores?.concerning || 0,
    summary: transcript.metadata.judge_output?.summary || transcript.metadata.description || 'No summary available',
    scores: transcript.metadata.judge_output?.scores || {},
    scoreDescriptions: transcript.metadata.judge_output?.score_descriptions,
    judgeSummary: transcript.metadata.judge_output?.summary || 'No judgment summary available',
    justification: transcript.metadata.judge_output?.justification || 'No justification available',
    characterAnalysis: transcript.metadata.judge_output?.character_analysis,
    tags: transcript.metadata.tags || [],
    systemPrompt: extractSystemPrompt(transcript),
    transcript: transcript,
    _filePath: filePath
  };
}

function extractTranscriptMetadata(transcript: Transcript, filePath: string): TranscriptDisplayMeta {
  const targetModel = extractTargetModel(transcript);
  const pathParts = filePath.split('/');
  const behaviorDir = pathParts.length > 1 ? pathParts[pathParts.length - 2] : '';
  const fileName = pathParts[pathParts.length - 1];
  const transcriptNumber = fileName.endsWith('.json') ? fileName.slice(0, -5) : fileName;

  return {
    id: transcript.metadata.transcript_id || transcriptNumber,
    model: extractModelName(targetModel),
    split: behaviorDir,
    concerningScore: transcript.metadata.judge_output?.scores?.concerning || 0,
    summary: transcript.metadata.judge_output?.summary || transcript.metadata.description || 'No summary available',
    scores: transcript.metadata.judge_output?.scores || {},
    scoreDescriptions: transcript.metadata.judge_output?.score_descriptions,
    judgeSummary: transcript.metadata.judge_output?.summary || 'No judgment summary available',
    justification: transcript.metadata.judge_output?.justification || 'No justification available',
    characterAnalysis: transcript.metadata.judge_output?.character_analysis,
    tags: transcript.metadata.tags || [],
    systemPrompt: undefined,
    _filePath: filePath
  };
}

// Recursively find all JSON files
function findJsonFiles(dir: string, baseDir: string = dir): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findJsonFiles(fullPath, baseDir));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      // Store relative path from base directory
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      files.push(relativePath);
    }
  }

  return files;
}

// Parse arguments
function parseArgs(): { dir: string } {
  const args = process.argv.slice(2);
  let dir = './transcripts'; // default

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) {
      dir = args[i + 1];
      i++;
    }
  }

  return { dir };
}

async function main() {
  const { dir } = parseArgs();
  const transcriptDir = path.resolve(dir);

  console.log(`Bundling transcripts from: ${transcriptDir}`);

  if (!fs.existsSync(transcriptDir)) {
    console.error(`Error: Transcript directory does not exist: ${transcriptDir}`);
    process.exit(1);
  }

  const jsonFiles = findJsonFiles(transcriptDir);
  console.log(`Found ${jsonFiles.length} JSON files`);

  if (jsonFiles.length === 0) {
    console.warn('Warning: No JSON files found. Creating empty bundle.');
  }

  const fullTranscripts: Record<string, TranscriptDisplayFull> = {};
  const metadataList: TranscriptDisplayMeta[] = [];
  const errors: string[] = [];

  for (const relativePath of jsonFiles) {
    const fullPath = path.join(transcriptDir, relativePath);

    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const transcript = JSON.parse(content) as Transcript;

      // Basic validation
      if (!transcript.metadata) {
        errors.push(`${relativePath}: Missing metadata`);
        continue;
      }

      const displayFull = createTranscriptDisplay(transcript, relativePath);
      const displayMeta = extractTranscriptMetadata(transcript, relativePath);

      fullTranscripts[relativePath] = displayFull;
      metadataList.push(displayMeta);

    } catch (err: any) {
      errors.push(`${relativePath}: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    console.error('\nErrors encountered:');
    errors.forEach(e => console.error(`  - ${e}`));
  }

  console.log(`\nSuccessfully processed: ${metadataList.length} transcripts`);

  // Generate the TypeScript file
  const outputPath = path.join(__dirname, '../src/lib/server/data/bundled-transcripts.ts');

  const output = `// Auto-generated by scripts/bundle-transcripts.ts
// Do not edit manually

import type { TranscriptDisplayFull, TranscriptDisplayMeta } from '$lib/shared/types';

export const BUNDLED_TRANSCRIPTS: Record<string, TranscriptDisplayFull> = ${JSON.stringify(fullTranscripts, null, 2)};

export const TRANSCRIPT_LIST_METADATA: TranscriptDisplayMeta[] = ${JSON.stringify(metadataList, null, 2)};

export const BUNDLE_GENERATED_AT = '${new Date().toISOString()}';
export const BUNDLE_TRANSCRIPT_COUNT = ${metadataList.length};
`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);

  console.log(`\nGenerated: ${outputPath}`);

  // Also generate static JSON file for client-side use
  const staticDir = path.join(__dirname, '../static/data');
  fs.mkdirSync(staticDir, { recursive: true });

  const staticData = {
    transcripts: fullTranscripts,
    metadata: metadataList,
    generatedAt: new Date().toISOString()
  };

  const staticJsonPath = path.join(staticDir, 'bundled-transcripts.json');
  fs.writeFileSync(staticJsonPath, JSON.stringify(staticData));

  console.log(`Generated: ${staticJsonPath}`);
  console.log(`Bundle contains ${metadataList.length} transcripts`);
}

main().catch(err => {
  console.error('Bundle generation failed:', err);
  process.exit(1);
});
