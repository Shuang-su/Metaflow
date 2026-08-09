#!/usr/bin/env python3
"""Generate or verify public Metaflow Editor version metadata."""

import argparse
import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE_FILE = REPO_ROOT / "metadata" / "editor-version-history.json"
DATA_FILE = REPO_ROOT / "data" / "editor-version-history.json"
RUNTIME_FILE = REPO_ROOT / "metaflow-editor" / "dist" / "version.json"


def read_json(path):
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def render_json(data):
    return f"{json.dumps(data, ensure_ascii=False, indent=2)}\n"


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_json(data), encoding="utf-8")


def check_json(path, data):
    expected = render_json(data)
    if not path.exists():
        raise SystemExit(f"Missing generated file: {path}")
    actual = path.read_text(encoding="utf-8")
    if actual != expected:
        raise SystemExit(f"Generated file is stale: {path}")


def build_runtime_version(history):
    current = history["current"]
    latest_entry = history["entries"][0] if history.get("entries") else {}
    return {
        "productName": current["productName"],
        "displayVersion": current["displayVersion"],
        "appSemver": current["appSemver"],
        "date": current["date"],
        "gitRef": current["gitRef"],
        "historyUrl": current["historyUrl"],
        "sourcePath": current.get("sourcePath"),
        "upstreamSnapshotPath": current.get("upstreamSnapshotPath"),
        "upstream": current["upstream"],
        "dependencies": current["dependencies"],
        "latestChange": {
            "type": latest_entry.get("type"),
            "scope": latest_entry.get("scope"),
            "summary": latest_entry.get("summary"),
            "changes": latest_entry.get("changes", [])
        },
        "generatedFrom": "metadata/editor-version-history.json"
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="verify generated files without writing")
    args = parser.parse_args()
    history = read_json(SOURCE_FILE)
    outputs = [
        (DATA_FILE, history),
        (RUNTIME_FILE, build_runtime_version(history))
    ]
    if args.check:
        for path, data in outputs:
            check_json(path, data)
            print(f"Verified {path}")
    else:
        for path, data in outputs:
            write_json(path, data)
            print(f"Generated {path}")


if __name__ == "__main__":
    main()
