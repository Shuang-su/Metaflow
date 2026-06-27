#!/usr/bin/env python3
"""Generate public Metaflow Editor version metadata."""

import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE_FILE = REPO_ROOT / "metadata" / "editor-version-history.json"
DATA_FILE = REPO_ROOT / "data" / "editor-version-history.json"
RUNTIME_FILE = REPO_ROOT / "metaflow-editor" / "version.json"


def read_json(path):
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
        file.write("\n")


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
    history = read_json(SOURCE_FILE)
    write_json(DATA_FILE, history)
    write_json(RUNTIME_FILE, build_runtime_version(history))
    print(f"Generated {DATA_FILE}")
    print(f"Generated {RUNTIME_FILE}")


if __name__ == "__main__":
    main()
