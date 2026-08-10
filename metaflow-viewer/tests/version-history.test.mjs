import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { classifyPaths, loadComponentRegistry } from '../../scripts/mcl.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const LEGACY_DISPLAY_CUTOFF = '5.18a';
const LEGACY_LEDGER_CUTOFF = 'c613a87';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const parseDisplayVersion = (displayVersion) => {
    const semver = displayVersion.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (semver) {
        return {
            kind: 'semver',
            base: `${semver[1]}.${semver[2]}`,
            patch: Number(semver[3]),
            parts: semver.slice(1).map(Number),
            suffix: ''
        };
    }

    const legacy = displayVersion.match(/^(\d+\.\d+)([a-z])?$/);
    assert.ok(legacy, `invalid displayVersion: ${displayVersion}`);
    return {
        kind: 'legacy',
        base: legacy[1],
        patch: null,
        parts: null,
        suffix: legacy[2] || ''
    };
};

const compareSemverParts = (left, right) => {
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) {
            return left[index] - right[index];
        }
    }
    return 0;
};

function assertVersionPolicy(entries) {
    const cutoffIndex = entries.findIndex((entry) => entry.displayVersion === LEGACY_DISPLAY_CUTOFF);
    assert.notEqual(cutoffIndex, -1, `missing legacy display cutoff ${LEGACY_DISPLAY_CUTOFF}`);

    const displayVersions = entries.map((entry) => entry.displayVersion);
    assert.equal(new Set(displayVersions).size, displayVersions.length, 'display versions must be unique');

    const suffixesByBase = new Map();
    let previousSemver = null;
    for (const [index, entry] of entries.entries()) {
        const parsed = parseDisplayVersion(entry.displayVersion);
        if (index <= cutoffIndex) {
            assert.equal(parsed.kind, 'legacy', `${entry.displayVersion} must remain legacy history`);
            assert.equal(entry.appSemver, `${parsed.base}.0`);
            if (parsed.suffix) {
                assert.equal(entry.type, 'resource');
                const suffixes = suffixesByBase.get(parsed.base) || [];
                suffixes.push(parsed.suffix);
                suffixesByBase.set(parsed.base, suffixes);
            }
            continue;
        }

        assert.equal(parsed.kind, 'semver', `${entry.displayVersion} uses a letter suffix after ${LEGACY_DISPLAY_CUTOFF}`);
        assert.equal(entry.displayVersion, entry.appSemver, `${entry.displayVersion} must match appSemver`);
        if (previousSemver) {
            assert.ok(
                compareSemverParts(parsed.parts, previousSemver) > 0,
                `${entry.displayVersion} must be greater than the previous SemVer release`
            );
        }
        previousSemver = parsed.parts;
    }

    const firstForwardEntry = entries[cutoffIndex + 1];
    if (firstForwardEntry) {
        assert.equal(firstForwardEntry.displayVersion, '5.18.1', 'the first forward release must be 5.18.1');
    }

    for (const [base, suffixes] of suffixesByBase.entries()) {
        const expected = suffixes.map((_, index) => String.fromCharCode('a'.charCodeAt(0) + index));
        assert.deepEqual(suffixes, expected, `${base} legacy resource suffixes should be contiguous`);
    }
}

test('legacy version history backfills every commit through the fixed historical cutoff', async () => {
    const manifest = await readJson(new URL('../../metadata/version-history.json', import.meta.url));
    const log = execFileSync('git', ['log', '--abbrev=7', '--pretty=format:%h', '--reverse'], {
        cwd: repoRoot,
        encoding: 'utf8'
    }).trim().split('\n');

    const cutoffIndex = log.indexOf(LEGACY_LEDGER_CUTOFF);
    assert.notEqual(cutoffIndex, -1, 'legacy ledger cutoff is missing from git log');

    const expectedRefs = log.slice(0, cutoffIndex + 1);
    const documentedRefs = [
        ...manifest.entries.map((entry) => entry.gitRef),
        ...(manifest.maintenanceCommits || []).map((entry) => entry.gitRef)
    ];
    assert.equal(new Set(documentedRefs).size, documentedRefs.length, 'each commit should be documented exactly once');
    const logOrder = new Map(expectedRefs.map((ref, index) => [ref, index]));
    const actualRefs = documentedRefs
        .filter((ref) => logOrder.has(ref))
        .toSorted((a, b) => logOrder.get(a) - logOrder.get(b));
    assert.deepEqual(actualRefs, expectedRefs);
    assert.equal(manifest.cutoffGitRef, LEGACY_LEDGER_CUTOFF);
});

test('legacy display versions remain valid and future releases require full SemVer', async () => {
    const manifest = await readJson(new URL('../../metadata/version-history.json', import.meta.url));
    assert.equal(manifest.versioning.mode, 'semver-forward');
    assertVersionPolicy(manifest.entries);

    const rules = manifest.versioning.rules.join(' ');
    assert.match(rules, /Patch releases cover resources.*bug fixes/i);
    assert.match(rules, /Minor releases add backwards-compatible.*capabilities/i);
    assert.match(rules, /Major releases change public contracts incompatibly.*consumer migration/i);
    assert.match(rules, /Documentation.*governance.*unpublished staging.*do not create Viewer versions/i);

    const compatibleFuture = [
        ...manifest.entries,
        {
            displayVersion: '5.18.1',
            appSemver: '5.18.1',
            type: 'fix',
            scope: 'viewer'
        },
        {
            displayVersion: '5.18.2',
            appSemver: '5.18.2',
            type: 'resource',
            scope: 'data'
        },
        {
            displayVersion: '5.19.0',
            appSemver: '5.19.0',
            type: 'feature',
            scope: 'viewer'
        },
        {
            displayVersion: '6.0.0',
            appSemver: '6.0.0',
            type: 'feature',
            scope: 'viewer'
        }
    ];
    assert.doesNotThrow(() => assertVersionPolicy(compatibleFuture));

    assert.throws(() => assertVersionPolicy([
        ...manifest.entries,
        {
            displayVersion: '5.18b',
            appSemver: '5.18.0',
            type: 'resource',
            scope: 'data'
        }
    ]), /letter suffix/);

    assert.throws(() => assertVersionPolicy([
        ...manifest.entries,
        {
            displayVersion: '5.18.1',
            appSemver: '5.18.0',
            type: 'fix',
            scope: 'viewer'
        }
    ]), /must match appSemver/);

    assert.throws(() => assertVersionPolicy([
        ...manifest.entries,
        {
            displayVersion: '5.18.2',
            appSemver: '5.18.2',
            type: 'fix',
            scope: 'viewer'
        }
    ]), /first forward release must be 5\.18\.1/);
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

test('commits after the legacy cutoff require records only for affected product components', async () => {
    const manifest = await readJson(new URL('../../metadata/version-history.json', import.meta.url));
    const editorManifest = await readJson(new URL('../../metadata/editor-version-history.json', import.meta.url));
    const componentRegistry = await loadComponentRegistry(repoRoot);
    const refs = execFileSync('git', ['rev-list', '--reverse', `${LEGACY_LEDGER_CUTOFF}..HEAD`], {
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
        'metaflow-editor/version.json',
        'supersplat-v2.28.0/package.json',
        'supersplat-v2.28.0/package-lock.json',
        'scripts/generate_editor_version.py',
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

    const findUnexpectedProductFiles = (files, {
        isDocumentedEditorRelease = false,
        isDocumentedViewerRelease = false
    } = {}) => {
        const classified = classifyPaths(files, componentRegistry);
        const viewerOrDataFiles = new Set([
            ...(classified.viewer || []),
            ...(classified.data || [])
        ]);
        return files.filter((file) => {
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
    };

    assert.deepEqual(findUnexpectedProductFiles(['data/index.json']), ['data/index.json']);
    assert.deepEqual(
        findUnexpectedProductFiles(['metaflow-viewer/src/main.ts']),
        ['metaflow-viewer/src/main.ts']
    );
    assert.deepEqual(findUnexpectedProductFiles(['docs/maintenance/documentation.md']), []);
    assert.deepEqual(findUnexpectedProductFiles(['supersplat-v2.28.0/src/index.ts']), []);

    for (const ref of refs.split('\n')) {
        const files = execFileSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', ref], {
            cwd: repoRoot,
            encoding: 'utf8'
        }).trim().split('\n').filter(Boolean);
        const shortRef = ref.slice(0, 7);
        const isDocumentedEditorRelease = documentedEditorReleaseRefs.has(shortRef);
        const isDocumentedViewerRelease = documentedViewerRefs.has(shortRef);
        const unexpectedFiles = findUnexpectedProductFiles(files, {
            isDocumentedEditorRelease,
            isDocumentedViewerRelease
        });
        assert.ok(
            unexpectedFiles.length === 0,
            `${shortRef} changes product files without a version-history entry: ${unexpectedFiles.join(', ')}`
        );
    }
});

test('root README retains the usage guide while allowing factual documentation corrections', async () => {
    const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8');

    for (const heading of ['快速开始', '开发模式', '使用方式', '项目结构', '数据目录', '部署']) {
        assert.match(readme, new RegExp(`^## ${heading}$`, 'm'));
    }
    assert.match(readme, /docs\/README\.md/);
    assert.match(readme, /npx --no-install serve -s public -l 3000/);
    assert.match(readme, /`content` 时会完全跳过 route\/index/);
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
