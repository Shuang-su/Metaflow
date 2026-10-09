import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createOfflineResources, offlineResourceOptions, GiB } from '../src/offline-resources';
import { machineLimits } from '../../scripts/mf97/asset-config.mjs';

const temporaryRoot = resolve(import.meta.dirname, '../../.codex-work/tmp/mf97-resource-tests');
mkdirSync(temporaryRoot, { recursive: true });
function fixture() {
    const base = mkdtempSync(resolve(temporaryRoot, 'policy-'));
    let freeBytes = 10000, rssBytes = 10;
    const resources = createOfflineResources({ root: resolve(base, 'output'), reserveBytes: 100, maxAddedBytes: 1000,
        maxRssBytes: 100, taskOutputBytes: 500, recoveryBytes: 20, measureFreeBytes: () => freeBytes, measureRssBytes: () => rssBytes });
    return { base, resources, setFree: (n: number) => freeBytes = n, setRss: (n: number) => rssBytes = n };
}
test('approved resource CLI defaults can only be tightened', () => {
    const defaults = offlineResourceOptions([]);
    const limits = machineLimits();
    assert.equal(defaults.reserveBytes, limits.reserveGiB * GiB); assert.equal(defaults.maxAddedBytes, limits.maxAddedGiB * GiB); assert.equal(defaults.maxRssBytes, limits.maxRssGiB * GiB);
    assert.throws(() => createOfflineResources({ reserveBytes: (limits.reserveGiB - 1) * GiB }), /approved limits/);
    assert.throws(() => offlineResourceOptions(['--cache-root']), /Missing value/);
    assert.throws(() => createOfflineResources({ maxAddedBytes: NaN }), /Invalid/);
});
test('reserve, cumulative output, per-task output and RSS fail before writing', () => {
    const f = fixture();
    try {
        f.setFree(130); assert.throws(() => f.resources.writeFileAtomic('a', '12345678901'), /reserve/);
        assert.equal(existsSync(f.resources.root), false);
        f.setFree(10000); f.setRss(101); assert.throws(() => f.resources.writeFileAtomic('a', 'a'), /RSS/);
        f.setRss(10); assert.throws(() => f.resources.writeFileAtomic('a', 'x'.repeat(501)), /per-task/);
        writeFileSync(resolve(f.base, 'outside'), 'keep');
        mkdirSync(f.resources.root); writeFileSync(resolve(f.resources.root, 'external.bin'), 'x'.repeat(981));
        assert.throws(() => f.resources.assertCapacity(0), /cumulative/);
    } finally { rmSync(f.base, { recursive: true }); }
});
test('atomic readback is idempotent, immutable writes reject differences and symlinks cannot escape', () => {
    const f = fixture();
    try {
        const hash = f.resources.writeJsonAtomic('reports/a.json', { x: 1 }, { replace: false });
        const before = f.resources.snapshot();
        assert.equal(f.resources.writeJsonAtomic('reports/a.json', { x: 1 }, { replace: false }), hash);
        assert.equal(f.resources.snapshot().chargedBytes, before.chargedBytes);
        assert.equal(existsSync(resolve(f.resources.root, 'reports/a.json.next')), false);
        assert.throws(() => f.resources.writeJsonAtomic('reports/a.json', { x: 2 }, { replace: false }), /replace different/);
        assert.throws(() => f.resources.resolveOutput('../outside'), /escaped/);
        symlinkSync(f.base, resolve(f.resources.root, 'outside'));
        assert.throws(() => f.resources.writeFileAtomic('outside/overwrite', 'no'), /symlink escaped/);
        writeFileSync(resolve(f.base, 'original'), 'preserve');
        symlinkSync(resolve(f.base, 'original'), resolve(f.resources.root, 'new.next'));
        assert.throws(() => f.resources.writeFileAtomic('new', 'replace'), /Temporary output is a symlink/);
        assert.equal(readFileSync(resolve(f.base, 'original'), 'utf8'), 'preserve');
        symlinkSync(resolve(f.base, 'original'), resolve(f.resources.root, '.resource-budget.json.next'));
        assert.throws(() => f.resources.writeFileAtomic('safe', 'x'), /Temporary ledger is a symlink/);
        assert.equal(readFileSync(resolve(f.base, 'original'), 'utf8'), 'preserve');
        assert.deepEqual(JSON.parse(readFileSync(resolve(f.resources.root, 'reports/a.json'), 'utf8')), { x: 1 });
    } finally { rmSync(f.base, { recursive: true }); }
});
test('recovery records can use the reserved cushion but never violate disk floor', () => {
    const f = fixture();
    try {
        f.setFree(110); f.setRss(101);
        f.resources.writeJsonAtomic('recovery.json', { x: 1 }, { recovery: true });
        assert.throws(() => f.resources.writeFileAtomic('too-large.json', 'x'.repeat(21), { recovery: true }), /reserve|allowance/);
        f.setFree(105); assert.throws(() => f.resources.writeJsonAtomic('other.json', { x: 1 }, { recovery: true }), /reserve/);
    } finally { rmSync(f.base, { recursive: true }); }
});
test('external additions are charged and replacing output never returns previous charges', () => {
    const f = fixture();
    try {
        f.resources.writeFileAtomic('a', '1234567890');
        writeFileSync(resolve(f.resources.root, 'external'), 'external');
        const first = f.resources.snapshot().chargedBytes;
        assert.equal(first, 18);
        f.resources.writeFileAtomic('a', '1');
        assert.equal(f.resources.snapshot().chargedBytes, 19);
    } finally { rmSync(f.base, { recursive: true }); }
});
test('a dead writer lock and a partial temporary output recover without discarding their evidence', () => {
    const f = fixture();
    try {
        mkdirSync(f.resources.root);
        const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
        assert.equal(child.status, 0);
        const lock = resolve(f.resources.root, '.resource-budget.lock');
        writeFileSync(lock, JSON.stringify({ pid: Number(child.stdout), file: 'a.json' }));
        writeFileSync(resolve(f.resources.root, 'a.json.next'), '{"part');
        f.resources.writeJsonAtomic('a.json', { complete: true });
        assert.deepEqual(JSON.parse(readFileSync(resolve(f.resources.root, 'a.json'), 'utf8')), { complete: true });
        assert.equal(existsSync(lock), false);
        writeFileSync(lock, JSON.stringify({ pid: process.pid, file: 'other.json' }));
        assert.throws(() => f.resources.writeJsonAtomic('other.json', {}), /Another MF97/);
        assert.equal(existsSync(lock), true);
    } finally { rmSync(f.base, { recursive: true }); }
});

test('immutable output is rechecked after another writer wins before lock acquisition', () => {
    const base = mkdtempSync(resolve(temporaryRoot, 'race-')), root = resolve(base, 'output');
    mkdirSync(root); let raced = false;
    const resources = createOfflineResources({ root, measureRssBytes: () => 1, measureFreeBytes: () => {
        if (!raced) { raced = true; writeFileSync(resolve(root, 'a'), 'winner'); }
        return 100 * GiB;
    } });
    try {
        assert.throws(() => resources.writeFileAtomic('a', 'second', { replace: false }), /replace different/);
        assert.equal(readFileSync(resolve(root, 'a'), 'utf8'), 'winner');
    } finally { rmSync(base, { recursive: true }); }
});
