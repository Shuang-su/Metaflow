from pathlib import Path
ROOT=Path(__file__).resolve().parent
p=ROOT/'device-detection.mjs';t=p.read_text()
t=t.replace("family==='phone'&&signature[3].startsWith('iphone')", "family==='phone'&&/iPhone|iPod/i.test(info.userAgent||'')&&signature[3].startsWith('iphone')")
t=t.replace("family==='tablet'&&signature[3].startsWith('ipad')", "family==='tablet'&&(/iPad/i.test(info.userAgent||'')||(/Mac/i.test(info.platform||'')&&info.maxTouchPoints>1))&&signature[3].startsWith('ipad')")
t=t.replace("const mac=/Mac/i.test(info.platform||info.userAgent||'');", "const mac=/Mac/i.test((info.platform||'')+' '+(info.userAgent||''));")
p.write_text(t)
p=ROOT/'room-details.mjs';t=p.read_text().replace("lamp.visible=books.every(o=>{o.visible=room.decor;return true;})&&room.decor;picture.visible=room.decor;", "for(const o of books)o.visible=room.decor;lamp.visible=room.decor;picture.visible=room.decor;")
p.write_text(t)
p=ROOT/'app.js';t=p.read_text().replace("getState:()=>({...state,cameraActive:!!state.video})", "getState:()=>({...state,cameraActive:!!state.video,sceneStatus:renderer?.diagnostics().scene})")
p.write_text(t)
p=ROOT/'experience.mjs';t=p.read_text()
if 's.sceneStatus' not in t:
    t=t.replace("function updateProgress(){const s=getState();", "function updateProgress(){const s=getState();\n    if(s.sceneStatus&&room.scene==='terrace'){const a=s.sceneStatus;assetStatus.hidden=false;assetStatus.textContent=a.status==='loading'?'正在加载轻量露台部件…':a.status==='error'?a.error:a.status==='ready'?'原模型部件已载入':'';retry.hidden=a.status!=='error';}\n")
if '// Recover incomplete desktop setup' not in t:
    t=t.replace("  listen($('guided-without-camera')", """  // Recover incomplete desktop setup instead of focusing a hidden field.
  listen($('confirm-calibration'),'click',()=>{if(!getState().displayConfirmed){step=1;selectTab('setup');$('camera-placement').focus();}});
  listen($('guided-without-camera')""")
t=t.replace('撤销本次调整</button>','撤销本次参数</button>')
t=t.replace('实时预览 · 自动保存到此设备','实时预览 · 场景与校准参数可撤销')
t=t.replace("room.scene=b.dataset.room;saveRoom();refresh();", "room.scene=b.dataset.room;$('settings-save-status').textContent=saveRoom()?'参数已保存 · 角色和相机操作单独生效':'本次预览有效；浏览器未允许保存';refresh();")
p.write_text(t)
p=ROOT/'usability.test.mjs';t=p.read_text()
if 'Android tablet is not an iPad' not in t:
    t+="\ntest('Android tablet is not an iPad even with the same screen signature',()=>{const d=detectDeviceProfile({userAgent:'Mozilla/5.0 Android 15',platform:'Linux armv8l',maxTouchPoints:5,screenWidth:744,screenHeight:1133,dpr:2});assert.equal(d.confidence,'family');assert.notEqual(d.profile,'ipad-mini');});\n"
    p.write_text(t)
p=ROOT/'usability.e2e.mjs';t=p.read_text()
if '// Incomplete setup must never acquire' not in t:
    anchor="assert.equal(await page.locator('#confirm-calibration').isVisible(),true);"
    assert t.count(anchor)==1
    t=t.replace(anchor,anchor+"""
      // Incomplete setup must never acquire the camera or silently confirm centimetres.
      await page.locator('#guided-camera-start').click();
      assert.equal((await page.evaluate(()=>window.__companionDiagnostics())).cameraActive,false);
      assert.equal((await page.evaluate(()=>window.__companionDiagnostics())).displayConfirmed,false);
      if(name==='desktop'){
        await page.locator('#confirm-calibration').click();
        assert.equal(await page.locator('#camera-placement').isVisible(),true,'blocked confirmation reveals the field that needs fixing');
        assert.equal((await page.evaluate(()=>window.__companionDiagnostics())).displayConfirmed,false);
        await page.locator('#setup-next').click();
      }
""")
    p.write_text(t)
print('FINALIZED platform matching / scene loading / physical setup recovery')
