import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "materialize-data.py"


class RestoreTest(unittest.TestCase):
    def test_alias_closure_and_failed_restore(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src = root / "src"
            payloads = {"index.json": b"{}", "one/body.sog": b"model", "one/tiles/a.bin": b"tile", "collision/one/a.bin": b"voxel", "two/body.sog": b"other"}
            for name, payload in payloads.items():
                target = src / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(payload)
            manifest = dict(release="1", origin="https://example.invalid", roots={"/one": ["one", "collision/one"], "/two": "two"},
                            aliases={"/alias": "/one"}, indexSha256=hashlib.sha256(b"{}").hexdigest(),
                            files={k: [hashlib.sha1(v).hexdigest(), len(v)] for k, v in payloads.items()})
            packed = gzip.compress(json.dumps(manifest).encode())
            (root / "data.gz").write_bytes(packed)
            lock = root / "lock.json"
            lock.write_text(json.dumps(dict(version="1", manifest="data.gz", sha256=hashlib.sha256(packed).hexdigest())))
            out = root / "out"
            args = [sys.executable, str(SCRIPT), "--lock", str(lock), "--offline", "--source", str(src), "--output", str(out)]
            subprocess.run(args + ["--route", "/alias"], check=True, capture_output=True)
            self.assertEqual((out / "one/tiles/a.bin").read_bytes(), b"tile")
            self.assertEqual((out / "collision/one/a.bin").read_bytes(), b"voxel")
            self.assertFalse((out / "two/body.sog").exists())
            (src / "two/body.sog").write_bytes(b"wrong")
            self.assertNotEqual(subprocess.run(args + ["--all"], capture_output=True).returncode, 0)
            self.assertEqual((out / "index.json").read_bytes(), b"{}")
            self.assertFalse((out / "two/body.sog").exists())
            (src / "two/body.sog").write_bytes(b"other")
            subprocess.run(args + ["--all"], check=True, capture_output=True)
            self.assertEqual((out / "two/body.sog").read_bytes(), b"other")
