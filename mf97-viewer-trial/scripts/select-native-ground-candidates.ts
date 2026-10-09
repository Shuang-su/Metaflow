import { loadAssetConfig, resolveAssetUrl, resolveRecordedPath } from "../../scripts/mf97/asset-config.mjs";
/** Read-only candidate shortlist; this command never writes a decision or collision asset. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VoxelCollision } from '../../metaflow-viewer/src/collision/voxel-collision';
import { BODY } from '../../mf79-viewer-trial/src/native-motion';
import { createOfflineResources, offlineResourceOptions } from '../src/offline-resources';
import { groundAnalysisHash } from '../src/ground-analysis-fingerprint';
import { compareNativeMotion } from './real-patch-validate';
import { sha } from './gaussian-map-offline';
const args=process.argv.slice(2),arg=(name:string)=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
const resources=createOfflineResources(offlineResourceOptions(args));
const cache = loadAssetConfig().roots.mapJobs;
const scenes=JSON.parse(readFileSync(resolve(import.meta.dirname,'../../mf79-viewer-trial/scene-exhibitions.json'),'utf8')).scenes;
const excluded=new Set(['apms-2026:layer:0:surface:77aa844b5314e44f:patch:9']);
const report:any={version:1,analysisHash:groundAnalysisHash(),implementation:{selector:sha(readFileSync(fileURLToPath(import.meta.url))),nativeValidator:sha(readFileSync(resolve(import.meta.dirname,'real-patch-validate.ts')))},selection:'Existing proposed single-bit isolated bumps on the entrance exhibition floor, native 5-ray radius .2m diagnostic, original-collider same-layer 0.4m traversal in four directions',acceptedByThisCommand:false,sourceModified:false,scenes:[],evaluated:[],shortlist:[]};
for(const scene of scenes){
 const folder=resolve(resources.root,'ground-v2',scene.id),coverage=JSON.parse(readFileSync(resolve(folder,'coverage.json'),'utf8'));
 const json=readFileSync(resolveRecordedPath(coverage.sourceFile)),bin=readFileSync(resolveRecordedPath(coverage.sourceFile).replace(/\.json$/,'.bin')),meta=JSON.parse(json.toString()),n=meta.nodeWordCount??meta.nodeCount;
 if(sha(json)+':'+sha(bin)!==coverage.sourceHash||coverage.analysisHash!==report.analysisHash)throw Error('Source/analysis identity mismatch');
 const words=new Uint32Array(bin.buffer,bin.byteOffset,bin.length/4),collision=new VoxelCollision(meta,words.subarray(0,n),words.subarray(n));
 const entry=collision.queryRay(scene.start.x,scene.start.y+1,scene.start.z,0,-1,0,8),job=JSON.parse(readFileSync(resolve(cache,scene.id+'.json'),'utf8')),band=job.layers[0].supportRange;
 const candidates:any[]=[];let singleBumps=0;
 for(const item of coverage.inventory){
  const path=resolve(folder,item.file),bytes=readFileSync(path),review=JSON.parse(bytes.toString());
  if(review.analysisHash!==report.analysisHash||review.sourceHash!==coverage.sourceHash||review.coordinateSpace!=='world')throw Error('Review identity changed');
  review.candidates.forEach((candidate:any,index:number)=>{
   if(candidate.status!=='proposed'||candidate.edits.length!==1||excluded.has(candidate.id))return;
   const edit=candidate.edits[0];if(edit.before!==true||edit.after!==false)return;singleBumps++;
   const r=meta.voxelResolution,center={x:meta.gridBounds.min[0]+(edit.ix+.5)*r,y:meta.gridBounds.min[1]+(edit.iy+.5)*r,z:meta.gridBounds.min[2]+(edit.iz+.5)*r},oldSupportY=center.y+r/2;
   if(!entry||oldSupportY<band[0]||oldSupportY>band[1]||oldSupportY-r<band[0]||Math.abs(oldSupportY-entry.y)>.24)return;
   const neighbors=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].map(([dx,dz])=>collision.queryRay(center.x+dx*r,oldSupportY+.2,center.z+dz*r,0,-1,0,1));
   if(neighbors.some(hit=>!hit||Math.abs(hit.y-(oldSupportY-r))>1e-6))return;
   candidates.push({sceneId:scene.id,chunk:item.file,candidateIndex:index,candidateId:candidate.id,reviewFile:path,reviewHash:sha(bytes),sourceHash:coverage.sourceHash,rawVoxel:[edit.ix,edit.iy,edit.iz],center,edit,oldSupportY,newSupportY:oldSupportY-r,distanceFromEntryMetres:Math.hypot(center.x-scene.start.x,center.z-scene.start.z),gaussianSlice:{axis:'z',center,alternateAxis:'x',gaussianHash:job.gaussianHash,modelMatrix:job.transform,assetUrl:scene.assetUrl},accepted:false});
  });
 }
 candidates.sort((a,b)=>a.distanceFromEntryMetres-b.distanceFromEntryMetres);
 const fiveRays=(position:{x:number;y:number;z:number})=>{const rays=[[0,0],[-BODY.radius,0],[BODY.radius,0],[0,-BODY.radius],[0,BODY.radius]].map(([dx,dz])=>({origin:{x:position.x+dx,y:position.y-BODY.eye,z:position.z+dz},hit:collision.queryRay(position.x+dx,position.y-BODY.eye,position.z+dz,0,-1,0,1)}));const hits=rays.flatMap(r=>r.hit?[r.hit.y]:[]);return{rays,averageSupport:hits.length?hits.reduce((a,b)=>a+b,0)/hits.length:null,allFiveHit:hits.length===5};};
 report.scenes.push({sceneId:scene.id,singleBumps,isolatedSameFloor:candidates.length,sourceHash:coverage.sourceHash});
 for(const candidate of candidates){
  resources.assertCapacity(0,'candidate native screening');
  const diagnostic=fiveRays({...candidate.center,y:candidate.oldSupportY+BODY.eye+BODY.hover});
  if(!diagnostic.allFiveHit){report.evaluated.push({...candidate,passed:false,reason:'five-probe-missing',diagnostic});continue;}
  const native=compareNativeMotion(collision,collision,candidate.center,meta.voxelResolution);
  const cases=native.cases.filter(c=>c.scenario.crossing).map(c=>{
   const crossing=c.scenario.crossing!,axis=crossing.axis,projection=c.before.trace.slice(120).map(s=>(s.position[axis]-candidate.center[axis])*crossing.direction);
   const fullPointFourMetres=projection[0]<=-.2+1e-8&&Math.max(...projection)>=.2-1e-8;
   const nearest=c.before.trace.slice(120).reduce((best,s)=>Math.hypot(s.position.x-candidate.center.x,s.position.z-candidate.center.z)<Math.hypot(best.position.x-candidate.center.x,best.position.z-candidate.center.z)?s:best);
   return{scenario:c.scenario,crossing:c.beforeCrossing,fullPointFourMetres,passed:c.passed&&fullPointFourMetres,traceHash:c.before.traceHash,settledFiveRays:fiveRays(c.before.trace[120].position),nearestFiveRays:fiveRays(nearest.position),trajectory:c.before.trace.map(s=>[s.tick,s.position.x,s.position.y,s.position.z,s.supportHeight,s.grounded])};
  });
  const passed=native.passed&&cases.every(c=>c.passed),result={...candidate,passed,diagnostic,cases};report.evaluated.push(result);
  if(passed)report.shortlist.push({...candidate,diagnostic,crossing:cases.map(({trajectory,...rest})=>rest),nativeOriginalOnly:true});
  console.log(JSON.stringify({scene:scene.id,chunk:candidate.chunk,index:candidate.candidateIndex,passed,crossing:cases.map(c=>({id:c.scenario.id,passed:c.passed,distance:c.crossing?.closestHorizontalDistance,span:c.fullPointFourMetres}))}));
 }
 if(sha(readFileSync(resolveRecordedPath(coverage.sourceFile)))+':'+sha(readFileSync(resolveRecordedPath(coverage.sourceFile).replace(/\.json$/,'.bin')))!==coverage.sourceHash)throw Error('Original collision changed during screening');
}
report.shortlist.sort((a:any,b:any)=>a.distanceFromEntryMetres-b.distanceFromEntryMetres);report.shortlist=report.shortlist.slice(0,3);
report.result=report.shortlist.length?'selected-for-gaussian-review-only':'no-candidate-passed-original-native-crossing';
resources.writeJsonAtomic(arg('--output')??'validation/native-ground-candidate-screen.json',report,{replace:false});
console.log(JSON.stringify({result:report.result,scenes:report.scenes,evaluated:report.evaluated.length,shortlist:report.shortlist.map((c:any)=>({scene:c.sceneId,chunk:c.chunk,index:c.candidateIndex,center:c.center,distance:c.distanceFromEntryMetres}))}));
