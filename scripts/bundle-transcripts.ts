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
    user_tags?: string[];
    share_online?: boolean;
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

// Lightweight metadata for list view (heavy fields removed for payload optimization)
interface TranscriptDisplayMeta {
  id: string;
  model: string;
  split: string;
  concerningScore: number;
  summary: string;  // Truncated to 200 chars
  scores: Record<string, number>;
  // scoreDescriptions - REMOVED: sent separately in dimension-descriptions.json
  // judgeSummary - REMOVED: not needed for list view
  // justification - REMOVED: not needed for list view
  // characterAnalysis - REMOVED: not needed for list view
  tags: string[];
  userTags?: string[];
  shareOnline?: boolean;
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
    userTags: transcript.metadata.user_tags || [],
    shareOnline: transcript.metadata.share_online,
    systemPrompt: extractSystemPrompt(transcript),
    transcript: transcript,
    _filePath: filePath
  };
}

// Truncate string to max length with ellipsis
function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

function extractTranscriptMetadata(transcript: Transcript, filePath: string): TranscriptDisplayMeta {
  const targetModel = extractTargetModel(transcript);
  const pathParts = filePath.split('/');
  const behaviorDir = pathParts.length > 1 ? pathParts[pathParts.length - 2] : '';
  const fileName = pathParts[pathParts.length - 1];
  const transcriptNumber = fileName.endsWith('.json') ? fileName.slice(0, -5) : fileName;

  const fullSummary = transcript.metadata.judge_output?.summary || transcript.metadata.description || 'No summary available';

  // Return lightweight metadata - heavy fields removed for list view optimization
  return {
    id: transcript.metadata.transcript_id || transcriptNumber,
    model: extractModelName(targetModel),
    split: behaviorDir,
    concerningScore: transcript.metadata.judge_output?.scores?.concerning || 0,
    summary: truncateString(fullSummary, 200),  // Truncated for list view
    scores: transcript.metadata.judge_output?.scores || {},
    // scoreDescriptions: REMOVED - sent separately in dimension-descriptions.json
    // judgeSummary: REMOVED - full data available when viewing individual transcript
    // justification: REMOVED - full data available when viewing individual transcript
    // characterAnalysis: REMOVED - full data available when viewing individual transcript
    tags: transcript.metadata.tags || [],
    userTags: transcript.metadata.user_tags || [],
    shareOnline: transcript.metadata.share_online,
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
function parseArgs(): { dir: string; tagsFile?: string } {
  const args = process.argv.slice(2);
  let dir = './transcripts'; // default
  let tagsFile: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) {
      dir = args[i + 1];
      i++;
    } else if (args[i] === '--tags' && args[i + 1]) {
      tagsFile = args[i + 1];
      i++;
    }
  }

  return { dir, tagsFile };
}

async function main() {
  const { dir, tagsFile } = parseArgs();
  const transcriptDir = path.resolve(dir);

  console.log(`Bundling transcripts from: ${transcriptDir}`);
  if (tagsFile) {
    console.log(`Tags file: ${tagsFile}`);
  }

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
  const allDescriptions: Record<string, string> = {};  // Deduplicated descriptions from all transcripts
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

      // Collect score descriptions (deduplicated - first occurrence wins)
      const scoreDescriptions = transcript.metadata.judge_output?.score_descriptions;
      if (scoreDescriptions) {
        for (const [name, description] of Object.entries(scoreDescriptions)) {
          if (!allDescriptions[name] && description) {
            allDescriptions[name] = description;
          }
        }
      }

    } catch (err: any) {
      errors.push(`${relativePath}: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    console.error('\nErrors encountered:');
    errors.forEach(e => console.error(`  - ${e}`));
  }

  console.log(`\nSuccessfully processed: ${metadataList.length} transcripts`);

  // Generate the TypeScript file (placeholder for node mode)
  const outputPath = path.join(__dirname, '../src/lib/server/data/bundled-transcripts.ts');

  const output = `// Auto-generated by scripts/bundle-transcripts.ts
// Do not edit manually - this is a placeholder for node mode

import type { TranscriptDisplayFull, TranscriptDisplayMeta } from '$lib/shared/types';

export const BUNDLED_TRANSCRIPTS: Record<string, TranscriptDisplayFull> = {};

export const TRANSCRIPT_LIST_METADATA: TranscriptDisplayMeta[] = [];

export const BUNDLE_GENERATED_AT = '${new Date().toISOString()}';
export const BUNDLE_TRANSCRIPT_COUNT = ${metadataList.length};
`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);

  console.log(`\nGenerated: ${outputPath}`);

  // Generate lightweight metadata index for client-side use (no full transcripts)
  const staticDir = path.join(__dirname, '../static/data');
  fs.mkdirSync(staticDir, { recursive: true });

  // Copy tags.yaml if provided
  if (tagsFile) {
    const tagsFilePath = path.resolve(tagsFile);
    if (fs.existsSync(tagsFilePath)) {
      const tagsDestPath = path.join(staticDir, 'tags.yaml');
      fs.copyFileSync(tagsFilePath, tagsDestPath);
      console.log(`Copied tags.yaml to: ${tagsDestPath}`);
    } else {
      console.warn(`Warning: Tags file not found: ${tagsFilePath}`);
    }
  }

  const metadataIndex = {
    metadata: metadataList,
    generatedAt: new Date().toISOString(),
    transcriptCount: metadataList.length
  };

  const metadataIndexPath = path.join(staticDir, 'metadata-index.json');
  fs.writeFileSync(metadataIndexPath, JSON.stringify(metadataIndex));
  console.log(`Generated metadata index: ${metadataIndexPath}`);

  // Write deduplicated dimension descriptions to separate file
  // This reduces payload: ~60 descriptions × 1500 transcripts → single ~6KB file
  const descriptionsPath = path.join(staticDir, 'dimension-descriptions.json');
  fs.writeFileSync(descriptionsPath, JSON.stringify(allDescriptions));
  console.log(`Generated dimension descriptions: ${descriptionsPath} (${Object.keys(allDescriptions).length} dimensions)`);

  // Copy individual transcript files to static/transcripts/ for lazy loading
  const transcriptsDir = path.join(__dirname, '../static/transcripts');
  fs.mkdirSync(transcriptsDir, { recursive: true });

  let copiedCount = 0;
  for (const relativePath of jsonFiles) {
    const sourcePath = path.join(transcriptDir, relativePath);
    const destPath = path.join(transcriptsDir, relativePath);

    // Create subdirectory if needed
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    // Copy the file
    fs.copyFileSync(sourcePath, destPath);
    copiedCount++;
  }

  console.log(`Copied ${copiedCount} transcript files to static/transcripts/`);
  console.log(`Total metadata entries: ${metadataList.length}`);
}

main().catch(err => {
  console.error('Bundle generation failed:', err);
  process.exit(1);
});
