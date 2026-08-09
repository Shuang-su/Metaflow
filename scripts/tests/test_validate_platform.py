import tempfile
import textwrap
import unittest
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from validate_platform import render_public_json, validate_netlify, validate_supabase, validate_workflows  # noqa: E402


class PlatformValidationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="metaflow-platform-")
        self.root = Path(self.temporary.name)

    def tearDown(self):
        self.temporary.cleanup()

    def test_netlify_requires_deterministic_build_and_last_spa_fallback(self):
        (self.root / "netlify.toml").write_text(
            textwrap.dedent(
                """
                [build]
                base = "metaflow-viewer"
                command = "npm install && npm run build"
                publish = "public"

                [[redirects]]
                from = "/*"
                to = "/index.html"
                status = 200

                [[redirects]]
                from = "/data/*"
                to = "/data/:splat"
                status = 200
                """
            ),
            encoding="utf-8",
        )
        errors = validate_netlify(self.root)
        self.assertTrue(any("npm ci" in error for error in errors))
        self.assertTrue(any("final redirect" in error for error in errors))
        self.assertTrue(any("MCL check" in error for error in errors))

    def test_supabase_requires_rls_and_definer_search_path(self):
        (self.root / "supabase" / "migrations").mkdir(parents=True)
        (self.root / "supabase" / "config.toml").write_text(
            'project_id = "fixture"\n[db.migrations]\nenabled = true\n',
            encoding="utf-8",
        )
        (self.root / "supabase" / "migrations" / "20260809000000_fixture.sql").write_text(
            textwrap.dedent(
                """
                create table public.fixture (id bigint primary key);
                create or replace function public.fixture_fn()
                returns void language plpgsql security definer as $$ begin end; $$;
                """
            ),
            encoding="utf-8",
        )
        errors = validate_supabase(self.root)
        self.assertTrue(any("ROW LEVEL SECURITY" in error for error in errors))
        self.assertTrue(any("set search_path" in error for error in errors))

    def test_workflow_actions_must_use_full_sha(self):
        workflow = self.root / ".github" / "workflows" / "ci.yml"
        workflow.parent.mkdir(parents=True)
        workflow.write_text(
            textwrap.dedent(
                """
                name: CI
                permissions:
                  contents: read
                jobs:
                  test:
                    timeout-minutes: 5
                    steps:
                      - uses: actions/checkout@v4
                """
            ),
            encoding="utf-8",
        )
        errors = validate_workflows(self.root)
        self.assertEqual(len(errors), 1)
        self.assertIn("full commit SHA", errors[0])

    def test_public_json_never_contains_finding_details(self):
        finding = "sensitive-finding-detail-that-must-not-reach-logs"
        rendered = render_public_json(not [finding])
        self.assertEqual(rendered, '{"ok": false}\n')
        self.assertNotIn(finding, rendered)


if __name__ == "__main__":
    unittest.main()
