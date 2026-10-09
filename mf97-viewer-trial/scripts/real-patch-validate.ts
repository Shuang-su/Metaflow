import { resolveRecordedPath } from "../../scripts/mf97/asset-config.mjs";
/** Native validation of an explicitly accepted materialized artifact. Never accepts edits or applies it to Viewer. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VoxelCollision } from '../../metaflow-viewer/src/collision/voxel-collision';
import { NativeDriver, BODY } from '../../mf79-viewer-trial/src/native-motion';
import type { WalkPhysicsState } from '../../metaflow-viewer/src/cameras/walk-controller';
import { acceptedEdits } from '../src/ground/review';
import type { SparseEdit, GroundReview, GroundDecisions } from '../src/ground/types';
import { groundAnalysisHash } from '../src/ground-analysis-fingerprint';
import { createOfflineResources, offlineResourceOptions } from '../src/offline-resources';
import { sha } from './gaussian-map-offline';
type Meta = ConstructorParameters<typeof VoxelCollision>[0];
function decode(file: string) {
    const json = readFileSync(file), binary = readFileSync(file.replace(/\.json$/, '.bin')), meta = JSON.parse(json.toString()) as Meta;
    const n = meta.nodeWordCount ?? meta.nodeCount;
    if ((n + meta.leafDataCount) * 4 !== binary.byteLength) throw Error('Collision binary size mismatch');
    const words = new Uint32Array(binary.buffer, binary.byteOffset, binary.byteLength / 4);
    return { meta, collision: new VoxelCollision(meta, words.subarray(0, n), words.subarray(n)), hash: `${sha(json)}:${sha(binary)}` };
}
/** Compare complete sparse tree coverage, not just edited blocks. Constants are
 * compared without expanding the empty/solid volume; every differing leaf bit
 * is checked against exactly the accepted edit set. */
export function compareVoxelTrees(before: VoxelCollision, after: VoxelCollision, edits: SparseEdit[]) {
    if (before.treeDepth !== after.treeDepth || before.numVoxelsX !== after.numVoxelsX || before.numVoxelsY !== after.numVoxelsY || before.numVoxelsZ !== after.numVoxelsZ) throw Error('Collision lattice changed');
    const expected = new Map(edits.map(e => [`${e.ix},${e.iy},${e.iz}`, e]));
    if (!expected.size || expected.size !== edits.length) throw Error('Expected edits must be nonempty and unique');
    type Node = { kind: 'empty' } | { kind: 'solid' } | { kind: 'node'; index: number };
    const EMPTY: Node = { kind: 'empty' }, SOLID: Node = { kind: 'solid' };
    function normalized(c: VoxelCollision, n: Node): Node {
        if (n.kind !== 'node') return n;
        const word = c.nodes[n.index * c.nodeStride] >>> 0;
        return (c.nodeStride === 2 ? word === 255 : word === 0xff000000) ? SOLID : n;
    }
    function children(c: VoxelCollision, node: Node): Node[] {
        if (node.kind !== 'node') return Array(8).fill(node);
        const word = c.nodes[node.index * c.nodeStride] >>> 0, mask = c.nodeStride === 2 ? word & 255 : word >>> 24;
        if (!mask) throw Error('Unexpected mixed leaf above lattice block');
        const base = c.nodeStride === 2 ? c.nodes[node.index * 2 + 1] >>> 0 : word & 0xffffff;
        let offset = 0;
        return Array.from({ length: 8 }, (_, oct) => mask & (1 << oct) ? normalized(c, { kind: 'node', index: base + offset++ }) : EMPTY);
    }
    function bits(c: VoxelCollision, n: Node): [number, number] {
        if (n.kind === 'empty') return [0, 0]; if (n.kind === 'solid') return [0xffffffff, 0xffffffff];
        const word = c.nodes[n.index * c.nodeStride] >>> 0, base = c.nodeStride === 2 ? c.nodes[n.index * 2 + 1] >>> 0 : word & 0xffffff;
        return [c.leafData[base * 2] >>> 0, c.leafData[base * 2 + 1] >>> 0];
    }
    let visitedNodes = 0, comparedLeafBlocks = 0, changedVoxelCount = 0;
    const changed: SparseEdit[] = [];
    function visit(a: Node, b: Node, level: number, bx: number, by: number, bz: number) {
        visitedNodes++;
        if (a.kind === b.kind && a.kind !== 'node') return;
        if (!level) {
            const aa = bits(before, a), bb = bits(after, b); comparedLeafBlocks++;
            for (let half = 0; half < 2; half++) {
                const difference = (aa[half] ^ bb[half]) >>> 0;
                if (!difference) continue;
                for (let bit = 0; bit < 32; bit++) if (difference & (1 << bit)) {
                    const index = half * 32 + bit, ix = bx * 4 + (index & 3), iy = by * 4 + ((index >> 2) & 3), iz = bz * 4 + (index >> 4);
                    const key = `${ix},${iy},${iz}`, e = expected.get(key), oldValue = !!(aa[half] & (1 << bit)), newValue = !!(bb[half] & (1 << bit));
                    if (!e || e.before !== oldValue || e.after !== newValue) throw Error(`Unapproved bit difference at ${key}`);
                    changed.push(e); changedVoxelCount++;
                }
            }
            return;
        }
        const ca = children(before, a), cb = children(after, b), step = 2 ** (level - 1);
        for (let oct = 0; oct < 8; oct++) visit(ca[oct], cb[oct], level - 1, bx + (oct & 1) * step, by + ((oct >> 1) & 1) * step, bz + ((oct >> 2) & 1) * step);
    }
    visit(before.nodes.length ? normalized(before, { kind: 'node', index: 0 }) : EMPTY, after.nodes.length ? normalized(after, { kind: 'node', index: 0 }) : EMPTY, before.treeDepth, 0, 0, 0);
    if (changedVoxelCount !== expected.size) throw Error('Accepted edit missing from full tree difference');
    return { completeTreeCompared: true, visitedNodes, comparedLeafBlocks, changedVoxelCount, changed };
}
export function compareNativeMotion(before: VoxelCollision, after: VoxelCollision, center: { x: number; y: number; z: number }, resolution: number) {
    const down = (c: VoxelCollision, x: number, z: number) => c.queryRay(x, center.y + 1, z, 0, -1, 0, 2)?.y ?? null;
    const probes = [[0,0], [-resolution,0], [resolution,0], [0,-resolution], [0,resolution]].map(([x,z]) => ({ x: center.x+x, z: center.z+z, before: down(before,center.x+x,center.z+z), after: down(after,center.x+x,center.z+z) }));
    if (probes.some(p => p.before === null || p.after === null)) throw Error('Native fixture lacks support around the edit');
    type Scenario = { id: string; x: number; z: number; inputX: number; inputZ: number; crossing?: { axis: 'x' | 'z'; direction: number } };
    const cases: Scenario[] = [
        ...probes.map((p,i) => ({ id: `stand-${i}`, x: p.x, z: p.z, inputX: 0, inputZ: 0 })),
        ...(['x','z'] as const).flatMap(axis => [-1,1].map(direction => ({ id: `cross-${axis}-${direction}`, x: center.x + (axis === 'x' ? -direction * .24 : 0), z: center.z + (axis === 'z' ? -direction * .24 : 0), inputX: axis === 'x' ? direction * .5 : 0, inputZ: axis === 'z' ? -direction * .5 : 0, crossing: { axis, direction } }))),
    ];
    const run = (collision: VoxelCollision, scenario: typeof cases[number]) => {
        const start = { x: scenario.x, y: Math.max(...probes.flatMap(p => [p.before!,p.after!])) + BODY.eye + BODY.hover + .3, z: scenario.z };
        const driver = new NativeDriver(collision, start), states: WalkPhysicsState[] = [];
        for (let tick = 0; tick < 360; tick++) states.push(driver.step(tick >= 120 && tick < 240 ? scenario.inputX : 0, tick >= 120 && tick < 240 ? scenario.inputZ : 0));
        const active = states.every(s => s.collision === 'active'), supports = states.slice(120).flatMap(s => s.supportHeight === null ? [] : [s.supportHeight]);
        return { start, active, groundedFinal: states.at(-1)!.grounded, final: states.at(-1)!, minSupport: supports.length ? Math.min(...supports) : null,
            maxSupport: supports.length ? Math.max(...supports) : null, maxVerticalSpeedAfterSettle: Math.max(...states.slice(120).map(s => Math.abs(s.velocity.y))),
            unsupportedTicksAfterSettle: states.slice(120).filter(s => s.supportHeight === null).length, traceHash: sha(JSON.stringify(states)), trace: states, states };
    };
    const results = cases.map(scenario => {
        const a = run(before, scenario), b = run(after, scenario), repeatA = run(before, scenario), repeatB = run(after, scenario);
        if (a.traceHash !== repeatA.traceHash || b.traceHash !== repeatB.traceHash) throw Error('Native fixed-input replay is not deterministic');
        const maxHorizontalDifference = Math.max(...a.states.map((s,i) => Math.hypot(s.position.x-b.states[i].position.x,s.position.z-b.states[i].position.z)));
        const maxVerticalDifference = Math.max(...a.states.map((s,i) => Math.abs(s.position.y-b.states[i].position.y)));
        const crossing = (states: WalkPhysicsState[]) => {
            if (!scenario.crossing) return null;
            const { axis, direction } = scenario.crossing, other = axis === 'x' ? 'z' : 'x';
            const floorMin = Math.min(...probes.flatMap(p => [p.before!,p.after!])) - resolution;
            const floorMax = Math.max(...probes.flatMap(p => [p.before!,p.after!])) + resolution;
            const movement = states.slice(120), onLayer = movement.filter(s => s.grounded && s.supportHeight !== null && s.supportHeight >= floorMin && s.supportHeight <= floorMax && Math.abs(s.position.y - s.supportHeight - BODY.eye - BODY.hover) <= resolution * 1.5);
            const aligned = onLayer.filter(s => Math.abs(s.position[other] - center[other]) <= resolution * 1.5);
            const projection = aligned.map(s => (s.position[axis]-center[axis])*direction);
            const closestHorizontalDistance = Math.min(Infinity,...aligned.map(s => Math.hypot(s.position.x-center.x,s.position.z-center.z)));
            const crossedEditProjection = projection.length > 1 && projection[0] < -resolution*.5 && projection.some(v => v > resolution*.5);
            return { closestHorizontalDistance: Number.isFinite(closestHorizontalDistance) ? closestHorizontalDistance : null, crossedEditProjection,
                sameLayerTicks: onLayer.length, requiredSameLayerTicks: movement.length, floorRange: [floorMin,floorMax],
                passed: crossedEditProjection && closestHorizontalDistance <= resolution*.75 && onLayer.length === movement.length };
        };
        const beforeCrossing = crossing(a.states), afterCrossing = crossing(b.states);
        const { states: _a, ...oldResult } = a, { states: _b, ...newResult } = b;
        return { scenario, before: oldResult, after: newResult, beforeCrossing, afterCrossing, deterministicRepeat: true, maxHorizontalDifference, maxVerticalDifference,
            passed: a.active && b.active && a.groundedFinal && b.groundedFinal && b.unsupportedTicksAfterSettle <= a.unsupportedTicksAfterSettle && maxHorizontalDifference < .01 && maxVerticalDifference <= resolution + 1e-8 && b.maxVerticalSpeedAfterSettle <= a.maxVerticalSpeedAfterSettle + 1e-8 && (!scenario.crossing || beforeCrossing?.passed === true && afterCrossing?.passed === true) };
    });
    return { crossingPassed: results.filter(r => r.scenario.crossing).every(r => r.beforeCrossing?.passed && r.afterCrossing?.passed), dt: 1/60, ticksPerCase: 360, settleTicks: 120, movementTicks: 120, body: BODY, probeHeights: probes, cases: results, passed: results.every(r => r.passed),
        limitation: 'Fixed-input native CPU replay on the materialized binary; GPU upload, browser integration, and same-source Recast navigation remain separate validations.' };
}
export function validateRealPatch(options: { artifact: string; review: string; decisions: string; output?: string; resources: ReturnType<typeof createOfflineResources> }) {
    const implementationFiles = [fileURLToPath(import.meta.url), resolve(import.meta.dirname, '../../metaflow-viewer/src/cameras/walk-controller.ts'), resolve(import.meta.dirname, '../../metaflow-viewer/src/collision/voxel-collision.ts'), resolve(import.meta.dirname, '../../mf79-viewer-trial/src/native-motion.ts')];
    const implementation = implementationFiles.map(file => ({ file, sha256: sha(readFileSync(file)) }));
    options.resources.assertCapacity(1024 * 1024, 'native patch validation');
    const manifestBytes = readFileSync(resolve(options.artifact, 'materialization.json')), manifest = JSON.parse(manifestBytes.toString());
    const decisionBytes = readFileSync(options.decisions), decisions = JSON.parse(decisionBytes.toString()) as GroundDecisions;
    const reviewBytes = readFileSync(options.review), review = JSON.parse(reviewBytes.toString()) as GroundReview;
    if (!manifest.complete || manifest.coordinateSpace !== 'world' || manifest.sourceHash !== decisions.sourceHash || manifest.decisionHash !== sha(decisionBytes) ||
        manifest.analysisHash !== groundAnalysisHash() || manifest.analysisHash !== decisions.analysisHash || manifest.sourceFile !== review.sourceFile) throw Error('Materialization/decision/current review identity mismatch');
    const edits = acceptedEdits(review, decisions);
    if (!edits.length) throw Error('No explicitly accepted edit');
    const original = decode(resolveRecordedPath(manifest.sourceFile)), changed = decode(resolve(options.artifact, 'walk.voxel.json'));
    if (original.hash !== manifest.sourceHash || changed.hash !== manifest.outputHash || JSON.stringify(original.meta.gridBounds) !== JSON.stringify(changed.meta.gridBounds) || original.meta.voxelResolution !== changed.meta.voxelResolution) throw Error('Materialized/source hash or grid differs');
    const difference = compareVoxelTrees(original.collision, changed.collision, edits);
    const r = original.meta.voxelResolution, min = original.meta.gridBounds.min;
    const native = edits.map(e => compareNativeMotion(original.collision, changed.collision, { x: min[0]+(e.ix+.5)*r, y:min[1]+(e.iy+.5)*r, z:min[2]+(e.iz+.5)*r }, r));
    if (decode(resolveRecordedPath(manifest.sourceFile)).hash !== original.hash || decode(resolve(options.artifact, 'walk.voxel.json')).hash !== changed.hash || sha(readFileSync(options.decisions)) !== manifest.decisionHash || sha(readFileSync(options.review)) !== sha(reviewBytes)) throw Error('Input changed during native validation');
    if (implementation.some(item => sha(readFileSync(item.file)) !== item.sha256)) throw Error('Native validator implementation changed during validation');
    const report = { version: 1, implementation, artifact: resolve(options.artifact), sourceHash: original.hash, outputHash: changed.hash, materializationHash: sha(manifestBytes),
        decisionHash: manifest.decisionHash, analysisHash: manifest.analysisHash, reviewHash: sha(reviewBytes), difference, native, nativePassed: native.every(n => n.passed), nativeCrossingPassed: native.every(n => n.crossingPassed), nativeIncomplete: native.some(n => !n.passed),
        sourceModified: false, appliedToViewer: false, gpuValidated: false, recastValidated: false, acceptedByThisCommand: false };
    options.resources.writeJsonAtomic(options.output ?? `validation/real-patch-${sha(manifestBytes).slice(0,16)}.json`, report, { replace: false });
    return { ...report, native: native.map(n => ({ passed: n.passed, crossingPassed: n.crossingPassed, cases: n.cases.length, crossing: n.cases.filter(c => c.scenario.crossing).map(c => ({ scenario: c.scenario, before: c.beforeCrossing, after: c.afterCrossing })), probeHeights: n.probeHeights })) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2), value = (name: string) => args.includes(name) ? args[args.indexOf(name)+1] : undefined;
    const artifact = value('--artifact'), review = value('--review'), decisions = value('--decisions');
    if (!artifact || !review || !decisions) throw Error('--artifact --review --decisions are required; this command never accepts candidates');
    const result = validateRealPatch({ artifact, review, decisions, output: value('--output'), resources: createOfflineResources(offlineResourceOptions(args)) });
    console.log(JSON.stringify(result));
    if (!result.nativePassed) process.exitCode = 2;
}
