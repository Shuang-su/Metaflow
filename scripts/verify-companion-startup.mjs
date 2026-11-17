import {createRequire} from 'node:module';
import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const [origin,label]=process.argv.slice(2),url=new URL(origin);
assert.equal(url.protocol,'https:');assert.ok(url.hostname==='polite-semolina-b478fc.netlify.app'||/^[0-9a-f]+--polite-semolina-b478fc\.netlify\.app$/.test(url.hostname));assert.ok(['preview','production'].includes(label));
const require=createRequire(path.join(process.env.BROWSER_MODULE_DIR,'package.json')),{chromium}=require('playwright');
const out=process.env.EVIDENCE_DIR;await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const report={origin,label,engine:'CI Chromium software WebGL; real remote Wenjing/Milk assets, simulated mobile viewport; no physical Apple device claim',scenarios:[],pass:false};
try{
 for(const mobile of [false,true]){
  const name=mobile?'mobile':'desktop',ctx=await browser.newContext({viewport:mobile?{width:420,height:912}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,reducedMotion:'reduce'});
  const page=await ctx.newPage(),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon.ico'))errors.push(m.text());});
  await page.addInitScript(()=>{if(!sessionStorage.getItem('startup-seed')){localStorage.setItem('metaflow-companion-room-v1',JSON.stringify({model:'reconstruction',scene:'studio',quality:'balanced'}));sessionStorage.setItem('startup-seed','true');}});
  const ready=model=>page.waitForFunction(model=>{const d=window.__companionDiagnostics?.();return d?.ready&&!d.renderer.loading&&document.querySelector('#model-choice').value===model&&(model==='wenjing'?d.model.includes('文镜'):d.model.includes('重建版'));},model,{timeout:120000});
  const open=async()=>{await page.locator('#room-shortcut').click();await page.locator('#tab-avatar').click();};
  try{
   await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});assert.equal(new URL(page.url()).hostname,url.hostname);assert.match(await page.title(),/MetaFlow/);await ready('wenjing');
   const first=await page.evaluate(()=>window.__companionDiagnostics());assert.equal(first.renderer.modelCount,1);assert.ok(first.renderer.triangles>100);assert.equal(first.cameraActive,false);assert.equal(first.displays.permission,'unrequested');
   await page.screenshot({path:`${out}/${label}-${name}-default-wenjing.png`});
   await page.locator('#room-shortcut').click();assert.equal(await page.locator('[data-room="terrace"]').count(),0);await page.locator('#appearance-advanced>summary').click();await page.locator('#room-quality').selectOption('low');await page.locator('#tab-avatar').click();
   assert.equal(await page.locator('#startup-model').inputValue(),'wenjing');assert.equal(await page.locator('.motion-entry').count(),16);
   await page.locator('#native-idle').selectOption('hand-hip');await page.waitForFunction(()=>window.__companionDiagnostics().renderer.nativeMotion?.idle==='hand-hip');
   await page.route('**/assets/milky-green-reconstruction.vrm',r=>r.fulfill({status:200,body:'invalid model',contentType:'application/octet-stream'}),{times:1});
   await page.locator('#model-choice').selectOption('reconstruction');await page.waitForFunction(()=>document.querySelector('#model-switch-status').textContent.includes('切换未完成'));assert.match(await page.locator('#scene-name').textContent(),/文镜/);
   await page.locator('#retry-model').click();await ready('reconstruction');await page.reload({waitUntil:'domcontentloaded'});await ready('wenjing');await open();
   await page.locator('#startup-model').selectOption('remember');await page.locator('#model-choice').selectOption('reconstruction');await ready('reconstruction');await page.reload({waitUntil:'domcontentloaded'});await ready('reconstruction');await open();
   assert.equal(await page.locator('#startup-model').inputValue(),'remember');await page.locator('#use-default-wenjing').click();await ready('wenjing');await page.waitForFunction(()=>window.__companionDiagnostics().renderer.nativeMotion?.idle==='hand-hip');
   assert.equal(await page.locator('#startup-model').inputValue(),'wenjing');await page.locator('#startup-model').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${label}-${name}-startup-settings.png`});
   const final=await page.evaluate(()=>window.__companionDiagnostics());assert.equal(final.cameraActive,false);assert.equal(final.displays.permission,'unrequested');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
   report.scenarios.push({name,pass:true,errors,checks:['actual Wenjing despite legacy Milk preference','temporary switching leaves Wenjing startup default','explicit remembering restores Milk','one-click Wenjing/default','failed switch retains actual avatar','retry recovers','per-avatar original idle retained','16-item catalogue retained','no auto camera/multiscreen permissions','no horizontal overflow']});
  }catch(e){report.scenarios.push({name,pass:false,error:e.stack,errors});await page.screenshot({path:`${out}/${label}-${name}-failed.png`}).catch(()=>{});throw e;}finally{await ctx.close();}
 }
 report.pass=true;console.log('REMOTE_STARTUP_VERIFIED',label);
}finally{await browser.close();await writeFile(`${out}/${label}-report.json`,JSON.stringify(report,null,2));}
