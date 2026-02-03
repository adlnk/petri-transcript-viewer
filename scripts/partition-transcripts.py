#!/usr/bin/env python3
"""
Partition transcripts into non-overlapping reviewer batches with balanced strategy distribution.

Usage:
    python partition-transcripts.py --batches 12 --dir /path/to/transcripts
    python partition-transcripts.py --batches 12 --filter "opus_4.5_wave4*"
    python partition-transcripts.py --batches 12 --batch-size 25  # auto-calculate batch count

Output:
    Creates manifest files (reviewer-batch-01.txt, etc.) listing transcript paths for each batch.
    Use with: ./build-reviewer-package.sh --manifest reviewer-batch-01.txt
"""

import argparse
import json
import random
import sys
from collections import defaultdict
from fnmatch import fnmatch
from pathlib import Path


def find_transcripts(base_dir: Path, filter_pattern: str | None = None) -> list[Path]:
    """Find all JSON transcript files, optionally filtered by glob pattern."""
    all_files = list(base_dir.rglob("*.json"))

    if not filter_pattern:
        return all_files

    filtered = []
    for f in all_files:
        rel_path = str(f.relative_to(base_dir))
        if fnmatch(rel_path, filter_pattern):
            filtered.append(f)
    return filtered


def get_strategy_tag(transcript_path: Path, tag_prefix: str = "strategy:") -> str:
    """Extract strategy tag from transcript metadata."""
    try:
        data = json.loads(transcript_path.read_text())
        tags = data.get("metadata", {}).get("tags", [])
        for tag in tags:
            if tag.startswith(tag_prefix):
                return tag
        return "other"
    except Exception:
        return "other"


def partition_transcripts(
    transcripts: list[Path],
    num_batches: int,
    tag_prefix: str = "strategy:",
    seed: int | None = None
) -> list[list[Path]]:
    """
    Partition transcripts into batches with balanced strategy distribution.

    Each strategy's transcripts are distributed evenly across all batches,
    so every batch gets a proportional share of each strategy.
    """
    if seed is not None:
        random.seed(seed)

    # Group by strategy
    by_strategy: dict[str, list[Path]] = defaultdict(list)
    for t in transcripts:
        tag = get_strategy_tag(t, tag_prefix)
        by_strategy[tag].append(t)

    # Shuffle within each strategy group
    for paths in by_strategy.values():
        random.shuffle(paths)

    # Initialize empty batches
    batches: list[list[Path]] = [[] for _ in range(num_batches)]

    # Distribute each strategy's transcripts evenly across batches
    for strategy in sorted(by_strategy.keys()):
        strategy_transcripts = by_strategy[strategy]
        for i, transcript in enumerate(strategy_transcripts):
            batch_idx = i % num_batches
            batches[batch_idx].append(transcript)

    # Shuffle within each batch to mix strategies
    for batch in batches:
        random.shuffle(batch)

    return batches


def print_summary(batches: list[list[Path]], tag_prefix: str):
    """Print distribution summary for each batch."""
    print("\n=== Partition Summary ===")
    print(f"Total batches: {len(batches)}")
    print(f"Total transcripts: {sum(len(b) for b in batches)}")
    print()

    for i, batch in enumerate(batches, 1):
        # Count strategies in this batch
        strategy_counts: dict[str, int] = defaultdict(int)
        for t in batch:
            tag = get_strategy_tag(t, tag_prefix)
            strategy_counts[tag] += 1

        strategies_str = ", ".join(
            f"{tag.replace(tag_prefix, '')}:{count}"
            for tag, count in sorted(strategy_counts.items())
        )
        print(f"  Batch {i:2d}: {len(batch):3d} transcripts  [{strategies_str}]")


def main():
    parser = argparse.ArgumentParser(
        description="Partition transcripts into reviewer batches with balanced strategy distribution"
    )
    parser.add_argument(
        "--dir", "-d",
        type=Path,
        help="Transcript directory (default: uses TRANSCRIPT_DIR or ./transcripts)"
    )
    parser.add_argument(
        "--filter", "-f",
        help="Glob pattern to filter transcripts (e.g., 'opus_4.5_wave4*')"
    )
    parser.add_argument(
        "--stratify", "-s",
        default="strategy:",
        help="Tag prefix for stratification (default: 'strategy:')"
    )
    parser.add_argument(
        "--batches", "-n",
        type=int,
        help="Number of batches to create"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        help="Target batch size (alternative to --batches, calculates batch count)"
    )
    parser.add_argument(
        "--output-dir", "-o",
        type=Path,
        default=Path("."),
        help="Directory for manifest files (default: current directory)"
    )
    parser.add_argument(
        "--prefix",
        default="reviewer-batch",
        help="Prefix for manifest filenames (default: 'reviewer-batch')"
    )
    parser.add_argument(
        "--seed",
        type=int,
        help="Random seed for reproducible partitioning"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show summary without writing files"
    )

    args = parser.parse_args()

    # Resolve transcript directory
    if args.dir:
        transcript_dir = args.dir.resolve()
    else:
        # Try common locations
        candidates = [
            Path("transcripts"),
            Path("../experiments/01_claude_soul_attack/02_character_dimension_attacks/transcripts"),
        ]
        transcript_dir = None
        for c in candidates:
            if c.exists():
                transcript_dir = c.resolve()
                break
        if not transcript_dir:
            print("Error: Could not find transcript directory. Use --dir to specify.")
            sys.exit(1)

    if not transcript_dir.exists():
        print(f"Error: Directory not found: {transcript_dir}")
        sys.exit(1)

    # Find transcripts
    transcripts = find_transcripts(transcript_dir, args.filter)
    if not transcripts:
        print(f"Error: No transcripts found matching filter: {args.filter}")
        sys.exit(1)

    print(f"Found {len(transcripts)} transcripts in {transcript_dir}")
    if args.filter:
        print(f"Filter: {args.filter}")

    # Calculate batch count
    if args.batch_size and not args.batches:
        num_batches = max(1, (len(transcripts) + args.batch_size - 1) // args.batch_size)
        print(f"Target batch size: {args.batch_size} → {num_batches} batches")
    elif args.batches:
        num_batches = args.batches
    else:
        print("Error: Specify either --batches or --batch-size")
        sys.exit(1)

    # Partition
    batches = partition_transcripts(
        transcripts,
        num_batches,
        tag_prefix=args.stratify,
        seed=args.seed
    )

    # Print summary
    print_summary(batches, args.stratify)

    if args.dry_run:
        print("\n[Dry run - no files written]")
        return

    # Write manifest files
    args.output_dir.mkdir(parents=True, exist_ok=True)

    print(f"\nWriting manifest files to: {args.output_dir}")
    for i, batch in enumerate(batches, 1):
        manifest_path = args.output_dir / f"{args.prefix}-{i:02d}.txt"

        # Write relative paths (relative to transcript_dir)
        with manifest_path.open("w") as f:
            for t in sorted(batch):
                rel_path = t.relative_to(transcript_dir)
                f.write(f"{rel_path}\n")

        print(f"  {manifest_path.name}: {len(batch)} transcripts")

    # Write metadata file with partition info
    meta_path = args.output_dir / f"{args.prefix}-metadata.json"
    metadata = {
        "transcript_dir": str(transcript_dir),
        "filter": args.filter,
        "stratify_tag": args.stratify,
        "seed": args.seed,
        "num_batches": num_batches,
        "batches": [
            {
                "manifest": f"{args.prefix}-{i:02d}.txt",
                "count": len(batch),
            }
            for i, batch in enumerate(batches, 1)
        ]
    }
    meta_path.write_text(json.dumps(metadata, indent=2))
    print(f"  {meta_path.name}: partition metadata")


if __name__ == "__main__":
    main()
