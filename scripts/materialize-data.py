#!/usr/bin/env python3
"""Restore one route or an entire immutable Metaflow data release."""
import argparse
import concurrent.futures
import gzip
from contextlib import contextmanager
from http.client import HTTPException
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tempfile
import time
from urllib.parse import quote, urlparse
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
LOCKS = ROOT / "metadata/data-releases"


def digest(path, algorithm):
    result = hashlib.new(algorithm)
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def relative(name):
    if (not isinstance(name, str) or not name or "\\" in name
            or PurePosixPath(name).is_absolute()
            or any(part in ("", ".", "..") for part in name.split("/"))):
        raise ValueError(f"Invalid resource path {name!r}")
    return name


def load(lock_path):
    lock = json.loads(lock_path.read_bytes())
    packed = (lock_path.parent / relative(lock["manifest"])).read_bytes()
    if hashlib.sha256(packed).hexdigest() != lock["sha256"]:
        raise ValueError("Release manifest SHA-256 mismatch")
    release = json.loads(gzip.decompress(packed))
    if release["release"] != lock["version"] or urlparse(release["origin"]).scheme != "https":
        raise ValueError("Invalid release identity")
    for name, entry in release["files"].items():
        relative(name)
        if len(entry) not in (2, 3) or not re.fullmatch("[a-f0-9]{40}", entry[0]) or entry[1] < 0:
            raise ValueError(f"Invalid file entry for {name}")
        if len(entry) == 3:
            relative(entry[2])
    return release


def selected(release, route):
    files = release["files"]
    if route is None:
        return files
    canonical = release["aliases"].get(route, route)
    if canonical not in release["roots"]:
        raise ValueError(f"Unknown route {route!r} in {release['release']}")
    roots = release["roots"][canonical]
    if isinstance(roots, str):
        roots = [roots]
    prefixes = tuple(relative(root).rstrip("/") + "/" for root in roots)
    result = {k: v for k, v in files.items() if k.startswith(prefixes)}
    if not result:
        raise ValueError(f"No assets under {roots!r}")
    for name in ("index.json", "version-history.json", "editor-version-history.json"):
        if name in files:
            result[name] = files[name]
    return result


def valid(path, entry):
    return path.is_file() and path.stat().st_size == entry[1] and digest(path, "sha1") == entry[0]


def restore(name, entry, origin, dest, sources, locations, offline):
    target = dest / name
    if not target.resolve().is_relative_to(dest):
        raise ValueError(f"Destination escapes output directory: {name}")
    if valid(target, entry):
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=target.parent) as work:
        partial = Path(work) / "payload"
        local = [root / name for root in sources]
        if name in locations:
            local.insert(0, Path(locations[name]))
        for path in local:
            if valid(path, entry):
                cloned = sys.platform == "darwin" and subprocess.run(
                    ["cp", "-c", str(path), str(partial)], stderr=subprocess.DEVNULL
                ).returncode == 0
                if not cloned:
                    shutil.copyfile(path, partial)
                break
        else:
            if offline:
                raise ValueError(f"Verified local source unavailable for {name}")
            remote = entry[2] if len(entry) == 3 else name
            url = origin + "/data/" + quote(remote, safe="/")
            for attempt in range(3):
                try:
                    with urlopen(url, timeout=90) as response, partial.open("wb") as output:
                        shutil.copyfileobj(response, output, 1024 * 1024)
                    if not valid(partial, entry):
                        raise ValueError(f"Content mismatch for {name}")
                    break
                except (OSError, HTTPException, ValueError):
                    if attempt == 2:
                        raise
                    time.sleep(2 ** attempt)
        if not valid(partial, entry):
            raise ValueError(f"Staged bytes mismatch for {name}")
        os.replace(partial, target)


@contextmanager
def output_lock(dest):
    # Keep coordination files outside publishable payloads.
    identity = hashlib.sha256(os.fsencode(dest)).hexdigest()
    with (Path(tempfile.gettempdir()) / ("metaflow-data-" + identity + ".lock")).open("a+b") as stream:
        if os.name == "nt":
            import msvcrt
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX)
        yield


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lock", type=Path, default=LOCKS / "active.lock.json")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--route")
    action.add_argument("--all", action="store_true")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--source", action="append", type=Path, default=[], help="Local data directory")
    parser.add_argument("--source-map", type=Path, help="Local JSON map of release path to archive file")
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--jobs", type=int, default=6, choices=range(1, 33), metavar="1..32")
    args = parser.parse_args()
    release = load(args.lock)
    files = selected(release, args.route)
    if args.output.is_symlink():
        raise ValueError("Choose a real output directory, not a symlink to another checkout")
    dest = args.output.resolve()
    dest.mkdir(parents=True, exist_ok=True)
    with output_lock(dest):
        materialize(args, release, files, dest)


def materialize(args, release, files, dest):
    current = dest / "index.json"
    if current.exists() and digest(current, "sha256") != release["indexSha256"]:
        fixture = ROOT / "metaflow-viewer/e2e/fixture/index.json"
        if args.all or not fixture.is_file() or current.read_bytes() != fixture.read_bytes():
            raise ValueError("Choose a separate output directory for each release")
    if args.all:
        extras = [str(p.relative_to(dest)) for p in dest.rglob("*")
                  if (p.is_file() or p.is_symlink()) and p.relative_to(dest).as_posix() not in files]
        if extras:
            raise ValueError(f"Full staging requires a clean destination; unexpected path {extras[0]}")
    locations = json.loads(args.source_map.read_bytes()) if args.source_map else {}

    def restore_name(name):
        restore(name, files[name], release["origin"], dest, args.source, locations, args.offline)

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
        for _ in pool.map(restore_name, (name for name in files if name != "index.json")):
            pass
    restore_name("index.json")
    if digest(dest / "index.json", "sha256") != release["indexSha256"]:
        raise ValueError("Index SHA-256 mismatch")
    print(f"{release['release']}: {len(files)} verified files, {sum(v[1] for v in files.values())} bytes")


if __name__ == "__main__":
    main()
