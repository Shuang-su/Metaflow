import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createOfflineResources, GiB } from '../src/offline-resources';
import { collisionIdentity, sha } from '../scripts/gaussian-map-offline';
import { generateGaussianMap } from '../scripts/generate-gaussian-map';
import type { MapRenderJob } from '../src/maps/model';
const root = resolve(import.meta.dirname, '../../.codex-work/tmp/mf97-resource-tests');
mkdirSync(root, { recursive: true });
function fixture() {
    const base = mkdtempSync(resolve(root, 'maps-')), source = resolve(base, 'source'); mkdirSync(source);
    writeFileSync(resolve(source, 'model.json'), '{"fixture":true}');
    const inventory = [{ file: 'model.json', sha256: sha(readFileSync(resolve(source, 'model.json'))) }];
    const job: MapRenderJob & { sourceInventory: typeof inventory } = { scene: 'fixture', assetUrl: '/fixture/model.json', lod: 0,
        gaussianHash: sha(JSON.stringify({ lod: 0, inventory })), collisionHash: 'fixture-collision', sourceInventory: inventory,
        transform: [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1], tileMetres: 1, pixels: 32,
        layers: [{ id: 'layer', label: 'Fixture', supportRange: [0, 1], sliceRange: [0, 1], bounds: { minX: 0, minZ: 0, maxX: 2, maxZ: 1 } }] };
    const resources = createOfflineResources({ root: resolve(base, 'outputs'), measureFreeBytes: () => 100 * GiB, measureRssBytes: () => 1 });
    let renders = 0;
    const options = { job, assetRoot: source, resources, render: async () => { renders++; return { data: Buffer.from('RIFF0000WEBPfixture').toString('base64'), frames: 2, splats: 1, ms: 1 }; } };
    return { base, source, options, renders: () => renders };
}
for (const checkpoint of ['prepared', 'binary', 'manifest'] as const) test(`map resumes after ${checkpoint}, verifies artifacts, and repeat performs no render/write`, async () => {
    const f = fixture();
    try {
        await assert.rejects(generateGaussianMap({ ...f.options, onCheckpoint: name => { if (name === checkpoint) throw Error('injected'); } }), /injected/);
        const output = resolve(f.options.resources.root, 'maps/fixture');
        assert.equal(JSON.parse(readFileSync(resolve(output, 'manifest.json'), 'utf8')).coverage.status, 'incomplete');
        const result = await generateGaussianMap(f.options); assert.equal(result.coverage.status, 'complete'); assert.equal(result.coverage.ready, 2);
        assert.equal(f.renders(), checkpoint === 'prepared' ? 3 : 2);
        const charge = f.options.resources.snapshot().chargedBytes;
        assert.equal((await generateGaussianMap(f.options)).alreadyComplete, true);
        assert.equal(f.options.resources.snapshot().chargedBytes, charge);
        writeFileSync(resolve(output, 'layer-0-0.webp'), 'corrupt');
        await assert.rejects(generateGaussianMap(f.options), /Damaged map tile/);
    } finally { rmSync(f.base, { recursive: true }); }
});
test('map rejects changed source before rendering or publishing complete', async () => {
    const f = fixture();
    try {
        writeFileSync(resolve(f.source, 'model.json'), '{}');
        await assert.rejects(generateGaussianMap(f.options), /hash|changed|mismatch/i); assert.equal(f.renders(), 0);
    } finally { rmSync(f.base, { recursive: true }); }
    const g = fixture();
    try {
        await assert.rejects(generateGaussianMap({ ...g.options, render: async t => {
            const result = await g.options.render();
            if (t.id.endsWith('-1-0')) writeFileSync(resolve(g.source, 'model.json'), '{"changed":1}');
            return result;
        } }), /hash|changed|mismatch/i);
        const manifest = JSON.parse(readFileSync(resolve(g.options.resources.root, 'maps/fixture/manifest.json'), 'utf8'));
        assert.equal(manifest.coverage.status, 'incomplete');
    } finally { rmSync(g.base, { recursive: true }); }
});
test('single and tiled jobs bind one collision source identity without tiled binary reads', async () => {
    const base = mkdtempSync(resolve(root, 'collision-'));
    try {
        const json = resolve(base, 'walk.voxel.json'), bin = resolve(base, 'walk.voxel.bin');
        writeFileSync(json, JSON.stringify({ voxelResolution: .08 })); writeFileSync(bin, 'binary');
        assert.equal((await collisionIdentity(json)).hash, `${sha(readFileSync(json))}:${sha(readFileSync(bin))}`);
        const index = resolve(base, 'voxel-tiles.json'); writeFileSync(index, JSON.stringify({ tiles: ['a'] }));
        const tile = { id: 'a', metadataHash: 'a'.repeat(64), binaryHash: 'b'.repeat(64), binaryBytes: 4, binaryUrl: '/missing/a.bin' };
        const sourceHash = sha(JSON.stringify({ manifestHash: sha(readFileSync(index)), tiles: [[tile.id, tile.metadataHash, tile.binaryHash]], transform: 'flipXY' }));
        const frozen = resolve(base, 'collision-source.json');
        const source = { version: 1, kind: 'tiled', transform: 'flipXY', sourceHash, voxelResolution: .08, tiles: [tile] };
        writeFileSync(frozen, JSON.stringify(source));
        const proof = await collisionIdentity(index, frozen); assert.equal(proof.hash, sourceHash); assert.equal(proof.provenance.binaryValidation, 'previous-frozen-source-audit');
        source.tiles[0].binaryHash = 'c'.repeat(64); writeFileSync(frozen, JSON.stringify(source));
        await assert.rejects(collisionIdentity(index, frozen), /identity does not match/);
    } finally { rmSync(base, { recursive: true }); }
});
