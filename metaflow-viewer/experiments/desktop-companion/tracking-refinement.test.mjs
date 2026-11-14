import test from 'node:test';
import assert from 'node:assert/strict';
import {CANONICAL_EYE_ANCHOR,inspectHeadPose,measureHead,meanMeasurement,calibrationIsStable,estimateHeadEye} from './head-estimator.mjs';
import {createHeadTracker} from './tracking.mjs';
import {mobileProfileValues} from './mobile.mjs';
import {placeTrackingVideo} from './tracking-preview.mjs';
// Synthetic detector output tests the estimator/state machine, NOT empirical
// side-face recognition accuracy. Real face inference is a separate device test.
function matrix(yaw=0,anchor={x:0,y:0,depth:50}){
  const a=yaw*Math.PI/180,c=Math.cos(a),s=Math.sin(a),[x,y,z]=CANONICAL_EYE_ANCHOR;
  return {rows:4,columns:4,data:[c,0,-s,0,0,1,0,0,s,0,c,0,anchor.x-(c*x+s*z),anchor.y-y,-anchor.depth-(-s*x+c*z),1]};
}
function result({yaw=0,x=0,y=0,depth=50,eyes=true,count=1}={}){
  if(!count)return {faceLandmarks:[],facialTransformationMatrixes:[]};
  const points=Array.from({length:478},()=>({x:.5,y:.5,z:0}));
  for(const [i,x,y] of [[10,.5,.22],[152,.5,.78],[234,.32,.5],[454,.68,.5],[1,.5,.48],[6,.5,.4],[33,.40,.40],[133,.46,.40],[362,.54,.40],[263,.60,.40]])points[i]={x,y,z:0};
  // No iris coordinates are needed. Missing eye corners exercise the fallback.
  for(const i of [468,473])points[i]=undefined;
  if(!eyes)for(const i of [33,133,362,263])points[i]=undefined;
  return {faceLandmarks:Array.from({length:count},()=>points),facialTransformationMatrixes:Array.from({length:count},()=>matrix(yaw,{x,y,depth}))};
}
const video={videoWidth:1280,videoHeight:720};
test('Air dimensions use display resolution and ppi, not body size',()=>{
  const p=mobileProfileValues('iphone-air',{canvasWidth:420,screenWidth:420,screenHeight:912});
  const l=mobileProfileValues('iphone-air',{landscape:true,canvasWidth:912,screenWidth:912,screenHeight:420});
  assert.ok(Math.abs(p.width-1260/460*2.54)<1e-10);assert.ok(Math.abs(l.width-2736/460*2.54)<1e-10);
});
for(const yaw of [0,35,55,65,-65])test(`whole-head pose accepts ${yaw} degrees without iris/eye corners`,()=>{
  const m=measureHead(result({yaw,eyes:false}),video);assert.ok(m);assert.equal(m.source,'head');
  assert.ok(Math.abs(m.pose.yaw-yaw)<1e-8);assert.ok(Math.abs(m.headAnchor.depth-50)<1e-8);
});
test('back/profile limit, degenerate faces and corrupt transforms fail closed',()=>{
  assert.equal(measureHead(result({yaw:85}),video),null);
  const d=matrix().data;d[0]=NaN;assert.equal(inspectHeadPose({rows:4,columns:4,data:d}),null);
  assert.equal(inspectHeadPose(matrix(0,{x:0,y:0,depth:-3})),null);
  assert.equal(measureHead(result(),{videoWidth:10,videoHeight:8}),null);
});
test('head rotation alone does not turn into false camera translation',()=>{
  const a=measureHead(result({yaw:0}),video),b=measureHead(result({yaw:60}),video);
  const eye=estimateHeadEye(a,b,{x:.1,y:.03,z:.5});
  assert.ok(Math.abs(eye.x-.1)<1e-10&&Math.abs(eye.y-.03)<1e-10&&Math.abs(eye.z-.5)<1e-10);
});
test('relative translation and depth use calibrated ratios, not raw centimetres',()=>{
  const a=measureHead(result(),video),b=measureHead(result({x:5,y:3,depth:60}),video);
  assert.deepEqual(estimateHeadEye(a,b,{x:0,y:0,z:.5}),{x:-.05,y:.03,z:.6});
});
test('stable natural side posture calibrates; substantial movement does not',()=>{
  const samples=Array.from({length:9},(_,i)=>({...measureHead(result({yaw:55,x:i*.005}),video),time:i*40}));
  assert.equal(calibrationIsStable(samples),true);assert.ok(meanMeasurement(samples).headAnchor);
  samples[8].pose.yaw=20;assert.equal(calibrationIsStable(samples),false);
});
function harness(){
  let time=0,id=0,output=result({yaw:55,eyes:false});const frames=new Map(),samples=[],eyes=[],statuses=[];
  const doc=new EventTarget();doc.hidden=false;const win=new EventTarget();
  const track=new EventTarget();track.stopped=false;track.stop=()=>{track.stopped=true;};track.getSettings=()=>({facingMode:'user'});
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
  const v={...video,readyState:4,currentTime:0,srcObject:null,pause(){},remove(){this.removed=true;}};
  const detector={closed:false,detectForVideo:()=>output,close(){this.closed=true;}};
  const environment={document:doc,window:win,now:()=>time,requestFrame:fn=>{frames.set(++id,fn);return id;},cancelFrame:i=>frames.delete(i),getUserMedia:()=>Promise.resolve(stream),createVideo:()=>v,readyVideo:()=>Promise.resolve(),loadDetector:()=>Promise.resolve(detector)};
  const tracker=createHeadTracker({environment,getBaseline:()=>({x:0,y:0,z:.5}),getCalibration:()=>({ipd:.063,estimateOrigin:false}),onSample:s=>samples.push(s),onEye:e=>eyes.push(e),onStatus:s=>statuses.push(s)});
  const advance=(count=1)=>{for(let i=0;i<count;i++){time+=50;v.currentTime+=.05;const todo=[...frames.values()];frames.clear();for(const fn of todo)fn(time);}};
  return {tracker,advance,setOutput:r=>{output=r;},samples,eyes,statuses,track,detector,frames,video:v,doc};
}
test('side posture can start tracking; missing eye corners do not block it',async()=>{
  const h=harness();try{assert.equal(await h.tracker.start(),true);h.advance(16);assert.equal(h.samples.at(-1).phase,'tracking');
    h.setOutput(result({yaw:60,x:4,eyes:false}));h.advance(10);assert.ok(h.eyes.at(-1).x<-.025);
  }finally{h.tracker.stop();}
});
test('temporary loss holds the view then auto-recovers without clicking recenter',async()=>{
  const h=harness();try{await h.tracker.start();h.advance(16);h.setOutput(result({x:3,yaw:55,eyes:false}));h.advance(10);
    const previous={...h.eyes.at(-1)};h.setOutput(result({count:0}));h.advance(35);
    assert.equal(h.samples.at(-1).phase,'lost');assert.ok(Math.abs(h.eyes.at(-1).x-previous.x)<.005);
    h.setOutput(result({x:3,yaw:55,eyes:false}));h.advance(16);assert.equal(h.samples.at(-1).phase,'tracking');
  }finally{h.tracker.stop();}
});
test('multiple faces pause and a stable single observer resumes without a teleport',async()=>{
  const h=harness();try{await h.tracker.start();h.advance(16);h.setOutput(result({count:2}));h.advance(6);assert.equal(h.samples.at(-1).phase,'multiple');
    h.setOutput(result({x:18,yaw:50}));h.advance(16);assert.equal(h.samples.at(-1).phase,'tracking');assert.ok(Math.abs(h.eyes.at(-1)?.x||0)<.01);
  }finally{h.tracker.stop();}
});
test('camera geometry changes still require explicit recenter',async()=>{
  const h=harness();try{await h.tracker.start();h.advance(16);h.video.videoWidth=960;h.advance(30);assert.equal(h.samples.at(-1).phase,'lost');
    assert.equal(h.tracker.recenter(),true);h.advance(16);assert.equal(h.samples.at(-1).phase,'tracking');
  }finally{h.tracker.stop();}
});
test('hidden-page shutdown releases camera detector and future frames',async()=>{
  const h=harness();await h.tracker.start();h.advance(16);h.doc.hidden=true;h.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.track.stopped,true);assert.equal(h.detector.closed,true);assert.equal(h.frames.size,0);assert.equal(h.video.srcObject,null);assert.equal(h.tracker.running,false);
});
test('quiet preview keeps attached video outside the hidden card',()=>{
  const card={},host={prepend(v){v.parentElement=this;}},body={append(v){v.parentElement=this;}};
  const doc={body,getElementById:id=>id==='camera-card'?card:host};
  const v={style:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}};
  placeTrackingVideo(v,false,doc);assert.equal(card.hidden,true);assert.equal(v.parentElement,body);assert.doesNotMatch(v.style.cssText,/display\s*:\s*none/);assert.equal(v.attrs['aria-hidden'],'true');
  placeTrackingVideo(v,true,doc);assert.equal(card.hidden,false);assert.equal(v.parentElement,host);assert.equal(v.attrs['aria-hidden'],undefined);
});
