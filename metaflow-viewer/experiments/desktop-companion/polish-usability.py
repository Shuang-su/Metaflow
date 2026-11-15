from pathlib import Path
ROOT=Path(__file__).resolve().parent
p=ROOT/'experience.mjs';t=p.read_text()
if 'settings-peek' not in t:
    t=t.replace('<button id="settings-done"', '<button id="settings-peek" type="button" class="button quiet">看效果</button><button id="settings-done"')
    t=t.replace('  panel.append(footer);', '''  panel.append(footer);
  const resume=doc.createElement('button');resume.id='resume-settings';resume.type='button';resume.className='preview-return button glass';resume.textContent='返回调整';resume.hidden=true;$('app').append(resume);
  function endPeek(){resume.hidden=true;$('app').classList.remove('settings-peeking');}
  function resumePanel(){panel.hidden=false;$('settings-toggle').setAttribute('aria-expanded','true');endPeek();$('settings-peek').focus();}
  listen($('settings-peek'),'click',()=>{panel.hidden=true;$('settings-toggle').setAttribute('aria-expanded','false');resume.hidden=false;$('app').classList.add('settings-peeking');resume.focus();});
  listen(resume,'click',resumePanel);
  listen(doc,'keydown',event=>{if(event.key==='Escape'&&!resume.hidden){event.preventDefault();event.stopPropagation();resumePanel();}});''')
    t=t.replace('return {onPanelOpened(requested){', 'return {onPanelOpened(requested){endPeek();')
    t=t.replace('onPanelClosed(){opened=false;', 'onPanelClosed(){endPeek();opened=false;')
    t=t.replace('disposed=true;abort.abort();observer.disconnect();', 'disposed=true;endPeek();resume.remove();abort.abort();observer.disconnect();')
    p.write_text(t)
p=ROOT/'experience.mjs';t=p.read_text()
t=t.replace("if(!getState().displayConfirmed){$('confirm-calibration').click();if(!getState().displayConfirmed){step=1;refresh();return;}}", "if(!getState().displayConfirmed){$('guided-result').textContent='请先量准画布并点击“确认画布与镜头位置”。';$('confirm-calibration').focus();return;}")
p.write_text(t)
p=ROOT/'experience.css';t=p.read_text()
if 'preview-return' not in t:
    t+='''\n/* A preview round-trip keeps the edit snapshot and the physical canvas. */
.preview-return{position:absolute;z-index:50;left:50%;transform:translateX(-50%);bottom:max(14px,env(safe-area-inset-bottom));min-height:44px;border-radius:15px;padding:10px 22px;font-size:13px;}
.settings-peeking .scene-dock,.settings-peeking .setup-shortcut{opacity:0;pointer-events:none;}
.settings-peeking .scene-dock *{pointer-events:none;}
#settings-panel.settings-panel{max-width:calc(100vw - 24px);}
@media(max-width:600px){#settings-panel.settings-panel{max-width:100%;}.settings-footer>div{gap:4px;}.settings-footer .button{padding-left:9px;padding-right:9px;}}
@media(max-height:480px) and (orientation:landscape){#settings-panel.settings-panel{top:8px;bottom:8px;height:auto;max-width:65vw;}}
'''
    p.write_text(t)
p=ROOT/'usability.e2e.mjs';t=p.read_text()
if 'peek preserves undo' not in t:
    t=t.replace("await page.locator('#settings-undo').click();", """// A peek preserves undo rather than silently accepting the edit.
      await page.locator('#settings-peek').click();assert.equal(await page.locator('#settings-panel').isVisible(),false);assert.equal(await page.locator('#resume-settings').isVisible(),true);
      await page.locator('#resume-settings').click();assert.equal(await page.locator('#settings-undo').isDisabled(),false);
      await page.locator('#settings-undo').click();""")
    p.write_text(t)
p=ROOT/'usability.test.mjs';t=p.read_text()
if 'Android is never' not in t:
    t+="\ntest('Android is never named iPhone merely because its screen matches',()=>{const d=detectDeviceProfile({...air,userAgent:'Mozilla Android Mobile',platform:'Linux armv8l'});assert.equal(d.confidence,'family');assert.doesNotMatch(d.label,/iPhone Air/);});\n"
    p.write_text(t)
p=ROOT/'renderer.js';t=p.read_text()
if '// MF165_PROP_BUDGET' not in t:
    t=t.replace('const propScale = clamp(desired / .17, .58, 1.12);','// MF165_PROP_BUDGET: keep the clock and flowers inside narrow phone windows.\n    const propScale = clamp(Math.min(desired / .17,state.width / .23), .22, 1.12);')
    p.write_text(t)
p=ROOT/'room-details.mjs';t=p.read_text()
if '// MF165_VISUAL_POLISH' not in t:
    t='// MF165_VISUAL_POLISH\n'+t
    t=t.replace("lamp.position.set(-w*.34,0,-Math.min(d*.44,.075));", "lamp.position.set(w*.35,0,-d*.67);")
    t=t.replace("    x.fillStyle=evening?'#ead0a3':'#f5efcf';x.beginPath();x.arc(375,150,48,0,Math.PI*2);x.fill();", "    // A quiet sky gradient remains undistorted across tall and wide windows.")
    t=t.replace("  const terraceBack=cuboid(terrace,cream);", """  const terraceBack=cuboid(terrace,cream);
  const outdoor=mesh(terrace,geo(new THREE.PlaneGeometry(1,1)),glassMat);outdoor.castShadow=false;outdoor.receiveShadow=false;
  for(const o of [...frames,...panels,baseboard,cornice,leftTrim,rightTrim])o.castShadow=false;
  const fabric=document.createElement('canvas');fabric.width=fabric.height=128;const fx=fabric.getContext('2d');fx.fillStyle='#eee9dc';fx.fillRect(0,0,128,128);fx.strokeStyle='#dedbcd';fx.lineWidth=1;
  for(let i=0;i<128;i+=4){fx.beginPath();fx.moveTo(i,0);fx.lineTo(i,128);fx.moveTo(0,i);fx.lineTo(128,i);fx.stroke();}
  const fabricMap=new THREE.CanvasTexture(fabric);fabricMap.colorSpace=THREE.SRGBColorSpace;fabricMap.wrapS=fabricMap.wrapT=THREE.RepeatWrapping;fabricMap.repeat.set(8,8);textures.add(fabricMap);rugMat.map=fabricMap;rugMat.roughness=.98;""")
    t=t.replace("    if(terrace.visible){\n      const rz", "    if(terrace.visible){\n      glassMat.map=skies[room.lighting];outdoor.scale.set(w,h,1);outdoor.position.set(0,h/2,rear+.001);\n      const rz")
    p.write_text(t)
p=ROOT/'index.html';t=p.read_text().replace('1 / 4 · 先量一下可见画布的实际宽度。','先选择设备，再量一下可见画布的实际宽度。');p.write_text(t)
p=ROOT/'about.html';t=p.read_text()
if '2026-11-15：设置与场景' not in t:
    t=t.replace('</main>','''<section><h2>2026-11-15：设置与场景</h2><p>设置分为场景、角色、校准、互动。修改即时预览并保存在本机，可撤销本次调整；“看效果”可暂时收起面板并返回，不改变物理画布。“设备匹配”使用平台、屏幕逻辑尺寸与像素比，不是硬件型号证明；手动选择优先，物理厘米仍须用尺核对。</p><p>日光书房为既有房间的独立细节升级。“星瞳露台”使用用户 metaxingtong 项目归档中的藤椅、边桌和顶棚格栅原网格，按材质合并、去掉原纹理并重新组合为小屏布景；不是完整原场景或已通过来源验收的复制品。<a href="./assets/terrace-provenance.json">来源、变更和哈希记录</a>保留了准确原文件路径。</p><p>交互研究参考了 LAPLACE Eidolon 设置分组和撤销机制，未复制其组件代码；参考 Parapeek Clock 官方展示的场景优先和设备校准说明。本轮未能重新播放原小红书与 B 站视频，不能当作逐帧一致性验收。真实 Safari、真人追踪精度和温升仍待实测。</p></section></main>''')
    p.write_text(t)
for name,body in [('spec.md','''\n## 2026-11-15：设置与场景体验增量\n\n独立站点增加场景/角色/校准/互动四组、三步物理校准、实时预览及可撤销的本次调整。临时收起看效果保留编辑快照，不改变画布；高级参数仍可访问。相机保持显式授权和默认隐藏取景，既有动作、音频与追踪生命周期保留。\n\n设备建议只使用平台、屏幕逻辑长短边、DPR；匹配时说明不是硬件型号识别，保留手动选择、不自动确认厘米标定。Android不能因屏幕相同而被命名为iPhone。\n\n场景为日光书房（现有房间细化）、星瞳露台（metaxingtong原网格子集的轻量改编）、纯净展台（原有房间）。日光/傍晚、摆件、时钟和画质预算可调；低档降低像素比并关闭阴影。露台按需加载，有错误提示和重试，不修改原始档案。来源候选未验收，不声称完整官方场景。\n\n研究已读取Eidolon settings-card.tsx (04c0088)，独立实现分组、撤销和高级项分离；原始小红书/B站本轮未能播放，以Parapeek官方公开展示补充，不声称逐帧回看或完整复制。\n'''),('plan.md','''\n## 2026-11-15：当前可用性与场景增量\n\n从已发布main建立codex/mf-165-usability-scenes；读取花店Eidolon设置代码和metaxingtong露台CURRENT及原GLB。只提取并合并原椅子、边桌、格栅网格，验证源SHA-256，新增衍生记录；不修改源归档。设置与设备匹配为独立模块，守住摄像头权限/物理校准边界。\n\n验收覆盖设备歧义、手动设置恢复、输入清洗、分组/三步校准/撤销/预览恢复/键盘、新场景真实GLB加载和实际画质开关，重跑原动作音频追踪测试。通过后由受保护main部署固定构建物至原精确域名并回读关键资源；失败不替换线上。真机光学、Safari性能与真人侧脸成功率另行验收。\n''')]:
    p=ROOT.parents[2]/'docs/changes/165-desktop-portrait'/name
    if p.exists() and '2026-11-15：' not in p.read_text():p.write_text(p.read_text()+body)
print('POLISHED preview round-trip / compact panel / physical confirmation / scene composition')
