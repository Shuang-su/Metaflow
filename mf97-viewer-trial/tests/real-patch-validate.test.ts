import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelCollision } from '../../metaflow-viewer/src/collision/voxel-collision';
import { compareNativeMotion, compareVoxelTrees } from '../scripts/real-patch-validate';
import { materializeVoxel } from '../src/ground/materialize';
import type { SparseEdit } from '../src/ground/types';
function floor(resolution=1,depth=1) {
    const nodes=[0],leaves:number[]=[],queue=[{index:0,level:depth,bx:0,by:0,bz:0}];let interiors=0;
    for(let cursor=0;cursor<queue.length;cursor++){
        const q=queue[cursor];
        if(q.level){nodes[q.index]=(0xff000000|nodes.length)>>>0;interiors++;const step=2**(q.level-1);
            for(let oct=0;oct<8;oct++){const index=nodes.length;nodes.push(0);queue.push({index,level:q.level-1,bx:q.bx+(oct&1)*step,by:q.by+((oct>>1)&1)*step,bz:q.bz+((oct>>2)&1)*step});}continue;}
        nodes[q.index]=leaves.length/2;let lo=0,hi=0;
        for(let z=0;z<4;z++)for(let y=0;y<4;y++)for(let x=0;x<4;x++)if(q.by*4+y<2){const bit=z*16+y*4+x;if(bit<32)lo|=1<<bit;else hi|=1<<(bit-32);}
        leaves.push(lo>>>0,hi>>>0);
    }
    const size=4*2**depth*resolution;
    const meta={version:'1.1',gridBounds:{min:[0,0,0],max:[size,size,size]},gaussianBounds:{min:[0,0,0],max:[size,size,size]},voxelResolution:resolution,leafSize:4,treeDepth:depth,nodeCount:nodes.length,leafDataCount:leaves.length,numInteriorNodes:interiors,numMixedLeaves:leaves.length/2};
    return {meta,collision:new VoxelCollision(meta,new Uint32Array(nodes),new Uint32Array(leaves))};
}
test('complete sparse comparison detects exactly approved changed bit and rejects unlisted changes',()=>{
    const f=floor(),edit:SparseEdit={ix:3,iy:1,iz:3,before:true,after:false,candidateId:'a'},other:SparseEdit={...edit,ix:4,candidateId:'b'};
    const one=materializeVoxel(f.meta,f.collision,[edit]);
    assert.equal(compareVoxelTrees(f.collision,one.collision,[edit]).changedVoxelCount,1);
    const two=materializeVoxel(f.meta,f.collision,[edit,other]);
    assert.throws(()=>compareVoxelTrees(f.collision,two.collision,[edit]),/Unapproved bit/);
    assert.throws(()=>compareVoxelTrees(f.collision,f.collision,[edit]),/missing/);
});
test('native materialized collider replay uses nine deterministic center/neighbour/bidirectional cases',()=>{
    const f=floor(.08,3),result=compareNativeMotion(f.collision,f.collision,{x:1.28,y:.12,z:1.28},.08);
    assert.equal(result.cases.length,9);assert.equal(result.passed,true);assert.equal(result.crossingPassed,true);
    assert.ok(result.cases.every(c=>c.deterministicRepeat&&c.maxHorizontalDifference===0&&c.maxVerticalDifference===0));
});

test('native gate rejects a replay that cannot cross the edit on both sides within its layer',()=>{
    const f=floor(.08,3),result=compareNativeMotion(f.collision,f.collision,{x:.1,y:.12,z:1.28},.08);
    assert.equal(result.crossingPassed,false);assert.equal(result.passed,false);
});
