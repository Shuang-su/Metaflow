import {createRequire} from 'node:module';
import path from 'node:path';import {mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const [origin,label]=process.argv.slice(2),url=new URL(origin);
assert.equal(url.protocol,'https:');assert.ok(url.hostname==='polite-semolina-b478fc.netlify.app'||/^[0-9a-f]+--polite-semolina-b478fc\.netlify\.app$/.test(url.hostname));assert.ok(['preview','production'].includes(label));
const {chromium}=createRequire(path.join(process.env.BROWSER_MODULE_DIR,'package.json'))('playwright'),out=process.env.EVIDENCE_DIR;await mkdir(out,{recursive:true});
const report={origin,label,engine:'CI Chromium software WebGL; actual remote avatars/clips; corrupted-response test is explicit; not physical hardware',scenarios:[],pass:false};
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
try{
 for(const mobile of [false,true]){
  const name=mobile?'mobile':'desktop',context=await browser.newContext({viewport:mobile?{width:420,height:912}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[],requests=[];page.setDefaultTimeout(30000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon.ico'))errors.push(m.text());});
  page.on('request',r=>{if(r.url().includes('/assets/motions/'))requests.push(r.url());});
  const settle=id=>page.waitForFunction(id=>{const s=window.__companionDiagnostics().renderer.nativeMotion;return s?.idle===id&&!s.loading&&s.actions===1;},id);
  try{
   await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});assert.equal(new URL(page.url()).hostname,url.hostname);assert.match(await page.title(),/MetaFlow/);
   await page.waitForFunction(()=>window.__companionDiagnostics?.().ready,{},{timeout:100000});assert.match(await page.locator('#scene-name').textContent(),/文镜/);assert.ok(await page.evaluate(()=>window.__companionDiagnostics().renderer.triangles>100));
   await page.locator('#room-shortcut').click();assert.equal(await page.locator('[data-room="terrace"]').count(),0);
   await page.locator('#appearance-advanced>summary').click();await page.locator('#room-quality').selectOption('low');await page.locator('#tab-avatar').click();assert.equal(await page.locator('.motion-entry').count(),16);
   for(const id of ['hands-back','hand-hip','folded-arms','leaning','talking','sitting','dance']){await page.locator('#native-idle').selectOption(id);await settle(id);}
   const count=requests.length;await page.locator('[data-play-motion="dance"]').click();assert.equal(requests.length,count);assert.equal(await page.locator('[data-motion="dance"]').getAttribute('aria-current'),'true');
   await page.locator('#native-idle-enabled').uncheck();assert.match(await page.locator('#native-motion-status').textContent(),/已暂停/);await page.locator('[data-play-motion="dance"]').click();assert.ok(await page.locator('#native-idle-enabled').isChecked());assert.equal(requests.length,count);
   await page.route('**/assets/motions/Idle_FoldedArms.vrma',r=>r.fulfill({status:200,body:'corrupt-test-response',contentType:'application/octet-stream'}),{times:1});
   await page.locator('#native-idle').selectOption('folded-arms');await page.locator('#motion-retry').waitFor({state:'visible'});assert.equal(await page.locator('#native-idle').inputValue(),'dance');assert.match(await page.locator('#native-motion-status').textContent(),/切换未完成.*Dance/);
   await page.locator('#native-motion-status').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${label}-${name}-failure-recovery.png`});
   await page.locator('#motion-retry').click();await settle('folded-arms');assert.equal(await page.locator('#motion-retry').isVisible(),false);
   await page.locator('#motion-playable-only').check();assert.equal(await page.locator('.motion-entry').count(),7);await page.locator('#motion-kind').selectOption('once');assert.ok(await page.locator('#motion-empty').isVisible());await page.locator('#motion-clear-filter').click();assert.equal(await page.locator('.motion-entry').count(),16);
   await page.locator('#motion-search').fill('Folded');assert.equal(await page.locator('.motion-entry').count(),1);assert.equal(await page.locator('[data-motion="folded-arms"]').getAttribute('aria-current'),'true');
   await page.locator('#native-idle').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${label}-${name}-current-motion.png`});
   const d=await page.evaluate(()=>window.__companionDiagnostics());assert.equal(d.cameraActive,false);assert.equal(d.displays.permission,'unrequested');assert.equal(d.experience.startupMode,'wenjing');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
   report.scenarios.push({name,pass:true,errors,checks:['real Wenjing default','seven original idles','current highlight','same idle not downloaded','pause/resume','failed original retains selector/idle','retry restores valid original','playable filter','empty reset and search','16-item catalogue retained','no automatic camera/display permission','no overflow']});
  }catch(error){report.scenarios.push({name,pass:false,error:error.stack,errors});await page.screenshot({path:`${out}/${label}-${name}-failed.png`}).catch(()=>{});throw error;}
  finally{await context.close();}
 }
 report.pass=true;console.log('REMOTE_FEEDBACK_VERIFIED',label);
}finally{await browser.close();await writeFile(`${out}/${label}-report.json`,JSON.stringify(report,null,2));}
