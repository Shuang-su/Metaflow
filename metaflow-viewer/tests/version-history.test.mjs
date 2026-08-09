import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { classifyPaths, loadComponentRegistry } from '../../scripts/mcl.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const versionBase = (displayVersion) => {
    const match = displayVersion.match(/^(\d+\.\d+)([a-z])?$/);
    assert.ok(match, `invalid displayVersion: ${displayVersion}`);
    return {
        base: match[1],
        suffix: match[2] || ''
    };
};

test('version history backfills every commit through the cutoff ref', async () => {
    const manifest = await readJson(new URL('../../metadata/version-history.json', import.meta.url));
    const log = execFileSync('git', ['log', '--abbrev=7', '--pretty=format:%h', '--reverse'], {
        cwd: repoRoot,
        encoding: 'utf8'
    }).trim().split('\n');

    const cutoffIndex = log.indexOf(manifest.cutoffGitRef);
    assert.notEqual(cutoffIndex, -1, 'cutoffGitRef is missing from git log');

    const expectedRefs = log.slice(0, cutoffIndex + 1);
    const documentedRefs = [
        ...manifest.entries.map((entry) => entry.gitRef),
        ...(manifest.maintenanceCommits || []).map((entry) => entry.gitRef)
    ];
    assert.equal(new Set(documentedRefs).size, documentedRefs.length, 'each commit should be documented exactly once');
    const logOrder = new Map(expectedRefs.map((ref, index) => [ref, index]));
    const actualRefs = documentedRefs.toSorted((a, b) => logOrder.get(a) - logOrder.get(b));
    assert.deepEqual(actualRefs, expectedRefs);
    assert.equal(manifest.documentedThrough, manifest.cutoffGitRef);
});

test('display versions are unique and resource suffixes are contiguous', async () => {
    const manifest = await readJson(new URL('../../metadata/version-history.json', import.meta.url));
    const displayVersions = manifest.entries.map((entry) => entry.displayVersion);

    assert.equal(new Set(displayVersions).size, displayVersions.length);

    const suffixesByBase = new Map();
    for (const entry of manifest.entries) {
        const { base, suffix } = versionBase(entry.displayVersion);
        assert.equal(entry.appSemver, `${base}.0`);

        if (suffix) {
            assert.equal(entry.type, 'resource');
            const suffixes = suffixesByBase.get(base) || [];
            suffixes.push(suffix);
            suffixesByBase.set(base, suffixes);
        }
    }
    for (const [base, suffixes] of suffixesByBase.entries()) {
        const expected = suffixes.map((_, index) => String.fromCharCode('a'.charCodeAt(0) + index));
        assert.deepEqual(suffixes, expected, `${base} resource suffixes should be contiguous`);
    }
});

test('generated index release matches current version history', async () => {
    const manifest = await readJson(new URL('../../metadata/version-history.json', import.meta.url));
    const index = await readJson(new URL('../../data/index.json', import.meta.url));

    assert.deepEqual(index.release, {
        displayVersion: manifest.current.displayVersion,
        appSemver: manifest.current.appSemver,
        schemaVersion: manifest.current.indexSchemaVersion,
        historyUrl: manifest.current.historyUrl,
        updatedAt: manifest.current.date,
        gitRef: manifest.current.gitRef
    });
});

test('viewer console output is wired to the version history display version', async () => {
    const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');

    assert.match(source, /Metaflow Viewer/);
    assert.match(source, /versionHistory\.current\.displayVersion/);
    assert.match(source, /versionHistory\.current\.indexSchemaVersion/);
});

test('change ledger contains every structured version and only main-history commit refs', async () => {
    const manifest = await readJson(new URL('../../metadata/version-history.json', import.meta.url));
    const ledger = await readFile(new URL('../../docs/metaflow-viewer-change-ledger.md', import.meta.url), 'utf8');

    for (const entry of manifest.entries) {
        assert.match(
            ledger,
            new RegExp(`\\\`${entry.displayVersion.replace('.', '\\.')}\\\`[^\\n]*\\\`${entry.gitRef}\\\``),
            `ledger is missing ${entry.displayVersion} / ${entry.gitRef}`
        );
    }
    for (const entry of manifest.maintenanceCommits || []) {
        assert.match(
            ledger,
            new RegExp(`\\\`${entry.gitRef}\\\``),
            `ledger is missing maintenance commit ${entry.gitRef}`
        );
    }

    const ledgerRefs = new Set(
        Array.from(ledger.matchAll(/`([0-9a-f]{7})`/g), (match) => match[1])
    );
    for (const ref of ledgerRefs) {
        execFileSync('git', ['cat-file', '-e', `${ref}^{commit}`], {
            cwd: repoRoot,
            stdio: 'ignore'
        });
        execFileSync('git', ['merge-base', '--is-ancestor', ref, 'HEAD'], {
            cwd: repoRoot,
            stdio: 'ignore'
        });
    }
});

test('commits after documentedThrough require version records only for affected product components', async () => {
    const manifest = await readJson(new URL('../../metadata/version-history.json', import.meta.url));
    const editorManifest = await readJson(new URL('../../metadata/editor-version-history.json', import.meta.url));
    const componentRegistry = await loadComponentRegistry(repoRoot);
    const refs = execFileSync('git', ['rev-list', '--reverse', `${manifest.documentedThrough}..HEAD`], {
        cwd: repoRoot,
        encoding: 'utf8'
    }).trim();

    if (!refs) {
        return;
    }

    const allowedFiles = new Set([
        'README.md',
        'metaflow-viewer/README.md',
        'docs/metaflow-viewer-change-ledger.md',
        'metadata/version-history.json',
        'data/version-history.json',
        'data/index.json',
        'metaflow-viewer/package.json',
        'metaflow-viewer/package-lock.json',
        'metaflow-viewer/.gitignore',
        'metaflow-viewer/playwright.config.mjs',
        'metaflow-viewer/tests/version-history.test.mjs'
    ]);
    const viewerMaintenancePrefixes = [
        'metaflow-viewer/e2e/',
        'metaflow-viewer/tests/'
    ];
    const editorMaintenanceFiles = new Set([
        '.gitignore',
        'README.md',
        'PROJECT_INDEX.md',
        'docs/metaflow-editor-change-ledger.md',
        'metadata/editor-version-history.json',
        'data/editor-version-history.json',
        'metadata/editor-runtime-baseline.json',
        'metadata/reference-snapshots.json',
        'scripts/generate_editor_version.py',
        'scripts/validate_editor_runtime.mjs',
        'scripts/validate_reference_snapshots.mjs',
        'scripts/tests/editor-runtime-baseline.test.mjs',
        'scripts/tests/reference-snapshots.test.mjs',
        'scripts/tests/test_generate_editor_version.py',
        'metaflow-viewer/tests/editor-version-history.test.mjs',
        'metaflow-viewer/tests/tiled-voxel-index.test.mjs',
        'metaflow-viewer/tests/version-history.test.mjs'
    ]);
    const editorSourcePrefixes = [
        'metaflow-editor/',
        'supersplat-v2.18.1/',
        'supersplat-v2.28.0/'
    ];
    const documentedEditorReleaseRefs = new Set(
        (editorManifest.entries || []).map((entry) => entry.gitRef).filter(Boolean)
    );
    const documentedViewerRefs = new Set([
        ...(manifest.entries || []).map((entry) => entry.gitRef).filter(Boolean),
        ...(manifest.maintenanceCommits || []).map((entry) => entry.gitRef).filter(Boolean)
    ]);
    const isEditorReleaseFile = (file) => (
        editorMaintenanceFiles.has(file) ||
        editorSourcePrefixes.some((prefix) => file.startsWith(prefix))
    );

    for (const ref of refs.split('\n')) {
        const files = execFileSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', ref], {
            cwd: repoRoot,
            encoding: 'utf8'
        }).trim().split('\n').filter(Boolean);
        const shortRef = ref.slice(0, 7);
        const isDocumentedEditorRelease = documentedEditorReleaseRefs.has(shortRef);
        const isDocumentedViewerRelease = documentedViewerRefs.has(shortRef);
        const classified = classifyPaths(files, componentRegistry);
        const viewerOrDataFiles = new Set([
            ...(classified.viewer || []),
            ...(classified.data || [])
        ]);
        const unexpectedFiles = files.filter((file) => {
            if (allowedFiles.has(file)) {
                return false;
            }
            if (viewerMaintenancePrefixes.some((prefix) => file.startsWith(prefix))) {
                return false;
            }
            if (editorMaintenanceFiles.has(file)) {
                return false;
            }
            if (isDocumentedEditorRelease && isEditorReleaseFile(file)) {
                return false;
            }
            if (!viewerOrDataFiles.has(file)) {
                return false;
            }
            return !isDocumentedViewerRelease;
        });
        assert.ok(
            unexpectedFiles.length === 0,
            `${shortRef} changes product files without a version-history entry: ${unexpectedFiles.join(', ')}`
        );
    }
});

test('root README preserves the original usage guide and exposes the audit entrypoint', async () => {
    const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8');
    const originalGuide = `${readme.split('\n## 当前版本\n')[0]}\n`;
    const digest = createHash('sha256').update(originalGuide).digest('hex');

    assert.equal(digest, 'c2d7995084cc957259cfc25f7f549a360c08c31f5f35dc3f7f88b8006999d319');
    assert.match(readme, /docs\/metaflow-viewer-change-ledger\.md/);
    assert.match(readme, /metadata\/version-history\.json/);
});

test('package and public release versions match the structured current version', async () => {
    const manifest = await readJson(new URL('../../metadata/version-history.json', import.meta.url));
    const pkg = await readJson(new URL('../package.json', import.meta.url));
    const lock = await readJson(new URL('../package-lock.json', import.meta.url));

    assert.equal(pkg.version, manifest.current.appSemver);
    assert.equal(lock.version, manifest.current.appSemver);
    assert.equal(lock.packages[''].version, manifest.current.appSemver);
    assert.equal(manifest.current.displayVersion, '5.18a');
    assert.equal(manifest.current.gitRef, manifest.documentedThrough);
    assert.equal(manifest.current.upstream.repository, 'playcanvas/supersplat-viewer');
    assert.equal(manifest.current.upstream.version, '1.26.2');
});
