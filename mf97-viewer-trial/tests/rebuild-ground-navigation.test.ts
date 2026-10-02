import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareGroundNavigation, validateRebuildRecords, affectedByEdits } from '../scripts/rebuild-ground-navigation';
import { createOfflineResources, GiB } from '../src/offline-resources';
import { groundAnalysisHash } from '../src/ground-analysis-fingerprint';
import { sha } from '../scripts/gaussian-map-offline';
import { BODY } from '../../mf79-viewer-trial/src/native-motion';
import { RECAST_CONFIG } from '../../mf79-viewer-trial/src/recast-config';
import { navigationTiles } from '../../mf79-viewer-trial/src/tiles';
const root=resolve(import.meta.dirname,'../../.codex-work/tmp/mf97-resource-tests');mkdirSync(root,{recursive:true});
const save=(file:string,value:unknown)=>writeFileSync(file,JSON.stringify(value));
function fixture(){
 const base=mkdtempSync(resolve(root,'nav-')),original=resolve(base,'original'),artifact=resolve(base,'accepted'),source=resolve(base,'source');
 for(const path of [original,artifact,source])mkdirSync(path);
 const sourceFile=resolve(source,'walk.voxel.json'),meta={version:'1.1',gridBounds:{min:[0,0,0],max:[.32,.32,.32]},voxelResolution:.08,leafSize:4,treeDepth:0,nodeCount:1,leafDataCount:0};
 save(sourceFile,meta);const binary=Buffer.from(new Uint32Array([0xff000000]).buffer);writeFileSync(sourceFile.replace(/\.json$/,'.bin'),binary);writeFileSync(resolve(original,'collision.bin'),binary);
 const sourceHash=sha(readFileSync(sourceFile))+':'+sha(binary),newMeta={...meta,leafDataCount:2},newBin=Buffer.from(new Uint32Array([0,0xfffffffe,0xffffffff]).buffer);
 save(resolve(artifact,'walk.voxel.json'),newMeta);writeFileSync(resolve(artifact,'walk.voxel.bin'),newBin);
 const outputHash=sha(readFileSync(resolve(artifact,'walk.voxel.json')))+':'+sha(newBin),analysisHash=groundAnalysisHash(),edit={ix:0,iy:0,iz:0,before:true,after:false,candidateId:'fixture'};
 const review=resolve(base,'review.json'),decisions=resolve(base,'decisions.json'),nativeValidation=resolve(base,'native.json');
 save(review,{version:1,protectionVersion:2,sourceFile,sourceHash,analysisHash,coordinateSpace:'world',candidates:[{id:'fixture',status:'proposed',edits:[edit]}]});
 save(decisions,{version:1,sourceHash,analysisHash,acceptedCandidateIds:['fixture'],rejectedCandidateIds:[]});
 const material={version:2,protectionVersion:2,complete:true,sourceFile,sourceHash,outputHash,analysisHash,decisionHash:sha(readFileSync(decisions)),coordinateSpace:'world',validation:{changedVoxelCount:1}};
 save(resolve(artifact,'materialization.json'),material);
 const paths=['../scripts/real-patch-validate.ts','../../metaflow-viewer/src/cameras/walk-controller.ts','../../metaflow-viewer/src/collision/voxel-collision.ts','../../mf79-viewer-trial/src/native-motion.ts'].map(p=>resolve(import.meta.dirname,p));
 // Synthetic provenance fixture tests binding only; it is never used for real navigation output.
 const validation={nativePassed:true,nativeCrossingPassed:true,nativeIncomplete:false,sourceHash,outputHash,analysisHash,materializationHash:sha(readFileSync(resolve(artifact,'materialization.json'))),decisionHash:material.decisionHash,reviewHash:sha(readFileSync(review)),implementation:paths.map(file=>({file,sha256:sha(readFileSync(file))})),difference:{completeTreeCompared:true,changedVoxelCount:1,changed:[edit]},native:[{passed:true,cases:Array.from({length:9},()=>({passed:true,deterministicRepeat:true}))}]};
 save(nativeValidation,validation);
 const bounds={min:{x:0,y:0,z:0},max:{x:.32,y:.32,z:.32}},key={generator:'native-v1-integer-xyz',controllerHash:validation.implementation[1].sha256,sourceHash,bounds,transform:{scale:1,yawDegrees:0,translation:{x:0,y:0,z:0}},body:BODY,config:RECAST_CONFIG,tileCells:512};
 const tileBytes=Buffer.from('synthetic-nav-tile'),tile={...navigationTiles(bounds,RECAST_CONFIG.cs,512)[0],name:'tile-0-0',hash:sha(tileBytes),bytes:tileBytes.length};
 writeFileSync(resolve(original,'tile-0-0.bin'),tileBytes);
 const old={key,fingerprint:sha(JSON.stringify(key)),status:'complete',scene:'fixture',meta,bounds,body:BODY,sourceHash,collisionHash:sha(binary),tiles:[tile]};save(resolve(original,'manifest.json'),old);
 const resources=createOfflineResources({root:base,measureFreeBytes:()=>100*GiB,measureRssBytes:()=>1});
 return {base,old,validation,options:{artifact,review,decisions,original,nativeValidation,resources}};
}
test('navigation preflight binds all artifact/proof/implementation hashes without writing',()=>{
 const f=fixture();try{const state=prepareGroundNavigation(f.options);assert.equal(state.old.tiles.length,1);assert.equal(state.material.outputHash,f.validation.outputHash);assert.equal(f.options.resources.snapshot().taskWrittenBytes,0);state.assertInputsUnchanged();}finally{rmSync(f.base,{recursive:true});}
});
test('navigation rejects wrong native output, implementation, changed bit set and original manifest',()=>{
 for(const field of ['output','implementation','bits','original'] as const){const f=fixture();try{
  if(field==='output')f.validation.outputHash='wrong';
  if(field==='implementation')f.validation.implementation[0].sha256='wrong';
  if(field==='bits')f.validation.difference.changed[0].ix=1;
  if(field==='original'){f.old.fingerprint='wrong';save(resolve(f.options.original,'manifest.json'),f.old);}
  save(f.options.nativeValidation,f.validation);
  assert.throws(()=>prepareGroundNavigation(f.options),/bound|implementation|bit set|provenance/);
 }finally{rmSync(f.base,{recursive:true});}}
});
test('navigation rejects output root and nested file aliases of original assets',()=>{
 const f=fixture();try{
  symlinkSync(f.options.original,resolve(f.base,'alias'));
  assert.throws(()=>prepareGroundNavigation({...f.options,output:'alias'}),/independent/);
  mkdirSync(resolve(f.base,'independent'));
  symlinkSync(resolve(f.options.original,'tile-0-0.bin'),resolve(f.base,'independent/tile-0-0.bin'));
  assert.throws(()=>prepareGroundNavigation({...f.options,output:'independent'}),/aliases/);
 }finally{rmSync(f.base,{recursive:true});}
});
test('resumed navigation rejects duplicate/foreign/misbound tile records',()=>{
 const f=fixture();try{
  const source=prepareGroundNavigation(f.options),tile=source.old.tiles[0],record={...tile,sourceHash:source.material.outputHash,originalHash:tile.hash,mode:'rebuilt-from-accepted-collision'};
  const manifest={key:source.key,fingerprint:source.fingerprint,sourceHash:source.material.outputHash,status:'building',tiles:[record]};
  validateRebuildRecords(manifest,source);
  assert.throws(()=>validateRebuildRecords({...manifest,tiles:[record,record]},source),/inventory|order/);
  assert.throws(()=>validateRebuildRecords({...manifest,tiles:[{...record,sourceHash:'old'}]},source),/inventory|order/);
  assert.throws(()=>validateRebuildRecords({...manifest,tiles:[{...record,name:'foreign'}]},source),/inventory|order/);
  assert.throws(()=>validateRebuildRecords({...manifest,status:'complete',tiles:[]},source),/missing/);
 }finally{rmSync(f.base,{recursive:true});}
});
test('affected coverage includes face-neighbour and Recast erosion halos',()=>{
 const tile={bounds:{min:{x:0,y:0,z:0},max:{x:20.48,y:1,z:20.48}}};
 assert.equal(affectedByEdits(tile,[{x:20.9,y:0,z:10}],.08),true);
 assert.equal(affectedByEdits(tile,[{x:21,y:0,z:10}],.08),false);
});
