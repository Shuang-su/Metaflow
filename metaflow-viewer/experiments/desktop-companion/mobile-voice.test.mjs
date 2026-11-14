import test from 'node:test';
import assert from 'node:assert/strict';
import {deviceFamily,landscapeOrientation,mobileProfileValues,rotatedMeasuredWidth,recommendedPixelRatio,pinchZoom,MOBILE_PROFILES} from './mobile.mjs';
import {GESTURES,gesturePose,createGesturePlayer,mouthFromSamples} from './motion.mjs';
import {createVoiceController} from './voice.mjs';
function harness(){
  let id=0;const timers=new Map(),frames=new Map(),states=[],mouth=[],utterances=[],audios=[],contexts=[],revoked=[];
  class Utterance{constructor(text){this.text=text;}}
  class Audio{constructor(){this.paused=true;this.ended=false;audios.push(this);}play(){this.paused=false;queueMicrotask(()=>this.onplaying?.());return Promise.resolve();}pause(){this.paused=true;this.onpause?.();}removeAttribute(){this.src='';}load(){}}
  class Context{constructor(){this.destination={};contexts.push(this);}createMediaElementSource(){return {connect(){},disconnect(){}};}createAnalyser(){return {fftSize:1024,connect(){},disconnect(){},getByteTimeDomainData(a){a.fill(128);}};}resume(){return Promise.resolve();}close(){this.closed=true;return Promise.resolve();}}
  const env={SpeechSynthesisUtterance:Utterance,Audio,AudioContext:Context,URL:{createObjectURL:()=>`blob:${++id}`,revokeObjectURL:url=>revoked.push(url)},
    speechSynthesis:{getVoices:()=>[{voiceURI:'zh-test',name:'test',lang:'zh-CN'}],speak:u=>utterances.push(u),cancel(){}},
    setTimeout:fn=>{const key=++id;timers.set(key,fn);return key;},clearTimeout:key=>timers.delete(key),
    requestAnimationFrame:fn=>{const key=++id;frames.set(key,fn);return key;},cancelAnimationFrame:key=>frames.delete(key)};
  const voice=createVoiceController({environment:env,onState:s=>states.push(s),onMouth:v=>mouth.push(v)});
  return {voice,env,states,mouth,utterances,audios,contexts,revoked,timers,frames};
}
const file={name:'authorized-sample.wav',type:'audio/wav',size:100};
test('iPad desktop UA is tablet, ordinary Mac remains desktop',()=>{
  assert.equal(deviceFamily({userAgent:'Mozilla iPhone',maxTouchPoints:5}),'phone');
  assert.equal(deviceFamily({platform:'MacIntel',maxTouchPoints:5}),'tablet');
  assert.equal(deviceFamily({platform:'MacIntel',maxTouchPoints:0}),'desktop');
});
test('screen orientation ignores keyboard-induced canvas aspect changes',()=>{
  assert.equal(landscapeOrientation({angle:0,screenWidth:844,screenHeight:390}),false);
  assert.equal(landscapeOrientation({type:'landscape-primary',angle:0}),true);
  assert.equal(landscapeOrientation({angle:-90}),true);
});
for(const id of Object.keys(MOBILE_PROFILES))test(`${id}: portrait/landscape physical width and window fraction`,()=>{
  const p=mobileProfileValues(id,{canvasWidth:390,screenWidth:390,screenHeight:844});
  const l=mobileProfileValues(id,{landscape:true,canvasWidth:844,screenWidth:390,screenHeight:844});
  assert.ok(l.width>p.width);assert.ok(p.width>=5&&p.width<15);assert.ok(l.width<22);
});
test('invalid metrics do not produce NaN calibration',()=>{
  assert.throws(()=>mobileProfileValues('ipad-mini',{canvasWidth:NaN}),RangeError);
  assert.equal(mobileProfileValues('manual'),null);
});
test('mini reference uses panel pixels/ppi, not chassis dimensions',()=>{
  assert.ok(Math.abs(mobileProfileValues('ipad-mini',{canvasWidth:744,screenWidth:744,screenHeight:1133}).width-11.593865)<.00001);
});
test('rotation preserves measured CSS density but rejects display/zoom changes',()=>{
  const c={cmPerPixel:.02,reference:{dpr:2,scale:1,screenWidth:744,screenHeight:1133}};
  assert.equal(rotatedMeasuredWidth(c,{width:1133,dpr:2,scale:1,screenWidth:1133,screenHeight:744}),22.66);
  assert.equal(rotatedMeasuredWidth(c,{width:744,dpr:3,scale:1,screenWidth:744,screenHeight:1133}),null);
});
test('touch zoom and render density are bounded',()=>{
  assert.equal(pinchZoom(1,100,1000),1.8);assert.equal(pinchZoom(1,100,1),.5);assert.equal(pinchZoom(1,0,1),1);
  assert.equal(recommendedPixelRatio({userAgent:'iPhone'},3),1.25);
});
for(const name of Object.keys(GESTURES))test(`${name}: bounded movement, neutral boundaries and VRM axes`,()=>{
  assert.equal(gesturePose(name,-1).done,true);assert.equal(gesturePose(name,GESTURES[name]).done,true);
  for(let t=0;t<GESTURES[name];t+=.01){const p=gesturePose(name,t);assert.ok(Math.abs(p.pitch)<=.2&&Math.abs(p.yaw)<=.25&&Math.abs(p.spine)<=.23);assert.ok(p.wave>=0&&p.wave<=1);}
  assert.equal(gesturePose(name,.6,-1).pitch,-gesturePose(name,.6,1).pitch);
});
test('gestures replace, stop and expire without timers',()=>{
  const p=createGesturePlayer();assert.equal(p.play('unknown',0),false);p.play('wave',10);p.play('nod',11);assert.equal(p.active,'nod');p.sample(20);assert.equal(p.active,null);p.play('bow',21);p.stop();assert.equal(p.active,null);
});
test('audio silence/DC offset closes mouth; waveform opens it',()=>{
  assert.equal(mouthFromSamples(new Uint8Array(128).fill(128)),0);assert.equal(mouthFromSamples(new Uint8Array(128).fill(170)),0);
  assert.ok(mouthFromSamples(Uint8Array.from({length:128},(_,i)=>128+Math.sin(i)*30))>.5);
});
test('TTS only opens mouth on actual start and closes on completion',()=>{
  const h=harness();assert.equal(h.voice.speak('你好'),true);assert.equal(h.mouth.at(-1),0);
  h.utterances[0].onstart();assert.equal(h.mouth.at(-1),null);assert.equal(h.states.at(-1).phase,'playing');
  h.utterances[0].onend();assert.equal(h.voice.active,false);assert.equal(h.mouth.at(-1),0);assert.equal(h.timers.size,0);
});
test('stopped and replaced TTS cannot be restarted by late events',()=>{
  const h=harness();h.voice.speak('第一句');const late=h.utterances[0].onstart;
  h.voice.speak('第二句');late();assert.equal(h.states.at(-1).phase,'loading');
  const second=h.utterances[1].onstart;h.voice.stop();second();assert.equal(h.states.at(-1).phase,'idle');assert.equal(h.mouth.at(-1),0);
});
test('TTS range checks and missing API are explicit',()=>{
  const h=harness();assert.equal(h.voice.speak(''),false);assert.equal(h.voice.speak('a'.repeat(501)),false);
  delete h.env.speechSynthesis;assert.equal(h.voice.speak('你好'),false);assert.equal(h.states.at(-1).phase,'error');
});
test('local audio starts on user call and releases every owned resource',async()=>{
  const h=harness();assert.equal(h.voice.playFile(file),true);await Promise.resolve();
  assert.equal(h.states.at(-1).phase,'playing');assert.equal(h.frames.size,1);
  h.voice.stop();assert.equal(h.frames.size,0);assert.equal(h.contexts[0].closed,true);assert.equal(h.revoked.length,1);assert.equal(h.audios[0].src,'');assert.equal(h.mouth.at(-1),0);
});
test('late file playback after stop cannot reactivate the avatar',async()=>{
  const h=harness();h.voice.playFile(file);h.voice.stop();await Promise.resolve();assert.equal(h.voice.active,false);assert.equal(h.states.at(-1).phase,'idle');assert.equal(h.frames.size,0);
});
test('bad files fail without creating audio resources',()=>{
  const h=harness();assert.equal(h.voice.playFile({name:'x.exe',type:'',size:100}),false);assert.equal(h.voice.playFile({...file,size:40*1024*1024}),false);assert.equal(h.audios.length,0);
});
test('dispose is idempotent and prevents later activation',()=>{
  const h=harness();h.voice.speak('你好');h.voice.dispose();h.voice.dispose();assert.equal(h.voice.speak('再见'),false);assert.equal(h.voice.playFile(file),false);assert.equal(h.timers.size,0);
});
