#!/bin/bash
# Build a portable reviewer package with bundled transcripts
#
# Usage:
#   ./scripts/build-reviewer-package.sh                    # Uses ./transcripts/
#   ./scripts/build-reviewer-package.sh /path/to/transcripts
#   ./scripts/build-reviewer-package.sh --sample 5         # Sample 5 random transcripts
#   ./scripts/build-reviewer-package.sh --filter "wave4*"  # Only wave4 directories
#   ./scripts/build-reviewer-package.sh --filter "opus*" --sample 10  # 10 random opus transcripts
#
# Filter patterns match against the relative path from transcript root.
# Examples:
#   --filter "opus_4.5_wave4*"       # Directories starting with opus_4.5_wave4
#   --filter "*wave4*"               # Any path containing "wave4"
#   --filter "*/transcript_*_1A_*"   # Strategy 1A transcripts in any directory
#
# Output: reviewer-package/ directory ready to distribute

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VIEWER_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$VIEWER_ROOT/reviewer-package"

# Parse arguments
TRANSCRIPT_DIR=""
SAMPLE_COUNT=""
FILTER_PATTERN=""
STRATIFY_TAG=""
DRY_RUN=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --sample)
            SAMPLE_COUNT="$2"
            shift 2
            ;;
        --output|-o)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --filter|-f)
            FILTER_PATTERN="$2"
            shift 2
            ;;
        --stratify|-s)
            STRATIFY_TAG="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN="1"
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS] [TRANSCRIPT_DIR]"
            echo ""
            echo "Options:"
            echo "  --filter, -f PATTERN   Filter transcripts by glob pattern"
            echo "  --sample N             Randomly sample N transcripts (or per-stratum with --stratify)"
            echo "  --stratify, -s PREFIX  Stratify by tag prefix (e.g., 'strategy:') and sample evenly"
            echo "  --output, -o DIR       Output directory (default: reviewer-package/)"
            echo "  --dry-run              List matching transcripts without building"
            echo "  --help, -h             Show this help"
            echo ""
            echo "Examples:"
            echo "  $0 --filter 'opus_4.5_wave4*' --sample 20 /path/to/transcripts"
            echo "  $0 --stratify 'strategy:' --sample 30 /path/to/transcripts"
            echo "  $0 --filter '*wave4*' --stratify 'strategy:' --sample 30 /path/to/transcripts"
            exit 0
            ;;
        *)
            TRANSCRIPT_DIR="$1"
            shift
            ;;
    esac
done

# Default transcript directory
if [[ -z "$TRANSCRIPT_DIR" ]]; then
    TRANSCRIPT_DIR="$VIEWER_ROOT/transcripts"
fi

# Resolve to absolute path
TRANSCRIPT_DIR="$(cd "$TRANSCRIPT_DIR" 2>/dev/null && pwd)" || {
    echo "Error: Transcript directory not found: $TRANSCRIPT_DIR"
    exit 1
}

echo "=== Building Reviewer Package ==="
echo "Transcript source: $TRANSCRIPT_DIR"
echo "Output directory: $OUTPUT_DIR"
[[ -n "$FILTER_PATTERN" ]] && echo "Filter pattern: $FILTER_PATTERN"
[[ -n "$STRATIFY_TAG" ]] && echo "Stratify by: $STRATIFY_TAG"
[[ -n "$SAMPLE_COUNT" ]] && echo "Sample size: $SAMPLE_COUNT"

# Build list of candidate files (apply filter if specified)
get_candidate_files() {
    local base_dir="$1"
    local pattern="$2"

    if [[ -z "$pattern" ]]; then
        # No filter - return all JSON files
        find "$base_dir" -name "*.json" -type f
    else
        # Filter by pattern matching relative path
        find "$base_dir" -name "*.json" -type f | while read -r file; do
            rel_path="${file#$base_dir/}"
            # Use bash pattern matching (supports *, ?, [...])
            if [[ "$rel_path" == $pattern ]]; then
                echo "$file"
            fi
        done
    fi
}

# If filtering, sampling, or stratifying, create temp directory with subset
if [[ -n "$SAMPLE_COUNT" ]] || [[ -n "$FILTER_PATTERN" ]] || [[ -n "$STRATIFY_TAG" ]]; then
    TEMP_TRANSCRIPTS=$(mktemp -d)
    trap "rm -rf $TEMP_TRANSCRIPTS" EXIT

    # Get candidate files (filtered if pattern specified)
    CANDIDATES=$(get_candidate_files "$TRANSCRIPT_DIR" "$FILTER_PATTERN")
    CANDIDATE_COUNT=$(echo "$CANDIDATES" | grep -c . || echo 0)

    if [[ "$CANDIDATE_COUNT" -eq 0 ]]; then
        echo "Error: No transcripts match filter pattern: $FILTER_PATTERN"
        exit 1
    fi

    echo "Matched $CANDIDATE_COUNT transcripts"

    # Stratified sampling using Python (handles JSON parsing)
    if [[ -n "$STRATIFY_TAG" ]]; then
        echo "Stratifying by '$STRATIFY_TAG' tags..."

        # Write candidates to temp file for Python
        CANDIDATES_FILE=$(mktemp)
        echo "$CANDIDATES" > "$CANDIDATES_FILE"

        python3 << PYEOF
import json
import random
from pathlib import Path
from collections import defaultdict

# Read candidate files
with open("$CANDIDATES_FILE") as f:
    candidates = [line.strip() for line in f if line.strip()]

# Group by stratification tag
files_by_tag = defaultdict(list)
tag_prefix = "$STRATIFY_TAG"

for filepath in candidates:
    try:
        data = json.loads(Path(filepath).read_text())
        tags = data.get("metadata", {}).get("tags", [])
        tag = next((t for t in tags if t.startswith(tag_prefix)), "other")
        files_by_tag[tag].append(filepath)
    except:
        files_by_tag["other"].append(filepath)

# Calculate per-stratum sample size
target_total = int("$SAMPLE_COUNT") if "$SAMPLE_COUNT" else len(candidates)
num_strata = len(files_by_tag)
base_per_stratum = max(1, target_total // num_strata)

# Sample from each stratum
selected = []
print("Stratification:")
for tag in sorted(files_by_tag.keys()):
    files = files_by_tag[tag]
    n = min(len(files), base_per_stratum + (1 if len(selected) < target_total - (num_strata - len(selected)) * base_per_stratum else 0))
    sampled = random.sample(files, n)
    selected.extend(sampled)
    print(f"  {tag}: {n}/{len(files)}")

# Trim if we overshot
if len(selected) > target_total:
    selected = random.sample(selected, target_total)

print(f"Total selected: {len(selected)}")

# Copy to temp directory
output_dir = Path("$TEMP_TRANSCRIPTS")
base_dir = Path("$TRANSCRIPT_DIR")

for filepath in selected:
    src = Path(filepath)
    rel = src.relative_to(base_dir)
    dest = output_dir / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(src.read_bytes())
PYEOF
        rm -f "$CANDIDATES_FILE"
    else
        # Simple random sampling (no stratification)
        if [[ -n "$SAMPLE_COUNT" ]]; then
            echo "Sampling $SAMPLE_COUNT from matched set..."
            SELECTED=$(echo "$CANDIDATES" | awk 'BEGIN {srand()} {print rand() "\t" $0}' | sort -n | cut -f2 | head -n "$SAMPLE_COUNT")
        else
            SELECTED="$CANDIDATES"
        fi

        # Copy selected files preserving directory structure
        echo "$SELECTED" | while read -r file; do
            [[ -z "$file" ]] && continue
            rel_path="${file#$TRANSCRIPT_DIR/}"
            dest="$TEMP_TRANSCRIPTS/$rel_path"
            mkdir -p "$(dirname "$dest")"
            cp "$file" "$dest"
        done
    fi

    TRANSCRIPT_DIR="$TEMP_TRANSCRIPTS"
fi

# Count transcripts
TRANSCRIPT_COUNT=$(find "$TRANSCRIPT_DIR" -name "*.json" -type f | wc -l | tr -d ' ')
echo "Selected $TRANSCRIPT_COUNT transcripts"

if [[ "$TRANSCRIPT_COUNT" -eq 0 ]]; then
    echo "Error: No JSON files found in $TRANSCRIPT_DIR"
    exit 1
fi

# Dry run - just list the files
if [[ -n "$DRY_RUN" ]]; then
    echo ""
    echo "=== Dry Run - Would include these transcripts ==="
    find "$TRANSCRIPT_DIR" -name "*.json" -type f | while read -r file; do
        rel="${file#$TRANSCRIPT_DIR/}"
        echo "  $rel"
    done
    echo ""
    echo "Total: $TRANSCRIPT_COUNT transcripts"
    exit 0
fi

# Change to viewer root for npm commands
cd "$VIEWER_ROOT"

# Clean previous bundled data
echo ""
echo "Cleaning previous build artifacts..."
rm -rf static/transcripts static/data

# Bundle transcripts
echo ""
echo "Bundling transcripts..."
npm run bundle-transcripts -- --dir "$TRANSCRIPT_DIR"

# Build reviewer mode
echo ""
echo "Building reviewer mode..."
BUILD_MODE=static VITE_STATIC_MODE=true VITE_REVIEWER_MODE=true npm run build

# Create output package
echo ""
echo "Creating portable package..."
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Copy built files
cp -r build/* "$OUTPUT_DIR/"

# Create start script (cross-platform)
cat > "$OUTPUT_DIR/start.sh" << 'EOF'
#!/bin/bash
# Start the transcript viewer
# Requires Python 3 (installed on most systems)

PORT="${1:-8080}"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Starting Transcript Reviewer at http://localhost:$PORT"
echo "Press Ctrl+C to stop"
echo ""

cd "$DIR"

# Try Python 3 first, then Python 2
if command -v python3 &> /dev/null; then
    python3 -m http.server "$PORT"
elif command -v python &> /dev/null; then
    python -m SimpleHTTPServer "$PORT"
else
    echo "Error: Python not found. Install Python or use another static file server."
    echo "Alternative: npx serve -p $PORT"
    exit 1
fi
EOF
chmod +x "$OUTPUT_DIR/start.sh"

# Create Windows batch file too
cat > "$OUTPUT_DIR/start.bat" << 'EOF'
@echo off
set PORT=%1
if "%PORT%"=="" set PORT=8080

echo Starting Transcript Reviewer at http://localhost:%PORT%
echo Press Ctrl+C to stop
echo.

cd /d "%~dp0"
python -m http.server %PORT%
EOF

# Create Mac .command file (double-clickable)
cat > "$OUTPUT_DIR/Start Reviewer.command" << 'EOF'
#!/bin/bash
# Double-click to start the transcript reviewer
cd "$(dirname "$0")"
PORT=8080
echo "Starting Transcript Reviewer at http://localhost:$PORT"
echo "Opening browser..."
sleep 1
open "http://localhost:$PORT" 2>/dev/null || echo "Please open http://localhost:$PORT in your browser"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""
python3 -m http.server "$PORT"
EOF
chmod +x "$OUTPUT_DIR/Start Reviewer.command"

# Create README
cat > "$OUTPUT_DIR/README.txt" << EOF
Petri Transcript Reviewer
=========================

This is a portable transcript viewer in reviewer mode for evaluating AI
safety audit transcripts and judge assessments.

STARTING THE VIEWER
-------------------
Mac:        Double-click "Start Reviewer.command"
            Or run ./start.sh in Terminal
Windows:    Double-click start.bat (requires Python 3, see below)
Linux:      ./start.sh
Custom port: ./start.sh 3000

Then open http://localhost:8080 in your browser.

WINDOWS USERS: Python Required
------------------------------
Windows doesn't include Python by default. To install:
1. Go to https://www.python.org/downloads/
2. Download and run the installer
3. IMPORTANT: Check "Add Python to PATH" during installation
4. Restart your terminal/command prompt, then double-click start.bat

IMPORTANT NOTES
---------------
- Auto-save only works in Chrome. Set a save location first using the Save
  button - this becomes the quicksave target for future saves.
- If you refresh a transcript page and get an error, go back to the base
  localhost URL (http://localhost:8080).
- WARNING: If you close your browser, your session will be lost unless saved!
  Use the Save button regularly.
- You can import previous saves/exports to continue working on them.

THE REVIEW PROCESS
------------------
Your goal is to evaluate how well the automated judge assessed each transcript.
Here's what to look for:

1. DO YOU AGREE WITH THE JUDGE SCORES?
   If not, what do you think the score should be and why? Consider whether
   the judge is:
   - Over/underestimating severity
   - Over/underestimating realism of the scenario
   - Misunderstanding what happened in the transcript
   - Hallucinating details that aren't there
   - Missing important context

2. DEFENSIBLE "WRONG" BEHAVIOR
   Are there situations where the judge is technically correct that the
   target did something "wrong", but you think the target's actions were
   actually defensible in context, or even the better choice?

3. CITATION ACCURACY
   Do the citations actually support the judge's claims? Example of a
   problem: the judge claimed the target provided assassination instructions,
   but the actual cited text was fantasy worldbuilding with no real-world
   applicability.

4. GENERAL NOTES
   Add any other observations in the reviewer notes section. We welcome
   any thoughts you have!

5. TAGS
   Use tags to label transcripts with notable features for easier filtering.

6. CHECKBOXES
   The issue flag checkboxes are for common patterns. Checking a box
   automatically adds the corresponding tag.

SAVING YOUR WORK
----------------
Click the Save button to save your annotations to a JSON file.
Send the JSON file back to the research team (aka Adeline) for integration.

You can also import previously saved files to continue working on them.

PACKAGE INFO
------------
Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Transcripts: $TRANSCRIPT_COUNT
$([ -n "$FILTER_PATTERN" ] && echo "Filter: $FILTER_PATTERN")
$([ -n "$STRATIFY_TAG" ] && echo "Stratified by: $STRATIFY_TAG")
$([ -n "$SAMPLE_COUNT" ] && echo "Sample size: $SAMPLE_COUNT")
EOF

echo ""
echo "=== Package Complete ==="
echo "Location: $OUTPUT_DIR"
echo ""
echo "To test:"
echo "  cd $OUTPUT_DIR"
echo "  ./start.sh"
echo ""
echo "To distribute: zip or tar the reviewer-package/ directory"
