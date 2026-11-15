"""Guarded one-time migration of the published companion. No network or deploy."""
from pathlib import Path
ROOT=Path(__file__).resolve().parent
MARK='// MF165_USABILITY_SCENES_V1'
def one(t,a,b):
    if t.count(a)!=1:raise ValueError('Unexpected source anchor: '+a[:110])
    return t.replace(a,b)
def app(t):
    t=MARK+"\nimport {createExperience,getRoomPreferences,rememberBuiltin} from './experience.mjs';\nimport {detectDeviceProfile,readDeviceInfo} from './device-detection.mjs';\n"+t
    t=one(t,'let renderer = null, extras = null, mobileMeasurement = null;','let renderer = null, extras = null, experience=null, mobileMeasurement = null;')
    t=one(t,"return {width:n('width')/100,tilt:n('tilt'),eye:state.eye,mode:state.mode,", "return {room:getRoomPreferences(),width:n('width')/100,tilt:n('tilt'),eye:state.eye,mode:state.mode,")
    t=one(t,"stored=typeof data['device-preset']==='string';", "stored=typeof data?.['device-preset']==='string'&&[...$('device-preset').options].some(o=>o.value===data['device-preset']);")
    a=t.index("  if(!stored&&family==='phone')");b=t.index('\n}',a)
    t=t[:a]+"  if(!stored){const suggestion=detectDeviceProfile(readDeviceInfo());$('device-preset').value=suggestion.profile;applyProfileValues(suggestion.profile);}"+t[b:]
    t=one(t,'function showSettings(open) {','function showSettings(open,tab) {')
    t=one(t,'  if(open)enumerateCameras();','  if(open){experience?.onPanelOpened(tab);enumerateCameras();}else experience?.onPanelClosed();')
    t=t.replace("if(!state.displayConfirmed)showSettings(true)","if(!state.displayConfirmed)showSettings(true,'setup')")
    t=one(t,'notify:notice,openSettings:()=>showSettings(true),','notify:notice,openSettings:()=>showSettings(true,\'interaction\'),')
    t=one(t,'      state.activeModelChoice=state.loadingModelChoice;', '      state.activeModelChoice=state.loadingModelChoice;rememberBuiltin(state.activeModelChoice);')
    t=one(t,"  $('camera-start').textContent=state.mode==='camera'?(tracker?.starting?'相机启动中 · 可取消':'重新校准相机'):desktopMode()?'开启摄像头追踪':'开启前摄追踪';", "  $('camera-start').textContent=state.mode==='camera'?(tracker?.starting?'取消启动':'重新居中'):'开启追踪';")
    t=one(t,'stopSpeech();extras?.dispose();tracker.stop();','stopSpeech();experience?.dispose();extras?.dispose();tracker.stop();')
    t=one(t,"if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)$('animate').checked=false;", """experience=createExperience({showSettings,notify:notice,getState:()=>({...state,cameraActive:!!state.video}),savePreferences,
  applySuggestion:s=>{$('device-preset').value=s.profile;$('device-preset').dispatchEvent(new Event('change'));}});
if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)$('animate').checked=false;""")
    t=one(t,'loadSelectedModel(defaultModelChoice);\n', 'loadSelectedModel(getRoomPreferences().model);\n')
    t=one(t,'graphics:!state.graphicsError,voice:', 'graphics:!state.graphicsError,experience:experience?.diagnostics()||null,voice:')
    t=t.replace('画布尺寸与镜头位置已确认。请正对镜头保持片刻，完成眼位校准。','画布与镜头已确认。保持自然坐姿片刻，完成头部位置校准。')
    t=one(t,"$('settings-panel').hidden=true;$('settings-toggle').setAttribute('aria-expanded','false');", "$('settings-panel').hidden=true;$('settings-toggle').setAttribute('aria-expanded','false');experience?.onPanelClosed();")
    return t

def renderer(t):
    t=MARK+"\nimport {createRoomDetails} from './room-details.mjs';\nimport {sanitizeRoom} from './device-detection.mjs';\n"+t
    t=one(t,'  let palmFacing=null;', '  let palmFacing=null;\n  const roomDetails=createRoomDetails(desk);\n  let roomGeometry={w:.25,h:.19,d:.24,front:0},qualityKey=\'\';')
    t=one(t,'      width: number(value.width, .262, .05, 1.2),', '      room:sanitizeRoom(value.room),\n      width: number(value.width, .262, .05, 1.2),')
    t=one(t,'current.wood, current.inspect].join', 'current.wood, current.inspect,current.room.scene,current.room.lighting,current.room.quality,current.room.decor,current.room.clock].join')
    t=one(t,'      state.roomDepth = depth;', '      state.roomDepth = depth;roomGeometry={w:innerWidth,h:roomHeight,d:depth,front:frontFloor};')
    t=one(t,'    grid.visible = current.grid && !current.inspect;', """    if(layoutChanged){
      roomDetails.update({...roomGeometry,room:current.room,inspect:current.inspect});
      if(!current.inspect){
        back.material.color.setHex(current.room.scene==='terrace'?0xc8d1bf:0xd6dbcd);
        key.color.setHex(current.room.lighting==='evening'?0xffd8a0:0xfff1db);
        fill.color.setHex(current.room.lighting==='evening'?0xb7c2cc:0xdce8df);
      }
    }
    const q=current.room.quality;
    if(q!==qualityKey){qualityKey=q;const budget=q==='low'?1:q==='high'?2:recommendedPixelRatio(navigator,window.devicePixelRatio||1);renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,budget));renderer.shadowMap.enabled=q!=='low';}
    flowers.visible=!current.inspect&&current.room.decor;
    clockGroup.visible=!current.inspect&&current.room.clock;
    grid.visible = current.grid && !current.inspect;""")
    t=one(t,'hemisphere.intensity = 1.45 * current.light; key.intensity = 2.35 * current.light; fill.intensity = .42 * current.light;', "hemisphere.intensity = (current.room.lighting==='evening'?1.05:1.45) * current.light; key.intensity = (current.room.lighting==='evening'?1.7:2.35) * current.light; fill.intensity = .42 * current.light;")
    t=one(t,'releaseCurrent(); disposeSceneResources([scene]', 'roomDetails.dispose();releaseCurrent(); disposeSceneResources([scene]')
    t=one(t,'      fps: state.fps, triangles:', '      scene:roomDetails.diagnostics(),pixelRatio:renderer.getPixelRatio(),shadows:renderer.shadowMap.enabled,\n      fps: state.fps, triangles:')
    return t

def experience(t):
    t=one(t,"  $('grid').closest('label')?.remove();\n  // The grid control remains available in calibration, with its original ID.\n  const gridToggle=doc.createElement('label');gridToggle.className='toggle';gridToggle.innerHTML='<span>显示校准网格</span><input id=\"grid\" type=\"checkbox\">';viewSection.append(gridToggle);", """  viewSection.append($('grid').closest('label'));
  const inspectControls=viewSection.querySelector('.segmented.two');
  avatarSection.append(inspectControls,$('view-help'),$('gaze').closest('label'),$('animate').closest('label'));""")
    t=one(t,'room:getRoomPreferences()};}', 'room:(({model,...settings})=>settings)(getRoomPreferences())};}')
    t=one(t,'room=sanitizeRoom(snapshot.room);','room=sanitizeRoom({...snapshot.room,model:room.model});')
    t=one(t,"  scroll.prepend(roomSection);", """  scroll.prepend(roomSection);
  const assetStatus=doc.createElement('p');assetStatus.id='scene-asset-status';assetStatus.setAttribute('role','status');
  const retry=doc.createElement('button');retry.id='retry-scene';retry.type='button';retry.className='button small';retry.textContent='重试露台资源';retry.hidden=true;
  $('room-source').after(assetStatus,retry);
  listen(retry,'click',()=>environment.dispatchEvent(new CustomEvent('companion:retry-scene')));
  listen(environment,'companion:scene-status',event=>{const {status,error}=event.detail;assetStatus.textContent=status==='loading'?'正在加载轻量露台部件…':status==='error'?error:status==='ready'?'原模型部件已载入':'';assetStatus.classList.toggle('error',status==='error');retry.hidden=status!=='error';});""")
    t=one(t,"    roomSection.hidden=tab!=='scene';", "    roomSection.hidden=tab!=='scene';assetStatus.hidden=retry.hidden=room.scene!=='terrace'||retry.hidden;\n    if(room.scene==='terrace')assetStatus.hidden=false;")
    # Keep status text independent of the retry button's state across tab switches.
    t=t.replace("assetStatus.hidden=retry.hidden=room.scene!=='terrace'||retry.hidden;", "assetStatus.hidden=room.scene!=='terrace';if(room.scene!=='terrace')retry.hidden=true;")
    return t

if __name__=='__main__':
    edited={}
    for name,fn in [('app.js',app),('renderer.js',renderer)]:
        t=(ROOT/name).read_text()
        if not t.startswith(MARK):edited[name]=fn(t)
    if edited:
        edited['experience.mjs']=experience((ROOT/'experience.mjs').read_text())
        d=(ROOT/'device-detection.mjs').read_text().replace("export function sanitizeRoom(value={}){", "export function sanitizeRoom(value={}){\n  if(!value||typeof value!=='object'||Array.isArray(value))value={};")
        edited['device-detection.mjs']=d
        html=(ROOT/'index.html').read_text().replace('<link rel="stylesheet" href="./styles.css">','<link rel="stylesheet" href="./styles.css">\n  <link rel="stylesheet" href="./experience.css">')
        html=html.replace('显示真实相机取景','显示诊断取景（仅本次）').replace('先在「调整」中量准屏幕，再开启前摄追踪。','从“设备与摆放”开始校准；相机只有点击后才开启。')
        edited['index.html']=html
        # Existing browser regressions now navigate the same controls through the visible categories.
        t=(ROOT/'mobile-voice.e2e.mjs').read_text()
        t=t.replace("await page.locator('#model-choice').selectOption('reconstruction');", "await page.locator('#tab-avatar').click();await page.locator('#model-choice').selectOption('reconstruction');")
        t=t.replace("await page.locator('[data-gesture=\"wave\"]').click();", "await page.locator('#tab-interaction').click();await page.locator('[data-gesture=\"wave\"]').click();")
        edited['mobile-voice.e2e.mjs']=t
        t=(ROOT/'tracking-refinement.e2e.mjs').read_text()
        t=t.replace("await page.locator('#device-preset').selectOption('iphone-air');", "await page.locator('#tab-setup').click();await page.locator('#device-preset').selectOption('iphone-air');")
        t=t.replace("await page.locator('#confirm-calibration').click();", "await page.locator('[data-step=\"2\"]').click();await page.locator('#confirm-calibration').click();")
        t=t.replace("await page.locator('#show-preview').check();", "await page.locator('#tab-setup').click();await page.locator('[data-step=\"1\"]').click();await page.locator('#show-preview').check();")
        t=t.replace("await page.locator('#model-choice').selectOption(choice);", "await page.locator('#tab-avatar').click();await page.locator('#model-choice').selectOption(choice);")
        edited['tracking-refinement.e2e.mjs']=t
    for name,t in edited.items():(ROOT/name).write_text(t)
    print('USABILITY_INTEGRATED',list(edited))
