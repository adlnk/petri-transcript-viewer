#!/usr/bin/env python3
"""
Portable transcript viewer launcher.

Opens a native folder picker to select a transcript directory, then starts
a local web server that serves the viewer app + transcripts. No bundling
step, no Node.js, no Chrome requirement.

Usage:
    python serve_viewer.py                    # Opens folder picker
    python serve_viewer.py /path/to/transcripts  # Skip picker, use this folder
    python serve_viewer.py --port 3000        # Custom port
"""

import argparse
import json
import os
import sys
import webbrowser
from functools import lru_cache
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote

SCRIPT_DIR = Path(__file__).parent.resolve()
VIEWER_DIR = SCRIPT_DIR.parent  # petri-transcript-viewer root

# The built viewer files (static site output from vite build)
# Look for annotator-package, reviewer-package, or build/ in order
def find_build_dir():
    candidates = [
        VIEWER_DIR / "annotator-package",
        VIEWER_DIR / "reviewer-package",
        VIEWER_DIR / "build",
    ]
    for c in candidates:
        if (c / "index.html").exists():
            return c
    return None


def pick_folder_native():
    """Open the OS native folder picker dialog. Returns selected path or None."""
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        folder = filedialog.askdirectory(
            title="Select Transcript Folder",
            mustexist=True,
        )
        root.destroy()
        return Path(folder) if folder else None
    except ImportError:
        print("\033[33mWarning\033[0m: tkinter not available for native folder picker")
        return None
    except Exception as e:
        print(f"\033[33mWarning\033[0m: folder picker failed: {e}")
        return None


def scan_transcripts(transcript_dir: Path) -> list[dict]:
    """Scan a directory for transcript JSON files, extract lightweight metadata."""
    transcripts = []
    json_files = sorted(transcript_dir.rglob("*.json"))

    for fpath in json_files:
        try:
            data = json.loads(fpath.read_text())
            if not data.get("metadata"):
                continue

            meta = data["metadata"]
            rel_path = str(fpath.relative_to(transcript_dir)).replace("\\", "/")
            parts = rel_path.split("/")
            split_dir = parts[-2] if len(parts) > 1 else ""
            filename = parts[-1]
            stem = filename[:-5] if filename.endswith(".json") else filename

            # Extract target model
            target_model = meta.get("target_model", "unknown")
            if target_model and ":" in target_model:
                target_model = target_model.split(":")[-1]

            judge = meta.get("judge_output") or {}
            full_summary = judge.get("summary") or meta.get("description") or "No summary available"

            transcripts.append({
                "id": meta.get("transcript_id", stem),
                "wordId": meta.get("word_id"),
                "model": target_model or "unknown",
                "split": split_dir,
                "concerningScore": (judge.get("scores") or {}).get("concerning", 0),
                "summary": full_summary[:200] + ("..." if len(full_summary) > 200 else ""),
                "compactSummary": judge.get("compact_summary"),
                "scores": judge.get("scores") or {},
                "tags": meta.get("tags") or [],
                "userTags": meta.get("user_tags") or [],
                "shareOnline": meta.get("share_online"),
                "_filePath": rel_path,
            })
        except (json.JSONDecodeError, KeyError):
            continue

    return transcripts


def extract_dimensions(transcript_dir: Path) -> tuple[dict, dict]:
    """Extract dimension descriptions and display names from transcripts."""
    descriptions = {}
    for fpath in transcript_dir.rglob("*.json"):
        try:
            data = json.loads(fpath.read_text())
            descs = (data.get("metadata") or {}).get("judge_output", {}).get("score_descriptions")
            if descs:
                for name, desc in descs.items():
                    if name not in descriptions and desc:
                        descriptions[name] = desc
                if len(descriptions) > 30:
                    break  # enough
        except (json.JSONDecodeError, KeyError):
            continue

    display_names = {}
    for dim_id in descriptions:
        display_names[dim_id] = " ".join(
            w.capitalize() for w in dim_id.split("_")
        )

    return descriptions, display_names


class TranscriptViewerHandler(SimpleHTTPRequestHandler):
    """HTTP handler that serves the viewer app + transcript data dynamically."""

    build_dir: Path
    transcript_dir: Path
    _metadata_cache: bytes | None = None
    _descriptions_cache: bytes | None = None
    _display_names_cache: bytes | None = None

    def do_GET(self):
        # Decode URL path
        path = unquote(self.path).split("?")[0]

        # Serve generated data files
        if path == "/data/metadata-index.json":
            self._serve_metadata_index()
            return
        if path == "/data/dimension-descriptions.json":
            self._serve_dimension_descriptions()
            return
        if path == "/data/dimension-display-names.json":
            self._serve_dimension_display_names()
            return

        # Serve individual transcript files
        if path.startswith("/transcripts/"):
            rel = path[len("/transcripts/"):]
            self._serve_transcript(rel)
            return

        # Everything else: serve from the built viewer directory
        self._serve_static(path)

    def _serve_metadata_index(self):
        cls = type(self)
        if cls._metadata_cache is None:
            transcripts = scan_transcripts(cls.transcript_dir)
            index = {
                "metadata": transcripts,
                "generatedAt": "runtime",
                "transcriptCount": len(transcripts),
            }
            cls._metadata_cache = json.dumps(index).encode()
            print(f"  Indexed {len(transcripts)} transcripts from {cls.transcript_dir}")
        self._send_json(cls._metadata_cache)

    def _serve_dimension_descriptions(self):
        cls = type(self)
        if cls._descriptions_cache is None:
            descriptions, display_names = extract_dimensions(cls.transcript_dir)
            cls._descriptions_cache = json.dumps(descriptions).encode()
            cls._display_names_cache = json.dumps(display_names).encode()
        self._send_json(cls._descriptions_cache)

    def _serve_dimension_display_names(self):
        cls = type(self)
        if cls._display_names_cache is None:
            descriptions, display_names = extract_dimensions(cls.transcript_dir)
            cls._descriptions_cache = json.dumps(descriptions).encode()
            cls._display_names_cache = json.dumps(display_names).encode()
        self._send_json(cls._display_names_cache)

    def _serve_transcript(self, rel_path: str):
        fpath = type(self).transcript_dir / rel_path
        if not fpath.exists() or not fpath.is_file():
            self.send_error(404, f"Transcript not found: {rel_path}")
            return
        # Security: ensure path doesn't escape transcript dir
        try:
            fpath.resolve().relative_to(type(self).transcript_dir.resolve())
        except ValueError:
            self.send_error(403, "Access denied")
            return
        self._send_json(fpath.read_bytes())

    def _serve_static(self, url_path: str):
        # Map URL to file in build directory
        if url_path == "/":
            url_path = "/index.html"

        fpath = type(self).build_dir / url_path.lstrip("/")

        # SvelteKit fallback: if file doesn't exist, try adding .html or serve index
        if not fpath.exists():
            # Try .html extension
            html_path = fpath.with_suffix(".html")
            if html_path.exists():
                fpath = html_path
            else:
                # SPA fallback: serve index.html for client-side routing
                fpath = type(self).build_dir / "index.html"

        if not fpath.exists():
            self.send_error(404, f"Not found: {url_path}")
            return

        # Determine content type
        content_type = self._guess_type(fpath)
        data = fpath.read_bytes()

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def _send_json(self, data: bytes):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def _guess_type(self, fpath: Path) -> str:
        ext = fpath.suffix.lower()
        types = {
            ".html": "text/html",
            ".js": "application/javascript",
            ".css": "text/css",
            ".json": "application/json",
            ".png": "image/png",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon",
            ".woff": "font/woff",
            ".woff2": "font/woff2",
            ".ttf": "font/ttf",
            ".map": "application/json",
        }
        return types.get(ext, "application/octet-stream")

    # Suppress request logging (too noisy)
    def log_message(self, format, *args):
        pass


def main():
    parser = argparse.ArgumentParser(description="Petri Transcript Viewer")
    parser.add_argument("transcript_dir", nargs="?", help="Transcript directory (opens folder picker if omitted)")
    parser.add_argument("--port", "-p", type=int, default=8080, help="Port (default: 8080)")
    parser.add_argument("--no-open", action="store_true", help="Don't auto-open browser")
    parser.add_argument("--build-dir", type=Path, help="Viewer build directory (auto-detected)")
    args = parser.parse_args()

    # Find the built viewer
    build_dir = args.build_dir or find_build_dir()
    if not build_dir:
        print("\033[31m✗ No viewer build found.\033[0m")
        print("Run one of: npm run build:static, npm run build:reviewer, npm run build:annotator")
        sys.exit(1)
    print(f"Viewer: {build_dir}")

    # Get transcript directory
    if args.transcript_dir:
        transcript_dir = Path(args.transcript_dir).resolve()
    else:
        print("Opening folder picker...")
        transcript_dir = pick_folder_native()
        if not transcript_dir:
            print("No folder selected. Exiting.")
            sys.exit(0)

    if not transcript_dir.exists():
        print(f"\033[31m✗ Directory not found:\033[0m {transcript_dir}")
        sys.exit(1)

    # Count transcripts
    json_count = len(list(transcript_dir.rglob("*.json")))
    print(f"Transcripts: {transcript_dir} ({json_count} JSON files)")

    # Configure the handler
    TranscriptViewerHandler.build_dir = build_dir
    TranscriptViewerHandler.transcript_dir = transcript_dir
    # Reset caches
    TranscriptViewerHandler._metadata_cache = None
    TranscriptViewerHandler._descriptions_cache = None
    TranscriptViewerHandler._display_names_cache = None

    # Start server
    server = HTTPServer(("localhost", args.port), TranscriptViewerHandler)
    url = f"http://localhost:{args.port}"
    print(f"\nServing at {url}")
    print("Press Ctrl+C to stop\n")

    if not args.no_open:
        webbrowser.open(url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.server_close()


if __name__ == "__main__":
    main()
