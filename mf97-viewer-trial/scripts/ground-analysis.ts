import { readFileSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { VoxelCollision, FlippedVoxelCollision } from '../../metaflow-viewer/src/collision/voxel-collision';
import { extractSpans, worldBounds, type VoxelSource } from '../src/ground/spans';
import { proposeGround, acceptedEdits } from '../src/ground/review';
import { patchedCollision } from '../src/ground/overlay';
import type { PlanePatch, GroundReview, GroundDecisions, GroundBounds } from '../src/ground/types';
import { createOfflineResources, offlineResourceOptions } from '../src/offline-resources';
import { groundAnalysisHash } from '../src/ground-analysis-fingerprint';

const here=dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2), arg=(name:string,fallback?:string)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const resourceBudget=createOfflineResources(offlineResourceOptions(args));
const output=resourceBudget.resolveOutput(arg('--output','ground-analysis')!);
let written=0;
function resources(){
    resourceBudget.assertCapacity(0,'ground analysis');
}
function save(file:string,data:unknown){resources();const text=JSON.stringify(data);resourceBudget.writeFileAtomic(file,text,{replace:false});written+=Buffer.byteLength(text);}
const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const analysisHash=groundAnalysisHash();
const detectorParameters={normalVarianceThresholdDeg:30,coplanarityDeg:75,outlierRatio:.65,minPlaneEdgeLength:.4,minNumPoints:20,
    normalRadius:.45,normalMaxNeighbors:30,searchNeighbors:30,maxCorrectionSourceVoxels:1,minClearance:1.7,minPatchArea:4,coherentPlateauMinNeighbors:1,coherentPlateauNeighborhood:8};
function load(file:string,flipXY=false){
    const json=readFileSync(file),meta=JSON.parse(json.toString()),bin=readFileSync(file.replace(/\.json$/,'.bin'));
    const words=new Uint32Array(bin.buffer,bin.byteOffset,bin.byteLength/4),c=meta.nodeWordCount??meta.nodeCount;
    if((c+meta.leafDataCount)*4!==bin.byteLength)throw Error('Voxel binary length mismatch');
    const C=flipXY?FlippedVoxelCollision:VoxelCollision;
    const source:VoxelSource={collision:new C(meta,words.subarray(0,c),words.subarray(c)),min:meta.gridBounds.min,max:meta.gridBounds.max,flipXY};
    return{source,meta,sourceHash:hash(json)+':'+hash(bin)};
}

class Detector {
    private child; private pending: {resolve:(p:PlanePatch[])=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>} | null=null;
    constructor(){
        const python=arg('--python',process.env.MF97_GROUND_PYTHON);
        if(!python || !existsSync(python))throw Error('Provide --python or MF97_GROUND_PYTHON pointing to the verified restored Open3D environment');
        this.child=spawn(python,[resolve(here,'ground-detect.py')],{env:{...process.env,OPEN3D_DISABLE_WEB_VISUALIZER:'true',OMP_NUM_THREADS:'2',
            MPLCONFIGDIR:resourceBudget.resolveOutput('matplotlib')},stdio:['pipe','pipe','pipe']});
        this.child.stderr.on('data',b=>process.stderr.write(b));
        createInterface({input:this.child.stdout}).on('line',line=>{
            const p=this.pending;if(!p)return;clearTimeout(p.timer);this.pending=null;
            try{const result=JSON.parse(line);if(result.error)throw Error(result.error);p.resolve(result.patches);}catch(e){p.reject(e as Error);}
        });
        this.child.on('error',e=>this.fail(e));this.child.on('exit',code=>{if(this.pending)this.fail(Error(`Open3D exited ${code}`));});
    }
    private fail(e:Error){if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(e);this.pending=null;}}
    detect(points:number[][],voxelResolution:number):Promise<PlanePatch[]>{
        if(this.pending)throw Error('Open3D chunks must run serially');
        return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.child.kill();this.fail(Error('Open3D chunk timeout'));},60000);
            this.pending={resolve,reject,timer};this.child.stdin.write(JSON.stringify({points,voxelResolution})+'\n');});
    }
    close(){this.child.stdin.end();}
}

async function analyze(){
    const sceneId=arg('--scene','apms-2026')!;
    const scenes=JSON.parse(readFileSync(resolve(here,'../../mf79-viewer-trial/scene-exhibitions.json'),'utf8')).scenes;
    const scene=scenes.find((s:any)=>s.id===sceneId);if(!scene)throw Error('Unknown exhibition');
    const file=resolve('/Volumes/Prism_初号機/3D高斯',scene.collisionUrl.replace('/scene-assets/',''));
    const loaded=load(file),{source,sourceHash}=loaded,bounds=worldBounds(source);
    const cell=Number(arg('--cell-size','8')),limit=Number(arg('--limit','Infinity'));
    if(!Number.isFinite(cell)||cell<2||cell>8)throw Error('Ground chunk size must be 2..8m');
    const folder=resolve(output,sceneId);
    const haloSize=Math.ceil(1.04/source.collision.voxelResolution)*source.collision.voxelResolution;
    const coverageFile=resolve(folder,'coverage.json');
    if(existsSync(coverageFile) && !args.includes('--resume'))throw Error('Existing analysis requires explicit --resume or an independent output directory');
    const previous=args.includes('--resume') && existsSync(coverageFile)?JSON.parse(readFileSync(coverageFile,'utf8')):null;
    if(previous && (previous.sourceHash!==sourceHash || previous.analysisHash!==analysisHash || previous.cellSize!==cell || previous.haloSize!==haloSize))throw Error('Resume source/algorithm/parameters mismatch');
    const inventory:any[]=previous?.inventory??[];let totalSpans=previous?.totalSpans??0,unknown=previous?.unknownSpanCount??0,
        proposed=previous?.proposedCandidateCount??0,protectedCount=previous?.protectedCandidateCount??0,columns=previous?.columns??0,
        index=inventory.length,cursor=0,stop=false,failure:string|undefined;
    const persist=(completeCoverage:boolean,error?:string)=>{
        const summary={version:1,protectionVersion:2,sceneId,sourceFile:file,sourceHash,analysisHash,detector:'Open3D-0.19.0.detect_planar_patches',detectorParameters,bounds,cellSize:cell,haloSize,
            completeCoverage,chunks:index,columns,totalSpans,unknownSpanCount:unknown,proposedCandidateCount:proposed,protectedCandidateCount:protectedCount,
            acceptedCandidateCount:0,sourceModified:false,bytes:written,error,nextChunk:index,
            countSemantics:'span/column observations include halo overlap; inventory core bounds establish whole coverage',inventory};
        resourceBudget.writeJsonAtomic(coverageFile,summary,{recovery:true});return summary;
    };
    const detector=new Detector();
    persist(false);
    try{
        for(let x=bounds.min.x;x<bounds.max.x && !stop;x+=cell)for(let z=bounds.min.z;z<bounds.max.z;z+=cell){
            if(cursor++<inventory.length)continue;
            if(index>=limit){stop=true;break;}resources();
            const b:GroundBounds={min:{x,y:bounds.min.y,z},max:{x:Math.min(x+cell,bounds.max.x),y:bounds.max.y,z:Math.min(z+cell,bounds.max.z)}};
            // Approved Plan: 8 m core with a source-grid-aligned 1.04 m halo.
            const halo={min:{x:b.min.x-haloSize,y:b.min.y,z:b.min.z-haloSize},
                max:{x:b.max.x+haloSize,y:b.max.y,z:b.max.z+haloSize}};
            const extracted=extractSpans(source,halo),patches=await detector.detect(extracted.spans.map(s=>[s.x,s.y,s.z]),source.collision.voxelResolution);
            const result=proposeGround(source,extracted.spans,patches,sceneId);
            for(const c of result.candidates){c.edits=c.edits.filter(e=>{const rawX=source.min[0]+(e.ix+.5)*source.collision.voxelResolution;
                const wx=source.flipXY?-rawX:rawX,wz=source.min[2]+(e.iz+.5)*source.collision.voxelResolution;
                return wx>=b.min.x&&wx<b.max.x&&wz>=b.min.z&&wz<b.max.z;});
                if(c.status==='proposed' && !c.edits.length){c.status='unknown';c.reasons=[...new Set([...c.reasons,'no-voxel-edits-in-core'])].sort();}}
            const review:GroundReview={version:1,sourceHash,detector:'Open3D-0.19.0.detect_planar_patches',coordinateSpace:'world',
                voxelResolution:source.collision.voxelResolution,...result,scannedColumnCount:extracted.columns,completeCoverage:true,
                sourceFile:file,coverageScope:'chunk',analysisHash,
                gridBounds:{min:source.min,max:source.max},
                previewPoints:extracted.spans.filter((_,i)=>i%Math.max(1,Math.ceil(extracted.spans.length/256))===0).map(s=>({x:s.x,y:s.y,z:s.z}))};
            const name=`chunk-${String(index).padStart(5,'0')}.review.json`;save(resolve(folder,name),review);
            columns+=extracted.columns;totalSpans+=extracted.spans.length;unknown+=result.unknownSpanCount;
            proposed+=result.candidates.filter(c=>c.status==='proposed').length;protectedCount+=result.candidates.filter(c=>c.status==='protected').length;
            inventory.push({index,bounds:b,spanCount:extracted.spans.length,planeCount:patches.length,file:name});index++;
            persist(false);
            if(index%25===0)console.log(JSON.stringify({sceneId,chunks:index,proposed,protectedCount,unknown,bytes:written}));
        }
    }catch(e){failure=(e as Error).message;stop=true;persist(false,failure);}finally{detector.close();}
    if(load(file).sourceHash!==sourceHash){failure='Original source changed during analysis';stop=true;}
    const summary=persist(!stop,failure);console.log(JSON.stringify({...summary,inventory:undefined}));
    if(failure)process.exitCode=1;
}

function dayun(){
    const base='/Volumes/Prism/Metaflow/data/Shenzhen/250917 Dayun/tiled-voxel',file=resolve(base,'voxel-tiles.json');
    const manifestBytes=readFileSync(file),manifest=JSON.parse(manifestBytes.toString());
    let bytes=0;const tiles=manifest.tiles.map((t:any)=>{
        const f=resolve(base,t.url),json=readFileSync(f),m=JSON.parse(json.toString()),binary=f.replace(/\.json$/,'.bin');
        const actualBytes=statSync(binary).size,expectedBytes=((m.nodeWordCount??m.nodeCount)+m.leafDataCount)*4;
        if(actualBytes!==expectedBytes)throw Error(`Corrupt tile ${t.id}`);bytes+=actualBytes;
        return{id:t.id,metadataHash:hash(json),binaryBytes:actualBytes,gridBounds:m.gridBounds,coreBounds:t.coreBounds,dataBounds:t.dataBounds};
    });
    const samples=['x13_z8','x13_z9','x13_z7','x10_z20'].map(id=>{
        const {source}=load(resolve(base,`tiles/${id}/walk.voxel.json`),true),extracted=extractSpans(source,worldBounds(source),25,1.76);
        const cols=new Map<string,number[]>();for(const s of extracted.spans){const k=`${s.ix},${s.iz}`;if(!cols.has(k))cols.set(k,[]);cols.get(k)!.push(s.y);}
        const multi=[...cols].filter(([,ys])=>Math.max(...ys)-Math.min(...ys)>2);
        return{id,columns:extracted.columns,supportSpanCount:extracted.spans.length,multiSurfaceColumns:multi.length,
            examples:multi.slice(0,5),interpretation:'geometry-candidate-only; walkability and stair connections require review'};
    });
    const result={version:1,asset:'dayun',manifestHash:hash(manifestBytes),completeStreamInventory:true,tileCount:tiles.length,binaryBytes:bytes,
        coordinateSpace:'metaflow-rz180',voxelResolution:manifest.voxelResolution,fullBounds:manifest.fullBounds,tiles,samples,sourceModified:false};
    save(resolve(output,'dayun-inventory.json'),result);console.log(JSON.stringify({...result,tiles:undefined}));
}

resources();
if(args.includes('--dayun-inventory'))dayun();
else if(args.includes('--review')){
    const file=arg('--review')!,decisions=JSON.parse(readFileSync(arg('--decisions')!,'utf8')) as GroundDecisions;
    const files=statSync(file).isDirectory()?JSON.parse(readFileSync(resolve(file,'coverage.json'),'utf8')).inventory.map((c:any)=>resolve(file,c.file)):[file];
    const reviews:GroundReview[]=files.map((f:string)=>JSON.parse(readFileSync(f,'utf8')) as GroundReview),first=reviews[0];
    if(!first?.sourceFile)throw Error('A sourceFile is required to verify the original source');
    if(first.analysisHash!==analysisHash || reviews.some(r=>r.analysisHash!==analysisHash))throw Error('Current analysis fingerprint is required');
    const loaded=load(arg('--source',first.sourceFile)!,first.coordinateSpace==='metaflow-rz180');
    if(loaded.sourceHash!==first.sourceHash || decisions.sourceHash!==first.sourceHash)throw Error('Original source fingerprint changed');
    const all=new Set(reviews.flatMap((r:GroundReview)=>r.candidates.map(c=>c.id)));
    for(const id of [...decisions.acceptedCandidateIds,...decisions.rejectedCandidateIds])if(!all.has(id))throw Error(`Unknown candidate ${id}`);
    const edits=reviews.flatMap((review:GroundReview)=>acceptedEdits(review,{...decisions,
        acceptedCandidateIds:decisions.acceptedCandidateIds.filter(id=>review.candidates.some(c=>c.id===id)),
        rejectedCandidateIds:decisions.rejectedCandidateIds.filter(id=>review.candidates.some(c=>c.id===id))}));
    patchedCollision(loaded.source.collision,loaded.meta,edits); // Checks every original before mask and overlapping candidate conflicts.
    const confirmed=load(arg('--source',first.sourceFile)!,first.coordinateSpace==='metaflow-rz180');
    if(confirmed.sourceHash!==first.sourceHash)throw Error('Original source changed during review export');
    save(resolve(output,`accepted.${hash(readFileSync(arg('--decisions')!)).slice(0,24)}.patch.json`),{version:1,protectionVersion:2,sourceHash:first.sourceHash,analysisHash:first.analysisHash,
        decisionHash:hash(readFileSync(arg('--decisions')!)),coordinateSpace:first.coordinateSpace,edits,nativeValidation:'pending',sourceModified:false});
    console.log(JSON.stringify({acceptedEdits:edits.length,sourceModified:false}));
}else await analyze();
