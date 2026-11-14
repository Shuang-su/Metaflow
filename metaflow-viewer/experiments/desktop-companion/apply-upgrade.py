"""One-time, fail-closed migration of the recorded Netlify baseline.
The generated source changes are reviewed/tested and committed on the isolated
feature branch. This script never changes Netlify or model bytes.
"""
from pathlib import Path
import hashlib,re
ROOT=Path(__file__).resolve().parent
MARK='// MF165_MOBILE_VOICE_V1'
def replace(text,old,new,count=1):
    if text.count(old)!=count:raise ValueError('Unexpected source anchor: '+old[:100])
    return text.replace(old,new)
def edit_app(text):
    text=MARK+"\nimport {deviceFamily,installMobileOptions,mobileProfileValues,landscapeOrientation,rotatedMeasuredWidth,pinchZoom} from './mobile.mjs';\nimport {createCompanionControls} from './companion-controls.mjs';\n"+text
    text=replace(text,'let renderer = null;',"let renderer = null, extras = null, mobileMeasurement = null;\nconst family=deviceFamily(navigator);\ninstallMobileOptions(document);\nfunction mobileMetrics(){const m=viewportMetrics();return {...m,canvasWidth:m.width,landscape:landscapeOrientation({angle:screen.orientation?.angle??window.orientation,type:screen.orientation?.type,screenWidth:m.screenWidth,screenHeight:m.screenHeight})};}")
    text=replace(text,"  if (placement === 'top') {", "  if (placement === 'bottom') { cameraX=0;cameraY=-height/2-.007; }\n  if (placement === 'top') {")
    text=replace(text,"  if(!stored&&isMac){", "  if(!stored&&family==='phone'){$('device-preset').value='iphone-standard';applyProfileValues('iphone-standard');}\n  if(!stored&&family==='tablet'&&Math.min(screen.width,screen.height)<800){$('device-preset').value='ipad-mini';applyProfileValues('ipad-mini');}\n  if(!stored&&isMac){")
    text=replace(text,'function applyProfileValues(value){',"function applyProfileValues(value){\n  const mobile=mobileProfileValues(value,mobileMetrics());\n  if(mobile){for(const [id,v] of Object.entries(mobile))$(id).value=String(v);$('camera-placement').value='top';return;}")
    start=text.index('function stopSpeech(){');end=text.index("listen($('camera-start')",start)
    text=text[:start]+"""extras=createCompanionControls({getRenderer:()=>renderer,isReady:()=>state.ready&&!state.graphicsError,
  notify:notice,openSettings:()=>showSettings(true),onSpeaking:value=>{state.speaking=value;}});
function stopSpeech(){extras?.stop();renderer?.stopGesture();state.speaking=false;}
function speak(){extras?.toggleSpeech();}

"""+text[end:]
    text=replace(text,"  stopSpeech();tracker.stop();tiltSensor.stop();renderer?.dispose();", "  stopSpeech();extras?.dispose();tracker.stop();tiltSensor.stop();renderer?.dispose();")
    text=replace(text,"  state.displayConfirmed=true;state.lastViewport=viewportMetrics();", "  mobileMeasurement=state.displayCalibration;\n  state.displayConfirmed=true;state.lastViewport=viewportMetrics();")
    text=replace(text,"if(id==='width'){state.displayCalibration=null;", "if(id==='width'){mobileMeasurement=null;state.displayCalibration=null;")
    text=replace(text,"  const value=$('device-preset').value;", "  const value=$('device-preset').value;mobileMeasurement=null;")
    text=replace(text,'let dragging=false,lastPointer=null;',"let dragging=false,lastPointer=null,pinch=null;\nconst pointers=new Map();\nconst pointerDistance=()=>{const [a,b]=[...pointers.values()];return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;};")
    text=replace(text,"  dragging=true;lastPointer={x:event.clientX,y:event.clientY};", "  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});\n  if(pointers.size>1){pinch={distance:pointerDistance(),zoom:state.inspectZoom};$('scene').setPointerCapture(event.pointerId);return;}\n  dragging=true;lastPointer={x:event.clientX,y:event.clientY};")
    text=replace(text,"  if(!dragging||state.mode==='camera')return;", "  if(!dragging||state.mode==='camera')return;\n  if(pointers.has(event.pointerId))pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});\n  if(pointers.size>1){if(state.view==='inspect'&&pinch)state.inspectZoom=pinchZoom(pinch.zoom,pinch.distance,pointerDistance());return;}")
    text=replace(text,"listen($('scene'),'pointermove',movePointer);listen($('scene'),'pointerup',()=>{dragging=false;});listen($('scene'),'pointercancel',()=>{dragging=false;});\nlisten($('scene'),'lostpointercapture',()=>{dragging=false;});", """function releasePointer(event){pointers.delete(event.pointerId);pinch=null;lastPointer=[...pointers.values()][0]||null;dragging=!!lastPointer;}
listen($('scene'),'pointermove',movePointer);
for(const event of ['pointerup','pointercancel','lostpointercapture'])listen($('scene'),event,releasePointer);""")
    anchor="if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)"
    rotation="""let mobileLandscape=mobileMetrics().landscape;
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
listen(screen.orientation,'change',reorientMobile);listen(window,'orientationchange',reorientMobile);
"""
    text=replace(text,anchor,rotation+'\n'+anchor)
    text=replace(text,"renderer:renderer?.diagnostics()||null});", "voice:extras?.diagnostics()||null,renderer:renderer?.diagnostics()||null});")
    return text

def edit_renderer(text):
    text=MARK+"\nimport {createGesturePlayer} from './motion.mjs';\nimport {recommendedPixelRatio} from './mobile.mjs';\n"+text
    text=replace(text,'  const eventAbort = new AbortController();', '  const eventAbort = new AbortController();\n  const gestures=createGesturePlayer();')
    text=replace(text,'waveUntil: 0, speaking: false,', 'waveUntil: 0, speaking: false, mouthLevel: null,')
    text,n=re.subn(r'renderer\.setPixelRatio\([^;]+\);',"renderer.setPixelRatio(recommendedPixelRatio(navigator,window.devicePixelRatio||1));",text)
    if n!=1:raise ValueError('Pixel ratio anchor changed')
    text=replace(text,'const active = current.animate, waving = state.waveUntil > state.time;', 'const active = current.animate;')
    text=replace(text,"    const axis = vrm.meta?.metaVersion === '0' ? -1 : 1;", "    const axis = vrm.meta?.metaVersion === '0' ? -1 : 1;\n    const gesture=gestures.sample(state.time,axis), waving=gesture.wave>0;")
    text=replace(text,"    if (bone('spine')) bone('spine').rotation.z", "    if (bone('spine')) bone('spine').rotation.x=THREE.MathUtils.damp(bone('spine').rotation.x,gesture.spine,8,dt);\n    if (bone('spine')) bone('spine').rotation.z")
    text=replace(text,'(waving ? .7 : -REST_ARM) * axis', '(-REST_ARM+(REST_ARM+.7)*gesture.wave) * axis')
    text=replace(text,'waving ? -.25 * axis : 0', '-.25 * axis * gesture.wave')
    text=replace(text,'waving ? 1.15 * axis : 0','1.15 * axis * gesture.wave')
    text=replace(text,'waving ? Math.sin(state.time * 10) * .23 : -.12','-.12+(Math.sin(gesture.phase)*.23+.12)*gesture.wave')
    text=replace(text,'waving ? Math.sin(state.time * 12) * .35 * axis : 0','Math.sin(gesture.phase*1.2)*.35*axis*gesture.wave')
    text=replace(text,"vrm.expressionManager?.setValue('aa', state.speaking ? Math.max(0, Math.sin(state.time * 18) * .45 + Math.sin(state.time * 6) * .15 + .17) : 0);", "vrm.expressionManager?.setValue('aa', state.speaking ? (state.mouthLevel??Math.max(0,Math.sin(state.time*18)*.45+Math.sin(state.time*6)*.15+.17)) : 0);")
    text=replace(text,"vrm.expressionManager?.setValue('happy', waving ? .12 : 0);", "vrm.expressionManager?.setValue('happy',gesture.smile);")
    text=replace(text,'head.rotation.y, yaw, 5, dt','head.rotation.y, yaw+gesture.yaw, 8, dt')
    text=replace(text,'head.rotation.x, pitch, 5, dt','head.rotation.x, pitch+gesture.pitch, 8, dt')
    text=replace(text,'  function releaseCurrent() {','  function releaseCurrent() {\n    gestures.stop();state.mouthLevel=null;')
    text=replace(text,'state.loadGeneration; state.loadAbort?.abort(); state.speaking = false;', 'state.loadGeneration; state.loadAbort?.abort(); state.speaking = false; gestures.stop();')
    text=replace(text,"    wave() { if (!state.vrm || state.disposed || state.graphicsLost) return false; state.waveUntil = state.time + 2.8; return true; },", """    wave() {if(!state.vrm||state.disposed||state.graphicsLost)return false;return gestures.play('wave',state.time);},
    playGesture(name){if(!state.vrm||state.disposed||state.graphicsLost)return false;return gestures.play(name,state.time);},
    stopGesture(){gestures.stop();},
    setMouthLevel(level){state.mouthLevel=level===null?null:Number.isFinite(level)?clamp(level,0,1):0;},""")
    text=replace(text,'loading: state.loading, modelCount:', 'gesture:gestures.active,mouthLevel:state.mouthLevel,headPose:bone(\'head\')?.rotation.toArray().slice(0,3)||null,\n      loading: state.loading, modelCount:')
    return text

CSS='''\n/* MF165_MOBILE_VOICE_V1: no viewport-wide CSS transform. */
.companion-extras{padding:20px 0;border-top:1px solid #bfc8bc;scroll-margin-top:16px;}
.companion-extras h3{font-size:17px;margin:0 0 12px;}
.companion-extras label{display:block;margin:14px 0 6px;font-size:14px;}
.companion-extras textarea,.companion-extras select{box-sizing:border-box;width:100%;font:inherit;font-size:16px;border:1px solid #aab9a7;border-radius:10px;padding:10px;background:#fbfcf8;color:#203428;}
.companion-extras textarea{resize:vertical;min-height:90px;max-height:220px;}
.companion-extras input[type=range]{width:100%;min-height:44px;}
.companion-extras input[type=file]{max-width:100%;font-size:16px;}
.companion-extras button,#motion-speech{min-height:44px;padding:8px 12px;background:#eef3e9;border:1px solid #aab9a7;border-radius:12px;color:#203428;font:inherit;font-size:14px;cursor:pointer;}
.companion-extras button:focus-visible,#motion-speech:focus-visible{outline:3px solid #567e59;outline-offset:2px;}
.extra-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0;}
.extra-help,#voice-status{font-size:13px;line-height:1.6;color:#4e6254;overflow-wrap:anywhere;}
.extra-check{display:flex!important;gap:9px;align-items:center;min-height:44px;}
.extra-check input{width:20px;height:20px;}
@media (pointer:coarse){#settings-panel select,#settings-panel input[type=text],#settings-panel input[type=number],#settings-panel textarea{font-size:16px;}#settings-panel button{min-height:44px;}.settings-scroll{overscroll-behavior:contain;-webkit-overflow-scrolling:touch;}}
@media (max-width:600px){.command-bar{flex-wrap:wrap;gap:6px;}#motion-speech{flex-basis:auto;}#camera-card{max-width:148px;}#scene-name{max-width:45vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}#caption{max-width:calc(100vw - 24px);max-height:25dvh;overflow:auto;}#settings-panel{max-width:calc(100vw - env(safe-area-inset-left) - env(safe-area-inset-right) - 16px);}#notice{max-height:4.5em;overflow:auto;}}
@media (max-height:480px) and (orientation:landscape){#camera-card{max-width:120px;}#notice{display:none;}.scene-dock{bottom:max(6px,env(safe-area-inset-bottom));}.command-bar{padding:5px;}#settings-panel{top:6px;bottom:6px;height:auto;}.scene-header{padding-top:max(6px,env(safe-area-inset-top));}}
'''
if __name__=='__main__':
    pins={'app.js':'2b88b15cc555f5082c482e9d56e1ab65474a5dbe5a691ed9d933dfbc0b05b79d','renderer.js':'e9dcc9f9209acec87d94d8f3c38b3eda0ea7d44bbaa599afae91727ef8f52668'}
    staged={}
    for file,fn in [('app.js',edit_app),('renderer.js',edit_renderer)]:
        text=(ROOT/file).read_text()
        if text.startswith(MARK):continue
        if hashlib.sha256(text.encode()).hexdigest()!=pins[file]:raise ValueError('Baseline changed: '+file)
        staged[file]=fn(text)
    for file,text in staged.items():(ROOT/file).write_text(text)
    css=(ROOT/'styles.css').read_text()
    if 'MF165_MOBILE_VOICE_V1' not in css:(ROOT/'styles.css').write_text(css+CSS)
    html=(ROOT/'index.html').read_text().replace('桌面人像 · Mac / iPad · MetaFlow','桌面人像 · iPhone / iPad mini / Mac · MetaFlow')
    (ROOT/'index.html').write_text(html)
    print('MIGRATED',list(staged))
