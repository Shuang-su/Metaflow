import tempfile
import textwrap
import unittest
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from validate_platform import (  # noqa: E402
    render_public_json,
    validate_dependabot,
    validate_netlify,
    validate_supabase,
    validate_workflows,
)


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
        self.assertTrue(any("build.ignore" in error for error in errors))

    def test_netlify_skips_only_ordinary_main_builds(self):
        (self.root / "netlify.toml").write_text(
            textwrap.dedent(
                '''
                [build]
                base = "metaflow-viewer"
                command = "node ../scripts/mcl.mjs check-all && python3 ../scripts/validate_platform.py && npm ci && npm run build"
                ignore = "test \\"$BRANCH\\" = \\"main\\""
                publish = "public"

                [[redirects]]
                from = "/*"
                to = "/index.html"
                status = 200
                '''
            ),
            encoding="utf-8",
        )

        self.assertEqual(validate_netlify(self.root), [])

        config = (self.root / "netlify.toml").read_text(encoding="utf-8")
        (self.root / "netlify.toml").write_text(
            config.replace('test \\"$BRANCH\\" = \\"main\\"', "exit 0"),
            encoding="utf-8",
        )
        errors = validate_netlify(self.root)
        self.assertTrue(any("build.ignore" in error for error in errors))

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

    def test_dependabot_rejects_versioned_source_directory_for_npm(self):
        config = self.root / ".github" / "dependabot.yml"
        config.parent.mkdir(parents=True)
        config.write_text(
            textwrap.dedent(
                """
                version: 2
                updates:
                  - package-ecosystem: npm
                    directory: /supersplat-v2.28.0
                    schedule:
                      interval: weekly
                  - package-ecosystem: npm
                    directory: /references/supersplat-viewer-v1.18.2
                    schedule:
                      interval: weekly
                """
            ),
            encoding="utf-8",
        )

        errors = validate_dependabot(self.root)

        self.assertEqual(len(errors), 2)
        self.assertTrue(all("versioned source directory" in error for error in errors))

    def test_dependabot_allows_active_npm_and_github_actions_targets(self):
        config = self.root / ".github" / "dependabot.yml"
        config.parent.mkdir(parents=True)
        config.write_text(
            textwrap.dedent(
                """
                version: 2
                updates:
                  - package-ecosystem: npm
                    directory: /metaflow-viewer
                    schedule:
                      interval: weekly
                  - package-ecosystem: github-actions
                    directory: /
                    schedule:
                      interval: weekly
                """
            ),
            encoding="utf-8",
        )

        self.assertEqual(validate_dependabot(self.root), [])

    def test_repository_dependabot_keeps_security_only_viewer_and_actions_updates(self):
        repository = Path(__file__).resolve().parents[2]
        config = (repository / ".github" / "dependabot.yml").read_text(encoding="utf-8")
        npm_block, actions_block = config.split(
            "  - package-ecosystem: github-actions", maxsplit=1
        )

        self.assertEqual(config.count("package-ecosystem: npm"), 1)
        self.assertEqual(config.count("package-ecosystem: github-actions"), 1)
        self.assertIn("directory: /metaflow-viewer", npm_block)
        self.assertIn("open-pull-requests-limit: 0", npm_block)
        self.assertIn("directory: /", actions_block)
        self.assertIn("open-pull-requests-limit: 5", actions_block)

    def test_public_json_never_contains_finding_details(self):
        finding = "sensitive-finding-detail-that-must-not-reach-logs"
        rendered = render_public_json(not [finding])
        self.assertEqual(rendered, '{"ok": false}\n')
        self.assertNotIn(finding, rendered)


if __name__ == "__main__":
    unittest.main()
