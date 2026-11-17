import {createRequire} from 'node:module';
import path from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const [origin,label]=process.argv.slice(2),url=new URL(origin);
assert.equal(url.protocol,'https:');assert.ok(url.hostname==='polite-semolina-b478fc.netlify.app'||/^[0-9a-f]+--polite-semolina-b478fc\.netlify\.app$/.test(url.hostname));assert.ok(['preview','production'].includes(label));
const require=createRequire(path.join(process.env.BROWSER_MODULE_DIR,'package.json'));
const {chromium}=require('playwright'),out=process.env.EVIDENCE_DIR;await mkdir(out,{recursive:true});
const report={origin,label,engine:'Chromium software WebGL; real remote avatars, motions and IndexedDB; synthetic zoom/permission status, not physical device testing',scenarios:[],pass:false};
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
try{
 for(const mobile of [false,true]){
  const name=mobile?'mobile':'desktop',ctx=await browser.newContext({viewport:mobile?{width:420,height:912}:{width:1280,height:900},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'});
  const page=await ctx.newPage(),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon.ico'))errors.push(m.text());});
  await page.addInitScript(()=>{
   let dpr=window.devicePixelRatio;Object.defineProperty(window,'devicePixelRatio',{configurable:true,get:()=>dpr});
   window.__qaZoom=v=>{dpr=v;dispatchEvent(new Event('resize'));};
   const status=Object.assign(new EventTarget(),{state:'granted'}),query=navigator.permissions.query.bind(navigator.permissions);
   navigator.permissions.query=p=>p.name==='window-management'?Promise.resolve(status):query(p);
   const currentScreen={label:'QA external screen',width:1440,height:900,left:0,top:0,isInternal:false,devicePixelRatio:1};
   const d=Object.assign(new EventTarget(),{currentScreen,screens:[currentScreen]});window.__qaRequests=0;
   window.getScreenDetails=async()=>{window.__qaRequests++;return d;};window.__qaRevoke=()=>{status.state='denied';status.dispatchEvent(new Event('change'));};
  });
  try{
   await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});assert.equal(new URL(page.url()).hostname,url.hostname);assert.match(await page.title(),/MetaFlow/);
   await page.waitForFunction(()=>window.__companionDiagnostics?.().ready,{},{timeout:100000});
   assert.equal(await page.evaluate(()=>window.__companionDiagnostics().cameraActive),false);assert.equal(await page.evaluate(()=>window.__qaRequests),0);
   await page.locator('#room-shortcut').click();assert.equal(await page.locator('[data-room="terrace"]').count(),0);
   await page.locator('#appearance-advanced>summary').click();await page.locator('#room-quality').selectOption('low');await page.locator('#tab-avatar').click();
   assert.equal(await page.locator('.motion-entry').count(),16);
   let played=0;
   for(const model of mobile?['reconstruction']:['wenjing','reconstruction']){
    await page.locator('#model-choice').selectOption(model);await page.waitForFunction(()=>window.__companionDiagnostics().ready&&!window.__companionDiagnostics().renderer.loading,{},{timeout:90000});
    for(const id of ['hands-back','hand-hip','folded-arms','leaning','talking','sitting','dance']){
     await page.locator('#native-idle').selectOption(id);await page.waitForFunction(id=>{const d=window.__companionDiagnostics();return d.renderer.nativeMotion?.idle===id&&d.renderer.nativeMotion.phase==='ready'&&d.renderer.triangles>100;},id);played++;
    }
   }
   await page.locator('#motion-import-panel>summary').click();await page.locator('#motion-persist').check();
   await page.locator('#native-motion-file').setInputFiles({name:'original.vrma',mimeType:'application/octet-stream',buffer:await readFile('companion-reliability-site/assets/motions/Idle_HandOnHip.vrma')});
   await page.locator('#motion-import').click();await page.waitForFunction(()=>document.querySelector('#motion-library-summary').textContent.includes('本地导入 1 项'));
   await page.locator('#motion-clear').click();await page.waitForFunction(()=>document.querySelector('#motion-library-summary').textContent.includes('本地导入 0 项'));
   assert.equal(await page.evaluate(()=>window.__companionDiagnostics().renderer.nativeMotion.idle),'dance');
   await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__companionDiagnostics?.().ready,{},{timeout:90000});
   await page.locator('#room-shortcut').click();await page.locator('#tab-avatar').click();await page.waitForFunction(()=>window.__companionDiagnostics().renderer.nativeMotion?.idle==='dance');
   assert.match(await page.locator('#motion-library-summary').textContent(),/本地导入 0 项/);
   await page.locator('#native-idle').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${label}-${name}-motions.png`});
   await page.locator('#tab-setup').click();await page.locator('#device-preset').selectOption('mac-pro-14');await page.locator('#detect-displays').click();await page.waitForFunction(()=>window.__companionDiagnostics().displays.verified);
   await page.locator('#save-display-calibration').click();const saved=await page.locator('#width').inputValue();
   await page.locator('#width').focus();await page.locator('#width').press('Home');const edited=await page.locator('#width').inputValue();
   await page.evaluate(()=>window.__qaZoom(1.25));await page.locator('#restore-display-calibration').click();assert.equal(await page.locator('#width').inputValue(),edited);assert.match(await page.locator('#notice').textContent(),/缩放.*不同/);
   await page.evaluate(()=>window.__qaZoom(1));await page.locator('#restore-display-calibration').click();assert.equal(await page.locator('#width').inputValue(),saved);
   await page.evaluate(()=>window.__qaRevoke());await page.waitForFunction(()=>!window.__companionDiagnostics().displays.verified);
   assert.ok(await page.locator('#manual-display-slot').isVisible());assert.match(await page.locator('#display-info').textContent(),/权限已撤销/);assert.equal(await page.evaluate(()=>window.__qaRequests),1);
   await page.locator('#display-info').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${label}-${name}-screen-fallback.png`});
   assert.equal(await page.evaluate(()=>window.__companionDiagnostics().cameraActive),false);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
   report.scenarios.push({name,pass:true,played,errors,checks:['real remote models/7 motions','16-entry catalogue','persistent import then clear','builtin idle preserved','reload does not resurrect cleared bytes','zoom mismatch refuses old size','matching scale restores parameters','permission revocation returns to manual','no automatic camera','no horizontal overflow']});
   console.log('REMOTE_RELIABILITY_PASS',label,name);
  }catch(error){report.scenarios.push({name,pass:false,error:error.stack,errors,state:await page.evaluate(()=>window.__companionDiagnostics?.()).catch(()=>null)});await page.screenshot({path:`${out}/${label}-${name}-failed.png`}).catch(()=>{});throw error;}
  finally{await ctx.close();}
 }
 report.pass=true;
}finally{await browser.close();await writeFile(`${out}/${label}-report.json`,JSON.stringify(report,null,2));}
