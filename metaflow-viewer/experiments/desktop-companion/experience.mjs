import {detectDeviceProfile,readDeviceInfo,sanitizeRoom} from './device-detection.mjs';
const ROOM_KEY='metaflow-companion-room-v1';
let room=sanitizeRoom();
try{room=sanitizeRoom(JSON.parse(localStorage.getItem(ROOM_KEY)||'{}'));}catch{}
export function getRoomPreferences(){return {...room};}
export function rememberBuiltin(model){if(['wenjing','reconstruction'].includes(model)){room.model=model;saveRoom();}}
function saveRoom(){try{localStorage.setItem(ROOM_KEY,JSON.stringify(room));return true;}catch{return false;}}
export function createExperience({showSettings,notify,getState,applySuggestion,savePreferences,environment=window}){
  const doc=environment.document,$=id=>doc.getElementById(id),abort=new AbortController();
  const listen=(node,event,fn)=>node?.addEventListener(event,fn,{signal:abort.signal});
  const panel=$('settings-panel'),scroll=panel.querySelector('.settings-scroll');
  const sections=[...scroll.querySelectorAll(':scope > .settings-section')];
  const [screenSection,cameraSection,viewSection,avatarSection]=sections;
  const guide=scroll.querySelector('.setup-guide'),credits=scroll.querySelector('.credits'),extras=$('companion-extras');
  const nav=doc.createElement('nav');nav.className='settings-tabs';nav.setAttribute('aria-label','设置分类');
  const names={scene:'场景',avatar:'角色',setup:'校准',interaction:'互动'};
  for(const [id,label] of Object.entries(names)){
    const button=doc.createElement('button');button.type='button';button.id='tab-'+id;button.dataset.tab=id;button.textContent=label;button.setAttribute('aria-pressed','false');nav.append(button);
  }
  panel.querySelector('.settings-heading').after(nav);
  $('settings-title').textContent='我的桌面';panel.querySelector('.eyebrow').textContent='METAFLOW · COMPANION';
  const roomSection=doc.createElement('section');roomSection.id='room-section';roomSection.className='room-section';
  roomSection.innerHTML=`<p class="section-intro">一个只属于你的桌面小世界。</p>
    <div class="room-choices" aria-label="选择场景">
      <button type="button" data-room="studio"><span class="room-swatch studio" aria-hidden="true"></span><strong>日光书房</strong><small>暖木 · 窗光 · 日常陪伴</small></button>
      <button type="button" data-room="terrace"><span class="room-swatch terrace" aria-hidden="true"></span><strong>星瞳露台</strong><small>原模型部件 · 轻量改编</small></button>
      <button type="button" data-room="minimal"><span class="room-swatch minimal" aria-hidden="true"></span><strong>纯净展台</strong><small>保留原始房间结构</small></button>
    </div>
    <p id="room-source" class="micro">现有木房间的细节升级，保留校准透视。</p>
    <label class="field-label spaced-label" for="room-lighting">光线氛围</label><select id="room-lighting"><option value="day">日光 · 清透柔和</option><option value="evening">傍晚 · 暖灯陪伴</option></select>
    <label class="toggle"><span>显示场景摆件</span><input id="room-decor" type="checkbox" checked></label>
    <label class="toggle"><span>显示桌面时钟</span><input id="room-clock" type="checkbox" checked></label>
    <details class="advanced-fields" id="appearance-advanced"><summary>材质与性能</summary><div id="surface-controls"></div>
    <label class="field-label spaced-label" for="room-quality">画质预算</label><select id="room-quality"><option value="balanced">均衡 · 推荐</option><option value="high">细致 · 更高渲染负担</option><option value="low">节能 · 降低像素与阴影</option></select><p class="micro">画质档位不保证特定帧率；发热明显时可切换节能。</p></details>`;
  scroll.prepend(roomSection);
  const assetStatus=doc.createElement('p');assetStatus.id='scene-asset-status';assetStatus.setAttribute('role','status');
  const retry=doc.createElement('button');retry.id='retry-scene';retry.type='button';retry.className='button small';retry.textContent='重试露台资源';retry.hidden=true;
  $('room-source').after(assetStatus,retry);
  listen(retry,'click',()=>environment.dispatchEvent(new CustomEvent('companion:retry-scene')));
  listen(environment,'companion:scene-status',event=>{const {status,error}=event.detail;assetStatus.textContent=status==='loading'?'正在加载轻量露台部件…':status==='error'?error:status==='ready'?'原模型部件已载入':'';assetStatus.classList.toggle('error',status==='error');retry.hidden=status!=='error';});
  function moveField(id,destination){const e=$(id);const label=doc.querySelector(`label[for="${id}"]`);if(label)destination.append(label);if(e)destination.append(e);}
  for(const id of ['light','wood'])moveField(id,$('surface-controls'));
  viewSection.append($('grid').closest('label'));
  const inspectControls=viewSection.querySelector('.segmented.two');
  avatarSection.append(inspectControls,$('view-help'),$('gaze').closest('label'),$('animate').closest('label'));
  const setup=doc.createElement('section');setup.id='setup-intro';
  setup.innerHTML=`<p class="section-intro">先摆好设备，再按平时的坐姿校准。无需持续盯住镜头。</p>
    <div class="setup-stage-nav" aria-label="校准步骤"><button type="button" data-step="0">1 屏幕</button><button type="button" data-step="1">2 摆放</button><button type="button" data-step="2">3 开始</button></div>
    <div id="device-suggestion" class="device-suggestion"><strong id="device-match"></strong><p id="device-basis"></p><button id="apply-device-suggestion" class="button small" type="button">重新匹配设备</button></div>`;
  screenSection.before(setup);
  const startCard=doc.createElement('section');startCard.id='setup-ready';
  startCard.innerHTML=`<h2>让视线带动这个小世界</h2><p class="section-intro">镜头可以位于侧边。保持你平时使用电脑的姿势，确认画布和镜头后开启追踪。</p><div id="confirm-slot"></div><button id="guided-camera-start" type="button" class="button primary full-width">确认后开启静默追踪</button><button id="guided-without-camera" type="button" class="button full-width quiet">暂不使用摄像头</button><p id="guided-result" role="status" class="micro">摄像头画面不展示、不上传；可随时停止。</p>`;
  viewSection.before(startCard);$('confirm-slot').append($('confirm-calibration'),$('display-calibration-status'));
  const stepFooter=doc.createElement('div');stepFooter.id='setup-navigation';stepFooter.className='setup-navigation';
  stepFooter.innerHTML='<button id="setup-back" class="button quiet" type="button">上一步</button><button id="setup-next" class="button primary" type="button">下一步</button>';
  scroll.append(stepFooter);
  const footer=doc.createElement('footer');footer.className='settings-footer';
  footer.innerHTML='<span id="settings-save-status" role="status">实时预览 · 场景与校准参数可撤销</span><div><button id="settings-undo" type="button" class="button quiet" disabled>撤销本次参数</button><button id="settings-peek" type="button" class="button quiet">看效果</button><button id="settings-done" type="button" class="button primary">完成</button></div>';
  panel.append(footer);
  const resume=doc.createElement('button');resume.id='resume-settings';resume.type='button';resume.className='preview-return button glass';resume.textContent='返回调整';resume.hidden=true;$('app').append(resume);
  function endPeek(){resume.hidden=true;$('app').classList.remove('settings-peeking');}
  function resumePanel(){panel.hidden=false;$('settings-toggle').setAttribute('aria-expanded','true');endPeek();$('settings-peek').focus();}
  listen($('settings-peek'),'click',()=>{panel.hidden=true;$('settings-toggle').setAttribute('aria-expanded','false');resume.hidden=false;$('app').classList.add('settings-peeking');resume.focus();});
  listen(resume,'click',resumePanel);
  listen(doc,'keydown',event=>{if(event.key==='Escape'&&!resume.hidden){event.preventDefault();event.stopPropagation();resumePanel();}});
  const shortcut=doc.createElement('button');shortcut.id='room-shortcut';shortcut.type='button';shortcut.className='button quiet';shortcut.textContent='布置';
  doc.querySelector('.command-bar').append(shortcut);
  $('motion-speech').textContent='互动';
  const welcome=doc.createElement('button');welcome.type='button';welcome.id='setup-shortcut';welcome.className='setup-shortcut glass hud';
  welcome.innerHTML='<span class="setup-shortcut-dot" aria-hidden="true"></span><span id="setup-shortcut-copy">设备已匹配 · 开始校准</span><span aria-hidden="true">↗</span>';
  $('app').append(welcome);
  let tab='scene',step=0,disposed=false,snapshot=null,noticeTimer=0,opened=false,restoring=false;
  const editableIds=['device-preset','width','tilt','height','distance','eye-x','eye-y','floor-offset','avatar-depth','room-depth','light','camera-x','camera-y','ipd','camera-placement','wood','gaze','animate','auto-height'];
  function capture(){return {fields:Object.fromEntries(editableIds.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value])),room:(({model,...settings})=>settings)(getRoomPreferences())};}
  function dirty(){return snapshot&&JSON.stringify(capture())!==JSON.stringify(snapshot);}
  function refresh(){
    for(const b of nav.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.tab===tab));
    roomSection.hidden=tab!=='scene';assetStatus.hidden=room.scene!=='terrace';if(room.scene!=='terrace')retry.hidden=true;
    if(room.scene==='terrace')assetStatus.hidden=false;avatarSection.hidden=tab!=='avatar';extras.hidden=tab!=='interaction';
    setup.hidden=guide.hidden=tab!=='setup';
    screenSection.hidden=tab!=='setup'||step!==0;cameraSection.hidden=tab!=='setup'||step!==1;
    startCard.hidden=viewSection.hidden=tab!=='setup'||step!==2;
    stepFooter.hidden=tab!=='setup';credits.hidden=tab!=='scene';
    for(const b of setup.querySelectorAll('[data-step]'))b.setAttribute('aria-current',Number(b.dataset.step)===step?'step':'false');
    $('setup-back').disabled=step===0;$('setup-next').textContent=step===2?'完成校准设置':'下一步';
    for(const b of roomSection.querySelectorAll('[data-room]'))b.setAttribute('aria-pressed',String(b.dataset.room===room.scene));
    $('room-lighting').value=room.lighting;$('room-quality').value=room.quality;$('room-decor').checked=room.decor;$('room-clock').checked=room.clock;
    $('room-source').textContent=room.scene==='terrace'?'藤椅、边桌和格栅来自 metaxingtong 露台候选模型；为手机重新组合，不是完整原场景。':room.scene==='minimal'?'保留原来的房间与桌面，降低装饰干扰。':'木纹、墙脚、窗框、书本与柔和灯光，装饰不会改变离轴投影。';
    $('settings-undo').disabled=!dirty();
  }
  function selectTab(value){if(!Object.hasOwn(names,value))return;tab=value;refresh();scroll.scrollTop=0;}
  function detect(){const d=detectDeviceProfile(readDeviceInfo(environment,environment.navigator));$('device-match').textContent=d.label;$('device-basis').textContent=`${d.basis}。${d.note}`;return d;}
  function updateProgress(){const s=getState();
    if(s.sceneStatus&&room.scene==='terrace'){const a=s.sceneStatus;assetStatus.hidden=false;assetStatus.textContent=a.status==='loading'?'正在加载轻量露台部件…':a.status==='error'?a.error:a.status==='ready'?'原模型部件已载入':'';retry.hidden=a.status!=='error';}
welcome.hidden=s.displayConfirmed||$('app').classList.contains('immersive');
    $('setup-shortcut-copy').textContent=s.displayConfirmed?'校准已确认':'设备与摆放 · 开始校准';
    if(!startCard.hidden)$('guided-result').textContent=s.cameraActive?(s.cameraPhase==='tracking'?'追踪已启动；可以关闭设置并进入纯净展示。':'相机已开启，正在等待稳定面部。'):s.displayConfirmed?'画布已确认。点击上方按钮后才会请求摄像头。':'先确认画布与镜头位置；无需开启诊断取景。';
  }
  listen(nav,'click',event=>{const b=event.target.closest('[data-tab]');if(b)selectTab(b.dataset.tab);});
  listen(nav,'keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const keys=Object.keys(names),i=keys.indexOf(tab),next=event.key==='Home'?0:event.key==='End'?keys.length-1:(i+(event.key==='ArrowRight'?1:-1)+keys.length)%keys.length;selectTab(keys[next]);$('tab-'+keys[next]).focus();});
  listen(setup,'click',event=>{const b=event.target.closest('[data-step]');if(b){step=Number(b.dataset.step);refresh();scroll.scrollTop=0;}});
  listen($('setup-back'),'click',()=>{step=Math.max(0,step-1);refresh();scroll.scrollTop=0;});
  listen($('setup-next'),'click',()=>{if(step<2){step++;refresh();scroll.scrollTop=0;}else showSettings(false);});
  listen($('apply-device-suggestion'),'click',()=>{applySuggestion(detect());refresh();notify('已应用推荐起点；请核对校准尺，未自动确认物理尺寸。');});
  listen($('guided-camera-start'),'click',()=>{
    if(!getState().displayConfirmed){$('guided-result').textContent='请先量准画布并点击“确认画布与镜头位置”。';$('confirm-calibration').focus();return;}
    // Preserve the original user activation for getUserMedia.
    $('camera-start').click();
  });
  // Recover incomplete desktop setup instead of focusing a hidden field.
  listen($('confirm-calibration'),'click',()=>{if(!getState().displayConfirmed){step=1;selectTab('setup');$('camera-placement').focus();}});
  listen($('guided-without-camera'),'click',()=>{doc.querySelector('[data-mode="manual"]').click();showSettings(false);});
  listen(roomSection,'click',event=>{const b=event.target.closest('[data-room]');if(b){room.scene=b.dataset.room;$('settings-save-status').textContent=saveRoom()?'参数已保存 · 角色和相机操作单独生效':'本次预览有效；浏览器未允许保存';refresh();}});
  for(const [id,key] of [['room-lighting','lighting'],['room-quality','quality'],['room-decor','decor'],['room-clock','clock']])listen($(id),'change',()=>{room[key]=$(id).type==='checkbox'?$(id).checked:$(id).value;$('settings-save-status').textContent=saveRoom()?'已保存到此设备':'本次预览有效；浏览器未允许保存';refresh();});
  listen(panel,'input',()=>{if(!restoring)$('settings-undo').disabled=!dirty();});
  listen(panel,'change',()=>{if(!restoring)$('settings-undo').disabled=!dirty();});
  listen($('settings-undo'),'click',()=>{
    if(!snapshot)return;restoring=true;
    for(const [id,value] of Object.entries(snapshot.fields)){$(id)[$(id).type==='checkbox'?'checked':'value']=value;}
    // Do not dispatch the preset selector: it would overwrite restored measured dimensions.
    for(const id of editableIds.filter(id=>id!=='device-preset'))$(id).dispatchEvent(new Event($(id).type==='range'?'input':'change',{bubbles:true}));
    room=sanitizeRoom({...snapshot.room,model:room.model});saveRoom();savePreferences();restoring=false;refresh();notify('已恢复打开设置前的数值。尺寸改动后的物理校准需要重新确认。');
  });
  listen($('settings-done'),'click',()=>showSettings(false));
  listen(shortcut,'click',()=>showSettings(true,'scene'));
  listen(welcome,'click',()=>{step=0;showSettings(true,'setup');$('show-ruler').checked=true;$('show-ruler').dispatchEvent(new Event('change'));});
  const observer=new MutationObserver(()=>{
    clearTimeout(noticeTimer);$('notice').classList.remove('notice-resting');
    if(!$('notice').classList.contains('error'))noticeTimer=environment.setTimeout(()=>$('notice').classList.add('notice-resting'),6000);
  });observer.observe($('notice'),{childList:true,characterData:true,subtree:true});
  const progressTimer=environment.setInterval(updateProgress,500);
  detect();refresh();updateProgress();
  return {onPanelOpened(requested){endPeek();if(!opened){snapshot=capture();opened=true;}if(requested)selectTab(requested);else refresh();},onPanelClosed(){endPeek();opened=false;snapshot=null;},
    selectTab,diagnostics:()=>({tab,step,device:detectDeviceProfile(readDeviceInfo(environment,environment.navigator)),room:getRoomPreferences()}),
    dispose(){if(disposed)return;disposed=true;endPeek();resume.remove();abort.abort();observer.disconnect();environment.clearInterval(progressTimer);environment.clearTimeout(noticeTimer);}
  };
}
