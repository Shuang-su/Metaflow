import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { VoxelCollision, FlippedVoxelCollision } from '../../metaflow-viewer/src/collision/voxel-collision';
import { solidColumn, extractSpans, worldBounds, type VoxelSource } from '../src/ground/spans';
import { proposeGround, acceptedEdits,isCurrentGroundReview } from '../src/ground/review';
import { patchedCollision } from '../src/ground/overlay';
import { materializeVoxel } from '../src/ground/materialize';
import { surfaceIdentity, resolveSurfaceAt, linkSurfaceContact } from '../../metaflow-viewer/src/navigation/layers';
import type { PlanePatch, GroundReview,GroundDecisions } from '../src/ground/types';

function fixture(solid:(x:number,y:number,z:number)=>boolean,flip=false){
    const depth=4,size=2**depth*4,nodes:number[]=[0],leaf:number[]=[];
    function build(index:number,level:number,bx:number,by:number,bz:number){
        if(level===0){let lo=0,hi=0;for(let z=0;z<4;z++)for(let y=0;y<4;y++)for(let x=0;x<4;x++){
            if(!solid(bx*4+x,by*4+y,bz*4+z))continue;const bit=z*16+y*4+x;if(bit<32)lo|=1<<bit;else hi|=1<<(bit-32);
        }nodes[index]=leaf.length/2;leaf.push(lo>>>0,hi>>>0);return;}
        const first=nodes.length;for(let i=0;i<8;i++)nodes.push(0);nodes[index]=(0xff000000|first)>>>0;
        const h=2**(level-1);for(let oct=0;oct<8;oct++)build(first+oct,level-1,bx+(oct&1)*h,by+((oct>>1)&1)*h,bz+((oct>>2)&1)*h);
    }
    build(0,depth,0,0,0);
    const meta={version:'1.1',gridBounds:{min:[0,-.16,0],max:[size*.08,size*.08-.16,size*.08]},gaussianBounds:{min:[0,-.16,0],max:[size*.08,size*.08-.16,size*.08]},
        voxelResolution:.08,leafSize:4,treeDepth:depth,numInteriorNodes:0,numMixedLeaves:leaf.length/2,nodeCount:nodes.length,leafDataCount:leaf.length};
    const C=flip?FlippedVoxelCollision:VoxelCollision,c=new C(meta,new Uint32Array(nodes),new Uint32Array(leaf));
    const source:VoxelSource={collision:c,min:meta.gridBounds.min,max:meta.gridBounds.max,flipXY:flip};return{source,meta,size};
}
function flatPatch(spans:ReturnType<typeof extractSpans>['spans'],height=0):PlanePatch{
    return{center:[2.5,height,2.5],rotation:[[1,0,0],[0,0,1],[0,1,0]],extent:[5,5,.16],plane:[0,1,0,-height],
        pointIndices:spans.map((_,i)=>i).filter(i=>Math.abs(spans[i].y-height)<.13)};
}
function review(result:ReturnType<typeof proposeGround>):GroundReview{return{version:1,sourceHash:'source',analysisHash:'fixture-algorithm-v2',detector:'Open3D-0.19.0.detect_planar_patches',
    coordinateSpace:'world',voxelResolution:.08,...result,unknownSpanCount:result.unknownSpanCount,scannedColumnCount:64*64,completeCoverage:true};}

test('sparse column traversal agrees with original octree occupancy, including empty runs',()=>{
    const {source,size}=fixture((x,y,z)=>y<2 || (x<20&&z<20&&y>=32&&y<34));
    for(const [x,z] of [[0,0],[19,19],[20,20],[63,63]]){
        const runs=solidColumn(source,x,z);
        for(let y=0;y<size;y++)assert.equal(runs.some(([lo,hi])=>y>=lo&&y<hi),source.collision.isVoxelSolid(x,y,z));
    }
});
test('overlapping floors remain separate spans with real clearance; stairs do not establish an invented link',()=>{
    const {source}=fixture((x,y,z)=>y<2 || (x<30&&z<30&&y>=32&&y<34));
    const {spans}=extractSpans(source,worldBounds(source));
    const at=spans.filter(s=>s.ix===10&&s.iz===10);assert.deepEqual(at.map(s=>Math.round(s.y*100)),[0,256]);
    const polygon=(y:number)=>[{x:0,y,z:0},{x:2,y,z:0},{x:2,y,z:2},{x:0,y,z:2}];
    const lower=surfaceIdentity('fixture',0,polygon(0),[0,1,0,0]),upper=surfaceIdentity('fixture',2.56,polygon(2.56),[0,1,0,-2.56]);
    assert.equal(resolveSurfaceAt({x:1,y:2.56,z:1},[lower,upper])?.id,upper.id);
    assert.equal(resolveSurfaceAt({x:1,y:2.56,z:1},[lower,upper],.28,lower.layerId),null);
    assert.equal(linkSurfaceContact(lower,upper,{x:1,y:0,z:1},true),false);
});
test('a single voxel bump/pit yields a reversible proposed diff and no implicit application',()=>{
    const {source,meta}=fixture((x,y,z)=>y<2 && !(x===20&&z===20&&y===1) || (x===25&&z===25&&y===2));
    const {spans}=extractSpans(source,worldBounds(source));
    const result=proposeGround(source,spans,[flatPatch(spans)],'fixture');const r=review(result);
    assert.ok(result.candidates[0].edits.some(e=>e.ix===25&&e.iz===25&&!e.after));
    assert.equal(acceptedEdits(r,{version:1,sourceHash:'source',analysisHash:r.analysisHash,acceptedCandidateIds:[],rejectedCandidateIds:[]}).length,0);
    const edits=acceptedEdits(r,{version:1,sourceHash:'source',analysisHash:r.analysisHash,acceptedCandidateIds:[r.candidates[0].id],rejectedCandidateIds:[]});
    const corrected=patchedCollision(source.collision,meta,edits);
    assert.equal(source.collision.isVoxelSolid(25,2,25),true);assert.equal(corrected.isVoxelSolid(25,2,25),false);
    const hit=corrected.queryRay(25.5*.08,1,25.5*.08,0,-1,0,2);assert.ok(hit && Math.abs(hit.y)<1e-6);
    const asset=materializeVoxel(meta,source.collision,edits);
    assert.equal(asset.validation.changedVoxelCount,edits.length);assert.equal(asset.collision.isVoxelSolid(25,2,25),false);
    assert.equal(source.collision.isVoxelSolid(25,2,25),true);
    assert.throws(()=>acceptedEdits(r,{version:1,sourceHash:'wrong',analysisHash:r.analysisHash,acceptedCandidateIds:[],rejectedCandidateIds:[]}));
});
test('missing or old algorithm fingerprints and obsolete protection policies cannot accept or export edits',()=>{
    const {source}=fixture((x,y,z)=>y<2 || x===25&&z===25&&y===2),{spans}=extractSpans(source,worldBounds(source));
    const r=review(proposeGround(source,spans,[flatPatch(spans)],'fixture'));
    const decision:GroundDecisions={version:1,sourceHash:r.sourceHash,analysisHash:r.analysisHash,acceptedCandidateIds:[r.candidates[0].id],rejectedCandidateIds:[]};
    assert.equal(r.protectionVersion,2);assert.equal(isCurrentGroundReview(r),true);assert.ok(acceptedEdits(r,decision).length);
    const missingDecision=JSON.parse(JSON.stringify(decision));delete missingDecision.analysisHash;
    assert.throws(()=>acceptedEdits(r,missingDecision),/algorithm/);
    assert.throws(()=>acceptedEdits(r,{...decision,analysisHash:'old-algorithm'}),/algorithm/);
    for(const field of ['protectionVersion','analysisHash']){
        const legacy=JSON.parse(JSON.stringify(r));delete legacy[field];assert.equal(isCurrentGroundReview(legacy),false);
        assert.throws(()=>acceptedEdits(legacy,decision),/rescreen/);
    }
    assert.throws(()=>acceptedEdits({...r,analysisHash:''},decision),/rescreen/);
});
test('wall feet and the entire eight-centimeter curb plateau stay protected',()=>{
    const {source}=fixture((x,y,z)=>y<2 || (x>=30&&y<3) || (x===15&&z<25&&y<20));
    const {spans}=extractSpans(source,worldBounds(source));
    const result=proposeGround(source,spans,[flatPatch(spans)],'fixture');
    for(const c of result.candidates)for(const e of c.edits){assert.ok(e.ix<30);assert.ok(Math.abs(e.ix-15)>2 || e.iz>=25);}
    assert.ok(result.candidates.some(c=>c.reasons.includes('exceeds-one-source-voxel') || c.reasons.includes('step-or-curb')));
});
test('eight-centimeter platforms, narrow raised strips, stairs and small exhibit tops retain their occupancy',()=>{
    const cases=[
        (x:number,_z:number)=>x>=24&&x<44?3:2,
        (x:number,z:number)=>x===24&&z>=16&&z<48?3:2,
        (x:number,_z:number)=>x>=24&&x<48?3+Math.floor((x-24)/6):2,
        (x:number,z:number)=>x>=24&&x<40&&z>=24&&z<40?3:2,
        (x:number,z:number)=>x>=24&&x<26&&z===24?3:2,
        (x:number,z:number)=>x===z&&x>=24&&x<28?3:2,
        (x:number,z:number)=>x===z&&x>=24&&x<28?3+x-24:2
    ];
    for(const top of cases){
        const {source}=fixture((x,y,z)=>y<top(x,z));
        const {spans}=extractSpans(source,worldBounds(source));
        const result=proposeGround(source,spans,[flatPatch(spans)],'fixture');
        assert.equal(result.candidates.flatMap(c=>c.edits).length,0);
    }
    const {source}=fixture((x,y,z)=>y<2 || x>=24&&x<40&&z>=24&&z<40&&y<3);
    const {spans}=extractSpans(source,worldBounds(source)),p=flatPatch(spans,.08);
    p.extent=[1.28,1.28,.16];p.pointIndices=p.pointIndices.filter(i=>spans[i].ix>=24&&spans[i].ix<40&&spans[i].iz>=24&&spans[i].iz<40);
    const result=proposeGround(source,spans,[p],'fixture');
    assert.equal(result.candidates[0].status,'protected');assert.ok(result.candidates[0].reasons.includes('small-platform-or-fixture'));
});
test('coordinate adapter keeps world support height and raw sparse edit addresses distinct',()=>{
    const {source}=fixture((_x,y,_z)=>y>=30&&y<32,true);
    const spans=extractSpans(source,worldBounds(source)).spans;
    assert.ok(spans.length);assert.ok(spans.every(s=>s.x<0 && Math.abs(s.y+2.24)<1e-6 && s.iy===30));
});
test('accepted octree materialization changes only specified bits and preserves original source words',()=>{
    const {source,meta,size}=fixture((x,y,z)=>y<3 || (x<25&&z<25&&y>=32&&y<34));
    const sourceNodes=source.collision.nodes.slice(),sourceLeaves=source.collision.leafData.slice();
    const edits=[{ix:20,iy:3,iz:20,before:false,after:true,candidateId:'accepted'},
        {ix:25,iy:2,iz:25,before:true,after:false,candidateId:'accepted'}];
    const result=materializeVoxel(meta,source.collision,edits);
    for(let x=0;x<size;x++)for(let y=0;y<size;y++)for(let z=0;z<size;z++){
        const e=edits.find(e=>e.ix===x&&e.iy===y&&e.iz===z);
        assert.equal(result.collision.isVoxelSolid(x,y,z),e?.after??source.collision.isVoxelSolid(x,y,z));
    }
    assert.deepEqual(source.collision.nodes,sourceNodes);assert.deepEqual(source.collision.leafData,sourceLeaves);
    assert.equal(result.validation.changedVoxelCount,2);assert.deepEqual(result.metadata.gridBounds,meta.gridBounds);
});
test('materialization splits a compressed solid subtree and can introduce a new sparse empty-tree leaf',()=>{
    const {meta}=fixture(()=>true),solidMeta={...meta,nodeCount:1,leafDataCount:0},solid=new VoxelCollision(solidMeta,new Uint32Array([0xff000000]),new Uint32Array());
    const removed=materializeVoxel(solidMeta,solid,[{ix:5,iy:17,iz:33,before:true,after:false,candidateId:'accepted'}]);
    assert.equal(removed.collision.isVoxelSolid(5,17,33),false);assert.equal(removed.collision.isVoxelSolid(6,17,33),true);
    const emptyMeta={...meta,nodeCount:0,leafDataCount:0},empty=new VoxelCollision(emptyMeta,new Uint32Array(),new Uint32Array());
    const added=materializeVoxel(emptyMeta,empty,[{ix:5,iy:17,iz:33,before:false,after:true,candidateId:'accepted'}]);
    assert.equal(added.collision.isVoxelSolid(5,17,33),true);assert.equal(added.collision.isVoxelSolid(6,17,33),false);
    assert.throws(()=>materializeVoxel(emptyMeta,empty,[{ix:5,iy:17,iz:33,before:true,after:false,candidateId:'invalid'}]));
});
test('Open3D detector actually runs on a local noisy-plane fixture',(t)=>{
    const python=process.env.MF97_GROUND_PYTHON??'/Volumes/Prism/Metaflow/.codex-work/cache/mf97-navigation/python/bin/python';
    if(!existsSync(python)){t.skip('Optional local Open3D analysis environment is absent');return;}
    const points:number[][]=[];for(let x=0;x<50;x++)for(let z=0;z<50;z++)points.push([x*.08,((x*13+z*7)%11-5)*.0002,z*.08]);
    const run=spawnSync(python,[new URL('../scripts/ground-detect.py',import.meta.url).pathname],{input:JSON.stringify({points,voxelResolution:.08})+'\n',encoding:'utf8',timeout:60000,
        env:{...process.env,OPEN3D_DISABLE_WEB_VISUALIZER:'true',OMP_NUM_THREADS:'2',MPLCONFIGDIR:process.env.MPLCONFIGDIR??new URL('../../.codex-work/cache/mf97-matplotlib',import.meta.url).pathname}});
    assert.equal(run.status,0,run.stderr);const output=JSON.parse(run.stdout.trim());assert.equal(output.detector,'Open3D-0.19.0.detect_planar_patches');
    assert.ok(output.patches.length>0);assert.ok(output.patches.some((p:PlanePatch)=>Math.abs(p.center[1])<.01 && Math.abs(p.plane[1])>.99));
});
