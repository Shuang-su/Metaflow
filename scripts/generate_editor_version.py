#!/usr/bin/env python3
"""Regenerate Editor history/runtime metadata without blessing stale code bytes.

First-time edition staging uses `node scripts/stage-editor.mjs --apply`.
This command updates metadata on already-staged manifests (e.g. final merge SHA).
"""
import hashlib
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE_FILE = REPO_ROOT / "metadata/editor-version-history.json"
DATA_FILE = REPO_ROOT / "data/editor-version-history.json"


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_runtime_version(history, current, edition, build_id):
    entry = history["entries"][0]
    return {
        "productName": current["productName"], "displayVersion": current["displayVersion"],
        "appSemver": current["appSemver"], "date": current["date"], "gitRef": current["gitRef"],
        "historyUrl": current["historyUrl"], "runtimeUrl": current["runtimeUrl"],
        "sourcePath": current["sourcePath"], "edition": edition, "development": False,
        "buildType": "release",
        "buildId": build_id, "upstream": current["upstream"], "dependencies": current["dependencies"],
        "latestChange": {"type": entry["type"], "scope": entry["scope"], "summary": entry["summary"], "changes": entry["changes"]},
        "generatedFrom": "metadata/editor-version-history.json"
    }


def main():
    history = read_json(SOURCE_FILE)
    write_json(DATA_FILE, history)
    print(f"Generated {DATA_FILE}")
    editions = [("default", "metaflow-editor", history["current"])]
    if history.get("compatibility"):
        editions.append(("compatibility", "metaflow-editor-legacy", {**history["current"], **history["compatibility"]}))
    for edition, directory, current in editions:
        mirror = REPO_ROOT / directory
        manifest_path = mirror / "build-manifest.json"
        if not manifest_path.exists():
            print(f"{edition}: fresh build and explicit staging required before runtime generation")
            continue
        manifest = read_json(manifest_path)
        bundle_id = hashlib.sha256((mirror / "index.js").read_bytes()).hexdigest()
        if bundle_id != manifest["files"]["index.js"]:
            raise ValueError(f"{edition}: bundle differs from staged manifest; refusing metadata update")
        runtime = mirror / "version.json"
        write_json(runtime, build_runtime_version(history, current, edition, bundle_id))
        manifest["files"]["version.json"] = hashlib.sha256(runtime.read_bytes()).hexdigest()
        write_json(manifest_path, manifest)
        print(f"Generated {runtime}; source digest retained for stage-editor --check")


if __name__ == "__main__":
    main()
