import {test} from 'node:test';import assert from 'node:assert/strict';
import {WalkController} from '../../metaflow-viewer/src/cameras/walk-controller';
import {Camera} from '../../metaflow-viewer/src/cameras/camera';
import {MeshCollision} from '../../metaflow-viewer/src/collision/mesh-collision';
import {NativeDriver,proveRoute} from '../src/native-motion';
const floor=new MeshCollision(new Float32Array([-10,0,-10,10,0,-10,10,0,10,-10,0,10]),new Uint32Array([0,2,1,0,3,2]));
test('readonly observation changes no native position, velocity or collision result',()=>{
 const a=new WalkController(),b=new WalkController(),ca=new Camera(),cb=new Camera();
 for(const [c,p]of [[a,ca],[b,cb]]as const){p.position.set(0,1.5,0);c.collision=floor;c.goto(p);}
 let count=0;b.onPhysicsStep=s=>{count++;assert.ok(Object.isFrozen(s.position));};
 for(let i=0;i<600;i++){
  const frame={read:()=>({move:[i<300?1/60:0,i===120?1:0,0],rotate:[0,0,0],worldMove:[0,0,0]})}as any;
  a.update(1/60,frame,ca);b.update(1/60,frame,cb);
  assert.deepEqual(a.readPhysicsState(),b.readPhysicsState());assert.deepEqual(ca,cb);
 }
 assert.equal(count,600);
});
test('native driver crosses flat floor without artificial safety rollback',()=>{
 const it=proveRoute(floor,{x:0,y:1.5,z:0},[{x:0,y:1.5,z:0},{x:2,y:1.5,z:-2}]);
 let r=it.next();while(!r.done)r=it.next();assert.equal(r.value.ok,true);
});
test('held collision is distinguished from active collision',()=>{
 const d=new NativeDriver(floor,{x:0,y:1.5,z:0});d.controller.collision=null;d.controller.onEnter(d.camera);
 assert.equal(d.step(0,0).collision,'missing');
});
test('same native timestamped input has identical fixed-tick motion at 30/60/120 Hz and jitter',()=>{
 const run=(frames:number[])=>{const driver=new NativeDriver(floor,{x:0,y:1.5,z:0}),states:any[]=[];driver.controller.onPhysicsStep=s=>{driver.state=s;states.push(s);};let t=0,i=0;while(t<4-1e-9){const dt=Math.min(frames[i++%frames.length],4-t);driver.step(.25,0,false,dt);t+=dt;}return states;};
 const base=run([1/60]);for(const frames of [[1/30],[1/120],[.008,.025,.011,.019,.021]]){const result=run(frames);let max=0;for(let i=0;i<Math.min(base.length,result.length);i++)max=Math.max(max,Math.hypot(base[i].position.x-result[i].position.x,base[i].position.y-result[i].position.y,base[i].position.z-result[i].position.z));assert.ok(max<=.01,`native fixed-tick error ${max}`);}
});
