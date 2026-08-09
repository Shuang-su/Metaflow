#!/usr/bin/env python3
"""Validate small, distributable Metaflow data fixtures and version mirrors."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path, PurePosixPath


class DataValidationError(Exception):
    pass


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise DataValidationError(f"{path}: missing") from error
    except json.JSONDecodeError as error:
        raise DataValidationError(f"{path}: invalid JSON: {error}") from error


def validate(root: Path, check_files: bool = False) -> list[str]:
    errors: list[str] = []
    index = load_json(root / "data" / "index.json")
    viewer_history = load_json(root / "metadata" / "version-history.json")
    viewer_mirror = load_json(root / "data" / "version-history.json")
    editor_history = load_json(root / "metadata" / "editor-version-history.json")
    editor_mirror = load_json(root / "data" / "editor-version-history.json")

    if viewer_history != viewer_mirror:
        errors.append("data/version-history.json must exactly mirror metadata/version-history.json")
    if editor_history != editor_mirror:
        errors.append("data/editor-version-history.json must exactly mirror metadata/editor-version-history.json")
    if index.get("schemaVersion") != "1.2":
        errors.append("data/index.json: schemaVersion must be 1.2")

    resources = index.get("resources")
    if not isinstance(resources, list):
        errors.append("data/index.json: resources must be an array")
        resources = []
    if index.get("totalResources") != len(resources):
        errors.append("data/index.json: totalResources does not match resources length")

    release = index.get("release", {})
    current = viewer_history.get("current", {})
    for field in ("displayVersion", "appSemver"):
        if release.get(field) != current.get(field):
            errors.append(f"data/index.json: release.{field} does not match Viewer version history")

    seen_routes: set[str] = set()
    seen_ids: set[tuple[str, str]] = set()
    for position, resource in enumerate(resources):
        label = f"data/index.json: resources[{position}]"
        route = resource.get("route")
        if not isinstance(route, str) or not route.startswith("/") or route == "/":
            errors.append(f"{label}: route must be an absolute non-root application route")
        elif route in seen_routes:
            errors.append(f"{label}: duplicate route {route}")
        else:
            seen_routes.add(route)

        resource_id = resource.get("id")
        category = resource.get("category")
        category_key = "/".join(category) if isinstance(category, list) else ""
        identity = (category_key, str(resource_id))
        if identity in seen_ids:
            errors.append(f"{label}: duplicate category/id identity {identity}")
        seen_ids.add(identity)

        files = resource.get("files", {})
        if not isinstance(files, dict):
            errors.append(f"{label}: files must be an object")
            continue
        for role, value in files.items():
            if value is None:
                continue
            if role == "lod" and isinstance(value, list):
                for lod_position, lod in enumerate(value):
                    lod_file = lod.get("file") if isinstance(lod, dict) else None
                    if not isinstance(lod_file, str):
                        errors.append(f"{label}: files.lod[{lod_position}].file must be a string")
                        continue
                    pure = PurePosixPath(lod_file)
                    if pure.is_absolute() or ".." in pure.parts:
                        errors.append(f"{label}: files.lod[{lod_position}].file must stay within data/")
                    elif check_files and not (root / "data" / pure).is_file():
                        errors.append(f"{label}: files.lod[{lod_position}].file does not exist: data/{lod_file}")
                continue
            if not isinstance(value, str):
                errors.append(f"{label}: files.{role} must be a string or null")
                continue
            pure = PurePosixPath(value)
            if pure.is_absolute() or ".." in pure.parts:
                errors.append(f"{label}: files.{role} must stay within data/")
            elif check_files and not (root / "data" / pure).is_file():
                errors.append(f"{label}: files.{role} does not exist: data/{value}")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--check-files", action="store_true")
    args = parser.parse_args()
    try:
        errors = validate(args.root.resolve(), check_files=args.check_files)
    except DataValidationError as error:
        errors = [str(error)]
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("Data fixture validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
