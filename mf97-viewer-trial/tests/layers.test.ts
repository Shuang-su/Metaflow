import test from 'node:test';
import assert from 'node:assert/strict';
import { surfaceIdentity, resolveSurfaceAt, linkSurfaceContact, containsSurfaceXZ } from '../../metaflow-viewer/src/navigation/layers';
const rectangle=(x:number,y:number)=>[{x,y,z:0},{x:x+1,y,z:0},{x:x+1,y,z:1},{x,y,z:1}];
test('rebuild vertex rotation/winding and equivalent plane normals preserve surface identity',()=>{
    const p=rectangle(0,.08),a=surfaceIdentity('room',0,p,[0,1,0,-.08]);
    assert.equal(surfaceIdentity('room',0,[...p.slice(2),...p.slice(0,2)],[0,2,0,-.16]).id,a.id);
    assert.equal(surfaceIdentity('room',0,[...p].reverse(),[0,-1,0,.08]).id,a.id);
    assert.notEqual(surfaceIdentity('room',0,rectangle(0,.16),[0,1,0,-.16]).id,a.id);
    assert.notEqual(surfaceIdentity('room',0,rectangle(.04,.08),[0,1,0,-.08]).id,a.id);
});
test('verified shared edge permits upward and downward transitions with persistent support identities',()=>{
    const a=surfaceIdentity('stairs',0,rectangle(0,0),[0,1,0,0]),b=surfaceIdentity('stairs',.5,rectangle(1,.16),[0,1,0,-.16]);
    assert.equal(linkSurfaceContact(a,b,{x:1,y:0,z:.5},true),true);
    assert.deepEqual(a.neighbors,[b.id]);assert.deepEqual(b.neighbors,[a.id]);
    assert.equal(resolveSurfaceAt({x:1.5,y:.16,z:.5},[a,b],.1,a.layerId,a.id)?.id,b.id);
    assert.equal(resolveSurfaceAt({x:.5,y:0,z:.5},[a,b],.1,b.layerId,b.id)?.id,a.id);
});
test('overlapping wrong floors, unverified and invalid contacts cannot establish adjacency',()=>{
    const a=surfaceIdentity('room',0,rectangle(0,0),[0,1,0,0]),upper=surfaceIdentity('room',3,rectangle(0,3),[0,1,0,-3]),
        next=surfaceIdentity('room',.5,rectangle(1,.16),[0,1,0,-.16]);
    assert.equal(linkSurfaceContact(a,upper,{x:0,y:0,z:.5},true),false);
    assert.equal(linkSurfaceContact(a,next,{x:1,y:0,z:.5},false),false);
    assert.equal(linkSurfaceContact(a,next,{x:1,y:10,z:.5},true),false);
    assert.equal(linkSurfaceContact(a,next,{x:2,y:0,z:.5},true),false);
    assert.equal(linkSurfaceContact(a,next,{x:NaN,y:0,z:.5},true),false);
    assert.equal(linkSurfaceContact(a,a,{x:0,y:0,z:.5},true),false);
    assert.equal(resolveSurfaceAt({x:.5,y:3,z:.5},[a,upper],.28,a.layerId,a.id),null);
    assert.equal(containsSurfaceXZ(a,1,.5),true);assert.deepEqual(a.neighbors,[]);
});
