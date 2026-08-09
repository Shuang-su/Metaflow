import importlib.util
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = REPO_ROOT / "scripts" / "generate_editor_version.py"
SPEC = importlib.util.spec_from_file_location("generate_editor_version", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class GenerateEditorVersionTests(unittest.TestCase):
    def test_runtime_metadata_uses_active_source_and_reference_snapshot(self):
        history = MODULE.read_json(REPO_ROOT / "metadata" / "editor-version-history.json")
        runtime = MODULE.build_runtime_version(history)

        self.assertEqual(runtime["productName"], "Metaflow Editor")
        self.assertEqual(runtime["appSemver"], "1.1.0")
        self.assertEqual(runtime["sourcePath"], "metaflow-editor")
        self.assertEqual(runtime["upstreamSnapshotPath"], "supersplat-v2.28.0")
        self.assertEqual(runtime["upstream"]["version"], "2.28.0")
        self.assertEqual(runtime["generatedFrom"], "metadata/editor-version-history.json")

    def test_runtime_output_is_generated_inside_ignored_dist(self):
        self.assertEqual(
            MODULE.RUNTIME_FILE,
            REPO_ROOT / "metaflow-editor" / "dist" / "version.json"
        )


if __name__ == "__main__":
    unittest.main()
