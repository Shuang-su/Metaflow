/** UNACCEPTED report migration; reuse detected planes, never rerun Open3D or edit collision. */
import { readFileSync,writeFileSync,renameSync,statfsSync,existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VoxelCollision } from '../../metaflow-viewer/src/collision/voxel-collision';
import { surfaceIdentity,surfaceHeight } from '../../metaflow-viewer/src/navigation/layers';
import type { GroundReview } from '../src/ground/types';
const here=dirname(fileURLToPath(import.meta.url)),root='/Volumes/Prism/Metaflow/.codex-work/cache/mf97-navigation/ground';
const sha=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const analysisHash=sha(['ground-analysis.ts','ground-detect.py','../src/ground/spans.ts','../src/ground/review.ts',
    '../../metaflow-viewer/src/navigation/layers.ts'].map(f=>sha(readFileSync(resolve(here,f)))).join(':'));
const migrationHash=sha(readFileSync(fileURLToPath(import.meta.url)));
// This finite migration is for the two completed, audited pre-protection reports only.
const supportedOriginalAnalysisHash='b595d2a99dd4966ea755ccfb08b176ad3516084eba8394a60fbcea21cf8e0262';
function save(file:string,data:unknown){const text=JSON.stringify(data),free=statfsSync(dirname(file));
    if(free.bavail*free.bsize-Buffer.byteLength(text)<10*1024**3)throw Error('Migration reserve below 10 GiB; prepared/finished chunks remain in migration-log.json');
    if(process.memoryUsage().rss>1.5*1024**3)throw Error('Migration RSS exceeds 1.5 GiB; resume information preserved');
    writeFileSync(file+'.next',text);renameSync(file+'.next',file);return sha(text);}
for(const sceneId of ['apms-2026','sdi-2026']){
    const folder=resolve(root,sceneId),coverageFile=resolve(folder,'coverage.json'),coverageBytes=readFileSync(coverageFile),coverage=JSON.parse(coverageBytes.toString());
    if(coverage.acceptedCandidateCount!==0 || !coverage.completeCoverage)throw Error('Only complete unaccepted proposals may migrate');
    const json=readFileSync(coverage.sourceFile),meta=JSON.parse(json.toString()),bin=readFileSync(coverage.sourceFile.replace(/\.json$/,'.bin'));
    const sourceHash=sha(json)+':'+sha(bin);if(sourceHash!==coverage.sourceHash)throw Error('Original source changed');
    const words=new Uint32Array(bin.buffer,bin.byteOffset,bin.byteLength/4),n=meta.nodeWordCount??meta.nodeCount,collision=new VoxelCollision(meta,words.subarray(0,n),words.subarray(n));
    const logFile=resolve(folder,'migration-log.json');
    const log:any=existsSync(logFile)?JSON.parse(readFileSync(logFile,'utf8')):{version:1,kind:'namespace-and-coherent-plateau-protection',sceneId,sourceHash,sourceModified:false,acceptedCandidateCount:0,
        originalCoverageHash:sha(coverageBytes),originalAnalysisHash:coverage.analysisHash,analysisHash,migrationHash,reranOpen3D:false,
        before:{proposed:coverage.proposedCandidateCount,protected:coverage.protectedCandidateCount},removedEdits:0,files:[],complete:false};
    if(log.originalAnalysisHash!==supportedOriginalAnalysisHash)throw Error('Unknown original analysis fingerprint; migration refused');
    if(log.sourceHash!==sourceHash||log.analysisHash!==analysisHash||log.migrationHash!==migrationHash)throw Error('Migration source/algorithm changed; preserve previous log');
    if(log.complete){
        if(sha(coverageBytes)!==log.outputCoverageHash)throw Error('Completed coverage changed');
        console.log(JSON.stringify({sceneId,alreadyComplete:true,...log.after}));continue;
    }
    if(coverage.migration&&coverage.migration.migrationHash!==migrationHash)throw Error('Different migration exists');
    save(logFile,log);
    let proposed=0,protectedCount=0,editsAfter=0;
    for(const chunk of coverage.inventory){
        const file=resolve(folder,chunk.file),bytes=readFileSync(file),record=log.files.find((v:any)=>v.file===chunk.file);
        if(record&&sha(bytes)===record.afterHash){
            record.state='finished';save(logFile,log);
            proposed+=record.proposed;protectedCount+=record.protected;editsAfter+=record.editsAfter;continue;
        }
        if(record&&sha(bytes)!==record.beforeHash)throw Error('Prepared chunk differs from both recorded hashes');
        const review=JSON.parse(bytes.toString()) as GroundReview;
        if(review.sourceHash!==sourceHash||review.analysisHash!==log.originalAnalysisHash)throw Error('Chunk source/original algorithm mismatch');
        if(review.coordinateSpace!=='world')throw Error('This migration supports only the two world-coordinate exhibition reports');
        let removedInChunk=0;
        for(const c of review.candidates){
            const oldId=c.id,layerMatch=c.surface.layerId.match(/:layer:(-?\d+)$/);if(!layerMatch)throw Error('Unknown old layer namespace');
            const surface=surfaceIdentity(sceneId,Number(layerMatch[1])*.5,c.surface.footprint,c.surface.plane),suffix=oldId.split(':patch:')[1];
            c.surface=surface;c.id=`${surface.id}:patch:${suffix}`;
            let removedImprovement=0,removedFromCandidate=0;const r=review.voxelResolution;
            c.edits=c.edits.filter(e=>{
                if(collision.isVoxelSolid(e.ix,e.iy,e.iz)!==e.before)throw Error('Before mask mismatch during protection migration');
                const top=e.after?e.iy-1:e.iy;
                const neighboringTops=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].map(([dx,dz])=>
                    [-2,-1,0,1,2].map(dy=>top+dy).find(y=>collision.isVoxelSolid(e.ix+dx,y,e.iz+dz)&&!collision.isVoxelSolid(e.ix+dx,y+1,e.iz+dz)))
                    .filter((y):y is number=>y!==undefined);
                const plateau=neighboringTops.includes(top),stepped=neighboringTops.length>1&&Math.max(...neighboringTops)-Math.min(...neighboringTops)>=1;
                if(plateau||stepped){
                    removedInChunk++;removedFromCandidate++;const x=meta.gridBounds.min[0]+(e.ix+.5)*r,z=meta.gridBounds.min[2]+(e.iz+.5)*r,
                        y=meta.gridBounds.min[1]+(top+1)*r,target=surfaceHeight(surface,x,z),corrected=y+(e.after?1:-1)*r;
                    removedImprovement+=Math.abs(target-y)-Math.abs(target-corrected);return false;
                }
                e.candidateId=c.id;return true;
            });
            if(removedFromCandidate){c.reasons=[...new Set([...c.reasons,'coherent-platform-or-step'])].sort();
                c.residualAfter+=removedImprovement/c.pointCount;if(!c.edits.length)c.status='protected';}
            if(c.status==='proposed')proposed++;if(c.status==='protected')protectedCount++;editsAfter+=c.edits.length;
        }
        review.protectionVersion=2;review.analysisHash=analysisHash;(review as any).migration={kind:log.kind,migrationHash,previousReportHash:sha(bytes),removedEdits:removedInChunk};
        const afterHash=sha(JSON.stringify(review)),next={file:chunk.file,beforeHash:sha(bytes),afterHash,removedEdits:removedInChunk,
            proposed:review.candidates.filter(c=>c.status==='proposed').length,protected:review.candidates.filter(c=>c.status==='protected').length,
            editsAfter:review.candidates.reduce((n,c)=>n+c.edits.length,0),state:'prepared'};
        if(record){if(record.afterHash!==afterHash)throw Error('Resumed transformation differs');Object.assign(record,next);}
        else log.files.push(next);
        log.removedEdits=log.files.reduce((n:number,v:any)=>n+v.removedEdits,0);save(logFile,log);
        // Both hashes are durable before the atomic replacement, including an interruption here.
        if(save(file,review)!==afterHash)throw Error('Report hash mismatch');
        (record??next).state='finished';save(logFile,log);
    }
    if(sha(readFileSync(coverage.sourceFile))+':'+sha(readFileSync(coverage.sourceFile.replace(/\.json$/,'.bin')))!==sourceHash)throw Error('Original changed during migration');
    coverage.protectionVersion=2;coverage.analysisHash=analysisHash;coverage.proposedCandidateCount=proposed;coverage.protectedCandidateCount=protectedCount;
    coverage.detectorParameters.coherentPlateauMinNeighbors=1;coverage.detectorParameters.coherentPlateauNeighborhood=8;
    coverage.migration={kind:log.kind,migrationHash,previousAnalysisHash:log.originalAnalysisHash,removedEdits:log.removedEdits};
    log.outputCoverageHash=save(coverageFile,coverage);log.after={proposed,protected:protectedCount,proposedVoxelEdits:editsAfter};log.complete=true;save(logFile,log);
    console.log(JSON.stringify({...log,files:undefined}));
}
