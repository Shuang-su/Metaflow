"""Apply checked Studio migration packages to the canonical resource index."""

from functools import lru_cache
import json
from pathlib import Path
import re
from subprocess import check_output


def asset_path(root, relative):
    path = root / relative
    if Path(relative).is_absolute() or not path.resolve().is_relative_to(root.resolve()):
        raise ValueError(f"Asset path outside data: {relative}")
    if not path.is_file():
        raise FileNotFoundError(path)
    return path


def logical_size(path):
    size = path.stat().st_size
    if size < 200:
        data = path.read_bytes()
        if data.startswith(b"version https://git-lfs.github.com/spec/v1\n"):
            return int(re.search(rb"^size (\d+)$", data, re.MULTILINE)[1])
    return size


@lru_cache(maxsize=None)
def lfs_object_directory(root):
    common = check_output(
        ["git", "-C", str(root), "rev-parse", "--path-format=absolute", "--git-common-dir"],
        text=True,
    ).strip()
    return Path(common)/"lfs"/"objects"


def read_asset_bytes(root, path):
    data = path.read_bytes()
    if data.startswith(b"version https://git-lfs.github.com/spec/v1\n"):
        record = re.search(rb"^oid sha256:([a-f0-9]{64})\nsize (\d+)$", data, re.MULTILINE)
        if record is None:
            raise ValueError(f"Malformed LFS pointer: {path}")
        oid, size = record[1].decode(), int(record[2])
        stored = lfs_object_directory(root)/oid[:2]/oid[2:4]/oid
        if not stored.is_file() or stored.stat().st_size != size:
            raise FileNotFoundError(f"Missing LFS model metadata: {path} ({oid})")
        data = stored.read_bytes()
    return data


def read_asset_json(root, path):
    return json.loads(read_asset_bytes(root, path))


def streaming_size(root, manifest):
    lod = read_asset_json(root, manifest)
    names = list(lod["filenames"])
    if lod.get("environment"):
        names.append(lod["environment"])
    files = {manifest}
    for name in names:
        chunk = asset_path(root, str(manifest.parent.relative_to(root) / name))
        files.add(chunk)
        if chunk.suffix == ".json":
            meta = read_asset_json(root, chunk)
            for channel in meta.values():
                if isinstance(channel, dict):
                    for texture in channel.get("files", []):
                        files.add(asset_path(root, str(chunk.parent.relative_to(root) / texture)))
    return sum(logical_size(path) for path in files)


def migrated_resources(resources, changes, root):
    routes = {}
    for resource in resources:
        route = resource["route"]
        if route in routes:
            raise ValueError(f"Duplicate canonical route: {route}")
        routes[route] = resource
    unknown = set(changes) - routes.keys()
    if unknown:
        raise ValueError(f"Unknown canonical routes: {sorted(unknown)}")
    for route, change in changes.items():
        resource = routes[route]
        files = resource["files"]
        sizes = resource["fileSize"]
        primary_size = ("model", "environment", "thumbnail", "voxel", "voxelManifest")
        for role, relative in change.get("files", {}).items():
            if role not in (*primary_size, "settings", "compatibilityModel"):
                raise ValueError(f"Unsupported migration file role: {role}")
            if relative is None:
                files.pop(role, None)
                sizes.pop(role, None)
                continue
            path = asset_path(root, relative)
            files[role] = relative
            if role == "model" and path.name == "lod-meta.json":
                sizes[role] = streaming_size(root, path)
            elif role == "voxel":
                sizes[role] = logical_size(path) + logical_size(path.with_suffix(".bin"))
            elif role == "voxelManifest":
                manifest = read_asset_json(root, path)
                tile_files = {path}
                for tile in manifest["tiles"]:
                    directory = path.parent.relative_to(root)
                    meta = asset_path(root, str(directory / tile["url"]))
                    tile_files.update((meta, asset_path(root, str(meta.with_suffix(".bin").relative_to(root)))))
                sizes[role] = sum(logical_size(f) for f in tile_files)
            elif role != "settings":
                sizes[role] = logical_size(path)
        # Compatibility assets are a distinct request path, not a Viewer startup byte count.
        sizes["total"] = sum(sizes.get(role, 0) for role in primary_size)
        if change.get("retireLegacyLod"):
            files.pop("lod", None)
            sizes.pop("recommended", None)
        if "experienceType" in change:
            resource["experienceType"] = change["experienceType"]
        if change.get("viewer"):
            resource["viewer"] = {**resource.get("viewer", {}), **change["viewer"]}
