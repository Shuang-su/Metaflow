// Runs without deployment credentials. Only the existing companion and its exact
// Netlify draft host are accepted; screenshots are CI evidence, not source assets.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const base=process.argv[2],label=process.argv[3]||'remote';
const host=new URL(base).hostname;
assert.ok(host==='polite-semolina-b478fc.netlify.app'||/^[0-9a-f]+--polite-semolina-b478fc\.netlify\.app$/.test(host));
assert.equal(new URL(base).protocol,'https:');
const require=createRequire(path.join(process.env.BROWSER_MODULE_DIR,'package.json'));
const {chromium}=require('playwright');
const out=process.env.EVIDENCE_DIR||'/tmp/companion-publication-evidence';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
const page=await context.newPage(),errors=[];page.setDefaultTimeout(30000);
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon.ico'))errors.push(m.text());});
const report={url:base,engine:'Chromium software WebGL, real remote assets',pass:false};
try{
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
  assert.equal(new URL(page.url()).hostname,host);assert.match(await page.title(),/MetaFlow/);
  await page.waitForFunction(()=>window.__companionDiagnostics?.().ready,{},{timeout:120000});
  const initial=await page.evaluate(()=>window.__companionDiagnostics());
  assert.equal(initial.cameraActive,false);assert.equal(initial.experience.room.scene,'studio');
  assert.equal(initial.renderer.modelCount,1);assert.equal(await page.locator('#camera-card').isVisible(),false);
  await page.screenshot({path:path.join(out,`${label}-study.png`)});
  await page.locator('#room-shortcut').click();
  assert.equal(await page.locator('#tab-scene').getAttribute('aria-pressed'),'true');
  await page.locator('#room-lighting').selectOption('evening');
  await page.locator('#settings-peek').click();assert.equal(await page.locator('#settings-panel').isVisible(),false);
  await page.locator('#resume-settings').click();assert.equal(await page.locator('#settings-undo').isDisabled(),false);
  await page.locator('#settings-undo').click();assert.equal(await page.locator('#room-lighting').inputValue(),'day');
  await page.locator('[data-room="terrace"]').click();await page.locator('#settings-done').click();
  await page.waitForFunction(()=>window.__companionDiagnostics().renderer.scene.loaded,{},{timeout:90000});
  const terrace=await page.evaluate(()=>window.__companionDiagnostics());
  assert.equal(terrace.renderer.scene.status,'ready');assert.equal(terrace.renderer.scene.scene,'terrace');
  await page.screenshot({path:path.join(out,`${label}-terrace.png`)});
  await page.locator('#room-shortcut').click();await page.locator('#tab-setup').click();
  assert.equal(await page.locator('#device-preset').isVisible(),true);
  await page.screenshot({path:path.join(out,`${label}-settings.png`)});
  assert.equal((await page.evaluate(()=>window.__companionDiagnostics())).cameraActive,false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[]);
  Object.assign(report,{pass:true,initial,terrace,errors,checks:['page identity','real model render','no camera request','four-category settings','preview return preserves undo','real terrace download and rendering','no horizontal overflow','no runtime console errors']});
  console.log('REMOTE_BROWSER_VERIFIED',label,host);
}catch(error){report.error=error.stack;report.errors=errors;await page.screenshot({path:path.join(out,`${label}-failed.png`)}).catch(()=>{});throw error;}
finally{await writeFile(path.join(out,`${label}-report.json`),JSON.stringify(report,null,2));await browser.close();}
