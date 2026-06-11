import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

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
    const log = execFileSync('git', ['log', '--pretty=format:%h', '--reverse'], {
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

test('commits after documentedThrough are documentation/version maintenance only', async () => {
    const manifest = await readJson(new URL('../../metadata/version-history.json', import.meta.url));
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
        'metaflow-viewer/tests/version-history.test.mjs'
    ]);

    for (const ref of refs.split('\n')) {
        const files = execFileSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', ref], {
            cwd: repoRoot,
            encoding: 'utf8'
        }).trim().split('\n').filter(Boolean);
        assert.ok(
            files.every((file) => allowedFiles.has(file)),
            `${ref.slice(0, 7)} changes product files without a version-history entry: ${files.join(', ')}`
        );
    }
});

test('root README preserves the original usage guide and exposes the audit entrypoint', async () => {
    const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8');
    const originalGuide = `${readme.split('\n## 当前版本\n')[0]}\n`;
    const digest = createHash('sha256').update(originalGuide).digest('hex');

    assert.equal(digest, '5650ea5179d57897d06d04b6f434429a083766154058ec6048c4518dedbb56f4');
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
    assert.equal(manifest.current.displayVersion, '5.8');
    assert.equal(manifest.current.gitRef, manifest.documentedThrough);
});
