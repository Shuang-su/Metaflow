// MF165_HEAD_PALM_AIR_V1
import {placeTrackingVideo} from './tracking-preview.mjs';
// MF165_MOBILE_VOICE_V1
import {deviceFamily,installMobileOptions,mobileProfileValues,landscapeOrientation,rotatedMeasuredWidth,pinchZoom} from './mobile.mjs';
import {createCompanionControls} from './companion-controls.mjs';
import { createTabletopRenderer } from './renderer.js';
import { createHeadTracker } from './tracking.mjs';
import { createTiltSensor } from './orientation.mjs';
import { detectDesktopMac, createDisplayCalibration, resolveDisplayCalibration } from './display-calibration.mjs';

const $ = (id) => document.getElementById(id);
const abort = new AbortController();
const listen = (node, event, fn, options = {}) => node?.addEventListener(event, fn, {...options, signal: abort.signal});
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const ranges = ['width','tilt','height','distance','eye-x','eye-y','floor-offset','avatar-depth','room-depth','light','camera-x','camera-y','ipd'];
const preferences = [...ranges,'camera-placement','device-preset','wood','gaze','animate','auto-height'];
const storageKey = 'metaflow-tabletop-calibration-v3';
const builtinModels = {
  reconstruction:{source:'./assets/milky-green-reconstruction.vrm',name:'明前奶绿 · 重建版',credit:'LAPLACE Live! / Milky Green · 重建样例，非已核实的视频同款'},
  wenjing:{source:{url:'./assets/wenjing.vrm.gz',bytes:17958450,decodedBytes:32201048,compression:'gzip'},name:'文镜 · 作者目录版',credit:'LAPLACE Live! × 彩茫 · CC BY-NC-SA 4.0 · 非商用演示'}
};
const defaultModelChoice='wenjing';
const isMac = detectDesktopMac({userAgent:navigator.userAgent,platform:navigator.platform,maxTouchPoints:navigator.maxTouchPoints||0});
const state = { mode: 'manual', eye: {x:0,y:.025,z:.55}, ready:false, disposed:false, generation:0, speaking:false, utterance:null, speechTimer:0, video:null, sample:null, cameraPhase:'idle', permission:'prompt', displayGeneration:0, wakeLock:null, wakePending:null, wakeGeneration:0, calibratedRect:null, resizeTimer:0, graphicsError:false, fullscreenWanted:false, view:'tabletop', inspectYaw:0, inspectPitch:.06, inspectZoom:1, modelPhase:'empty', sourceFile:null, modelName:'', displayCalibration:null, displayConfirmed:false, lastViewport:null, cameraOrigin:null, cameraListGeneration:0 };
let renderer = null, extras = null, mobileMeasurement = null;
const family=deviceFamily(navigator);
installMobileOptions(document);
$('show-preview').checked=false;
function mobileMetrics(){const m=viewportMetrics();return {...m,canvasWidth:m.width,landscape:landscapeOrientation({angle:screen.orientation?.angle??window.orientation,type:screen.orientation?.type,screenWidth:m.screenWidth,screenHeight:m.screenHeight})};}
state.modelChoice=defaultModelChoice;state.activeModelChoice=null;state.loadingModelChoice=null;state.lastWindowPosition=windowPosition();

function notice(message, error = false) {
  $('notice').textContent = message;
  $('notice').classList.toggle('error', error);
}
function n(id) { return Number($(id).value); }
function baseline() { return {x:n('eye-x')/100,y:n('eye-y')/100,z:n('distance')/100}; }
function desktopMode(){return $('device-preset').value.startsWith('mac')||($('device-preset').value==='manual'&&isMac);}
function viewportMetrics(){const r=$('stage').getBoundingClientRect();return {width:r.width,height:r.height,dpr:window.devicePixelRatio||1,screenWidth:screen.width||r.width,screenHeight:screen.height||r.height,scale:window.visualViewport?.scale||1};}
function windowPosition(){return {x:window.screenX||0,y:window.screenY||0};}
function screenGeometry() {
  const rect = $('stage').getBoundingClientRect();
  const width = n('width')/100;
  return {width,height:width*Math.max(1,rect.height)/Math.max(1,rect.width)};
}
function cameraCalibration() {
  const {width,height} = screenGeometry();
  let cameraX = n('camera-x')/100, cameraY = n('camera-y')/100;
  const placement = $('camera-placement').value;
  if (placement === 'bottom') { cameraX=0;cameraY=-height/2-.007; }
  if (placement === 'top') { cameraX=0;cameraY=height/2+.007; }
  if (placement === 'left') { cameraX=-width/2-.007;cameraY=0; }
  if (placement === 'right') { cameraX=width/2+.007;cameraY=0; }
  return {cameraX,cameraY,ipd:n('ipd')/100,estimateOrigin:true};
}
function renderSettings() {
  return {width:n('width')/100,tilt:n('tilt'),eye:state.eye,mode:state.mode,
    avatarHeight:$('auto-height').checked?null:n('height')/100,
    floorOffset:n('floor-offset')/100,avatarDepth:n('avatar-depth')/100,roomDepth:n('room-depth')/100,
    gaze:$('gaze').checked,animate:$('animate').checked,light:n('light'),wood:$('wood').value,grid:$('grid').checked,
    inspect:state.view==='inspect',inspectYaw:state.inspectYaw,inspectPitch:state.inspectPitch,inspectZoom:state.inspectZoom};
}
function loadPreferences() {
  let stored=false;
  try {
    const data=JSON.parse(localStorage.getItem(storageKey)||'{}');
    stored=typeof data['device-preset']==='string';
    for(const id of preferences) {
      const element=$(id), value=data[id];
      if(!element||value===undefined)continue;
      if(element.type==='checkbox'&&typeof value==='boolean')element.checked=value;
      else if(element.type==='range'&&Number.isFinite(value))element.value=String(clamp(value,Number(element.min),Number(element.max)));
      else if(element.tagName==='SELECT'&&[...element.options].some(o=>o.value===value))element.value=value;
    }
  } catch {}
  if(!stored&&family==='phone'){$('device-preset').value='iphone-standard';applyProfileValues('iphone-standard');}
  if(!stored&&family==='tablet'&&Math.min(screen.width,screen.height)<800){$('device-preset').value='ipad-mini';applyProfileValues('ipad-mini');}
  if(!stored&&isMac){$('device-preset').value='macbook';applyProfileValues('macbook');}
}
function applyProfileValues(value){
  const mobile=mobileProfileValues(value,mobileMetrics());
  if(mobile){for(const [id,v] of Object.entries(mobile))$(id).value=String(v);$('camera-placement').value='top';return;}
  // These are starting values, never an automatic measurement or model lookup.
  const profiles={macbook:{width:30,tilt:80,'floor-offset':1.5,'avatar-depth':6,'room-depth':28},'mac-desktop':{width:50,tilt:90,'floor-offset':10,'avatar-depth':30,'room-depth':45},'ipad-12.9-landscape':{width:26.2,tilt:65,'floor-offset':.8,'avatar-depth':4,'room-depth':24},'ipad-11-landscape':{width:22.9,tilt:65,'floor-offset':.8,'avatar-depth':4,'room-depth':24}};
  for(const [id,settingValue] of Object.entries(profiles[value]||{}))$(id).value=String(settingValue);
  $('camera-placement').value='top';
}
function savePreferences() {
  try {
    const data={};
    for(const id of preferences){const element=$(id);if(element)data[id]=element.type==='checkbox'?element.checked:element.type==='range'?Number(element.value):element.value;}
    localStorage.setItem(storageKey,JSON.stringify(data));
  } catch {}
}
function updateLabels() {
  for(const id of ranges) {
    const output=$(id+'-value');if(!output)continue;
    const value=n(id), digits=id==='light'?2:id==='tilt'?1:1;
    output.textContent=value.toFixed(digits).replace(/\.0+$/,'')+(id==='tilt'?'°':id==='light'?'×':' cm');
  }
  $('height').disabled=$('auto-height').checked;
  const custom=$('camera-placement').value==='custom';
  $('camera-x').disabled=!custom;$('camera-y').disabled=!custom;
  if(!custom){const c=cameraCalibration();$('camera-x-value').textContent=(c.cameraX*100).toFixed(1)+' cm';$('camera-y-value').textContent=(c.cameraY*100).toFixed(1)+' cm';}
  updateRuler();
}
function updateRuler(){
  $('screen-ruler').hidden=!$('show-ruler').checked||state.view==='inspect';
  const length=n('width')<12?2:5;
  $('ruler-label').textContent=`用实体尺核对：${length} cm`;
  $('screen-ruler').setAttribute('aria-label',`${length} 厘米屏幕校准尺`);
  $('ruler-line').style.width=`${$('stage').getBoundingClientRect().width*length/n('width')}px`;
}
function paintDevice(){
  const desktop=desktopMode();
  $('mac-camera-help').hidden=!desktop;$('motion-start').hidden=desktop;
  $('device-help').textContent=desktop?'这里不自动识别屏幕厘米尺寸。先进入全屏，或在固定窗口中用实体尺校准；移到另一显示器后重新测量。':'设备尺寸是近似起点，请按实际可见画布测量。';
  if(desktop)$('motion-status').textContent='Mac 使用手动倾角：填写屏幕与桌面的夹角。';
  else $('motion-status').textContent='可手动填写，或请求设备倾角。';
}
function paintActivity() {
  $('activity').textContent=state.graphicsError?'图形环境不可用':['fetching','parsing'].includes(state.modelPhase)?'正在读取角色':!state.ready?'等待选择角色':state.view==='inspect'?'普通透视 · 模型检查':state.mode==='camera'&&state.cameraPhase==='tracking'?(state.displayConfirmed?'头部追踪 · 本机':'追踪已开启 · 待物理校准'):state.mode==='auto'?'演示视差':'固定观察位置';
}
function paintMode() {
  const active=state.mode==='camera';$('quiet-camera-stop').hidden=!active;$('quiet-tracking-status').hidden=!active;
  for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode));
  for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===state.view));
  $('view-label').textContent=state.view==='inspect'?'拖动旋转 · 滚动缩放':state.mode==='camera'?'相机眼位':state.mode==='auto'?'演示镜头 · 非真实追踪':'拖动 / 方向键 · R 复位';
  $('camera-start').textContent=state.mode==='camera'?(tracker?.starting?'相机启动中 · 可取消':'重新校准相机'):desktopMode()?'开启摄像头追踪':'开启前摄追踪';
  $('camera-stop').disabled=state.mode!=='camera'&&!tracker?.starting&&!tracker?.running;
  $('recenter').disabled=state.mode!=='camera'||!tracker?.running;
  paintActivity();
}
function showSettings(open) {
  $('settings-panel').hidden=!open;
  $('settings-toggle').setAttribute('aria-expanded',String(open));
  if(open)$('close-settings').focus();else $('settings-toggle').focus();
  if(open)enumerateCameras();
}
function showCameraCard(){placeTrackingVideo(state.video,$('show-preview').checked&&!$('app').classList.contains('immersive'),document);}
function overlay(sample) {
  if(!$('show-preview').checked)return;
  const canvas=$('camera-overlay'), video=state.video;
  if(!video||!canvas)return;
  const width=video.videoWidth||sample.video?.width||640,height=video.videoHeight||sample.video?.height||480;
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  $('camera-preview').parentElement.style.aspectRatio=`${width} / ${height}`;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,width,height);
  const eyes=sample.eyes;
  if(!eyes?.left||!eyes?.right)return;
  ctx.strokeStyle=sample.quality==='good'?'#9fe9bf':'#ffd897';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=Math.max(2,width/280);
  const left={x:eyes.left.x*width,y:eyes.left.y*height},right={x:eyes.right.x*width,y:eyes.right.y*height};
  ctx.beginPath();ctx.moveTo(left.x,left.y);ctx.lineTo(right.x,right.y);ctx.stroke();
  for(const p of [left,right]){ctx.beginPath();ctx.arc(p.x,p.y,Math.max(3,width/100),0,Math.PI*2);ctx.stroke();}
  const mid=eyes.midpoint||{x:(eyes.left.x+eyes.right.x)/2,y:(eyes.left.y+eyes.right.y)/2};
  ctx.beginPath();ctx.arc(mid.x*width,mid.y*height,3,0,Math.PI*2);ctx.fill();
}
async function enumerateCameras() {
  const generation=++state.cameraListGeneration;
  if(!navigator.mediaDevices?.enumerateDevices){$('camera-device-status').textContent='浏览器没有开放摄像头列表；请使用 HTTPS 独立页面。';return;}
  try {
    const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');
    const select=$('camera-device'),current=select.value;
    if(generation!==state.cameraListGeneration||state.disposed)return;
    select.replaceChildren(new Option('自动选择摄像头',''));
    devices.filter(d=>d.deviceId).forEach((d,i)=>select.add(new Option(d.label||`摄像头 ${i+1} · 授权后显示名称`,d.deviceId)));
    select.value=[...select.options].some(o=>o.value===current)?current:'';
    select.disabled=false;
    $('camera-device-status').textContent=devices.some(d=>d.label)?`已列出 ${devices.length} 个视频输入；选择朝向自己的相机。`:'尚未获得完整设备列表。可先开启相机授权，再刷新；这不代表没有硬件。';
  } catch {if(generation===state.cameraListGeneration)$('camera-device-status').textContent='摄像头列表暂时无法读取，请检查权限后刷新。';}
}

loadPreferences();state.eye=baseline();updateLabels();paintDevice();state.lastViewport=viewportMetrics();

const tracker=createHeadTracker({
  getBaseline:baseline,
  getCalibration(){
    const calibration=cameraCalibration(),rect=$('stage').getBoundingClientRect();
    // Record the geometry used by this reference, not the moment tracking
    // resumes after a temporary loss. That recovery can reuse an older reference.
    state.calibratedRect={width:rect.width,height:rect.height};
    state.cameraOrigin=windowPosition();
    return calibration;
  },
  onEye(eye){if(state.mode==='camera'&&state.displayConfirmed)state.eye={...eye};},
  onVideo(video){
    state.video=video;
    if(video){state.permission='granted';enumerateCameras();}
    else $('camera-overlay').getContext('2d').clearRect(0,0,$('camera-overlay').width,$('camera-overlay').height);
    showCameraCard();
  },
  onSample(sample){
    state.sample=sample;
    $('tracking-meter').value=sample.phase==='tracking'?1:clamp(sample.progress||0,0,1);
    $('camera-card').dataset.quality=sample.quality||'unavailable';
    const labels={good:'整脸 / 头部追踪','hold-still':'保持自然坐姿片刻',turned:'侧转过大，暂时保位',multiple:'多人入镜，已暂停',lost:'暂时保位，等待重捕获',unavailable:'等待摄像头'};
    const distance=sample.eye?.z?` · ${(sample.eye.z*100).toFixed(0)} cm`:'';
    const fps=sample.fps>0?` · ${sample.fps.toFixed(0)} 次/秒`:'';
    $('tracking-quality').textContent=(!state.displayConfirmed&&sample.phase==='tracking'?'追踪正常 · 待画布校准':labels[sample.quality]||'校准中')+distance+fps;
    overlay(sample);
  },
  onStatus(result){
    state.cameraPhase=result.state;
    const quiet=$('quiet-tracking-status');quiet.textContent=({permission:'等待相机授权',loading:'准备本机追踪',calibrating:'自然坐姿校准',tracking:'头部追踪中',lost:'暂时保位 · 自动恢复',multiple:'多人入镜 · 已暂停',error:'追踪未启动',idle:'追踪已关闭'})[result.state]||'追踪准备中';
    $('tracking-status').textContent=result.message;
    const step=$('camera-step');if(step)step.textContent=result.message;
    if(result.state==='error'||result.state==='idle'){
      if(state.mode==='camera'){state.mode='manual';state.eye=baseline();}
      if(result.state==='error'){
        if(['front-camera-required','camera-constraints','camera-not-found'].includes(result.code))$('camera-device').value='';
        const help=desktopMode()&&result.code==='permission-denied'?' Mac：检查浏览器的网站相机设置和系统“隐私与安全性 → 摄像头”。':'';
        notice(result.message+help,true);enumerateCameras();
      }
    }
    if(result.state==='tracking'){
      notice(state.displayConfirmed?'正在本机跟随头部。无需盯住镜头；短暂丢失会保位并自动恢复。':'静默追踪已开启。请在“调整”中确认画布尺寸与镜头位置；诊断取景默认关闭。');
    }
    paintMode();
  }
});

function beginCamera(){
  if(state.disposed)return;
  handleViewportChange();handleWindowPositionChange();
  if(state.mode==='camera'&&tracker.running){if(!state.displayConfirmed)showSettings(true);tracker.recenter();return;}
  if(tracker.starting){++state.generation;state.mode='manual';tracker.stop();paintMode();return;}
  const generation=++state.generation;
  state.view='tabletop';updateRuler();
  state.calibratedRect=null;
  state.mode='camera';state.cameraPhase='permission';paintMode();
  $('tracking-status').textContent='请允许这个网站使用所选摄像头';
  // start() requests getUserMedia synchronously before any download awaits.
  const deviceId=$('camera-device').value||undefined;
  const pending=tracker.start({deviceId,allowEnvironmentCamera:desktopMode()&&Boolean(deviceId)});
  if(!state.displayConfirmed)showSettings(true);
  pending.then(ok=>{if(generation!==state.generation||state.disposed)return;if(!ok&&state.mode==='camera'){state.mode='manual';state.eye=baseline();}paintMode();}).catch(error=>{if(generation!==state.generation)return;state.mode='manual';notice(error.message,true);paintMode();});
}
function setMode(mode){
  if(mode==='camera'){beginCamera();return;}
  if(mode==='auto'){state.view='tabletop';updateRuler();}
  ++state.generation;state.mode=mode;tracker.stop();state.eye=baseline();paintMode();
  $('tracking-status').textContent=mode==='auto'?'正在用虚拟眼位演示视差。此模式不使用摄像头。':'摄像头已关闭。拖动场景可预览观察位置。';
  notice(mode==='auto'?'这是视差演示；放在桌上使用时，请开启前摄或固定眼位。':'调整完成后开启前摄，或者从固定观察位置观看。');
}
function setView(view){
  if(view==='inspect'&&state.mode==='camera')setMode('manual');
  state.view=view;if(state.mode!=='camera')state.eye=baseline();
  if(view==='inspect')state.mode='manual';
  updateRuler();paintMode();renderer?.resize();
  notice(view==='inspect'?'模型检查使用普通透视。拖动旋转，滚轮或触控板缩放，R 恢复全身。':'桌面窗口已恢复。请按实际屏幕尺寸和观看位置校准。');
}

const tiltSensor=createTiltSensor({
  onTilt(angle){
    if(angle<25||angle>90){$('motion-status').textContent=`当前 ${angle.toFixed(1)}°，请将平板架到 25–90° 范围。`;return;}
    $('tilt').value=angle.toFixed(1);updateLabels();
  },
  onStatus(phase,message){$('motion-status').textContent=message;$('motion-start').textContent=phase==='active'||phase==='waiting'?'停止倾角感应':'读取设备倾角';}
});

try {
  renderer=createTabletopRenderer({
    canvas:$('scene'),getSettings:renderSettings,
    onLoad(info){
      const phase=info.phase;
      if(info.code==='graphics-context-lost'){
        state.graphicsError=true;state.ready=false;$('render-error').hidden=false;$('render-error').textContent=info.message;
        for(const id of ['wave','speak','import','import-start','model-choice','load-default-model','retry-model','clear-model'])$(id).disabled=true;
        $('loading').hidden=true;stopSpeech();paintActivity();return;
      }
      if(state.graphicsError||state.disposed)return;
      state.modelPhase=phase;
      $('load-message').textContent=info.message||{fetching:'正在读取所选 VRM',parsing:'正在准备材质与骨骼',ready:'角色已就绪',error:'角色加载失败'}[phase];
      if(phase==='fetching'||phase==='parsing'){
        $('model-empty').hidden=true;$('loading').hidden=false;$('load-progress').hidden=false;$('retry-model').hidden=true;
        if(info.total>0)$('load-progress').value=info.loaded/info.total*100;else $('load-progress').removeAttribute('value');
      }
      if(phase==='ready'){$('loading').hidden=true;state.ready=true;$('wave').disabled=false;$('speak').disabled=false;$('clear-model').disabled=false;}
      if(phase==='error'){$('loading').hidden=true;$('model-empty').hidden=state.ready;$('load-progress').hidden=true;$('retry-model').hidden=false;notice(info.message||'角色载入失败，请重试。',true);}
      paintActivity();
    },
    onAvatar(info){
      if(state.graphicsError||state.disposed)return;
      state.activeModelChoice=state.loadingModelChoice;
      state.modelName=info.name||'导入的 VRM';
      $('scene-name').textContent=state.modelName;$('model-label').textContent=state.modelName;
      $('model-credit').textContent=builtinModels[state.activeModelChoice]?.credit||`${info.credit||'本地导入'} · 文件仅在当前浏览器读取`;
      $('model-empty').hidden=true;
      state.inspectYaw=0;state.inspectPitch=.06;state.inspectZoom=1;
      setView(state.activeModelChoice==='local'?'inspect':state.view);
    }
  });
} catch(error){
  state.graphicsError=true;$('loading').hidden=true;$('render-error').hidden=false;
  $('model-empty').hidden=true;
  for(const id of ['import','import-start','model-choice','load-default-model','retry-model','clear-model'])$(id).disabled=true;
  $('render-error').textContent='当前浏览器未能创建 WebGL2 图形上下文。请在支持 WebGL2 的浏览器中打开；摄像头授权与取景仍可在这里检查。';
  notice('三维图形尚未启动。相机权限和取景独立于三维模型，可继续检查。',true);paintActivity();
  console.error('Graphics initialization failed',error);
}

extras=createCompanionControls({getRenderer:()=>renderer,isReady:()=>state.ready&&!state.graphicsError,
  notify:notice,openSettings:()=>showSettings(true),onSpeaking:value=>{state.speaking=value;}});
function stopSpeech(){extras?.stop();renderer?.stopGesture();state.speaking=false;}
function speak(){extras?.toggleSpeech();}

listen($('camera-start'),'click',beginCamera);
listen($('camera-stop'),'click',()=>setMode('manual'));
listen($('quiet-camera-stop'),'click',()=>setMode('manual'));
listen($('recenter'),'click',()=>tracker.recenter());
listen($('camera-device'),'change',()=>{
  invalidatePhysicalCalibration('摄像头已切换，请核对新镜头相对画布中心的位置并重新确认。');
  if(state.mode==='camera'){setMode('manual');beginCamera();}
});
listen($('camera-refresh'),'click',enumerateCameras);
listen($('show-preview'),'change',()=>{showCameraCard();savePreferences();});
for(const b of document.querySelectorAll('[data-mode]'))listen(b,'click',()=>setMode(b.dataset.mode));
for(const b of document.querySelectorAll('[data-view]'))listen(b,'click',()=>setView(b.dataset.view));
listen($('settings-toggle'),'click',()=>showSettings($('settings-panel').hidden));
listen($('close-settings'),'click',()=>showSettings(false));
listen($('wave'),'click',()=>renderer?.wave());listen($('speak'),'click',speak);
listen($('import'),'click',()=>$('file').click());
listen($('import-start'),'click',()=>$('file').click());
function loadSelectedModel(choice=state.modelChoice){
  if(!renderer||state.graphicsError||(!Object.hasOwn(builtinModels,choice)&&choice!=='local')||(choice==='local'&&!state.sourceFile))return;
  state.modelChoice=choice;state.loadingModelChoice=choice;$('model-choice').value=choice;
  stopSpeech();
  if(builtinModels[choice]){const model=builtinModels[choice];renderer.loadAvatar(model.source,model.name,model.credit);}
  else renderer.loadAvatar(state.sourceFile);
}
listen($('model-choice'),'change',()=>loadSelectedModel($('model-choice').value));
listen($('load-default-model'),'click',()=>loadSelectedModel(defaultModelChoice));
listen($('file'),'change',()=>{
  const file=$('file').files?.[0];if(!file)return;
  state.sourceFile=file;
  $('local-model-option').disabled=false;$('local-model-option').textContent=`本地文件 · ${file.name}`;
  loadSelectedModel('local');$('file').value='';
});
listen($('retry-model'),'click',()=>loadSelectedModel());
listen($('clear-model'),'click',()=>{
  stopSpeech();renderer?.clearAvatar();state.ready=false;state.activeModelChoice=null;state.loadingModelChoice=null;state.modelChoice='empty';state.modelName='';state.modelPhase='empty';
  $('model-choice').value='empty';
  $('scene-name').textContent='桌面人像';$('model-label').textContent='尚未选择角色';$('model-credit').textContent='可选择作者目录中的文镜、保留的明前奶绿重建版，或导入自己的 VRM。';
  $('model-empty').hidden=false;$('loading').hidden=true;$('retry-model').hidden=true;$('clear-model').disabled=true;$('wave').disabled=true;$('speak').disabled=true;paintActivity();
});
listen($('motion-start'),'click',()=>{if(tiltSensor.active)tiltSensor.stop();else tiltSensor.start();});

function invalidatePhysicalCalibration(message){
  state.displayConfirmed=false;state.eye=baseline();
  $('display-calibration-status').textContent=message;
}
listen($('show-ruler'),'change',updateRuler);
listen($('confirm-calibration'),'click',()=>{
  handleViewportChange();handleWindowPositionChange();
  if(desktopMode()&&!document.fullscreenElement&&$('camera-placement').value!=='custom'){
    notice('Mac 窗口模式请先选择“自定义镜头位置”，量取镜头相对画布中心的左右、上下偏移，再确认。',true);
    $('camera-placement').focus();return;
  }
  try{state.displayCalibration=createDisplayCalibration(n('width'),viewportMetrics());}catch{notice('画布尚未就绪，请稍后测量。',true);return;}
  mobileMeasurement=state.displayCalibration;
  state.displayConfirmed=true;state.lastViewport=viewportMetrics();state.lastWindowPosition=windowPosition();
  $('display-calibration-status').textContent=`已确认 ${n('width').toFixed(1)} cm。窗口或显示器变化后，请重新核对镜头位置。`;
  $('show-ruler').checked=false;updateRuler();savePreferences();
  if(state.mode==='camera')tracker.recenter();paintMode();
  notice('画布尺寸与镜头位置已确认。请正对镜头保持片刻，完成眼位校准。');
});

for(const id of ranges){
  listen($(id),'input',()=>{
    if(id==='tilt')tiltSensor.stop();
    if(id==='width'){mobileMeasurement=null;state.displayCalibration=null;invalidatePhysicalCalibration('调整校准尺后，请点击“确认画布与镜头位置”。');}
    if(['camera-x','camera-y'].includes(id))invalidatePhysicalCalibration('镜头位置已调整，请重新确认画布与镜头位置。');
    if(['eye-x','eye-y','distance'].includes(id)&&state.mode!=='camera')state.eye=baseline();
    updateLabels();
  });
  listen($(id),'change',()=>{
    if(state.mode==='camera'&&['width','distance','eye-x','eye-y','camera-x','camera-y','ipd'].includes(id))tracker.recenter();
    savePreferences();
  });
}
for(const id of ['gaze','animate','auto-height','wood'])listen($(id),'change',()=>{updateLabels();savePreferences();});
listen($('camera-placement'),'change',()=>{
  if($('camera-placement').value==='custom')$('camera-offset-fields').open=true;
  invalidatePhysicalCalibration('镜头位置已改变，请量准后重新确认。');
  updateLabels();savePreferences();if(state.mode==='camera')tracker.recenter();
});
listen($('device-preset'),'change',()=>{
  const value=$('device-preset').value;mobileMeasurement=null;
  if(state.mode==='camera')setMode('manual');tiltSensor.stop();applyProfileValues(value);
  state.displayCalibration=null;invalidatePhysicalCalibration('设备配置已切换，请重新测量当前画布。');
  paintDevice();updateLabels();paintMode();savePreferences();renderer?.resize();
  $('show-ruler').checked=true;updateRuler();
  notice('这些是初始值；请用实体尺校准画布宽，并填写真实桌面高度与镜头位置。');
});

let dragging=false,lastPointer=null,pinch=null;
const pointers=new Map();
const pointerDistance=()=>{const [a,b]=[...pointers.values()];return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;};
listen($('scene'),'pointerdown',(event)=>{
  if(state.mode==='camera')return;
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(pointers.size>1){pinch={distance:pointerDistance(),zoom:state.inspectZoom};$('scene').setPointerCapture(event.pointerId);return;}
  dragging=true;lastPointer={x:event.clientX,y:event.clientY};$('scene').focus({preventScroll:true});$('scene').setPointerCapture(event.pointerId);if(state.mode==='auto')setMode('manual');
  if(state.view!=='inspect')movePointer(event);
});
function movePointer(event){
  if(!dragging||state.mode==='camera')return;
  if(pointers.has(event.pointerId))pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(pointers.size>1){if(state.view==='inspect'&&pinch)state.inspectZoom=pinchZoom(pinch.zoom,pinch.distance,pointerDistance());return;}
  if(state.view==='inspect'){
    state.inspectYaw=((state.inspectYaw-(event.clientX-lastPointer.x)*.008+Math.PI*3)%(Math.PI*2))-Math.PI;
    state.inspectPitch=clamp(state.inspectPitch+(event.clientY-lastPointer.y)*.005,0,.65);
    lastPointer={x:event.clientX,y:event.clientY};return;
  }
  const rect=$('scene').getBoundingClientRect(),base=baseline();
  state.eye={x:base.x+((event.clientX-rect.left)/rect.width-.5)*.20,y:base.y+(.5-(event.clientY-rect.top)/rect.height)*.12,z:base.z};
}
function releasePointer(event){pointers.delete(event.pointerId);pinch=null;lastPointer=[...pointers.values()][0]||null;dragging=!!lastPointer;}
listen($('scene'),'pointermove',movePointer);
for(const event of ['pointerup','pointercancel','lostpointercapture'])listen($('scene'),event,releasePointer);
listen($('scene'),'wheel',(event)=>{
  if(state.view!=='inspect')return;
  event.preventDefault();const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?window.innerHeight:1);
  state.inspectZoom=clamp(state.inspectZoom*Math.exp(-clamp(delta,-150,150)*.003),.5,1.8);
},{passive:false});
listen($('scene'),'keydown',(event)=>{
  if(event.ctrlKey||event.metaKey||event.altKey||state.mode==='camera')return;
  const key=event.key.toLowerCase();if(!['arrowleft','arrowright','arrowup','arrowdown','r','+','=','-'].includes(key))return;
  event.preventDefault();
  if(state.mode==='auto')setMode('manual');
  if(key==='r'){state.eye=baseline();state.inspectYaw=0;state.inspectPitch=.06;state.inspectZoom=1;return;}
  if(state.view==='inspect'){
    if(key==='arrowleft'||key==='arrowright')state.inspectYaw=clamp(state.inspectYaw+(key==='arrowleft'?.08:-.08),-Math.PI,Math.PI);
    if(key==='arrowup'||key==='arrowdown')state.inspectPitch=clamp(state.inspectPitch+(key==='arrowup'?.05:-.05),0,.65);
    if(['+','=','-'].includes(key))state.inspectZoom=clamp(state.inspectZoom*(key==='-'?.9:1.1),.5,1.8);
  }else{
    const step=event.shiftKey?.025:.01;
    if(key==='arrowleft'||key==='arrowright')state.eye.x=clamp(state.eye.x+(key==='arrowleft'?-step:step),-.3,.3);
    if(key==='arrowup'||key==='arrowdown')state.eye.y=clamp(state.eye.y+(key==='arrowup'?step:-step),-.3,.3);
    if(['+','=','-'].includes(key))state.eye.z=clamp(state.eye.z+(key==='-'?.025:-.025),.25,1.2);
  }
});

function releaseWakeLock(){
  ++state.wakeGeneration;
  // An unresolved request cannot be cancelled, but its generation is now stale.
  // Do not let its completion clear or replace a subsequent pending request.
  state.wakePending=null;
  const lock=state.wakeLock;state.wakeLock=null;
  try{return Promise.resolve(lock?.release()).catch(()=>{});}catch{return Promise.resolve();}
}
function acquireWakeLock(){
  const wanted=state.fullscreenWanted||$('app').classList.contains('immersive');
  if(document.hidden||state.disposed||!wanted)return Promise.resolve();
  if(state.wakeLock?.released)state.wakeLock=null;
  if(state.wakeLock)return Promise.resolve(state.wakeLock);
  if(state.wakePending)return state.wakePending;
  const generation=state.wakeGeneration;
  let request;
  try{request=navigator.wakeLock?.request('screen');}catch{return Promise.resolve();}
  if(!request)return Promise.resolve();
  const pending=Promise.resolve(request).then(async(lock)=>{
    if(!lock)return;
    const stillWanted=state.fullscreenWanted||$('app').classList.contains('immersive');
    if(state.disposed||document.hidden||!stillWanted||generation!==state.wakeGeneration){
      await lock.release().catch(()=>{});return;
    }
    state.wakeLock=lock;
    const released=()=>{if(state.wakeLock===lock)state.wakeLock=null;};
    lock.addEventListener?.('release',released,{once:true});
    if(lock.released)released();
    return lock;
  }).catch(()=>{}).finally(()=>{if(state.wakePending===pending)state.wakePending=null;});
  state.wakePending=pending;
  return pending;
}
function handleViewportChange(){
  if(state.disposed)return;
  const metrics=viewportMetrics(),previous=state.lastViewport;state.lastViewport=metrics;
  if(!previous||Object.keys(metrics).every(key=>Math.abs(metrics[key]-previous[key])<.001))return;
  let message='画布尺寸已变化，请核对实际宽度与镜头位置，再开启相机。';
  if(state.displayCalibration){
    const resolved=resolveDisplayCalibration(state.displayCalibration,metrics);
    if(resolved.valid&&resolved.widthCm>=5&&resolved.widthCm<=120){
      $('width').value=resolved.widthCm.toFixed(2);
      message='窗口大小已变化，厘米宽已按尺量比例更新；请核对镜头位置，再开启相机。';
    }else{
      state.displayCalibration=null;
      message='显示器、缩放或显示参数已变化，请用实体尺重新校准。';
    }
  }
  invalidatePhysicalCalibration(message);
  if(state.mode==='camera')setMode('manual');
  notice(message);updateLabels();
}
function handleWindowPositionChange(){
  const position=windowPosition(),previous=state.lastWindowPosition;
  if(!desktopMode()||document.fullscreenElement||!previous){state.lastWindowPosition=position;return;}
  // Keep an anchor so a series of small moves cannot evade invalidation.
  if(Math.abs(position.x-previous.x)<=2&&Math.abs(position.y-previous.y)<=2)return;
  state.lastWindowPosition=position;
  const wasConfirmed=state.displayConfirmed,wasTracking=state.mode==='camera';
  state.displayCalibration=null;
  invalidatePhysicalCalibration('窗口位置已改变，请核对画布尺寸及镜头相对画布中心的偏移。');
  if(wasTracking)setMode('manual');
  if(wasConfirmed||wasTracking)notice('窗口位置已改变。请重新确认画布与镜头位置；相机跟随需要重新校准。');
}
function scheduleCalibration(){
  clearTimeout(state.resizeTimer);
  state.resizeTimer=setTimeout(()=>{
    handleViewportChange();
    if(state.disposed||state.mode!=='camera'||!tracker.running)return;
    const rect=$('stage').getBoundingClientRect(),reference=state.calibratedRect;
    if(!reference||Math.abs(rect.width-reference.width)>1||Math.abs(rect.height-reference.height)>1){
      setMode('manual');invalidatePhysicalCalibration('可见区域已变化，请重新核对画布与镜头位置。');notice('相机已暂停，请确认物理校准后重新开启。');
    }
  },250);
}
async function enterFullscreen(hideControls){
  const generation=++state.displayGeneration;state.fullscreenWanted=true;
  if(!document.fullscreenElement){
    try{await document.documentElement.requestFullscreen?.();}catch{}
  }
  if(generation!==state.displayGeneration){
    if(!state.fullscreenWanted&&document.fullscreenElement)await document.exitFullscreen().catch(()=>{});
    return;
  }
  $('app').classList.toggle('immersive',hideControls);$('leave-display').hidden=!hideControls;showCameraCard();
  if(hideControls){$('settings-panel').hidden=true;$('settings-toggle').setAttribute('aria-expanded','false');}else showSettings(true);
  if(!document.fullscreenElement)notice('浏览器未进入系统全屏。请按当前可见画布测量；相机位置可用自定义厘米值校准。');
  await acquireWakeLock();renderer?.resize();scheduleCalibration();
}
function leaveDisplay(){
  ++state.displayGeneration;
  $('app').classList.remove('immersive');$('leave-display').hidden=true;showCameraCard();
  // Keep the fullscreen viewport unchanged while its controls are visible.
  // Exiting fullscreen here would invalidate the physical calibration again.
}
async function exitFullscreen(){
  ++state.displayGeneration;state.fullscreenWanted=false;leaveDisplay();
  const generation=state.displayGeneration;
  await releaseWakeLock();
  if(generation!==state.displayGeneration||state.fullscreenWanted)return;
  if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});
  scheduleCalibration();
}
listen($('display'),'click',()=>enterFullscreen(true));
listen($('fullscreen-calibrate'),'click',()=>enterFullscreen(false));
listen($('exit-fullscreen'),'click',exitFullscreen);
listen($('leave-display'),'click',leaveDisplay);
listen($('scene'),'dblclick',()=>{if($('app').classList.contains('immersive'))leaveDisplay();});
listen(document,'fullscreenchange',()=>{
  const fullscreen=!!document.fullscreenElement;
  $('exit-fullscreen').hidden=!fullscreen;
  $('fullscreen-calibrate').textContent=fullscreen?'在当前全屏中校准':'进入全屏校准';
  if(!fullscreen){state.fullscreenWanted=false;leaveDisplay();releaseWakeLock();}
  handleViewportChange();renderer?.resize();updateLabels();scheduleCalibration();
});
listen(window,'keydown',(event)=>{
  if(event.key==='Escape'){if(!$('settings-panel').hidden)showSettings(false);else if($('app').classList.contains('immersive'))leaveDisplay();}
});
const resizeObserver=new ResizeObserver(()=>{handleViewportChange();renderer?.resize();updateLabels();scheduleCalibration();});
resizeObserver.observe($('stage'));
listen(window.visualViewport,'resize',()=>{handleViewportChange();renderer?.resize();});
const displayWatcher=setInterval(()=>{
  if(document.hidden||state.disposed)return;
  handleViewportChange();
  handleWindowPositionChange();
},500);
listen(navigator.mediaDevices,'devicechange',enumerateCameras);
listen(document,'visibilitychange',()=>{
  renderer?.pause(document.hidden);
  if(!document.hidden&&(state.fullscreenWanted||$('app').classList.contains('immersive')))acquireWakeLock();
  if(document.hidden){stopSpeech();setMode('manual');tiltSensor.stop();releaseWakeLock();}
});
function dispose(){
  if(state.disposed)return;state.disposed=true;++state.generation;++state.displayGeneration;
  stopSpeech();extras?.dispose();tracker.stop();tiltSensor.stop();renderer?.dispose();resizeObserver.disconnect();clearTimeout(state.resizeTimer);clearInterval(displayWatcher);abort.abort();releaseWakeLock();
}
listen(window,'pagehide',(event)=>{if(event.persisted){renderer?.pause(true);stopSpeech();setMode('manual');tiltSensor.stop();releaseWakeLock();}else dispose();});
listen(window,'pageshow',()=>{renderer?.pause(document.hidden);if(!document.hidden)acquireWakeLock();});

let mobileLandscape=mobileMetrics().landscape;
function reorientMobile(){
  const m=mobileMetrics();if(m.landscape===mobileLandscape)return;mobileLandscape=m.landscape;
  const profile=mobileProfileValues($('device-preset').value,m);if(!profile)return;
  if(state.mode==='camera')setMode('manual');tiltSensor.stop();
  $('width').value=String(rotatedMeasuredWidth(mobileMeasurement,m)??profile.width);
  state.displayCalibration=null;
  invalidatePhysicalCalibration('屏幕方向已改变。请核对校准尺，并选择转动后的镜头所在边，再确认。');
  $('show-ruler').checked=true;updateLabels();paintMode();renderer?.resize();savePreferences();
  notice('横竖屏已切换，请重新确认画布宽与镜头位置；角色不会自动跟随旋转。');
}
// MF165_ORIENTATION_SETTLED
// orientationchange can precede the new CSS viewport. Coalesce both events,
// then measure after layout; keyboard-only resize never changes orientation.
let orientationTimer=0;
function scheduleMobileOrientation(){
  clearTimeout(orientationTimer);
  orientationTimer=setTimeout(()=>{if(!state.disposed)reorientMobile();},180);
}
listen(screen.orientation,'change',scheduleMobileOrientation);
listen(window,'orientationchange',scheduleMobileOrientation);
listen(window,'resize',scheduleMobileOrientation);
listen(window,'pagehide',()=>clearTimeout(orientationTimer));

if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)$('animate').checked=false;
paintMode();
enumerateCameras();
loadSelectedModel(defaultModelChoice);
$('tracking-status').textContent='先确认画布宽和镜头位置，然后开启前摄，在浏览器提示中允许相机。';
$('tracking-quality').textContent='等待相机授权';
if(window.top!==window.self)notice('请在独立网页中打开本网站，以便浏览器请求摄像头和传感器权限。');

// Non-sensitive validation output. No frames, landmarks, device IDs or audio.
window.__companionDiagnostics=()=>({model:$('scene-name').textContent,ready:state.ready,mode:state.mode,view:state.view,profile:$('device-preset').value,physicalWidthCm:n('width'),displayConfirmed:state.displayConfirmed,cameraPhase:state.cameraPhase,cameraActive:!!state.video,permission:state.permission,eye:{...state.eye},graphics:!state.graphicsError,voice:extras?.diagnostics()||null,renderer:renderer?.diagnostics()||null});
