#!/usr/bin/env python3
"""
Merge reviewer annotations back into transcript files.

Usage:
    python merge-reviewer-annotations.py annotations.json --transcripts-dir /path/to/transcripts
    python merge-reviewer-annotations.py annotations.json --dry-run  # Preview changes
"""

import argparse
import json
import shutil
from pathlib import Path
from datetime import datetime


def load_annotations(annotations_path: Path) -> dict:
    """Load the exported annotations JSON."""
    with open(annotations_path) as f:
        return json.load(f)


def find_transcript(file_path: str, transcripts_dir: Path) -> Path | None:
    """Find the transcript file, handling various path formats."""
    # Try direct path
    direct = transcripts_dir / file_path
    if direct.exists():
        return direct

    # Try just the filename
    filename = Path(file_path).name
    matches = list(transcripts_dir.rglob(filename))
    if len(matches) == 1:
        return matches[0]
    elif len(matches) > 1:
        print(f"  Warning: Multiple matches for {filename}, skipping")
        return None

    return None


def merge_annotation(transcript_path: Path, annotation: dict, reviewer_name: str, dry_run: bool = False) -> bool:
    """Merge a single annotation into a transcript file."""
    try:
        with open(transcript_path) as f:
            transcript = json.load(f)
    except json.JSONDecodeError as e:
        print(f"  Error: Invalid JSON in {transcript_path}: {e}")
        return False

    metadata = transcript.get('metadata', {})
    changes = []

    # Merge user tags
    if annotation.get('userTags'):
        existing_user_tags = set(metadata.get('user_tags', []))
        new_tags = set(annotation['userTags'])
        combined = list(existing_user_tags | new_tags)
        if combined != metadata.get('user_tags', []):
            metadata['user_tags'] = sorted(combined)
            changes.append(f"tags: +{len(new_tags - existing_user_tags)}")

    # Merge user notes (append if different)
    if annotation.get('userNotes'):
        existing_notes = metadata.get('user_notes', '')
        new_notes = annotation['userNotes']
        if new_notes and new_notes != existing_notes:
            # Use passed reviewer_name (from export top-level) or fall back to annotation
            name = annotation.get('reviewerName', reviewer_name)
            timestamp = annotation.get('lastModified', datetime.now().isoformat())[:10]

            # Format: append reviewer's notes with attribution
            if existing_notes:
                combined = f"{existing_notes}\n\n---\n[{name}, {timestamp}]:\n{new_notes}"
            else:
                combined = f"[{name}, {timestamp}]:\n{new_notes}"

            metadata['user_notes'] = combined
            changes.append("notes: updated")

    # Store reviewer scores in a dedicated field
    if annotation.get('reviewerScores'):
        existing_reviewer_scores = metadata.get('reviewer_scores', [])

        # Index existing by (reviewer, dimension) to avoid duplicates
        existing_index = {
            (s['reviewerName'], s['dimension']): s
            for s in existing_reviewer_scores
        }

        for score in annotation['reviewerScores']:
            key = (score['reviewerName'], score['dimension'])
            existing_index[key] = score  # Overwrite if exists

        metadata['reviewer_scores'] = list(existing_index.values())
        changes.append(f"reviewer_scores: {len(annotation['reviewerScores'])}")

    # Store issue flags
    if annotation.get('issueFlags'):
        existing_flags = set(metadata.get('issue_flags', []))
        new_flags = set(annotation['issueFlags'])
        combined = list(existing_flags | new_flags)
        if combined != metadata.get('issue_flags', []):
            metadata['issue_flags'] = sorted(combined)
            changes.append(f"issue_flags: {len(new_flags)}")

    if not changes:
        return False

    transcript['metadata'] = metadata

    if dry_run:
        print(f"  Would update: {', '.join(changes)}")
    else:
        # Backup original
        backup_path = transcript_path.with_suffix('.json.bak')
        if not backup_path.exists():
            shutil.copy(transcript_path, backup_path)

        # Write updated transcript
        with open(transcript_path, 'w') as f:
            json.dump(transcript, f, indent=2)
        print(f"  Updated: {', '.join(changes)}")

    return True


def main():
    parser = argparse.ArgumentParser(description='Merge reviewer annotations into transcripts')
    parser.add_argument('annotations', type=Path, help='Path to exported annotations JSON')
    parser.add_argument('--transcripts-dir', '-d', type=Path,
                        help='Path to transcripts directory (default: auto-detect from annotations paths)')
    parser.add_argument('--dry-run', '-n', action='store_true',
                        help='Preview changes without modifying files')
    parser.add_argument('--no-backup', action='store_true',
                        help='Skip creating .bak files')

    args = parser.parse_args()

    if not args.annotations.exists():
        print(f"Error: Annotations file not found: {args.annotations}")
        return 1

    data = load_annotations(args.annotations)

    print(f"Reviewer: {data.get('reviewerName', 'Unknown')}")
    print(f"Exported: {data.get('exportedAt', 'Unknown')}")
    print(f"Annotations: {len(data.get('annotations', []))}")
    print()

    if args.dry_run:
        print("DRY RUN - no files will be modified\n")

    # Determine transcripts directory
    transcripts_dir = args.transcripts_dir
    if not transcripts_dir:
        # Try to find common parent from annotation paths
        print("Warning: No --transcripts-dir specified, will search current directory")
        transcripts_dir = Path('.')

    if not transcripts_dir.exists():
        print(f"Error: Transcripts directory not found: {transcripts_dir}")
        return 1

    updated = 0
    skipped = 0
    not_found = 0

    # Get top-level reviewer name for use in annotations
    top_level_reviewer = data.get('reviewerName', 'Unknown')

    for annotation in data.get('annotations', []):
        file_path = annotation.get('filePath', '')
        print(f"Processing: {file_path}")

        transcript_path = find_transcript(file_path, transcripts_dir)
        if not transcript_path:
            print(f"  Not found")
            not_found += 1
            continue

        if merge_annotation(transcript_path, annotation, top_level_reviewer, args.dry_run):
            updated += 1
        else:
            print(f"  No changes")
            skipped += 1

    print()
    print(f"Summary: {updated} updated, {skipped} unchanged, {not_found} not found")

    if args.dry_run and updated > 0:
        print("\nRun without --dry-run to apply changes")

    return 0


if __name__ == '__main__':
    exit(main())
