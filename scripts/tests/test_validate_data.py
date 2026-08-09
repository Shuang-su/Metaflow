import json
import tempfile
import unittest
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from validate_data import validate  # noqa: E402


class DataValidationTests(unittest.TestCase):
    def test_detects_mirror_and_route_drift(self):
        with tempfile.TemporaryDirectory(prefix="metaflow-data-") as directory:
            root = Path(directory)
            (root / "data").mkdir()
            (root / "metadata").mkdir()
            viewer = {
                "schemaVersion": "1.1",
                "current": {"displayVersion": "1.0", "appSemver": "1.0.0"},
                "entries": [],
            }
            editor = {
                "schemaVersion": "1.1",
                "current": {"displayVersion": "2.0", "appSemver": "2.0.0"},
                "entries": [],
            }
            index = {
                "schemaVersion": "1.2",
                "release": viewer["current"],
                "totalResources": 2,
                "resources": [
                    {"id": "a", "category": ["x"], "route": "/x/a", "files": {"model": "x/a.sog"}},
                    {"id": "b", "category": ["x"], "route": "/x/a", "files": {"model": "../escape.sog"}},
                ],
            }
            for path, value in (
                (root / "metadata/version-history.json", viewer),
                (root / "data/version-history.json", {**viewer, "schemaVersion": "1.0"}),
                (root / "metadata/editor-version-history.json", editor),
                (root / "data/editor-version-history.json", editor),
                (root / "data/index.json", index),
            ):
                path.write_text(json.dumps(value), encoding="utf-8")

            errors = validate(root)
            self.assertTrue(any("exactly mirror" in error for error in errors))
            self.assertTrue(any("duplicate route" in error for error in errors))
            self.assertTrue(any("stay within" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
