import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
const url=process.argv[2],label=process.argv[3]||'remote',host=new URL(url).hostname;
assert.equal(new URL(url).protocol,'https:');assert.ok(host==='polite-semolina-b478fc.netlify.app'||/^[0-9a-f]+--polite-semolina-b478fc\.netlify\.app$/.test(host));
const require=createRequire(path.join(process.env.BROWSER_MODULE_DIR,'package.json'));const {chromium}=require('playwright');
const out=process.env.EVIDENCE_DIR;await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon.ico'))errors.push(m.text());});
const report={url,label,engine:'Chromium software WebGL on actual remote site',pass:false,errors,clips:[]};
try{
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});assert.equal(new URL(page.url()).hostname,host);assert.match(await page.title(),/MetaFlow/);
 await page.waitForFunction(()=>window.__companionDiagnostics?.().ready,{},{timeout:120000});
 const initial=await page.evaluate(()=>window.__companionDiagnostics());assert.equal(initial.cameraActive,false);assert.equal(initial.renderer.modelCount,1);assert.ok(initial.renderer.triangles>100);
 await page.locator('#room-shortcut').click();assert.equal(await page.locator('[data-room="terrace"]').count(),0);
 await page.locator('#tab-avatar').click();assert.equal(await page.locator('.motion-entry').count(),16);
 await page.locator('#motion-kind').selectOption('idle');assert.equal(await page.locator('.motion-entry').count(),9);
 await page.locator('#motion-kind').selectOption('once');assert.equal(await page.locator('.motion-entry').count(),7);
 await page.locator('#motion-kind').selectOption('all');await page.locator('#motion-search').fill('Dance');assert.equal(await page.locator('.motion-entry').count(),1);await page.locator('#motion-search').fill('');
 for(const id of ['hands-back','hand-hip','folded-arms','leaning','talking','sitting','dance']){
  await page.locator('#native-idle').selectOption(id);await page.waitForFunction(id=>{const m=window.__companionDiagnostics().renderer.nativeMotion;return m?.idle===id&&m.phase==='ready'&&m.actions===1;},id);
  const d=await page.evaluate(()=>window.__companionDiagnostics());assert.equal(d.cameraActive,false);assert.deepEqual(d.renderer.cameraPosition,initial.renderer.cameraPosition);report.clips.push({id,bones:d.renderer.nativeBones});
 }
 await page.locator('#motion-search').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,label+'-motion-library.png')});
 await page.locator('#settings-peek').click();await page.screenshot({path:path.join(out,label+'-dancing.png')});await page.locator('#resume-settings').click();
 await page.locator('#native-idle-enabled').uncheck();await page.waitForFunction(()=>window.__companionDiagnostics().renderer.nativeMotion?.idleEnabled===false);
 await page.locator('#native-idle-enabled').check();await page.waitForFunction(()=>window.__companionDiagnostics().renderer.nativeMotion?.idleEnabled===true);
 await page.locator('#tab-setup').click();assert.equal(await page.locator('#display-controls').isVisible(),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
 report.pass=true;report.checks=['page identity and meaningful real model','16-item inventory','9/7 category counts','search','all seven original builtin loops','pause/resume','unchanged observer camera','no automatic camera request','display settings','withdrawn adapted scene','no horizontal overflow or runtime errors'];console.log('REMOTE_MOTION_LIBRARY_VERIFIED',label,host);
}catch(e){report.error=e.stack;await page.screenshot({path:path.join(out,label+'-failed.png')}).catch(()=>{});throw e;}
finally{await writeFile(path.join(out,label+'-report.json'),JSON.stringify(report,null,2));await browser.close();}
