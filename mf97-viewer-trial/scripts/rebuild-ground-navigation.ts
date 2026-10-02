/** Rebuild only navigation whose geometry/support halo intersects accepted bits.
 * Every reused tile retains the hash and provenance of its complete original cache. */
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { init, exportNavMesh, getNavMeshPositionsAndIndices } from 'recast-navigation';
import { createOfflineResources, offlineResourceOptions } from '../src/offline-resources';
import { VoxelCollision } from '../../metaflow-viewer/src/collision/voxel-collision';
import { RecastTileBuilder, navigationTiles } from '../../mf79-viewer-trial/src/tiles';
import { exposedVoxelMesh } from '../../mf79-viewer-trial/src/voxel-mesh';
import { BODY, stand } from '../../mf79-viewer-trial/src/native-motion';
import { RECAST_CONFIG } from '../../mf79-viewer-trial/src/recast-config';
import { acceptedEdits } from '../src/ground/review';
import { groundAnalysisHash } from '../src/ground-analysis-fingerprint';
import { sha } from './gaussian-map-offline';
import type { SparseEdit } from '../src/ground/types';
import type { Point } from '../../mf79-viewer-trial/src/types';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const overlap = (a: string, b: string) => a === b || a.startsWith(b + sep) || b.startsWith(a + sep);
function physical(path: string) {
    let ancestor = path;
    while (!existsSync(ancestor)) ancestor = dirname(ancestor);
    return resolve(realpathSync(ancestor), relative(ancestor, path));
}
const nativeFiles = ['../scripts/real-patch-validate.ts', '../../metaflow-viewer/src/cameras/walk-controller.ts', '../../metaflow-viewer/src/collision/voxel-collision.ts', '../../mf79-viewer-trial/src/native-motion.ts'];
const implementationFiles = [fileURLToPath(import.meta.url), ...['../../mf79-viewer-trial/src/tiles.ts', '../../mf79-viewer-trial/src/recast-tile.ts', '../../mf79-viewer-trial/src/voxel-mesh.ts', '../../mf79-viewer-trial/src/native-motion.ts', '../../mf79-viewer-trial/src/recast-config.ts'].map(p => resolve(import.meta.dirname, p))];
const sortedEdits = (edits: SparseEdit[]) => edits.map(e => [e.ix,e.iy,e.iz,e.before,e.after,e.candidateId]).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
export const affectedByEdits = (tile: { bounds: { min: Point; max: Point } }, centers: Point[], resolution: number) => {
    const margin = (RECAST_CONFIG.walkableRadius + 3) * RECAST_CONFIG.cs + resolution * 1.5;
    return centers.some(p => p.x >= tile.bounds.min.x - margin && p.x <= tile.bounds.max.x + margin && p.z >= tile.bounds.min.z - margin && p.z <= tile.bounds.max.z + margin);
};
export type RebuildOptions = {
    artifact: string; review: string; decisions: string; original: string; nativeValidation: string;
    output?: string; resources: ReturnType<typeof createOfflineResources>;
};
/** Source proof and all path checks finish before any output or Recast allocation. */
export function prepareGroundNavigation(options: RebuildOptions) {
    const frozen = new Map<string,string>(), bindings = new Map<string,string>();
    const read = (path: string) => { const file = realpathSync(path), bytes = readFileSync(file); frozen.set(file, sha(bytes)); bindings.set(resolve(path),file); return bytes; };
    const parse = (file: string) => JSON.parse(read(file).toString());
    const artifact = realpathSync(options.artifact), original = realpathSync(options.original);
    const materialFile = resolve(artifact,'materialization.json'), material = parse(materialFile);
    const validation = parse(options.nativeValidation), originalManifestFile = resolve(original,'manifest.json'), old = parse(originalManifestFile);
    const review = parse(options.review), decisions = parse(options.decisions);
    const json = read(resolve(artifact,'walk.voxel.json')), binary = read(resolve(artifact,'walk.voxel.bin')), meta = JSON.parse(json.toString());
    const sourceJson = read(material.sourceFile), sourceBin = read(material.sourceFile.replace(/\.json$/,'.bin')), sourceMeta = JSON.parse(sourceJson.toString());
    const sourceHash = `${sha(sourceJson)}:${sha(sourceBin)}`, outputHash = `${sha(json)}:${sha(binary)}`;
    if (!material.complete || material.protectionVersion !== 2 || material.coordinateSpace !== 'world' || sourceHash !== material.sourceHash || outputHash !== material.outputHash ||
        material.analysisHash !== groundAnalysisHash() || sha(read(options.decisions)) !== material.decisionHash || review.sourceFile !== material.sourceFile || review.sourceHash !== sourceHash || review.analysisHash !== material.analysisHash || review.coordinateSpace !== 'world') throw Error('Accepted/source/current analysis identity mismatch');
    if (validation.nativePassed !== true || validation.nativeCrossingPassed !== true || validation.nativeIncomplete !== false || validation.outputHash !== outputHash || validation.sourceHash !== sourceHash || validation.materializationHash !== sha(read(materialFile)) ||
        validation.decisionHash !== material.decisionHash || validation.analysisHash !== material.analysisHash || validation.reviewHash !== sha(read(options.review)) ||
        validation.difference?.completeTreeCompared !== true || !validation.native?.length || validation.native.some((n: any) => n.passed !== true || n.cases?.length !== 9 || n.cases.some((c: any) => c.passed !== true || !c.deterministicRepeat))) throw Error('Native validation is not bound to these complete accepted inputs');
    const expectedImplementation = nativeFiles.map(p => { const file = resolve(import.meta.dirname,p); return { file, sha256: sha(read(file)) }; });
    if (!same(validation.implementation, expectedImplementation)) throw Error('Native validation implementation changed; rerun validation');
    const edits = acceptedEdits(review, decisions);
    if (!edits.length || edits.length !== material.validation.changedVoxelCount || validation.difference.changedVoxelCount !== edits.length || !same(sortedEdits(validation.difference.changed), sortedEdits(edits))) throw Error('Full-tree changed bit set differs from accepted edits');
    if (!same(meta.gridBounds, sourceMeta.gridBounds) || meta.voxelResolution !== sourceMeta.voxelResolution || meta.treeDepth !== sourceMeta.treeDepth || !same(old.meta, sourceMeta)) throw Error('Original/materialized collision lattice differs');
    const bounds = { min: { x: meta.gridBounds.min[0], y: meta.gridBounds.min[1], z: meta.gridBounds.min[2] }, max: { x: meta.gridBounds.max[0], y: meta.gridBounds.max[1], z: meta.gridBounds.max[2] } };
    if (old.status !== 'complete' || old.fingerprint !== sha(JSON.stringify(old.key)) || old.sourceHash !== sourceHash || old.key.sourceHash !== sourceHash ||
        old.key.generator !== 'native-v1-integer-xyz' || !same(old.bounds,bounds) || !same(old.key.bounds,bounds) || !same(old.body,BODY) || !same(old.key.body,BODY) ||
        !same(old.key.config,RECAST_CONFIG) || old.key.controllerHash !== expectedImplementation[1].sha256 || old.key.tileCells !== 512) throw Error('Original navigation/configuration/controller provenance differs');
    if (sha(read(resolve(original,'collision.bin'))) !== sha(sourceBin) || old.collisionHash !== sha(sourceBin)) throw Error('Original navigation collision differs');
    const expectedTiles = navigationTiles(bounds, RECAST_CONFIG.cs, old.key.tileCells);
    if (!Array.isArray(old.tiles) || old.tiles.length !== expectedTiles.length) throw Error('Original navigation tile coverage differs');
    old.tiles.forEach((tile: any, index: number) => {
        const expected = expectedTiles[index];
        if (tile.name !== `tile-${expected.x}-${expected.z}` || tile.x !== expected.x || tile.z !== expected.z || !same(tile.bounds,expected.bounds) || !(tile.hash === null || /^[a-f0-9]{64}$/.test(tile.hash))) throw Error('Original tile inventory differs');
        if (tile.hash && sha(read(resolve(original,tile.name+'.bin'))) !== tile.hash) throw Error('Original nav tile changed');
    });
    const centers = edits.map(e => ({ x:meta.gridBounds.min[0]+(e.ix+.5)*meta.voxelResolution, y:meta.gridBounds.min[1]+(e.iy+.5)*meta.voxelResolution, z:meta.gridBounds.min[2]+(e.iz+.5)*meta.voxelResolution }));
    const implementation = implementationFiles.map(file => ({ file,sha256:sha(read(file)) }));
    const key = { ...old.key, sourceHash:outputHash, generator:'mf97-accepted-voxel-tiles-v2', originalManifestHash:sha(read(originalManifestFile)), materializationHash:sha(read(materialFile)), nativeValidationHash:sha(read(options.nativeValidation)), implementation };
    const fingerprint = sha(JSON.stringify(key));
    const output = physical(options.resources.resolveOutput(options.output ?? `navigation/${old.scene}-${fingerprint.slice(0,12)}`));
    const protectedPaths = [original, artifact, dirname(realpathSync(material.sourceFile)), ...frozen.keys()];
    const checkOutput = (name: string) => {
        const path = physical(options.resources.resolveOutput(resolve(output,name)));
        if (protectedPaths.some(source => overlap(path,source))) throw Error('Navigation output aliases original or validated input');
        return path;
    };
    if (protectedPaths.some(source => overlap(output,source))) throw Error('Navigation output must be independent of original and accepted inputs');
    for (const name of ['manifest.json','nav.bin','collision.bin','nav-positions.bin','nav-indices.bin', ...old.tiles.map((t:any) => t.name+'.bin')]) checkOutput(name);
    const assertInputsUnchanged = () => { for (const [logical,canonical] of bindings) if (realpathSync(logical) !== canonical) throw Error('Frozen navigation source alias changed'); for (const [path,hash] of frozen) if (sha(readFileSync(path)) !== hash) throw Error(`Frozen navigation input changed: ${path}`); };
    return { artifact, original, material, validation, old, meta, binary, bounds, centers, key, fingerprint, output, checkOutput, assertInputsUnchanged };
}
export function validateRebuildRecords(manifest: any, source: ReturnType<typeof prepareGroundNavigation>) {
    if (manifest.fingerprint !== source.fingerprint || !same(manifest.key,source.key) || manifest.sourceHash !== source.material.outputHash || !['building','failed','complete'].includes(manifest.status) || !Array.isArray(manifest.tiles)) throw Error('Different resumed navigation identity');
    if (manifest.tiles.some((record:any,index:number) => record.name !== source.old.tiles[index]?.name) || manifest.pending && manifest.pending.name !== source.old.tiles[manifest.tiles.length]?.name) throw Error('Resumed tile order/pending position differs');
    const names = new Set<string>();
    for (const record of [...manifest.tiles, ...(manifest.pending ? [manifest.pending] : [])]) {
        const tile = source.old.tiles.find((t:any) => t.name === record.name);
        const mode = tile && affectedByEdits(tile,source.centers,source.meta.voxelResolution) ? 'rebuilt-from-accepted-collision' : 'unchanged-geometry-halo-proved';
        if (!tile || names.has(record.name) || record.x !== tile.x || record.z !== tile.z || !same(record.bounds,tile.bounds) || record.sourceHash !== source.material.outputHash || record.mode !== mode || record.originalHash !== tile.hash ||
            !(record.hash === null || /^[a-f0-9]{64}$/.test(record.hash)) || !Number.isSafeInteger(record.bytes) || record.bytes < 0 || (!record.hash && record.bytes !== 0) || mode === 'unchanged-geometry-halo-proved' && record.hash !== tile.hash) throw Error('Resumed tile inventory/provenance differs');
        names.add(record.name);
    }
    if (manifest.status === 'complete' && (manifest.pending || manifest.tiles.length !== source.old.tiles.length)) throw Error('Completed navigation has missing or pending tiles');
}
export async function rebuildGroundNavigation(options: RebuildOptions) {
    const source = prepareGroundNavigation(options), { resources } = options, { meta,binary,bounds,old,key,fingerprint,output,checkOutput } = source;
    const file = checkOutput('manifest.json');
    let manifest:any = existsSync(file) ? JSON.parse(readFileSync(file,'utf8')) : { key,fingerprint,status:'building',tiles:[],sourceHash:source.material.outputHash,pending:null };
    validateRebuildRecords(manifest,source);
    const verifyTile = (record:any) => {
        if (!record.hash) return null;
        const bytes = readFileSync(checkOutput(record.name+'.bin'));
        if (sha(bytes) !== record.hash || bytes.length !== record.bytes) throw Error('Damaged resumed navigation tile');
        return bytes;
    };
    for (const record of manifest.tiles) verifyTile(record);
    if (manifest.status === 'complete') {
        for (const [name,hash] of [['nav.bin',manifest.navHash],['collision.bin',manifest.collisionHash],['nav-positions.bin',manifest.display.positionsHash],['nav-indices.bin',manifest.display.indicesHash]]) if (sha(readFileSync(checkOutput(name))) !== hash) throw Error('Damaged completed navigation output');
        if (manifest.collisionHash !== sha(binary)) throw Error('Completed collision does not match accepted binary');
        source.assertInputsUnchanged();
        return { output,navHash:manifest.navHash,sourceHash:source.material.outputHash,alreadyComplete:true };
    }
    resources.assertCapacity(64*1024**2,'incremental same-source navigation');
    const n=meta.nodeWordCount??meta.nodeCount;
    if (binary.byteLength !== (n+meta.leafDataCount)*4) throw Error('Invalid materialized binary length');
    const words=new Uint32Array(binary.buffer,binary.byteOffset,binary.byteLength/4);
    const collision=new VoxelCollision(meta,words.subarray(0,n),words.subarray(n));
    const space={collision,bounds,known:(x:number,y:number,z:number)=>[x,y,z].every((v,i)=>v>=meta.gridBounds.min[i]&&v<meta.gridBounds.max[i])};
    await init(); const builder=new RecastTileBuilder(bounds,RECAST_CONFIG,old.key.tileCells);
    const save=(recovery=false)=>resources.writeJsonAtomic(file,manifest,{recovery});
    try {
        manifest.status='building'; delete manifest.error; save();
        for(const tile of old.tiles){
            resources.assertCapacity(0,'navigation tile');
            const record=manifest.tiles.find((v:any)=>v.name===tile.name);
            if(record){const bytes=verifyTile(record);if(bytes)builder.add(bytes);continue;}
            if(manifest.pending?.name===tile.name){
                const pending=manifest.pending, path=checkOutput(tile.name+'.bin');
                if(!pending.hash || existsSync(path)){
                    const bytes=pending.hash?verifyTile(pending):null;if(bytes)builder.add(bytes);
                    manifest.tiles.push(pending);manifest.pending=null;save();continue;
                }
            }
            const affected=affectedByEdits(tile,source.centers,meta.voxelResolution);
            let data:Uint8Array|null=null,diagnostic={};
            if(affected){
                const halo=(RECAST_CONFIG.walkableRadius+3)*RECAST_CONFIG.cs,b=structuredClone(tile.bounds);b.min.x-=halo;b.min.z-=halo;b.max.x+=halo;b.max.z+=halo;
                const geometry=exposedVoxelMesh(space,b,bounds.min,meta.voxelResolution,{boundary:'source'});
                data=builder.build(geometry.positions,geometry.indices,tile,true,(x,y,z)=>!!stand(collision,{x,y,z}));diagnostic=builder.lastDiagnostic??{};
            }else if(tile.hash)data=readFileSync(resolve(source.original,tile.name+'.bin'));
            const next={name:tile.name,x:tile.x,z:tile.z,bounds:tile.bounds,hash:data?sha(data):null,bytes:data?.byteLength??0,sourceHash:source.material.outputHash,mode:affected?'rebuilt-from-accepted-collision':'unchanged-geometry-halo-proved',originalHash:tile.hash,...diagnostic};
            manifest.pending=next;save();
            if(data){resources.writeFileAtomic(checkOutput(tile.name+'.bin'),data,{replace:false});builder.add(data);}
            manifest.tiles.push(next);manifest.pending=null;save();
            console.log(tile.name,affected?'rebuilt':'unchanged');
        }
        const nav=exportNavMesh(builder.mesh),[positions,indices]=getNavMeshPositionsAndIndices(builder.mesh),p=new Float32Array(positions),i=new Uint32Array(indices);
        resources.writeFileAtomic(checkOutput('nav.bin'),nav,{replace:false});resources.writeFileAtomic(checkOutput('collision.bin'),binary,{replace:false});
        resources.writeFileAtomic(checkOutput('nav-positions.bin'),new Uint8Array(p.buffer),{replace:false});resources.writeFileAtomic(checkOutput('nav-indices.bin'),new Uint8Array(i.buffer),{replace:false});
        source.assertInputsUnchanged();
        Object.assign(manifest,{status:'complete',scene:old.scene,meta,bounds,body:BODY,sourceHash:source.material.outputHash,markerHash:old.markerHash,start:old.start,markers:old.markers,navHash:sha(nav),collisionHash:sha(binary),display:{positionsHash:sha(new Uint8Array(p.buffer)),indicesHash:sha(new Uint8Array(i.buffer))},provenance:{originalManifestHash:key.originalManifestHash,materialization:source.artifact,decisionHash:source.material.decisionHash,nativeValidationHash:key.nativeValidationHash,originalReportsModified:false,sourceModified:false},appliedToViewer:false});
        validateRebuildRecords(manifest,source);save();
        return {output,navHash:manifest.navHash,sourceHash:source.material.outputHash,rebuilt:manifest.tiles.filter((t:any)=>t.mode==='rebuilt-from-accepted-collision').length,reused:manifest.tiles.filter((t:any)=>t.mode==='unchanged-geometry-halo-proved').length};
    }catch(error){manifest.status='failed';manifest.error=String(error);try{save(true);}catch(recovery){throw new AggregateError([error,recovery],'Navigation rebuild and recovery record failed');}throw error;}
    finally{builder.destroy();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    const args=process.argv.slice(2),arg=(k:string)=>{const i=args.indexOf(k);return i<0?undefined:args[i+1]};
    const artifact=arg('--artifact'),review=arg('--review'),decisions=arg('--decisions'),original=arg('--original'),nativeValidation=arg('--native-validation');
    if(!artifact||!review||!decisions||!original||!nativeValidation)throw Error('--artifact --review --decisions --original --native-validation required');
    const options={artifact,review,decisions,original,nativeValidation,output:arg('--output'),resources:createOfflineResources(offlineResourceOptions(args))};
    if(args.includes('--check')){const s=prepareGroundNavigation(options);console.log(JSON.stringify({output:s.output,fingerprint:s.fingerprint,sourceHash:s.material.outputHash,tiles:s.old.tiles.length,affected:s.old.tiles.filter((t:any)=>affectedByEdits(t,s.centers,s.meta.voxelResolution)).map((t:any)=>t.name),writes:0}));}
    else console.log(JSON.stringify(await rebuildGroundNavigation(options)));
}
