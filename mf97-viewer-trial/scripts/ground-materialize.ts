import { resolveRecordedPath } from "../../scripts/mf97/asset-config.mjs";
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VoxelCollision } from '../../metaflow-viewer/src/collision/voxel-collision';
import { acceptedEdits } from '../src/ground/review';
import { materializeVoxel } from '../src/ground/materialize';
import { groundAnalysisHash } from '../src/ground-analysis-fingerprint';
import { createOfflineResources, offlineResourceOptions, MiB } from '../src/offline-resources';
import type { GroundReview, GroundDecisions } from '../src/ground/types';
const sha = (v: Uint8Array | string) => createHash('sha256').update(v).digest('hex');
export function materializeGround(options: {
    reviewPath: string; decisionPath: string; output?: string; resources: ReturnType<typeof createOfflineResources>;
    onCheckpoint?: (stage: 'prepared' | 'binary' | 'complete') => void;
}) {
    const { resources, reviewPath, decisionPath } = options;
    const folder = resources.resolveOutput(options.output ?? 'accepted');
    const acceptedRoot = resources.resolveOutput('accepted');
    if (folder !== acceptedRoot && !folder.startsWith(acceptedRoot + sep)) throw Error('Materialization must remain under the continuation accepted cache');
    resources.assertCapacity(0, 'ground materialization preflight');
    const decisionBytes = readFileSync(decisionPath), decisions = JSON.parse(decisionBytes.toString()) as GroundDecisions;
    const directory = statSync(reviewPath).isDirectory();
    const coverage = directory ? JSON.parse(readFileSync(resolve(reviewPath, 'coverage.json'), 'utf8')) : null;
    if (coverage && (!coverage.completeCoverage || coverage.protectionVersion !== 2)) throw Error('Complete version 2 coverage is required');
    const files = directory ? coverage.inventory.map((v: any) => {
        if (!/^chunk-\d{5}\.review\.json$/.test(v.file)) throw Error('Invalid coverage inventory path');
        return resolve(reviewPath, v.file);
    }) : [reviewPath];
    const reviews: GroundReview[] = files.map((file: string) => JSON.parse(readFileSync(file, 'utf8'))), first = reviews[0];
    if (!first?.sourceFile) throw Error('Original sourceFile is required');
    const expectedAnalysisHash = groundAnalysisHash();
    if (first.analysisHash !== expectedAnalysisHash || decisions.analysisHash !== expectedAnalysisHash) throw Error('Current analysis fingerprint is required');
    const sourceFile = first.sourceFile, located = resolveRecordedPath(sourceFile), json = readFileSync(located), meta = JSON.parse(json.toString());
    const bin = readFileSync(located.replace(/\.json$/, '.bin')), sourceHash = sha(json) + ':' + sha(bin);
    if (sourceHash !== first.sourceHash || decisions.sourceHash !== sourceHash || reviews.some(r =>
        r.sourceHash !== sourceHash || r.sourceFile !== sourceFile || r.analysisHash !== expectedAnalysisHash || r.coordinateSpace !== first.coordinateSpace)) throw Error('Source/analysis/coordinate fingerprint mismatch');
    const available = new Set(reviews.flatMap(r => r.candidates.map(c => c.id)));
    for (const id of [...decisions.acceptedCandidateIds, ...decisions.rejectedCandidateIds]) if (!available.has(id)) throw Error('Unknown candidate in decisions');
    const edits = reviews.flatMap(r => acceptedEdits(r, { ...decisions,
        acceptedCandidateIds: decisions.acceptedCandidateIds.filter(id => r.candidates.some(c => c.id === id)),
        rejectedCandidateIds: decisions.rejectedCandidateIds.filter(id => r.candidates.some(c => c.id === id)) }));
    if (!edits.length) throw Error('No explicitly accepted voxel edits; no materialization created');
    const decisionHash = sha(decisionBytes), identity = { sourceHash, analysisHash: expectedAnalysisHash, decisionHash };
    const artifact = resolve(folder, sha(JSON.stringify(identity)).slice(0, 24)), manifestFile = resolve(artifact, 'materialization.json');
    if (existsSync(manifestFile)) {
        const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
        const actual = sha(readFileSync(resolve(artifact, 'walk.voxel.json'))) + ':' + sha(readFileSync(resolve(artifact, 'walk.voxel.bin')));
        if (manifest.outputHash !== actual || manifest.sourceHash !== sourceHash || manifest.analysisHash !== expectedAnalysisHash || manifest.decisionHash !== decisionHash || !manifest.complete) throw Error('Existing materialization differs; preserve it');
        return { artifact, alreadyComplete: true, ...manifest };
    }
    resources.assertCapacity(bin.byteLength + MiB, 'materialization estimated output');
    const n = meta.nodeWordCount ?? meta.nodeCount;
    if ((n + meta.leafDataCount) * 4 !== bin.byteLength || bin.byteLength % 4) throw Error('Voxel binary length mismatch');
    const words = new Uint32Array(bin.buffer, bin.byteOffset, bin.byteLength / 4), original = new VoxelCollision(meta, words.subarray(0, n), words.subarray(n));
    const result = materializeVoxel(meta, original, edits);
    resources.assertCapacity(result.binary.byteLength + MiB, 'materialization exact output');
    const sourceStillMatches = () => sha(readFileSync(located)) + ':' + sha(readFileSync(located.replace(/\.json$/, '.bin'))) === sourceHash;
    if (!sourceStillMatches()) throw Error('Original changed during materialization');
    resources.writeJsonAtomic(resolve(artifact, 'preparation.json'), { version: 1, ...identity, sourceFile, complete: false }, { replace: false });
    options.onCheckpoint?.('prepared');
    resources.writeJsonAtomic(resolve(artifact, 'walk.voxel.json'), result.metadata, { replace: false });
    resources.writeFileAtomic(resolve(artifact, 'walk.voxel.bin'), result.binary, { replace: false });
    options.onCheckpoint?.('binary');
    const outputJson = readFileSync(resolve(artifact, 'walk.voxel.json')), outputBin = readFileSync(resolve(artifact, 'walk.voxel.bin'));
    const outputHash = sha(outputJson) + ':' + sha(outputBin);
    if (sha(outputJson) !== sha(JSON.stringify(result.metadata)) || sha(outputBin) !== sha(result.binary)) throw Error('Materialization readback mismatch');
    if (!sourceStillMatches() || groundAnalysisHash() !== expectedAnalysisHash) throw Error('Source or analysis changed before completion');
    const manifest = { version: 2, complete: true, protectionVersion: 2, sourceFile, ...identity, outputHash,
        coordinateSpace: first.coordinateSpace, validation: result.validation, sourceModified: false, appliedToViewer: false,
        acceptedCandidateCount: new Set(decisions.acceptedCandidateIds).size };
    resources.writeJsonAtomic(manifestFile, manifest, { replace: false, recovery: true });
    options.onCheckpoint?.('complete');
    return { artifact, alreadyComplete: false, ...manifest };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2), arg = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
    const reviewPath = arg('--review'), decisionPath = arg('--decisions');
    if (!reviewPath || !decisionPath) throw Error('--review and --decisions are required; no implicit acceptance');
    const resources = createOfflineResources(offlineResourceOptions(args));
    console.log(JSON.stringify(materializeGround({ reviewPath, decisionPath, output: arg('--output'), resources })));
}
