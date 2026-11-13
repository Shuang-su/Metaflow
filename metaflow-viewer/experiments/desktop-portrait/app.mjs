import * as pc from './node_modules/playcanvas/build/playcanvas.mjs';
import { getProjection, tablePose, clampEye } from './projection.mjs';
import { createHeadTracker } from './tracking.mjs';
import { createCalibrationPly } from './sample.mjs';
import { createAssetLoader } from './asset-loader.mjs';

const $ = id => document.getElementById(id);
const canvas = $('canvas');
const defaults = { width: 26, tilt: 65, eyeX: 0, eyeY: 15, eyeZ: 55, height: 18, depth: 10, heading: 0, foot: 0 };
const values = { ...defaults };
let app, camera, desk, personRoot, model, modelAsset, modelBounds, shadow, floor, markers;
let viewEye = baseline();
let viewport = { width: window.innerWidth, height: window.innerHeight };
let sourceRotation = 'none';
let loadSequence = 0;
let activeLoads = 0;
let portraitLoader;
let disposed = false;
let floorTexture, shadowTexture, wakeLock, resizeObserver, tiltCancel;
let presentationGeneration = 0;
let tiltGeneration = 0;
let ready = false;
let assetName = '合成高斯校准样本';
const offsetVector = new pc.Vec2();

function baseline() { return { x: values.eyeX / 100, y: values.eyeY / 100, z: values.eyeZ / 100 }; }
function message(text, error = false) {
  $('message').textContent = text;
  $('assetName').textContent = assetName;
  $('status').dataset.error = String(error);
}
function syncLabels() {
  for (const [key, value] of Object.entries(values)) {
    const unit = key === 'tilt' || key === 'heading' ? '°' : key === 'foot' ? ' mm' : ' cm';
    $(`${key}Value`).textContent = `${value}${unit}`;
    $(key).value = value;
  }
}
function constrainCanvasWidth() {
  const aspect=viewport.width/viewport.height;
  const min=Math.max(8,Math.ceil(4*aspect*10)/10);
  const max=Math.min(80,Math.floor(100*aspect*10)/10);
  $('width').min=String(min);$('width').max=String(max);
  values.width=Math.min(max,Math.max(min,values.width));
}

const tracker = createHeadTracker({
  getBaseline: baseline,
  onEye(eye) { viewEye = clampEye(eye); updateProjection(); },
  onStatus(status) {
    $('trackingStatus').textContent = status.message;
    $('tracking').textContent = ['loading', 'calibrating', 'tracking', 'lost'].includes(status.state) ? '停止追踪' : '开启前摄追踪';
  }
});

function geometry() {
  const width = values.width / 100;
  const height = width * viewport.height / viewport.width;
  return { width, height };
}
function updateProjection() {
  if (!camera || disposed) return;
  try {
    const { width, height } = geometry();
    const projection = getProjection({ width, height, eye: viewEye });
    camera.setPosition(projection.eye.x, projection.eye.y, projection.eye.z);
    camera.setEulerAngles(0, 0, 0);
    camera.camera.horizontalFov = false;
    camera.camera.aspectRatioMode = pc.ASPECT_MANUAL;
    camera.camera.aspectRatio = projection.aspect;
    camera.camera.fov = projection.fov;
    // Assign through the setter; mutating the getter's Vec2 does not dirty the matrix.
    camera.camera.projectionOffset = offsetVector.set(projection.offset.x, projection.offset.y);
    const pose = tablePose({ height, tiltDegrees: values.tilt });
    desk.setLocalPosition(pose.position.x, pose.position.y, pose.position.z);
    desk.setLocalEulerAngles(pose.rotationX, 0, 0);
    if (markers) {
      [[-.5,-.5],[.5,-.5],[-.5,.5],[.5,.5],[0,0]].forEach(([x,y],i) => markers.children[i].setLocalPosition(width*x, height*y, 0));
    }
  } catch (error) { message(`校准参数不可用：${error.message}`, true); }
}

function updatePerson() {
  if (!personRoot || disposed) return;
  personRoot.setLocalPosition(0, 0, -values.depth / 100);
  personRoot.setLocalEulerAngles(0, values.heading, 0);
  shadow.setLocalPosition(0, .0005, -values.depth / 100);
  const spread = values.height / 100 * .55;
  shadow.setLocalScale(spread, 1, spread * .62);
  shadow.enabled = $('shadow').checked;
  if (!model || !modelBounds) return;
  const angles = { none: [0,0,0], z180: [0,0,180], x180: [180,0,0], x90: [-90,0,0] }[sourceRotation];
  const rotation = new pc.Quat().setFromEulerAngles(...angles);
  const transform = new pc.Mat4().setTRS(new pc.Vec3(), rotation, pc.Vec3.ONE);
  const bounds = new pc.BoundingBox();
  bounds.setFromTransformedAabb(modelBounds, transform);
  const fullHeight = bounds.halfExtents.y * 2;
  if (!Number.isFinite(fullHeight) || fullHeight < 1e-8) return;
  const scale = values.height / 100 / fullHeight;
  model.setLocalRotation(rotation);
  model.setLocalScale(scale, scale, scale);
  const footY = bounds.center.y - bounds.halfExtents.y;
  model.setLocalPosition(-bounds.center.x * scale, -footY * scale + values.foot / 1000, -bounds.center.z * scale);
}

function textureFromCanvas(source) {
  const texture = new pc.Texture(app.graphicsDevice, { width: source.width, height: source.height, format: pc.PIXELFORMAT_RGBA8, mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR });
  texture.setSource(source);
  return texture;
}
function makeFloorTexture(style) {
  const source = document.createElement('canvas');
  source.width = source.height = 512;
  const ctx = source.getContext('2d');
  ctx.fillStyle = '#dedad4'; ctx.fillRect(0, 0, 512, 512);
  if (style === 'wood') {
    // Deterministic procedural grain, independently generated for this prototype.
    for (let x = 0; x < 512; x++) {
      const tone = 195 + Math.round(14 * Math.sin(x * .17) + 8 * Math.sin(x * .73));
      ctx.strokeStyle = `rgb(${tone},${tone},${tone})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, 0);
      for (let y = 0; y <= 512; y += 16) ctx.lineTo(x + Math.sin(y * .023 + x * .027) * 3, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#56514b55'; ctx.fillRect(0, 0, 2, 512); ctx.fillRect(255, 0, 2, 512);
  } else if (style === 'grid') {
    ctx.strokeStyle = '#777'; ctx.lineWidth = 2;
    for (let n = 0; n <= 512; n += 64) { ctx.beginPath(); ctx.moveTo(n,0); ctx.lineTo(n,512); ctx.moveTo(0,n); ctx.lineTo(512,n); ctx.stroke(); }
  }
  return textureFromCanvas(source);
}
function updateFloor() {
  if (!floor) return;
  const material = floor.render.meshInstances[0].material;
  const old = floorTexture;
  floorTexture = makeFloorTexture($('floorStyle').value);
  material.emissiveMap = floorTexture;
  material.emissive.set(...hexColor($('floorColor').value));
  material.update();
  old?.destroy();
}
function hexColor(hex) { return [1,3,5].map(i => parseInt(hex.slice(i,i+2),16) / 255); }

function createScene() {
  camera = new pc.Entity('Calibrated eye');
  camera.addComponent('camera', { clearColor: new pc.Color(.07,.065,.06), nearClip: .005, farClip: 8 });
  app.root.addChild(camera);
  desk = new pc.Entity('Level desk'); app.root.addChild(desk);
  const floorMaterial = new pc.StandardMaterial();
  floorMaterial.useLighting = false;
  floorMaterial.diffuse.set(0,0,0);
  floorMaterial.emissiveTint = true;
  floorMaterial.emissiveMapTiling.set(4,4);
  floorMaterial.update();
  floor = new pc.Entity('Desk surface');
  floor.addComponent('render', { type: 'plane', material: floorMaterial });
  floor.setLocalPosition(0,-.0008,-.25); floor.setLocalScale(1.4,1,1.4);
  desk.addChild(floor);
  // Use the emissive map alone: adding constant white emission washes out the wood.
  updateFloor();
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width=shadowCanvas.height=128;
  const ctx = shadowCanvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64,64,0,64,64,62);
  gradient.addColorStop(0,'rgba(0,0,0,.55)'); gradient.addColorStop(.4,'rgba(0,0,0,.22)'); gradient.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=gradient; ctx.fillRect(0,0,128,128);
  shadowTexture=textureFromCanvas(shadowCanvas);
  const shadowMaterial = new pc.StandardMaterial();
  shadowMaterial.useLighting=false; shadowMaterial.diffuse.set(0,0,0); shadowMaterial.emissive.set(0,0,0);
  shadowMaterial.opacityMap=shadowTexture; shadowMaterial.opacityMapChannel='a'; shadowMaterial.blendType=pc.BLEND_NORMAL; shadowMaterial.depthWrite=false; shadowMaterial.update();
  shadow=new pc.Entity('Illustrative contact shadow'); shadow.addComponent('render',{type:'plane',material:shadowMaterial}); desk.addChild(shadow);
  personRoot=new pc.Entity('Portrait foot anchor'); desk.addChild(personRoot);
  markers=new pc.Entity('Screen plane markers'); app.root.addChild(markers);
  const markerMaterial=new pc.StandardMaterial(); markerMaterial.useLighting=false; markerMaterial.emissive.set(.7,.42,1); markerMaterial.update();
  for(let i=0;i<5;i++) { const marker=new pc.Entity(`Screen marker ${i}`); marker.addComponent('render',{type:'sphere',material:markerMaterial}); marker.setLocalScale(.002,.002,.002); markers.addChild(marker); }
  markers.enabled=false;
  updateProjection(); updatePerson();
}

async function openPortrait({ url, filename, revoke = false, synthetic = false }) {
  const sequence = ++loadSequence;
  activeLoads++;
  message(`正在载入 ${filename}…`);
  let next;
  try {
    const asset = await portraitLoader.load({ url, filename }); next=asset;
    if (disposed || sequence !== loadSequence) { asset.unload(); app.assets.remove(asset); return; }
    const entity = new pc.Entity('Gaussian portrait');
    entity.addComponent('gsplat', { asset, unified: true });
    const bounds = entity.gsplat.customAabb;
    if (!bounds) { entity.destroy(); throw new Error('无法获得人像范围'); }
    const extent = bounds.halfExtents;
    if (![...bounds.center.toArray(), ...extent.toArray()].every(Number.isFinite) || Math.max(extent.x,extent.y,extent.z) < 1e-8) {
      entity.destroy(); throw new Error('人像范围无效');
    }
    model?.destroy(); if(modelAsset) { modelAsset.unload(); app.assets.remove(modelAsset); }
    model=entity; modelAsset=asset; modelBounds=bounds.clone();
    personRoot.addChild(entity);
    sourceRotation=synthetic?'none':$('sourceAxis').value;
    if(synthetic) $('sourceAxis').value='none';
    assetName=synthetic?'合成高斯校准样本 · 7,600 点':filename;
    updatePerson(); ready=true;
    message(synthetic?'这是几何校准用的高斯样本。打开你的 PLY / SOG 人像，调整源坐标与脚底位置。':'已载入真实高斯资产。请检查人物上下方向、脚底与观看位置。');
  } catch(error) {
    if (next && next !== modelAsset) { next.unload(); app.assets.remove(next); }
    if(sequence===loadSequence && !disposed) message(`载入失败：${error.message}`,true);
  } finally {
    activeLoads--;
    if(revoke) URL.revokeObjectURL(url);
  }
}

async function importFile(file) {
  if (!app || !file) return;
  if (!/\.(ply|sog)$/i.test(file.name)) { message('请打开单文件 PLY 或 SOG 人像。',true); return; }
  if (file.size > 150 * 1024 * 1024) { message('原型限制单文件 150 MiB，请先导出较小的人像。',true); return; }
  await openPortrait({url:URL.createObjectURL(file),filename:file.name,revoke:true});
}

async function readTilt() {
  const generation=++tiltGeneration;
  tiltCancel?.();
  const Motion = window.DeviceMotionEvent;
  if (!Motion) { message('当前浏览器没有设备倾角数据，请使用倾角滑块。',true); return; }
  try {
    if (typeof Motion.requestPermission === 'function' && await Motion.requestPermission() !== 'granted') throw new Error('倾角权限未开启');
    if(generation!==tiltGeneration || document.hidden)return;
    message('保持屏幕下沿水平，正在读取倾角…');
    await new Promise((resolve,reject) => {
      const timeout=setTimeout(()=>{cleanup();reject(new Error('没有收到有效倾角数据，请手动设置'));},3000);
      const cleanup=()=>{clearTimeout(timeout);window.removeEventListener('devicemotion',receive);tiltCancel=null;};
      const receive=event=>{
        const g=event.accelerationIncludingGravity;
        if(!g || ![g.x,g.y,g.z].every(Number.isFinite)) return;
        const angle=screen.orientation?.angle ?? window.orientation ?? 0;
        const landscape=Math.abs(angle)%180===90;
        const vertical=landscape?g.x:g.y, lateral=landscape?g.y:g.x;
        if(Math.hypot(g.x,g.y,g.z)<5) return;
        if(Math.abs(lateral)>2.5) {cleanup();reject(new Error('请让屏幕下沿保持水平，再读取一次'));return;}
        values.tilt=Math.round(Math.atan2(Math.abs(vertical),Math.abs(g.z))*180/Math.PI);
        cleanup();resolve();
      };
      tiltCancel=()=>{cleanup();reject(new Error('倾角读取已取消'));};
      window.addEventListener('devicemotion',receive);
    });
    syncLabels();updateProjection();message('已辅助设置倾角。请对照真实桌面微调；这不会测量观看位置。');
  } catch(error) { if(!disposed && generation===tiltGeneration)message(error.message,true); }
}

for (const key of Object.keys(defaults)) $(key).addEventListener('input', () => {
  values[key]=Number($(key).value);
  if(key==='width')constrainCanvasWidth();
  if(key.startsWith('eye')) { tracker.stop(); viewEye=baseline(); }
  syncLabels();updateProjection();updatePerson();
});
$('sourceAxis').addEventListener('change',()=>{sourceRotation=$('sourceAxis').value;updatePerson();});
$('floorStyle').addEventListener('change',updateFloor);
$('floorColor').addEventListener('input',updateFloor);
$('shadow').addEventListener('change',updatePerson);
$('markers').addEventListener('change',()=>{if(markers)markers.enabled=$('markers').checked;});
$('file').addEventListener('change',()=>{const file=$('file').files[0];$('file').value='';void importFile(file);});
$('loadUrl').addEventListener('click',()=>{
  if(!app) return;
  try {
    const url=new URL($('url').value);
    if(url.protocol!=='https:') throw new Error('请使用 HTTPS 资源链接');
    const filename=decodeURIComponent(url.pathname.split('/').pop());
    if(!/\.(ply|sog)$/i.test(filename)) throw new Error('需要以 .ply 或 .sog 结尾的单文件链接');
    void openPortrait({url:url.href,filename});
  } catch(error) { message(error.message,true); }
});
$('tracking').addEventListener('click',async()=>{
  if(tracker.running || tracker.starting) tracker.stop(); else await tracker.start();
});
$('recenter').addEventListener('click',()=>tracker.recenter());
$('senseTilt').addEventListener('click',readTilt);
$('reset').addEventListener('click',()=>{tracker.stop();Object.assign(values,defaults);constrainCanvasWidth();viewEye=baseline();syncLabels();updateProjection();updatePerson();message('校准已重置。请按可见画布的实际尺寸调整。');});

async function releaseWakeLock() { if(wakeLock) { const lock=wakeLock;wakeLock=null;try{await lock.release();}catch{} } }
$('present').addEventListener('click',async()=>{
  const generation=++presentationGeneration;
  document.body.classList.add('presentation');
  try { await document.documentElement.requestFullscreen?.(); } catch { /* Hidden-control presentation remains usable. */ }
  if(generation!==presentationGeneration || !document.body.classList.contains('presentation') || document.hidden) {
    if(!document.body.classList.contains('presentation') && document.fullscreenElement)try{await document.exitFullscreen();}catch{}
    return;
  }
  try {
    if(navigator.wakeLock) {
      const lock=await navigator.wakeLock.request('screen');
      if(generation!==presentationGeneration || !document.body.classList.contains('presentation') || document.hidden)await lock.release();
      else wakeLock=lock;
    }
  } catch { /* Optional capability. */ }
});
async function restoreControls() { presentationGeneration++;document.body.classList.remove('presentation'); await releaseWakeLock(); if(document.fullscreenElement)try{await document.exitFullscreen();}catch{} }
$('restore').addEventListener('click',restoreControls);
document.addEventListener('keydown',event=>{if(event.key==='Escape')void restoreControls();});
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement) {presentationGeneration++;document.body.classList.remove('presentation');void releaseWakeLock();}});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden) {presentationGeneration++;tiltGeneration++;tracker.stop();tiltCancel?.();void releaseWakeLock();if(app){app.autoRender=false;app.renderNextFrame=false;}}
  else if(!disposed) {if(app){app.autoRender=true;app.renderNextFrame=true;}viewEye=baseline();updateProjection();}
});
window.addEventListener('pagehide',()=>{presentationGeneration++;tiltGeneration++;tracker.stop();tiltCancel?.();portraitLoader?.cancel();void releaseWakeLock();if(app){app.autoRender=false;app.renderNextFrame=false;}});
window.addEventListener('pageshow',()=>{if(!disposed && app && !document.hidden){app.autoRender=true;app.renderNextFrame=true;}});

function resize() {
  const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight);
  if(width===viewport.width && height===viewport.height && app.graphicsDevice.width>1)return;
  viewport={width,height};app.graphicsDevice.resizeCanvas(width,height);
  // Keep the chosen width, recompute physical height, and require the viewer to recheck.
  constrainCanvasWidth();
  tracker.stop();viewEye=baseline();syncLabels();updateProjection();updatePerson();
  if(ready)message('显示区域已变化。请重新核对可见画布宽度与观看位置，再开启追踪。');
}

export function diagnostics() {
  return { ready, activeLoads, assetName, gaussianCount: model?.gsplat?.resource?.numSplats ?? null, eye: {...viewEye}, geometry:geometry(), projection:getProjection({...geometry(),eye:viewEye}), tilt:values.tilt, camera, app };
}

async function initialize() {
  constrainCanvasWidth();
  syncLabels();
  const device=await pc.createGraphicsDevice(canvas,{deviceTypes:[pc.DEVICETYPE_WEBGL2],antialias:false,alpha:false});
  device.maxPixelRatio=Math.min(window.devicePixelRatio || 1,1.5);
  app=new pc.Application(canvas,{graphicsDevice:device});
  portraitLoader=createAssetLoader({app,Asset:pc.Asset});
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  app.graphicsDevice.resizeCanvas(viewport.width,viewport.height);
  app.scene.toneMapping=pc.TONEMAP_NONE;
  app.scene.gsplat.antiAlias=true;
  app.scene.gsplat.radialSorting=true;
  createScene();
  let elapsed=0,frames=0;
  app.on('update',dt=>{elapsed+=dt;frames++;if(elapsed>=1){$('fps').textContent=`${Math.round(frames/elapsed)} fps`;elapsed=0;frames=0;}});
  app.start();
  resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas);
  const url=URL.createObjectURL(new Blob([createCalibrationPly()],{type:'application/octet-stream'}));
  await openPortrait({url,filename:'calibration.ply',revoke:true,synthetic:true});
}
initialize().catch(error=>{message(`无法启动三维展示：${error.message}。请使用支持 WebGL2 的浏览器。`,true);$('tracking').disabled=true;});
