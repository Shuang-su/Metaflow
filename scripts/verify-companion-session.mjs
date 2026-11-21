// Remote deployment acceptance. No real camera, system lock-screen or hardware
// wake guarantee: lifecycle inputs are controlled, but models and UI are real.
import {createRequire} from 'node:module';
import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const [origin,label]=process.argv.slice(2),url=new URL(origin);
assert.equal(url.protocol,'https:');assert.ok(url.hostname==='polite-semolina-b478fc.netlify.app'||/^[0-9a-f]+--polite-semolina-b478fc\.netlify\.app$/.test(url.hostname));assert.ok(['preview','production'].includes(label));
const require=createRequire(path.join(process.env.BROWSER_MODULE_DIR,'package.json')),{chromium}=require('playwright');
const out=process.env.EVIDENCE_DIR;await mkdir(out,{recursive:true});
const report={origin,label,engine:'Chromium software WebGL; actual remote Wenjing/VRMA; simulated fullscreen rejection, wake leases, visibility, cache and pending camera requests; not physical Apple lock-screen validation',scenarios:[],pass:false};
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
try{
 for(const mobile of [false,true]){
  const name=mobile?'mobile':'desktop',ctx=await browser.newContext({viewport:mobile?{width:420,height:912}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,reducedMotion:'reduce'});
  const page=await ctx.newPage(),errors=[],knownDiagnostics=[];page.setDefaultTimeout(30000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{
   const message=m.text();
   if(message==='INFO: Created TensorFlow Lite XNNPACK delegate for CPU.'){knownDiagnostics.push({channel:m.type(),message});return;}
   if(m.type()==='error'&&!message.includes('favicon.ico'))errors.push(message);
  });
  await page.addInitScript(()=>{
   let hidden=false;const qa={wakeRequests:0,releases:0,mediaRequests:0,deny:false,locks:[]};
   Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
   Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>hidden?'hidden':'visible'});
   Object.defineProperty(Element.prototype,'requestFullscreen',{configurable:true,value:()=>Promise.reject(new DOMException('QA fullscreen fallback','NotSupportedError'))});
   Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{request(){
    qa.wakeRequests++;if(qa.deny)return Promise.reject(new DOMException('QA power restriction','NotAllowedError'));
    const lock=Object.assign(new EventTarget(),{released:false,release(){if(!this.released){this.released=true;qa.releases++;this.dispatchEvent(new Event('release'));}return Promise.resolve();}});
    qa.locks.push(lock);return Promise.resolve(lock);
   }}});
   navigator.mediaDevices.getUserMedia=()=>{qa.mediaRequests++;return new Promise(()=>{});};
   window.__qaSession={qa,setHidden(v){hidden=v;document.dispatchEvent(new Event('visibilitychange'));},cache(v){dispatchEvent(new PageTransitionEvent(v?'pagehide':'pageshow',{persisted:true}));},release:()=>qa.locks.at(-1)?.release()};
  });
  const wake=phase=>page.waitForFunction(p=>window.__companionDiagnostics().displaySession?.phase===p,phase);
  try{
   await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});assert.equal(new URL(page.url()).hostname,url.hostname);assert.match(await page.title(),/MetaFlow/);
   await page.waitForFunction(()=>window.__companionDiagnostics?.().ready,{},{timeout:100000});
   const first=await page.evaluate(()=>window.__companionDiagnostics());assert.match(first.model,/文镜/);assert.ok(first.renderer.triangles>100);assert.equal(first.renderer.modelCount,1);
   assert.equal(first.cameraActive,false);assert.equal(first.displays.permission,'unrequested');assert.equal(await page.evaluate(()=>__qaSession.qa.wakeRequests),0);assert.equal(await page.evaluate(()=>__qaSession.qa.mediaRequests),0);
   await page.locator('#room-shortcut').click();assert.equal(await page.locator('[data-room="terrace"]').count(),0);
   await page.locator('#appearance-advanced>summary').click();await page.locator('#room-quality').selectOption('low');
   await page.locator('#display-session-controls').scrollIntoViewIfNeeded();assert.match(await page.locator('#display-awake-status').textContent(),/进入展示后/);
   await page.screenshot({path:`${out}/${label}-${name}-session-settings.png`});
   await page.locator('#tab-avatar').click();assert.equal(await page.locator('.motion-entry').count(),16);
   await page.locator('#native-idle').selectOption('hand-hip');await page.waitForFunction(()=>window.__companionDiagnostics().renderer.nativeMotion?.idle==='hand-hip');
   await page.locator('#settings-done').click();await page.locator('#display').click();await wake('held');assert.equal(await page.evaluate(()=>!!document.fullscreenElement),false);
   await page.locator('#leave-display').click();await wake('idle');assert.equal(await page.evaluate(()=>__qaSession.qa.releases),1);
   await page.evaluate(()=>{__qaSession.qa.deny=true;});await page.locator('#display').click();await wake('unavailable');assert.ok(await page.locator('#display-awake-inline').isVisible());
   await page.screenshot({path:`${out}/${label}-${name}-awake-retry.png`});await page.evaluate(()=>{__qaSession.qa.deny=false;});await page.locator('#display-awake-inline').click();await wake('held');
   await page.evaluate(()=>__qaSession.release());await wake('released');await page.locator('#display-awake-inline').click();await wake('held');
   await page.locator('#leave-display').click();await wake('idle');await page.locator('#room-shortcut').click();await page.locator('#display-awake').uncheck();await page.locator('#settings-done').click();
   const count=await page.evaluate(()=>__qaSession.qa.wakeRequests);await page.locator('#display').click();await wake('off');assert.equal(await page.evaluate(()=>__qaSession.qa.wakeRequests),count);await page.locator('#leave-display').click();
   await page.locator('#room-shortcut').click();await page.locator('#display-awake').check();await page.locator('#tab-setup').click();await page.locator('#device-preset').selectOption('iphone-air');
   await page.locator('[data-step="2"]').click();await page.locator('#confirm-calibration').click();assert.equal(await page.evaluate(()=>window.__companionDiagnostics().displayConfirmed),true);await page.locator('#settings-done').click();
   await page.locator('#camera-start').click();assert.equal(await page.evaluate(()=>__qaSession.qa.mediaRequests),1);
   await page.evaluate(()=>__qaSession.setHidden(true));assert.equal(await page.evaluate(()=>window.__companionDiagnostics().mode),'manual');assert.equal(await page.evaluate(()=>window.__companionDiagnostics().renderer.paused),true);
   await page.evaluate(()=>__qaSession.setHidden(false));await page.waitForFunction(()=>!document.querySelector('#display-resume-card').hidden&&!window.__companionDiagnostics().renderer.paused);
   assert.equal(await page.evaluate(()=>__qaSession.qa.mediaRequests),1);assert.equal(await page.evaluate(()=>window.__companionDiagnostics().cameraActive),false);
   await page.screenshot({path:`${out}/${label}-${name}-tracking-resume.png`});await page.locator('#resume-session-tracking').click();assert.equal(await page.evaluate(()=>__qaSession.qa.mediaRequests),2);
   await page.evaluate(()=>__qaSession.cache(true));await page.evaluate(()=>__qaSession.cache(false));await page.waitForFunction(()=>!document.querySelector('#display-resume-card').hidden&&!window.__companionDiagnostics().renderer.paused);
   assert.equal(await page.evaluate(()=>__qaSession.qa.mediaRequests),2);await page.locator('#dismiss-session-resume').click();assert.equal(await page.locator('#display-resume-card').isVisible(),false);
   const final=await page.evaluate(()=>window.__companionDiagnostics());assert.equal(final.renderer.disposed,false);assert.equal(final.renderer.modelCount,1);assert.equal(final.renderer.nativeMotion.idle,'hand-hip');assert.equal(final.cameraActive,false);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
   report.scenarios.push({name,pass:true,errors,knownDiagnostics,checks:['actual Wenjing/default and original native idle','16-item catalogue','no automatic wake/camera permission','inline display exit releases lock','denial/system-release and explicit retry','awake switch honored','background stops pending camera and rendering','return renders but does not restart camera','explicit tracking resume only','cached page keeps renderer alive','original idle retained','no overflow']});
   console.log('LIVE_SESSION_VERIFIED',label,name);
  }catch(error){report.scenarios.push({name,pass:false,error:error.stack,errors,knownDiagnostics});await page.screenshot({path:`${out}/${label}-${name}-failed.png`}).catch(()=>{});throw error;}
  finally{await ctx.close();}
 }
 report.pass=true;
}finally{await browser.close();await writeFile(`${out}/${label}-report.json`,JSON.stringify(report,null,2));}
