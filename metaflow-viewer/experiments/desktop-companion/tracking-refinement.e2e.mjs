import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.EVIDENCE_DIR||'/tmp/companion-evidence';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const report={engine:'Chromium/software WebGL, synthetic camera stream, not physical iPhone Air/Safari',checks:[],errors:[]};
const context=await browser.newContext({viewport:{width:420,height:912},screen:{width:420,height:912},deviceScaleFactor:3,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',permissions:['camera']});
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon.ico'))report.errors.push(m.text());});
await page.addInitScript(()=>localStorage.setItem('metaflow-tabletop-calibration-v3',JSON.stringify({'show-preview':true})));
try{
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__companionDiagnostics?.().ready,{},{timeout:90000});
  assert.equal(await page.locator('#show-preview').isChecked(),false,'legacy preference must not re-enable camera preview');
  await page.locator('#settings-toggle').click();await page.locator('#device-preset').selectOption('iphone-air');
  assert.ok(Math.abs(Number(await page.locator('#width').inputValue())-6.9573913)<.02);
  await page.locator('#confirm-calibration').click();await page.locator('#close-settings').click();
  report.checks.push('Air explicit profile, calibrated portrait width, no false auto-identification');
  await page.locator('#camera-start').click();
  await page.waitForFunction(()=>window.__companionDiagnostics().cameraActive,{},{timeout:60000});
  await page.waitForFunction(()=>{const v=document.querySelector('video.camera-video');return v?.readyState>=2&&v.currentTime>0;},{},{timeout:30000});
  assert.equal(await page.locator('#camera-card').isVisible(),false);
  const first=await page.locator('video.camera-video').evaluate(v=>({time:v.currentTime,parent:v.parentElement.tagName,display:getComputedStyle(v).display,opacity:getComputedStyle(v).opacity}));
  assert.equal(first.parent,'BODY');assert.notEqual(first.display,'none');assert.equal(first.opacity,'0');
  await page.waitForFunction(t=>document.querySelector('video.camera-video').currentTime>t+.3,first.time,{timeout:15000});
  assert.ok(await page.locator('#quiet-camera-stop').isVisible());
  await page.screenshot({path:`${out}/air-quiet-tracking.png`});
  report.checks.push('camera permission/stop remain explicit; hidden attached video keeps advancing');
  await page.locator('#settings-toggle').click();await page.locator('#show-preview').check();assert.equal(await page.locator('#camera-card').isVisible(),true);
  await page.locator('#show-preview').uncheck();assert.equal(await page.locator('#camera-card').isVisible(),false);await page.locator('#close-settings').click();
  const cdp=await context.newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:912,height:420,deviceScaleFactor:3,mobile:true,screenWidth:912,screenHeight:420,screenOrientation:{type:'landscapePrimary',angle:90}});
  await page.waitForFunction(()=>{const d=window.__companionDiagnostics();return d.profile==='iphone-air'&&d.physicalWidthCm>14&&!d.displayConfirmed&&!d.cameraActive;},{},{timeout:20000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:`${out}/air-landscape.png`});
  report.checks.push('actual emulated orientation event updates Air width, invalidates calibration and releases camera');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:420,height:912,deviceScaleFactor:3,mobile:true,screenWidth:420,screenHeight:912,screenOrientation:{type:'portraitPrimary',angle:0}});
  for(const [choice,label] of [['wenjing','文镜'],['reconstruction','重建版']]){
    await page.locator('#settings-toggle').click();await page.locator('#model-choice').selectOption(choice);
    await page.waitForFunction(label=>{const d=window.__companionDiagnostics();return d.ready&&!d.renderer.loading&&d.model.includes(label);},label,{timeout:90000});
    await page.locator('#close-settings').click();
    const before=await page.evaluate(()=>window.__companionDiagnostics().renderer.cameraPosition);
    await page.locator('#wave').click();
    await page.waitForFunction(()=>{const d=window.__companionDiagnostics().renderer;return d.gesture==='wave'&&d.palm?.screenFacingDot>.95&&d.palm?.screenUpDot>.8;},{},{timeout:30000});
    const current=await page.evaluate(()=>window.__companionDiagnostics().renderer);
    assert.deepEqual(current.cameraPosition,before);
    assert.ok(current.palm.screenFacingDot>.95&&current.palm.screenUpDot>.8);
    await page.screenshot({path:`${out}/${choice}-palm-facing.png`});
    report.checks.push({model:choice,palm:current.palm,cameraUnchanged:true});
    await page.waitForFunction(()=>window.__companionDiagnostics().renderer.gesture===null,{},{timeout:30000});
  }
  assert.equal(report.errors.length,0,report.errors.join('\n'));
  report.pass=true;console.log('REFINEMENT_BROWSER_PASS',JSON.stringify(report));
}catch(e){report.pass=false;report.failure=e.message;await page.screenshot({path:`${out}/refinement-failed.png`}).catch(()=>{});console.log('REFINEMENT_BROWSER_FAIL',JSON.stringify(report));process.exitCode=1;}
finally{await writeFile(`${out}/refinement-report.json`,JSON.stringify(report,null,2));await browser.close();}
