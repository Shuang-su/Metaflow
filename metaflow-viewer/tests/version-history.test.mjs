import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
    const actualRefs = manifest.entries.map((entry) => entry.gitRef);
    assert.deepEqual(actualRefs, expectedRefs);
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
