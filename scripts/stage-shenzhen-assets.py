#!/usr/bin/env python3
"""Stage versioned Shenzhen data from a local release package or the verified live store."""

import argparse
import concurrent.futures
import gzip
import hashlib
import json
import os
import shutil
import tempfile
import time
from pathlib import Path, PurePosixPath
from urllib.parse import quote
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "metadata" / "shenzhen-asset-manifest.json.gz"


def fingerprint(path):
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stage(destination, local, origin, workers):
    with gzip.open(MANIFEST, "rt", encoding="utf-8") as manifest:
        records = json.load(manifest)
    def materialize(record):
        name, size, checksum = record
        key = PurePosixPath(name)
        if key.is_absolute() or ".." in key.parts or key.parts[:2] != ("data", "Shenzhen"):
            raise ValueError(f"Invalid Shenzhen asset path: {name}")
        target = destination / name
        if target.is_file() and target.stat().st_size == size and fingerprint(target) == checksum:
            return
        target.parent.mkdir(parents=True, exist_ok=True)
        fd, temp = tempfile.mkstemp(dir=target.parent, prefix=".stage-")
        scratch = Path(temp)
        try:
            with os.fdopen(fd, "wb") as stream:
                if local:
                    with (local / name).open("rb") as source:
                        shutil.copyfileobj(source, stream, 1024 * 1024)
                else:
                    for attempt in range(4):
                        try:
                            with urlopen(origin.rstrip("/") + "/" + quote(name), timeout=120) as source:
                                shutil.copyfileobj(source, stream, 1024 * 1024)
                            break
                        except OSError:
                            if attempt == 3:
                                raise
                            stream.seek(0)
                            stream.truncate()
                            time.sleep(2 ** attempt)
            if scratch.stat().st_size != size or fingerprint(scratch) != checksum:
                raise ValueError(f"Asset checksum mismatch: {name}")
            os.replace(scratch, target)
        finally:
            scratch.unlink(missing_ok=True)
    with concurrent.futures.ThreadPoolExecutor(workers) as pool:
        for _ in pool.map(materialize, records):
            pass
    print(f"Verified {len(records)} Shenzhen objects")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "metaflow-viewer/public")
    parser.add_argument("--local", type=Path, default=os.environ.get("METAFLOW_SHENZHEN_PACKAGE"))
    parser.add_argument("--origin", default=os.environ.get("METAFLOW_SHENZHEN_ORIGIN", "https://metaflow.shuang-su.com"))
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    stage(args.output.resolve(), args.local, args.origin, args.workers)
