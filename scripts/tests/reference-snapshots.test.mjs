import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
    computeSnapshotIdentity,
    validateRegistry,
    validateSnapshot
} from '../validate_reference_snapshots.mjs';

const repoRoot = resolve(import.meta.dirname, '../..');

test('registered SuperSplat v2.28.0 snapshot has exact upstream identity', async () => {
    const registry = JSON.parse(await readFile(join(repoRoot, 'metadata/reference-snapshots.json'), 'utf8'));
    const snapshot = registry.snapshots.find((entry) => entry.id === 'supersplat-v2.28.0');

    assert.ok(snapshot);
    assert.equal(snapshot.tagObject, 'ca76baf0c6b7f12a337c1c71a37554eb991a25f9');
    assert.equal(snapshot.commit, '9f4dfe1ff4e94876fb2054353497c8e2eb93b423');
    assert.equal(snapshot.tree, '0ce0d79143abc945e394d1f13f362533a15bf363');
    assert.equal(snapshot.fileCount, 232);
    assert.equal(snapshot.canonicalTreeSha256, '9d37961e3ba6259b26f8564e177d5aa4de7d547caa2fd6a8a7ae748c1a6df4a7');

    const results = await validateRegistry(repoRoot);
    assert.deepEqual(results.map((entry) => entry.id), ['supersplat-v2.28.0']);
});

test('snapshot validation rejects extra or modified files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'metaflow-reference-test-'));
    const snapshotPath = join(root, 'fixture');
    await mkdir(snapshotPath);
    await writeFile(join(snapshotPath, 'LICENSE'), 'fixture license\n');
    const identity = await computeSnapshotIdentity(snapshotPath);
    const snapshot = {
        id: 'fixture',
        path: 'fixture',
        kind: 'upstream-snapshot',
        repository: 'https://example.invalid/upstream',
        tag: 'v1.0.0',
        tagObject: '1111111111111111111111111111111111111111',
        commit: '2222222222222222222222222222222222222222',
        tree: identity.tree,
        fileCount: identity.fileCount,
        canonicalTreeSha256: identity.canonicalTreeSha256,
        license: 'MIT',
        mutable: false
    };

    await validateSnapshot(root, snapshot);
    await writeFile(join(snapshotPath, 'unexpected.txt'), 'unexpected\n');
    await assert.rejects(validateSnapshot(root, snapshot), /fileCount|tree|canonicalTreeSha256/);
});
