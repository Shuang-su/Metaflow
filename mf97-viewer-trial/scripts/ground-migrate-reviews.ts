import { loadAssetConfig, resolveAssetUrl, resolveRecordedPath } from "../../scripts/mf97/asset-config.mjs";
/** Copy and migrate complete UNACCEPTED reports; source reports/collision remain immutable. */
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VoxelCollision } from '../../metaflow-viewer/src/collision/voxel-collision';
import { surfaceIdentity, surfaceHeight } from '../../metaflow-viewer/src/navigation/layers';
import { createOfflineResources, offlineResourceOptions } from '../src/offline-resources';
import { groundAnalysisHash } from '../src/ground-analysis-fingerprint';
import type { GroundReview, SparseEdit } from '../src/ground/types';

export const SUPPORTED_ORIGINAL_ANALYSIS_HASH = 'b595d2a99dd4966ea755ccfb08b176ad3516084eba8394a60fbcea21cf8e0262';
export const DEFAULT_GROUND_INPUT = loadAssetConfig().roots.groundReports;
const sha = (v: Uint8Array | string) => createHash('sha256').update(v).digest('hex');
export { groundAnalysisHash } from '../src/ground-analysis-fingerprint';
const editKey = (e: SparseEdit) => `${e.ix},${e.iy},${e.iz}:${e.before}:${e.after}`;
function physicalPath(path: string) {
    let ancestor = path;
    while (!existsSync(ancestor)) ancestor = dirname(ancestor);
    return resolve(realpathSync(ancestor), relative(ancestor, path));
}
function safeChild(root: string, name: string) {
    if (!/^chunk-\d{5}\.review\.json$/.test(name)) throw Error('Unexpected report inventory path');
    const file = resolve(root, name), realRoot = realpathSync(root), realFile = realpathSync(file);
    if (relative(realRoot, realFile).startsWith('..' + sep) || relative(realRoot, realFile) === '..') throw Error('Report escaped its source directory');
    return file;
}
function verifySource(sourceFile: string, expected: string) {
    const located = resolveRecordedPath(sourceFile);
    const json = readFileSync(located), bin = readFileSync(located.replace(/\.json$/, '.bin'));
    const sourceHash = sha(json) + ':' + sha(bin);
    if (sourceHash !== expected) throw Error('Original source changed');
    const meta = JSON.parse(json.toString()), n = meta.nodeWordCount ?? meta.nodeCount;
    if ((n + meta.leafDataCount) * 4 !== bin.byteLength || bin.byteLength % 4) throw Error('Voxel binary length mismatch');
    const words = new Uint32Array(bin.buffer, bin.byteOffset, bin.byteLength / 4);
    return { meta, collision: new VoxelCollision(meta, words.subarray(0, n), words.subarray(n)), sourceHash };
}
export type MigrationOptions = {
    inputRoot?: string; outputRoot?: string; scenes?: string[];
    resources: ReturnType<typeof createOfflineResources>;
    /** Failure injection used only by deterministic recovery tests. */
    onCheckpoint?: (name: 'copied' | 'prepared' | 'replaced' | 'coverage', scene: string, file?: string) => void;
};
export function migrateGroundReviews(options: MigrationOptions) {
    const { resources } = options, inputRoot = realpathSync(options.inputRoot ?? DEFAULT_GROUND_INPUT);
    const outputRoot = physicalPath(resources.resolveOutput(options.outputRoot ?? 'ground-v2'));
    if (outputRoot === inputRoot || outputRoot.startsWith(inputRoot + sep) || inputRoot.startsWith(outputRoot + sep)) throw Error('Migration must use an independent report copy');
    const analysisHash = groundAnalysisHash(), migrationHash = sha(readFileSync(fileURLToPath(import.meta.url))), results: any[] = [];
    for (const sceneId of options.scenes ?? ['apms-2026', 'sdi-2026']) {
        if (!['apms-2026', 'sdi-2026'].includes(sceneId)) throw Error('Only the two audited exhibition namespaces may migrate');
        const input = realpathSync(resolve(inputRoot, sceneId)), output = physicalPath(resolve(outputRoot, sceneId));
        if ([inputRoot, input].some(original => output === original || output.startsWith(original + sep) || original.startsWith(output + sep))) throw Error('Scene output must be independent of the original reports');
        const coverageBytes = readFileSync(resolve(input, 'coverage.json')), coverage = JSON.parse(coverageBytes.toString());
        if (coverage.sceneId !== sceneId || coverage.acceptedCandidateCount !== 0 || !coverage.completeCoverage) throw Error('Only complete unaccepted proposals may migrate');
        if (coverage.analysisHash !== SUPPORTED_ORIGINAL_ANALYSIS_HASH) throw Error('Unknown original analysis fingerprint; migration refused');
        if (!Array.isArray(coverage.inventory) || coverage.inventory.length !== coverage.chunks || coverage.nextChunk !== coverage.chunks) throw Error('Incomplete source inventory');
        const names = new Set<string>(), frozenFiles: any[] = [];
        for (const chunk of coverage.inventory) {
            if (names.has(chunk.file)) throw Error('Duplicate inventory file');
            names.add(chunk.file);
            const bytes = readFileSync(safeChild(input, chunk.file)), review = JSON.parse(bytes.toString());
            if (review.sourceHash !== coverage.sourceHash || review.analysisHash !== SUPPORTED_ORIGINAL_ANALYSIS_HASH) throw Error('Chunk source/original algorithm mismatch');
            if (review.coordinateSpace !== 'world') throw Error('Migration only supports world-coordinate reports');
            if (review.sourceFile !== coverage.sourceFile || !review.completeCoverage || review.coverageScope !== 'chunk') throw Error('Chunk source or coverage differs');
            frozenFiles.push({ file: chunk.file, bytes: bytes.length, hash: sha(bytes) });
        }
        const { meta, collision, sourceHash } = verifySource(coverage.sourceFile, coverage.sourceHash);
        const sourceManifest = { version: 1, inputRoot, sceneId, originalCoverageHash: sha(coverageBytes), sourceFile: coverage.sourceFile,
            sourceHash, originalAnalysisHash: coverage.analysisHash, files: frozenFiles };
        const manifestPath = resolve(output, 'original-reports.json');
        resources.writeJsonAtomic(manifestPath, sourceManifest, { replace: false });
        const logFile = resolve(output, 'migration-log.json');
        const log: any = existsSync(logFile) ? JSON.parse(readFileSync(logFile, 'utf8')) : {
            version: 2, kind: 'namespace-and-coherent-plateau-protection', sceneId, inputRoot, outputRoot,
            sourceHash, sourceModified: false, originalReportsModified: false, acceptedCandidateCount: 0,
            originalCoverageHash: sha(coverageBytes), originalAnalysisHash: coverage.analysisHash, analysisHash, migrationHash,
            originalReportsManifestHash: sha(JSON.stringify(sourceManifest)), reranOpen3D: false, files: [], complete: false
        };
        if (log.version !== 2 || log.inputRoot !== inputRoot || log.outputRoot !== outputRoot || log.sourceHash !== sourceHash || log.analysisHash !== analysisHash ||
            log.originalReportsManifestHash !== sha(JSON.stringify(sourceManifest))) throw Error('Migration source/algorithm changed; preserve previous copy and log');
        if (log.complete) {
            if (sha(readFileSync(resolve(output, 'coverage.json'))) !== log.outputCoverageHash) throw Error('Completed coverage changed');
            for (const record of log.files) if (sha(readFileSync(resolve(output, record.file))) !== record.afterHash) throw Error('Completed report changed');
            if (log.files.length !== coverage.chunks) throw Error('Completed log misses reports');
            // This is read-only verification of an already finished, same-policy artifact.
            // Keep its actual historical migration hash; never relabel it with the current tool.
            results.push({ sceneId, alreadyComplete: true, ...log.after, sourceHash, analysisHash,
                migrationHash: log.migrationHash, currentMigrationHash: migrationHash, output });
            continue;
        }
        if (log.migrationHash !== migrationHash) throw Error('Incomplete migration tool changed; preserve previous copy and start an independent output');
        resources.writeJsonAtomic(logFile, log);
        // Preserve an exact, independently usable initial copy before replacing any report.
        for (const entry of frozenFiles) {
            const file = resolve(output, entry.file), record = log.files.find((v: any) => v.file === entry.file);
            if (existsSync(file)) {
                const actual = sha(readFileSync(file));
                if (actual !== entry.hash && actual !== record?.afterHash) throw Error('Report copy differs from both recorded hashes');
            } else {
                const bytes = readFileSync(safeChild(input, entry.file));
                if (sha(bytes) !== entry.hash) throw Error('Original report changed while copying');
                resources.writeFileAtomic(file, bytes, { replace: false });
            }
        }
        if (!existsSync(resolve(output, 'coverage.json'))) resources.writeFileAtomic(resolve(output, 'coverage.json'), coverageBytes, { replace: false });
        options.onCheckpoint?.('copied', sceneId);
        let proposed = 0, protectedCount = 0, unknownCandidates = 0, editsAfter = 0, removedEdits = 0, editsBefore = 0, emptyLegacyProposals = 0;
        const uniqueBefore = new Set<string>(), uniqueAfter = new Set<string>();
        for (const chunk of coverage.inventory) {
            const sourceFile = safeChild(input, chunk.file), bytes = readFileSync(sourceFile), frozen = frozenFiles.find(v => v.file === chunk.file);
            if (sha(bytes) !== frozen.hash) throw Error('Original report changed during migration');
            const review = JSON.parse(bytes.toString()) as GroundReview;
            let removedInChunk = 0;
            for (const candidate of review.candidates) {
                if (candidate.status === 'proposed' && candidate.edits.length === 0) {
                    candidate.status = 'unknown'; emptyLegacyProposals++;
                    candidate.reasons = [...new Set([...candidate.reasons, 'no-voxel-edits-in-core'])].sort();
                }
                const oldId = candidate.id, layerMatch = candidate.surface.layerId.match(/:layer:(-?\d+)$/), suffix = oldId.split(':patch:')[1];
                if (!layerMatch || !/^\d+$/.test(suffix)) throw Error('Unknown old surface namespace');
                const beforeKeys = new Set(candidate.edits.map(editKey));
                editsBefore += candidate.edits.length;
                for (const key of beforeKeys) uniqueBefore.add(key);
                const surface = surfaceIdentity(sceneId, Number(layerMatch[1]) * .5, candidate.surface.footprint, candidate.surface.plane);
                candidate.surface = surface; candidate.id = `${surface.id}:patch:${suffix}`;
                let removedImprovement = 0, removedFromCandidate = 0;
                const r = review.voxelResolution;
                candidate.edits = candidate.edits.filter(e => {
                    if (collision.isVoxelSolid(e.ix, e.iy, e.iz) !== e.before) throw Error('Before mask mismatch during protection migration');
                    const top = e.after ? e.iy - 1 : e.iy;
                    const neighboringTops = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].map(([dx,dz]) =>
                        [-2,-1,0,1,2].map(dy => top + dy).find(y => collision.isVoxelSolid(e.ix + dx, y, e.iz + dz) && !collision.isVoxelSolid(e.ix + dx, y + 1, e.iz + dz)))
                        .filter((y): y is number => y !== undefined);
                    const plateau = neighboringTops.includes(top), stepped = neighboringTops.length > 1 && Math.max(...neighboringTops) - Math.min(...neighboringTops) >= 1;
                    if (plateau || stepped) {
                        removedInChunk++; removedFromCandidate++;
                        const x = meta.gridBounds.min[0] + (e.ix + .5) * r, z = meta.gridBounds.min[2] + (e.iz + .5) * r;
                        const y = meta.gridBounds.min[1] + (top + 1) * r, target = surfaceHeight(surface, x, z), corrected = y + (e.after ? 1 : -1) * r;
                        removedImprovement += Math.abs(target - y) - Math.abs(target - corrected); return false;
                    }
                    e.candidateId = candidate.id; return true;
                });
                if (removedFromCandidate) {
                    candidate.reasons = [...new Set([...candidate.reasons, 'coherent-platform-or-step'])].sort();
                    candidate.residualAfter += removedImprovement / candidate.pointCount;
                    if (!candidate.edits.length) candidate.status = 'protected';
                }
                for (const edit of candidate.edits) {
                    if (!beforeKeys.has(editKey(edit))) throw Error('Migration introduced a voxel edit');
                    uniqueAfter.add(editKey(edit));
                }
                if (candidate.status === 'proposed') proposed++;
                if (candidate.status === 'protected') protectedCount++;
                if (candidate.status === 'unknown') unknownCandidates++;
                editsAfter += candidate.edits.length;
            }
            removedEdits += removedInChunk;
            review.protectionVersion = 2; review.analysisHash = analysisHash;
            (review as any).migration = { kind: log.kind, migrationHash, previousReportHash: sha(bytes), removedEdits: removedInChunk };
            const afterHash = sha(JSON.stringify(review)), record = log.files.find((v: any) => v.file === chunk.file);
            const next = { file: chunk.file, beforeHash: sha(bytes), afterHash, removedEdits: removedInChunk, state: 'prepared' };
            if (record && (record.beforeHash !== next.beforeHash || record.afterHash !== next.afterHash)) throw Error('Resumed transformation differs');
            const current = resolve(output, chunk.file), currentHash = sha(readFileSync(current));
            if (currentHash !== next.beforeHash && currentHash !== next.afterHash) throw Error('Prepared chunk differs from both recorded hashes');
            if (currentHash !== next.afterHash) {
                if (record) Object.assign(record, next); else log.files.push(next);
                resources.writeJsonAtomic(logFile, log);
                options.onCheckpoint?.('prepared', sceneId, chunk.file);
                if (resources.writeJsonAtomic(current, review) !== afterHash) throw Error('Report hash mismatch');
                options.onCheckpoint?.('replaced', sceneId, chunk.file);
            } else if (!record) throw Error('Unlogged migrated report');
            (record ?? next).state = 'finished'; resources.writeJsonAtomic(logFile, log);
        }
        verifySource(coverage.sourceFile, sourceHash);
        if (sha(readFileSync(resolve(input, 'coverage.json'))) !== sourceManifest.originalCoverageHash) throw Error('Original coverage changed during migration');
        for (const item of frozenFiles) if (sha(readFileSync(safeChild(input, item.file))) !== item.hash) throw Error('Original report changed during migration');
        if (groundAnalysisHash() !== analysisHash) throw Error('Analysis code changed during migration; preserve this incomplete copy');
        if (editsBefore - editsAfter !== removedEdits) throw Error('Migration edit accounting differs');
        coverage.protectionVersion = 2; coverage.analysisHash = analysisHash;
        coverage.proposedCandidateCount = proposed; coverage.protectedCandidateCount = protectedCount;
        coverage.detectorParameters.coherentPlateauMinNeighbors = 1; coverage.detectorParameters.coherentPlateauNeighborhood = 8;
        coverage.migration = { kind: log.kind, migrationHash, previousAnalysisHash: log.originalAnalysisHash, removedEdits, originalReportsManifestHash: log.originalReportsManifestHash };
        log.outputCoverageHash = resources.writeJsonAtomic(resolve(output, 'coverage.json'), coverage);
        options.onCheckpoint?.('coverage', sceneId);
        log.after = { chunks: coverage.chunks, proposed, protected: protectedCount, unknownCandidates, proposedVoxelEdits: editsAfter,
            uniqueProposedVoxelEdits: uniqueAfter.size, originalVoxelEditReferences: editsBefore, originalUniqueVoxelEdits: uniqueBefore.size,
            removedVoxelEditReferences: removedEdits, emptyLegacyProposals, unknownSpanCount: coverage.unknownSpanCount, acceptedCandidateCount: 0, addedVoxelEdits: 0 };
        log.complete = true; resources.writeJsonAtomic(logFile, log, { recovery: true });
        results.push({ sceneId, alreadyComplete: false, ...log.after, sourceHash, analysisHash, output });
    }
    return results;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2), option = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
    const resources = createOfflineResources(offlineResourceOptions(args));
    const results = migrateGroundReviews({ inputRoot: option('--input-root'), outputRoot: option('--output-root'), resources });
    console.log(JSON.stringify({ results, resources: resources.snapshot() }));
}
