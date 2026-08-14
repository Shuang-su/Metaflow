#!/usr/bin/env python3
"""Validate Metaflow platform configuration without contacting external services."""

from __future__ import annotations

import argparse
import re
import sys
import tomllib
from pathlib import Path


MIGRATION_NAME = re.compile(r"^[0-9]{14}_[a-z0-9_]+\.sql$")
PINNED_ACTION = re.compile(r"^[^\s@]+@[0-9a-f]{40}(?:\s+#.*)?$")
DEPENDABOT_UPDATE = re.compile(
    r"^(?P<indent>\s*)-\s+package-ecosystem:\s*(?P<ecosystem>[^#]+?)\s*(?:#.*)?$"
)
DEPENDABOT_DIRECTORY = re.compile(
    r"^\s+directory:\s*(?P<directory>[^#]+?)\s*(?:#.*)?$"
)
VERSIONED_SOURCE_DIRECTORY = re.compile(r"^(?:supersplat|supersplat-viewer)-v", re.IGNORECASE)
CREATE_TABLE = re.compile(
    r"create\s+table\s+(?:if\s+not\s+exists\s+)?"
    r"(?P<table>[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)"
    r"(?P<tail>[\s\S]*?);",
    re.IGNORECASE,
)
ENABLE_RLS = re.compile(
    r"alter\s+table\s+(?:if\s+exists\s+)?"
    r"(?P<table>[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)"
    r"\s+enable\s+row\s+level\s+security\s*;",
    re.IGNORECASE,
)
SECURITY_DEFINER_FUNCTION = re.compile(
    r"create\s+or\s+replace\s+function\s+[^;]+?"
    r"security\s+definer(?P<tail>[\s\S]*?)\$\$\s*;",
    re.IGNORECASE,
)
SECRET_PATTERNS = (
    ("GitHub token", re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b")),
    ("private key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("Supabase secret", re.compile(r"\bsb_secret_[A-Za-z0-9_-]{16,}\b")),
)


class ValidationError(Exception):
    """Raised when one or more platform invariants fail."""


def _load_toml(path: Path) -> dict:
    if not path.is_file():
        raise ValidationError(f"{path}: missing")
    try:
        with path.open("rb") as handle:
            return tomllib.load(handle)
    except tomllib.TOMLDecodeError as error:
        raise ValidationError(f"{path}: invalid TOML: {error}") from error


def _yaml_scalar(value: str) -> str:
    """Return the scalar shape used by the repository's small YAML manifests."""
    scalar = value.strip()
    if len(scalar) >= 2 and scalar[0] == scalar[-1] and scalar[0] in {'"', "'"}:
        return scalar[1:-1]
    return scalar


def _is_versioned_source_directory(directory: str) -> bool:
    components = [component for component in directory.split("/") if component]
    return any(VERSIONED_SOURCE_DIRECTORY.match(component) for component in components)


def validate_dependabot(root: Path) -> list[str]:
    """Validate optional Dependabot version-update targets.

    A missing configuration intentionally disables version-update pull requests.
    If automation is reintroduced later, immutable versioned source trees remain
    forbidden targets.
    """
    path = root / ".github" / "dependabot.yml"
    if not path.is_file():
        return []

    errors: list[str] = []
    current_ecosystem: str | None = None
    current_indent = -1
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        update = DEPENDABOT_UPDATE.match(line)
        if update:
            current_ecosystem = _yaml_scalar(update.group("ecosystem"))
            current_indent = len(update.group("indent"))
            continue

        # A new list item at the update indentation ends the current update block.
        list_item = re.match(r"^(?P<indent>\s*)-\s+", line)
        if list_item and len(list_item.group("indent")) <= current_indent:
            current_ecosystem = None
            current_indent = -1
            continue

        directory = DEPENDABOT_DIRECTORY.match(line)
        if current_ecosystem != "npm" or not directory:
            continue
        target = _yaml_scalar(directory.group("directory"))
        if _is_versioned_source_directory(target):
            errors.append(
                f".github/dependabot.yml:{line_number}: npm updates must not target "
                f"versioned source directory {target}"
            )
    return errors


def validate_netlify(root: Path) -> list[str]:
    path = root / "netlify.toml"
    document = _load_toml(path)
    errors: list[str] = []
    build = document.get("build", {})
    for key in ("base", "command", "publish"):
        if not isinstance(build.get(key), str) or not build[key].strip():
            errors.append(f"netlify.toml: build.{key} must be a non-empty string")

    command = build.get("command", "")
    if re.search(r"(?:^|&&|;)\s*npm\s+install(?:\s|$)", command):
        errors.append("netlify.toml: use npm ci instead of npm install for reproducible deploys")
    if "node ../scripts/mcl.mjs check-all" not in command:
        errors.append("netlify.toml: build.command must run the MCL check from the configured base")
    if "python3 ../scripts/validate_platform.py" not in command:
        errors.append("netlify.toml: build.command must run the platform configuration check")

    ignore = build.get("ignore")
    if ignore != 'test "$BRANCH" = "main"':
        errors.append(
            'netlify.toml: build.ignore must skip ordinary main builds while preserving branch previews'
        )

    redirects = document.get("redirects", [])
    catchalls = [index for index, redirect in enumerate(redirects) if redirect.get("from") == "/*"]
    if len(catchalls) != 1:
        errors.append("netlify.toml: exactly one /* SPA fallback is required")
    elif catchalls[0] != len(redirects) - 1:
        errors.append("netlify.toml: /* SPA fallback must be the final redirect")
    elif redirects[catchalls[0]].get("to") != "/index.html" or redirects[catchalls[0]].get("status") != 200:
        errors.append("netlify.toml: /* must rewrite to /index.html with status 200")

    return errors


def validate_supabase(root: Path) -> list[str]:
    config_path = root / "supabase" / "config.toml"
    document = _load_toml(config_path)
    errors: list[str] = []
    if not isinstance(document.get("project_id"), str) or not document["project_id"].strip():
        errors.append("supabase/config.toml: project_id is required")
    if document.get("db", {}).get("migrations", {}).get("enabled") is not True:
        errors.append("supabase/config.toml: db.migrations.enabled must be true")

    migration_dir = root / "supabase" / "migrations"
    migrations = sorted(migration_dir.glob("*.sql"))
    if not migrations:
        errors.append("supabase/migrations: at least one migration is required")
        return errors

    names = [path.name for path in migrations]
    for name in names:
        if not MIGRATION_NAME.fullmatch(name):
            errors.append(f"supabase/migrations/{name}: expected <14-digit timestamp>_<slug>.sql")
    timestamps = [name[:14] for name in names if MIGRATION_NAME.fullmatch(name)]
    if len(timestamps) != len(set(timestamps)):
        errors.append("supabase/migrations: migration timestamps must be unique")

    corpus = "\n".join(path.read_text(encoding="utf-8") for path in migrations)
    normalized = corpus.lower()
    created_tables = {
        match.group("table").lower()
        for match in CREATE_TABLE.finditer(corpus)
        if "partition of" not in match.group("tail").lower()
        and not match.group("table").lower().startswith(("storage.", "auth."))
    }
    rls_tables = {match.group("table").lower() for match in ENABLE_RLS.finditer(corpus)}
    for table in sorted(created_tables - rls_tables):
        errors.append(f"supabase/migrations: {table} is created without ENABLE ROW LEVEL SECURITY")

    if "auth.role()" in normalized:
        errors.append("supabase/migrations: auth.role() is forbidden; use explicit role policies or auth.jwt()")
    for index, match in enumerate(SECURITY_DEFINER_FUNCTION.finditer(corpus), start=1):
        if not re.search(r"\bset\s+search_path\s*=", match.group("tail"), re.IGNORECASE):
            errors.append(f"supabase/migrations: SECURITY DEFINER function #{index} must set search_path")

    return errors


def validate_workflows(root: Path) -> list[str]:
    errors: list[str] = []
    workflow_dir = root / ".github" / "workflows"
    if not workflow_dir.exists():
        return [".github/workflows: missing"]
    workflows = sorted((*workflow_dir.glob("*.yml"), *workflow_dir.glob("*.yaml")))
    if not workflows:
        return [".github/workflows: no workflow files found"]

    for path in workflows:
        text = path.read_text(encoding="utf-8")
        relative = path.relative_to(root)
        if "permissions:" not in text:
            errors.append(f"{relative}: top-level or job-level permissions are required")
        if "timeout-minutes:" not in text:
            errors.append(f"{relative}: every workflow must define at least one timeout-minutes")
        for line_number, line in enumerate(text.splitlines(), start=1):
            match = re.match(r"\s*-\s+uses:\s+(.+?)\s*$", line)
            if not match:
                continue
            target = match.group(1).strip()
            if target.startswith("./"):
                continue
            if not PINNED_ACTION.fullmatch(target):
                errors.append(f"{relative}:{line_number}: action must be pinned to a full commit SHA")
    return errors


def scan_secrets(root: Path) -> list[str]:
    errors: list[str] = []
    candidates = [root / "netlify.toml", root / "supabase" / "config.toml"]
    candidates.extend(sorted((root / ".github").rglob("*.yml")))
    candidates.extend(sorted((root / ".github").rglob("*.yaml")))
    for path in candidates:
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for label, pattern in SECRET_PATTERNS:
            if pattern.search(text):
                errors.append(f"{path.relative_to(root)}: possible {label}")
    return errors


def validate(root: Path, include_workflows: bool = True) -> dict:
    checks = {
        "dependabot": validate_dependabot(root),
        "netlify": validate_netlify(root),
        "supabase": validate_supabase(root),
        "secrets": scan_secrets(root),
    }
    if include_workflows:
        checks["workflows"] = validate_workflows(root)
    errors = [error for values in checks.values() for error in values]
    return {"ok": not errors, "checks": checks, "errors": errors}


def render_public_json(ok: bool) -> str:
    """Render only a constant-shape status; findings may describe detected secrets."""
    return '{"ok": true}\n' if ok else '{"ok": false}\n'


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--skip-workflows", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    result = validate(args.root.resolve(), include_workflows=not args.skip_workflows)
    if args.json:
        print(render_public_json(result["ok"]), end="")
    elif result["ok"]:
        print("Platform configuration validation passed.")
    else:
        print("ERROR: Platform configuration validation failed; sensitive findings are not written to logs.", file=sys.stderr)
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
