import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.EVIDENCE_DIR||'/tmp/companion-evidence';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const scenarios=[['desktop',{viewport:{width:1440,height:960},screen:{width:1512,height:982},deviceScaleFactor:1,userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'},'macbook'],['air',{viewport:{width:420,height:912},screen:{width:420,height:912},deviceScaleFactor:3,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'},'iphone-air'],['mini',{viewport:{width:744,height:1133},screen:{width:744,height:1133},deviceScaleFactor:2,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'},'ipad-mini']];
const report={engine:'CI Chromium software WebGL; not physical Apple/Safari',browserBlocker:'Connected Browser lacks originating browser context; local container navigation is administratively blocked. Existing CI Playwright path used.',scenarios:[]};
try{
  for(const [name,options,profile] of scenarios){
    const context=await browser.newContext(options),page=await context.newPage(),errors=[];page.setDefaultTimeout(20000);
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon.ico'))errors.push(m.text());});
    try{
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.__companionDiagnostics?.().ready,{},{timeout:90000});
      const initial=await page.evaluate(()=>window.__companionDiagnostics());assert.equal(initial.profile,profile);assert.equal(initial.experience.room.scene,'studio');assert.equal(initial.cameraActive,false);assert.equal(initial.displayConfirmed,false);
      assert.equal(await page.locator('#camera-card').isVisible(),false);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      const ids=await page.evaluate(()=>{const a=[...document.querySelectorAll('[id]')].map(e=>e.id);return a.filter((id,i)=>a.indexOf(id)!==i);});assert.deepEqual(ids,[]);
      await page.screenshot({path:`${out}/${name}-study.png`});
      await page.locator('#room-shortcut').click();assert.equal(await page.locator('#tab-scene').getAttribute('aria-pressed'),'true');
      await page.locator('#room-lighting').selectOption('evening');await page.locator('#appearance-advanced').locator('summary').click();
      await page.locator('#room-quality').selectOption('low');
      await page.waitForFunction(()=>window.__companionDiagnostics().renderer.pixelRatio<=1&&!window.__companionDiagnostics().renderer.shadows);
      await page.locator('#settings-undo').click();assert.equal(await page.locator('#room-lighting').inputValue(),'day');assert.equal(await page.locator('#room-quality').inputValue(),'balanced');
      assert.equal(await page.locator('#settings-undo').isDisabled(),true);
      await page.locator('#tab-setup').click();assert.equal(await page.locator('#device-preset').isVisible(),true);assert.equal(await page.locator('#camera-placement').isVisible(),false);
      await page.locator('#setup-next').click();assert.equal(await page.locator('#camera-placement').isVisible(),true);assert.equal(await page.locator('#device-preset').isVisible(),false);
      await page.locator('#setup-next').click();assert.equal(await page.locator('#confirm-calibration').isVisible(),true);
      await page.locator('#guided-without-camera').click();assert.equal(await page.locator('#settings-panel').isVisible(),false);assert.equal((await page.evaluate(()=>window.__companionDiagnostics())).cameraActive,false);
      await page.locator('#motion-speech').click();assert.equal(await page.locator('#tab-interaction').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#speech-text').isVisible(),true);
      await page.locator('#tab-avatar').click();assert.equal(await page.locator('#model-choice').isVisible(),true);assert.equal(await page.locator('[data-view="inspect"]').isVisible(),true);
      await page.locator('#tab-avatar').focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('#tab-scene').getAttribute('aria-pressed'),'true');
      await page.screenshot({path:`${out}/${name}-settings.png`});
      if(name==='desktop'||name==='air'){
        await page.locator('[data-room="terrace"]').click();await page.locator('#settings-done').click();
        await page.waitForFunction(()=>window.__companionDiagnostics().renderer.scene.loaded,{},{timeout:90000});
        const terrace=await page.evaluate(()=>window.__companionDiagnostics());assert.equal(terrace.renderer.scene.scene,'terrace');assert.equal(terrace.renderer.scene.status,'ready');assert.equal(terrace.renderer.modelCount,1);
        await page.screenshot({path:`${out}/${name}-terrace.png`});
        await page.locator('#room-shortcut').click();await page.locator('#room-lighting').selectOption('evening');await page.locator('#settings-done').click();
        await page.screenshot({path:`${out}/${name}-terrace-evening.png`});
        await page.locator('#room-shortcut').click();await page.locator('[data-room="minimal"]').click();await page.locator('#settings-done').click();await page.waitForFunction(()=>!window.__companionDiagnostics().renderer.scene.visible);
        await page.locator('#room-shortcut').click();await page.locator('[data-room="studio"]').click();await page.locator('#room-lighting').selectOption('day');await page.locator('#settings-done').click();
      }
      if(name==='air'){
        await page.locator('#settings-toggle').click();await page.locator('#tab-setup').click();await page.locator('[data-step="0"]').click();await page.locator('#device-preset').selectOption('manual');await page.locator('#settings-done').click();
        await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__companionDiagnostics?.().ready,{},{timeout:90000});assert.equal((await page.evaluate(()=>window.__companionDiagnostics())).profile,'manual','auto-detection must not overwrite a saved manual choice');
        await page.setViewportSize({width:912,height:420});await page.locator('#motion-speech').click();await page.locator('#speech-stop').scrollIntoViewIfNeeded();assert.equal(await page.locator('#speech-stop').isVisible(),true);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:`${out}/air-landscape-controls.png`});
      }
      await page.keyboard.press('Escape');assert.equal(await page.locator('#settings-panel').isVisible(),false);
      assert.deepEqual(errors,[]);
      report.scenarios.push({name,pass:true,profile,checks:['meaningful VRM render','no horizontal overflow or duplicate IDs','four categories','guided calibration','no automatic camera access','quality changes actual renderer','undo restores prior settings','keyboard category navigation','visible controls'],errors});
      console.log('USABILITY_BROWSER_PASS',name);
    }catch(error){await page.screenshot({path:`${out}/${name}-usability-failed.png`}).catch(()=>{});const state=await page.evaluate(()=>window.__companionDiagnostics?.()).catch(()=>null);report.scenarios.push({name,pass:false,failure:error.stack,errors,state});console.log('USABILITY_BROWSER_FAIL',name,error.stack,JSON.stringify(state),JSON.stringify(errors));}
    await context.close();
  }
}finally{await browser.close();await writeFile(`${out}/usability-report.json`,JSON.stringify(report,null,2));}
if(report.scenarios.some(s=>!s.pass))process.exitCode=1;
