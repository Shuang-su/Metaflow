import test from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from './node_modules/playcanvas/build/playcanvas/src/scene/camera.js';
import { ASPECT_MANUAL, Vec2, Vec3, Mat4, Quat } from './node_modules/playcanvas/build/playcanvas.mjs';
import { getProjection, screenPointNdc, tablePose } from './projection.mjs';

const close = (a,b) => assert.ok(Math.abs(a-b)<2e-6, `${a} != ${b}`);

test('installed PlayCanvas 2.23.0 camera projects the physical window exactly', () => {
  const camera=new Camera();
  camera.aspectRatioMode=ASPECT_MANUAL;
  camera.horizontalFov=false;
  for(const eye of [{x:0,y:.15,z:.55},{x:.15,y:-.1,z:.3},{x:-.25,y:.3,z:1.1}]) {
    const options={width:.26,height:.195,eye};
    const projection=getProjection(options);
    camera.aspectRatio=projection.aspect;camera.fov=projection.fov;
    camera.projectionOffset=new Vec2(projection.offset.x,projection.offset.y);
    const m=camera.projectionMatrix.data;
    for(const p of [{x:-.13,y:-.0975,z:0},{x:.13,y:.0975,z:0},{x:0,y:0,z:0},{x:.03,y:.06,z:-.12},{x:0,y:.04,z:.08}]) {
      const x=p.x-eye.x,y=p.y-eye.y,z=p.z-eye.z;
      const w=m[3]*x+m[7]*y+m[11]*z+m[15];
      const expected=screenPointNdc(p,options);
      close((m[0]*x+m[4]*y+m[8]*z+m[12])/w,expected.x);
      close((m[1]*x+m[5]*y+m[9]*z+m[13])/w,expected.y);
    }
  }
});

test('reassigning the offset through the engine setter refreshes its cached projection', () => {
  const camera=new Camera();camera.aspectRatioMode=ASPECT_MANUAL;
  const offset=new Vec2(.2,.3);camera.projectionOffset=offset;
  close(camera.projectionMatrix.data[8],.2);
  offset.set(-.4,.6);camera.projectionOffset=offset;
  close(camera.projectionMatrix.data[8],-.4);close(camera.projectionMatrix.data[9],.6);
});

test('actual engine transform places the figure up axis and foot anchor on the calibrated desk', () => {
  for(const tiltDegrees of [0,30,65,90]) {
    const pose=tablePose({height:.195,tiltDegrees});
    const q=new Quat().setFromEulerAngles(pose.rotationX,0,0);
    const m=new Mat4().setTRS(new Vec3(pose.position.x,pose.position.y,pose.position.z),q,Vec3.ONE);
    const up=m.transformVector(Vec3.UP);
    close(up.x,pose.up.x);close(up.y,pose.up.y);close(up.z,pose.up.z);
    const foot=m.transformPoint(new Vec3(0,0,-.12));
    const relative=foot.clone().sub(new Vec3(pose.position.x,pose.position.y,pose.position.z));
    close(relative.dot(up),0);
  }
});
