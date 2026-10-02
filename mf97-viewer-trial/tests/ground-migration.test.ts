import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createOfflineResources, GiB } from '../src/offline-resources';
import { groundAnalysisHash } from '../src/ground-analysis-fingerprint';
import { migrateGroundReviews, SUPPORTED_ORIGINAL_ANALYSIS_HASH } from '../scripts/ground-migrate-reviews';
import { materializeGround } from '../scripts/ground-materialize';
import { VoxelCollision } from '../../metaflow-viewer/src/collision/voxel-collision';

const temporaryRoot = resolve(import.meta.dirname, '../../.codex-work/tmp/mf97-resource-tests');
mkdirSync(temporaryRoot, { recursive: true });
const sha = (v: Uint8Array | string) => createHash('sha256').update(v).digest('hex');
function makeFixture() {
    const base = mkdtempSync(resolve(temporaryRoot, 'migration-')), input = resolve(base, 'original'), scene = resolve(input, 'apms-2026');
    mkdirSync(scene, { recursive: true });
    const sourceFile = resolve(base, 'walk.voxel.json'), nodes = [0xff000001], leaves: number[] = [];
    for (let oct = 0; oct < 8; oct++) {
        nodes.push(leaves.length / 2); let low = 0, high = 0;
        for (let z = 0; z < 4; z++) for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
            const gx = (oct & 1) * 4 + x, gy = ((oct >> 1) & 1) * 4 + y, gz = ((oct >> 2) & 1) * 4 + z;
            if (!(gy < 2 || gy === 2 && (gx === 3 && gz === 3 || (gx === 5 || gx === 6) && gz === 5))) continue;
            const bit = z * 16 + y * 4 + x; if (bit < 32) low |= 1 << bit; else high |= 1 << (bit - 32);
        }
        leaves.push(low >>> 0, high >>> 0);
    }
    const metadata = { version: '1.1', gridBounds: { min: [0, 0, 0], max: [.64, .64, .64] }, gaussianBounds: { min: [0, 0, 0], max: [.64, .64, .64] },
        voxelResolution: .08, leafSize: 4, treeDepth: 1, numInteriorNodes: 1, numMixedLeaves: 8, nodeCount: nodes.length, leafDataCount: leaves.length };
    const json = JSON.stringify(metadata), binary = new Uint8Array(new Uint32Array([...nodes, ...leaves]).buffer);
    writeFileSync(sourceFile, json); writeFileSync(sourceFile.replace(/\.json$/, '.bin'), binary);
    const sourceHash = sha(json) + ':' + sha(binary);
    const candidate = (index: number, coordinates: number[][]) => ({ id: `old:patch:${index}`, surface: { id: 'old', layerId: 'old:layer:0',
        footprint: [{ x: 0, y: .16, z: 0 }, { x: .64, y: .16, z: 0 }, { x: .64, y: .16, z: .64 }, { x: 0, y: .16, z: .64 }], plane: [0, 1, 0, -.16] },
        status: 'proposed', reasons: [] as string[], pointCount: 20, residualBefore: .08, residualAfter: 0,
        edits: coordinates.map(([ix, iy, iz]) => ({ ix, iy, iz, before: true, after: false, candidateId: `old:patch:${index}` })) });
    const review = { version: 1, sourceHash, sourceFile, analysisHash: SUPPORTED_ORIGINAL_ANALYSIS_HASH, detector: 'Open3D-0.19.0.detect_planar_patches',
        coordinateSpace: 'world', voxelResolution: .08, candidates: [candidate(0, [[3,2,3]]), candidate(1, [[5,2,5],[6,2,5]]), candidate(2, [])],
        unknownSpanCount: 5, scannedColumnCount: 64, completeCoverage: true, coverageScope: 'chunk', gridBounds: metadata.gridBounds, previewPoints: [] as {x:number;y:number;z:number}[] };
    const coverage = { version: 1, sceneId: 'apms-2026', sourceHash, sourceFile, analysisHash: SUPPORTED_ORIGINAL_ANALYSIS_HASH,
        acceptedCandidateCount: 0, completeCoverage: true, chunks: 1, nextChunk: 1, proposedCandidateCount: 3, protectedCandidateCount: 0,
        unknownSpanCount: 5, detectorParameters: {}, inventory: [{ index: 0, file: 'chunk-00000.review.json' }] };
    writeFileSync(resolve(scene, 'chunk-00000.review.json'), JSON.stringify(review)); writeFileSync(resolve(scene, 'coverage.json'), JSON.stringify(coverage));
    const resources = createOfflineResources({ root: resolve(base, 'output'), measureFreeBytes: () => 100 * GiB, measureRssBytes: () => 1 });
    return { base, input, scene, sourceFile, sourceHash, review, resources,
        options: { inputRoot: input, resources, scenes: ['apms-2026'] } };
}
function originalHashes(f: ReturnType<typeof makeFixture>) {
    return [f.sourceFile, f.sourceFile.replace(/\.json$/, '.bin'), resolve(f.scene, 'coverage.json'), resolve(f.scene, 'chunk-00000.review.json')].map(path => sha(readFileSync(path)));
}
for (const interruption of ['copied', 'prepared', 'replaced', 'coverage'] as const) test(`migration resumes after ${interruption}, preserves all originals, and repeat is idempotent`, () => {
    const f = makeFixture(), before = originalHashes(f);
    try {
        assert.throws(() => migrateGroundReviews({ ...f.options, onCheckpoint: name => { if (name === interruption) throw Error('injected interruption'); } }), /injected/);
        assert.deepEqual(originalHashes(f), before);
        const result = migrateGroundReviews(f.options)[0];
        assert.equal(result.chunks, 1); assert.equal(result.proposed, 1); assert.equal(result.protected, 1);
        assert.equal(result.proposedVoxelEdits, 1); assert.equal(result.removedVoxelEditReferences, 2); assert.equal(result.addedVoxelEdits, 0);
        assert.equal(result.emptyLegacyProposals, 1); assert.equal(result.unknownCandidates, 1);
        const target = resolve(f.resources.root, 'ground-v2/apms-2026');
        const newReview = JSON.parse(readFileSync(resolve(target, 'chunk-00000.review.json'), 'utf8'));
        assert.equal(newReview.protectionVersion, 2); assert.equal(newReview.analysisHash, groundAnalysisHash());
        assert.equal(newReview.candidates[2].status, 'unknown'); assert.ok(newReview.candidates[2].reasons.includes('no-voxel-edits-in-core'));
        assert.deepEqual(newReview.candidates.flatMap((c: any) => c.edits).map((e: any) => [e.ix,e.iy,e.iz]), [[3,2,3]]);
        const bytes = readdirSync(target).map(name => [name, sha(readFileSync(resolve(target, name)))]);
        const charged = f.resources.snapshot().chargedBytes;
        assert.equal(migrateGroundReviews(f.options)[0].alreadyComplete, true);
        assert.deepEqual(readdirSync(target).map(name => [name, sha(readFileSync(resolve(target, name)))]), bytes);
        assert.equal(f.resources.snapshot().chargedBytes, charged); assert.deepEqual(originalHashes(f), before);
    } finally { rmSync(f.base, { recursive: true }); }
});
test('migration rejects wrong algorithm/coordinates/source and divergent resumed copy', () => {
    for (const mode of ['algorithm', 'coordinate', 'source', 'resume'] as const) {
        const f = makeFixture();
        try {
            if (mode === 'algorithm') {
                const p = resolve(f.scene, 'coverage.json'), v = JSON.parse(readFileSync(p, 'utf8')); v.analysisHash = 'unknown'; writeFileSync(p, JSON.stringify(v));
            } else if (mode === 'coordinate') {
                const p = resolve(f.scene, 'chunk-00000.review.json'), v = JSON.parse(readFileSync(p, 'utf8')); v.coordinateSpace = 'metaflow-rz180'; writeFileSync(p, JSON.stringify(v));
            } else if (mode === 'source') writeFileSync(f.sourceFile.replace(/\.json$/, '.bin'), 'changed');
            else {
                assert.throws(() => migrateGroundReviews({ ...f.options, onCheckpoint: name => { if (name === 'prepared') throw Error('stop'); } }));
                writeFileSync(resolve(f.resources.root, 'ground-v2/apms-2026/chunk-00000.review.json'), '{}');
            }
            assert.throws(() => migrateGroundReviews(f.options), /fingerprint|coordinate|source changed|recorded hashes/);
        } finally { rmSync(f.base, { recursive: true }); }
    }
});
test('migration rejects a within-cache symlink alias back to its original reports', () => {
    const f = makeFixture(), before = originalHashes(f);
    try {
        // The source is inside the approved cache, so the resource path guard alone permits
        // this symlink. The migration's physical source/output comparison must reject it.
        const resources = createOfflineResources({ root: f.base, measureFreeBytes: () => 100 * GiB, measureRssBytes: () => 1 });
        symlinkSync(f.input, resolve(f.base, 'ground-alias'));
        assert.throws(() => migrateGroundReviews({ inputRoot: f.input, outputRoot: 'ground-alias', resources, scenes: ['apms-2026'] }), /independent report copy/);
        assert.deepEqual(originalHashes(f), before);
        assert.equal(existsSync(resolve(f.scene, 'original-reports.json')), false);
        mkdirSync(resolve(f.base, 'independent-root'));
        symlinkSync(f.scene, resolve(f.base, 'independent-root/apms-2026'));
        assert.throws(() => migrateGroundReviews({ inputRoot: f.input, outputRoot: 'independent-root', resources, scenes: ['apms-2026'] }), /Scene output must be independent/);
        assert.deepEqual(originalHashes(f), before);
        const physicalScene = resolve(f.base, 'real-scene');
        renameSync(f.scene, physicalScene);
        symlinkSync(physicalScene, f.scene);
        assert.throws(() => migrateGroundReviews({ inputRoot: f.input, outputRoot: 'independent-root', resources, scenes: ['apms-2026'] }), /Scene output must be independent/);
        assert.deepEqual(originalHashes(f), before);
    } finally { rmSync(f.base, { recursive: true }); }
});
test('v2 synthetic materialization resumes after binary write, reads back only approved bit and rejects changed completed output', () => {
    const f = makeFixture(), before = originalHashes(f);
    try {
        const migrated = migrateGroundReviews(f.options)[0], reviewPath = migrated.output;
        const review = JSON.parse(readFileSync(resolve(reviewPath, 'chunk-00000.review.json'), 'utf8'));
        const decisionPath = resolve(f.base, 'decisions.json');
        writeFileSync(decisionPath, JSON.stringify({ version: 1, sourceHash: f.sourceHash, analysisHash: groundAnalysisHash(),
            acceptedCandidateIds: [review.candidates[0].id], rejectedCandidateIds: [] }));
        const options = { reviewPath, decisionPath, resources: f.resources };
        assert.throws(() => materializeGround({ ...options, onCheckpoint: name => { if (name === 'binary') throw Error('stop after binary'); } }), /stop after binary/);
        const result = materializeGround(options); assert.equal(result.complete, true); assert.equal(result.validation.changedVoxelCount, 1);
        assert.equal(result.validation.nativeValidation, 'pending'); assert.equal(result.appliedToViewer, false);
        const meta = JSON.parse(readFileSync(resolve(result.artifact, 'walk.voxel.json'), 'utf8')), bin = readFileSync(resolve(result.artifact, 'walk.voxel.bin'));
        const words = new Uint32Array(bin.buffer, bin.byteOffset, bin.byteLength / 4), collision = new VoxelCollision(meta, words.subarray(0, meta.nodeCount), words.subarray(meta.nodeCount));
        for (let z = 0; z < 8; z++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
            assert.equal(collision.isVoxelSolid(x, y, z), y < 2 || y === 2 && (x === 5 || x === 6) && z === 5);
        }
        assert.equal(materializeGround(options).alreadyComplete, true); assert.deepEqual(originalHashes(f), before);
        writeFileSync(resolve(result.artifact, 'walk.voxel.bin'), 'corrupt');
        assert.throws(() => materializeGround(options), /Existing materialization differs/);
    } finally { rmSync(f.base, { recursive: true }); }
});
