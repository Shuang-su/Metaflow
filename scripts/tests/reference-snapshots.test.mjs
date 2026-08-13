import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
    chmod,
    mkdir,
    mkdtemp,
    readFile,
    rm,
    unlink,
    writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    canonicalFormat,
    computeSnapshotIdentity,
    validateRegistry,
    validateSnapshot,
    validateSnapshotMetadata,
    verifyUpstreamIdentity
} from '../validate_reference_snapshots.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const runGit = (directory, args) => execFileSync('git', args, {
    cwd: directory,
    encoding: 'utf8'
}).trim();

const makeUpstreamSnapshot = async (fixtureRoot, id = 'supersplat-viewer-v9.9.9') => {
    const snapshotPath = join(fixtureRoot, 'references', id);
    await mkdir(snapshotPath, { recursive: true });
    await writeFile(join(snapshotPath, 'LICENSE'), 'fixture license\n');
    await writeFile(join(snapshotPath, 'source.ts'), 'export const value = 1;\n');
    const identity = await computeSnapshotIdentity(snapshotPath);
    return {
        id,
        path: `references/${id}`,
        kind: 'upstream',
        repository: 'https://github.com/playcanvas/supersplat-viewer',
        tag: 'v9.9.9',
        tagObject: '1111111111111111111111111111111111111111',
        commit: '2222222222222222222222222222222222222222',
        tree: identity.tree,
        trackedFileCount: identity.trackedFileCount,
        canonicalContentSha256: identity.canonicalContentSha256,
        canonicalFormat,
        identityVerification: 'exact-upstream-tree',
        license: 'MIT',
        mutable: false
    };
};

test('checked-in registry validates every reference directory and preserves history semantics', async () => {
    const registry = JSON.parse(await readFile(join(root, 'metadata/reference-snapshots.json'), 'utf8'));
    assert.deepEqual(
        registry.snapshots.map((snapshot) => snapshot.id),
        [
            'supersplat-viewer-v1.11.1',
            'supersplat-viewer-v1.18.2',
            'supersplat-v2.18.1',
            'supersplat-viewer-v1.26.2',
            'supersplat-viewer-v1.28.0',
            'supersplat-viewer-v1.29.0',
            'supersplat-v2.28.0',
            'supersplat-v2.32.3',
            'splat-transform-v2.5.1',
            'splat-transform-v3.2.0',
            'splat-transform-v3.3.0'
        ]
    );
    const history = registry.snapshots.find((snapshot) => snapshot.id === 'supersplat-v2.18.1');
    assert.equal(history.kind, 'metaflow-history');
    assert.equal(history.identityVerification, 'local-content-only');
    assert.equal(history.upstreamLineage.contentMatch, false);
    assert.equal(history.previousPath, 'supersplat-v2.18.1');

    const expectedCommits = new Map([
        ['supersplat-viewer-v1.26.2', 'f1327060f0a17c342de518712aabf7f30f2747c5'],
        ['supersplat-viewer-v1.28.0', 'f6378f066d803a7b9dd4b86e5eb78b03f8a37730'],
        ['supersplat-viewer-v1.29.0', 'c8226406b87e232f9a20cdd79f83bedd54325344'],
        ['supersplat-v2.28.0', '9f4dfe1ff4e94876fb2054353497c8e2eb93b423'],
        ['supersplat-v2.32.3', 'b9e3cb6f072179f0d49ae52d6c256d70b2079174'],
        ['splat-transform-v2.5.1', 'ed9162f927fa4af22d2ef18973bc93704aa1b7a0'],
        ['splat-transform-v3.2.0', '8d6b801f06dd61b4ed215e9cfd9f314d2f509102'],
        ['splat-transform-v3.3.0', '57883c2c7bda5bcfb60a8b402ababacc286e49ae']
    ]);
    for (const [id, commit] of expectedCommits) {
        assert.equal(registry.snapshots.find((snapshot) => snapshot.id === id)?.commit, commit);
    }

    const results = await validateRegistry(root);
    assert.equal(results.length, registry.snapshots.length);
});

test('schema document is valid JSON and describes immutable snapshot metadata', async () => {
    const schema = JSON.parse(
        await readFile(join(root, 'metadata/schemas/reference-snapshots.schema.json'), 'utf8')
    );
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.properties.schemaVersion.const, '1.0');
    assert.equal(schema.$defs.baseSnapshot.properties.mutable.const, false);
});

test('snapshot validation rejects a missing file', async (context) => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'metaflow-reference-missing-'));
    context.after(() => rm(fixtureRoot, { recursive: true, force: true }));
    const snapshot = await makeUpstreamSnapshot(fixtureRoot);
    await unlink(join(fixtureRoot, snapshot.path, 'source.ts'));
    await assert.rejects(validateSnapshot(fixtureRoot, snapshot), /tree|trackedFileCount|canonicalContentSha256/);
});

test('snapshot validation rejects an extra file', async (context) => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'metaflow-reference-extra-'));
    context.after(() => rm(fixtureRoot, { recursive: true, force: true }));
    const snapshot = await makeUpstreamSnapshot(fixtureRoot);
    await writeFile(join(fixtureRoot, snapshot.path, 'unexpected.txt'), 'unexpected\n');
    await assert.rejects(validateSnapshot(fixtureRoot, snapshot), /tree|trackedFileCount|canonicalContentSha256/);
});

test('snapshot validation rejects content changes', async (context) => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'metaflow-reference-content-'));
    context.after(() => rm(fixtureRoot, { recursive: true, force: true }));
    const snapshot = await makeUpstreamSnapshot(fixtureRoot);
    await writeFile(join(fixtureRoot, snapshot.path, 'source.ts'), 'export const value = 2;\n');
    await assert.rejects(validateSnapshot(fixtureRoot, snapshot), /tree|canonicalContentSha256/);
});

test('snapshot validation rejects executable-bit changes', async (context) => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'metaflow-reference-mode-'));
    context.after(() => rm(fixtureRoot, { recursive: true, force: true }));
    const snapshot = await makeUpstreamSnapshot(fixtureRoot);
    await chmod(join(fixtureRoot, snapshot.path, 'source.ts'), 0o755);
    await assert.rejects(validateSnapshot(fixtureRoot, snapshot), /tree|canonicalContentSha256/);
});

test('snapshot validation rejects nested Git metadata and generated artifacts', async (context) => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'metaflow-reference-generated-'));
    context.after(() => rm(fixtureRoot, { recursive: true, force: true }));
    const nestedGit = await makeUpstreamSnapshot(fixtureRoot);
    await mkdir(join(fixtureRoot, nestedGit.path, '.git'));
    await assert.rejects(validateSnapshot(fixtureRoot, nestedGit), /nested Git directory/);

    await rm(join(fixtureRoot, nestedGit.path, '.git'), { recursive: true, force: true });
    await mkdir(join(fixtureRoot, nestedGit.path, 'node_modules'));
    await assert.rejects(validateSnapshot(fixtureRoot, nestedGit), /generated or nested Git directory/);
});

test('snapshot metadata rejects repository, tag, path, and history identity claims that do not match the id', async (context) => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'metaflow-reference-identity-'));
    context.after(() => rm(fixtureRoot, { recursive: true, force: true }));
    const snapshot = await makeUpstreamSnapshot(fixtureRoot);

    assert.throws(
        () => validateSnapshotMetadata({ ...snapshot, repository: 'https://github.com/playcanvas/supersplat' }),
        /repository does not match/
    );
    assert.throws(() => validateSnapshotMetadata({ ...snapshot, tag: 'v9.9.8' }), /tag does not match/);
    assert.throws(
        () => validateSnapshotMetadata({ ...snapshot, path: 'references/wrong' }),
        /path must be/
    );
    assert.throws(
        () => validateSnapshotMetadata({
            ...snapshot,
            kind: 'metaflow-history',
            tag: null,
            tagObject: null,
            identityVerification: 'local-content-only',
            upstreamLineage: {
                repository: snapshot.repository,
                tag: snapshot.tag,
                tagObject: snapshot.tagObject,
                commit: snapshot.commit,
                tree: snapshot.tree,
                contentMatch: true,
                note: 'invalid identity claim'
            }
        }),
        /must not claim content identity/
    );
});

test('upstream identity verification checks tag object, commit, and tree independently', async (context) => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'metaflow-reference-upstream-'));
    context.after(() => rm(fixtureRoot, { recursive: true, force: true }));
    const source = join(fixtureRoot, 'source');
    await mkdir(source);
    runGit(source, ['init']);
    runGit(source, ['config', 'user.name', 'Reference Test']);
    runGit(source, ['config', 'user.email', 'reference-test@example.invalid']);
    await writeFile(join(source, 'LICENSE'), 'fixture license\n');
    await writeFile(join(source, 'source.ts'), 'export const value = 1;\n');
    runGit(source, ['add', '.']);
    runGit(source, ['commit', '-m', 'fixture']);
    runGit(source, ['tag', '-a', 'v9.9.9', '-m', 'fixture tag']);

    const snapshot = await makeUpstreamSnapshot(fixtureRoot);
    snapshot.tagObject = runGit(source, ['rev-parse', 'refs/tags/v9.9.9']);
    snapshot.commit = runGit(source, ['rev-parse', 'refs/tags/v9.9.9^{commit}']);
    snapshot.tree = runGit(source, ['rev-parse', 'refs/tags/v9.9.9^{tree}']);
    const identity = await computeSnapshotIdentity(join(fixtureRoot, snapshot.path));
    assert.equal(snapshot.tree, identity.tree);

    const verified = await verifyUpstreamIdentity(snapshot, { gitDirectory: join(source, '.git') });
    assert.equal(verified.status, 'verified');
    await assert.rejects(
        verifyUpstreamIdentity(
            { ...snapshot, commit: '3333333333333333333333333333333333333333' },
            { gitDirectory: join(source, '.git') }
        ),
        /upstream identity mismatch: commit/
    );
});
