// A browser-only check of the exact deployed candidate. No deployment credentials.
import {createRequire} from 'node:module';
import path from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.argv[2],label=process.argv[3]||'remote';
const target='polite-semolina-b478fc.netlify.app';
const parsed=new URL(base);
assert.equal(parsed.protocol,'https:');
assert.ok(parsed.hostname===target||/^[0-9a-f]+--polite-semolina-b478fc\.netlify\.app$/.test(parsed.hostname));
assert.ok(['preview','production'].includes(label));
const require=createRequire(path.join(process.env.BROWSER_MODULE_DIR,'package.json'));
const {chromium}=require('playwright');
const out=process.env.EVIDENCE_DIR||'/tmp/companion-motion-publication';
await mkdir(out,{recursive:true});
const clips=['hands-back','hand-hip','folded-arms','leaning','talking','sitting','dance'];
const report={url:base,sourceRef:'f1a476f7a6fa4d60ad16bd8d401eed4433704eff',engine:'Chromium software WebGL; real remote models/animations; not Apple hardware or real multi-monitor QA',quality:'Default first render, then explicit visible low-quality setting for software-renderer budget',scenarios:[],pass:false};
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
function closeCoordinates(a,b){assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-b[i])<1e-9,'animation must not move the observer camera');}
try{
  for(const mobile of [false,true]){
    const name=mobile?'mobile':'desktop';
    const context=await browser.newContext({viewport:mobile?{width:420,height:912}:{width:1280,height:900},screen:mobile?{width:420,height:912}:{width:1280,height:900},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce',userAgent:mobile?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1':'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'});
    const page=await context.newPage(),errors=[],poses=[];
    page.setDefaultTimeout(30000);
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon.ico'))errors.push(m.text());});
    try{
      await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
      assert.equal(new URL(page.url()).hostname,parsed.hostname);
      assert.match(await page.title(),/MetaFlow/);
      await page.waitForFunction(()=>window.__companionDiagnostics?.().ready,{},{timeout:100000});
      const first=await page.evaluate(()=>window.__companionDiagnostics());
      assert.equal(first.renderer.modelCount,1);assert.ok(first.renderer.triangles>100);
      assert.equal(first.cameraActive,false);assert.equal(first.displays.permission,'unrequested');
      assert.equal(await page.locator('#camera-card').isVisible(),false);
      await page.locator('#room-shortcut').click();
      assert.equal(await page.locator('[data-room="terrace"]').count(),0);
      assert.ok(await page.locator('#scene-fidelity-note').isVisible());
      await page.locator('#appearance-advanced > summary').click();
      await page.locator('#room-quality').selectOption('low');
      await page.waitForFunction(()=>window.__companionDiagnostics().renderer.pixelRatio<=1&&!window.__companionDiagnostics().renderer.shadows);
      await page.locator('#tab-avatar').click();
      assert.equal(await page.locator('#motion-catalogue-list .motion-entry').count(),16);
      await page.locator('#motion-kind').selectOption('idle');
      assert.equal(await page.locator('#motion-catalogue-list .motion-entry').count(),9);
      await page.locator('#motion-kind').selectOption('once');
      assert.equal(await page.locator('#motion-catalogue-list .motion-entry').count(),7);
      await page.locator('#motion-kind').selectOption('all');
      await page.locator('#motion-search').fill('Dance');
      assert.equal(await page.locator('#motion-catalogue-list .motion-entry').count(),1);
      await page.locator('[data-play-motion="dance"]').click();
      await page.waitForFunction(()=>window.__companionDiagnostics().renderer.nativeMotion?.idle==='dance');
      await page.locator('#motion-search').fill('');
      for(const [model,modelText] of mobile?[['reconstruction','重建版']]:[['wenjing','文镜'],['reconstruction','重建版']]){
        await page.locator('#model-choice').selectOption(model);
        await page.waitForFunction(text=>{const d=window.__companionDiagnostics();return d.ready&&!d.renderer.loading&&d.model.includes(text);},modelText,{timeout:100000});
        for(const id of clips){
          await page.locator('#native-idle').selectOption(id);
          await page.waitForFunction(id=>{const m=window.__companionDiagnostics().renderer.nativeMotion;return m?.idle===id&&m.phase==='ready'&&m.actions===1;},id,{timeout:30000});
          const d=await page.evaluate(()=>window.__companionDiagnostics());
          assert.equal(d.renderer.modelCount,1);assert.ok(d.renderer.triangles>100);assert.equal(d.cameraActive,false);
          poses.push({model,id,bones:d.renderer.nativeBones});
          if(!mobile&&model==='reconstruction'&&id==='dance'){
            const before=d.renderer;
            await page.locator('#settings-peek').click();
            await page.screenshot({path:path.join(out,`${label}-dance.png`)});
            const after=await page.evaluate(()=>window.__companionDiagnostics().renderer);
            closeCoordinates(before.cameraPosition,after.cameraPosition);
            assert.equal(before.avatarHeight,after.avatarHeight);
            await page.locator('#resume-settings').click();
          }
        }
      }
      assert.notDeepEqual(poses.at(-1).bones,poses.at(-2).bones,'Different original clips must change the actual skeleton');
      await page.locator('#native-idle-enabled').uncheck();
      assert.equal(await page.locator('#animate').isChecked(),false);
      await page.locator('#native-idle-enabled').check();
      assert.equal(await page.locator('#animate').isChecked(),true);
      await page.locator('#motion-import-panel > summary').click();
      await page.locator('#native-motion-file').setInputFiles({name:'authorized-original.vrma',mimeType:'application/octet-stream',buffer:await readFile('companion-motion-site/assets/motions/Idle_HandOnHip.vrma')});
      await page.locator('#native-motion-mode').selectOption('once');
      await page.locator('#native-motion-play').click();
      await page.waitForFunction(()=>window.__companionDiagnostics().renderer.nativeMotion?.oneShot==='local');
      await page.locator('#native-motion-stop').click();
      await page.waitForFunction(()=>{const m=window.__companionDiagnostics().renderer.nativeMotion;return m?.oneShot===null&&m.idle==='dance';});
      await page.locator('#motion-import-panel > summary').click();
      await page.locator('#motion-search').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(out,`${label}-${name}-catalogue.png`)});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      assert.deepEqual(errors,[]);
      report.scenarios.push({name,pass:true,catalogue:16,idles:9,oneShots:7,poses,errors,checks:['page identity','meaningful model render','no runtime/framework error','no automatic camera or display permission','all seven built-in motions','search and type filters','pause and resume','local one-shot and stop-to-idle','no adapted terrace','no horizontal overflow']});
      console.log('REMOTE_MOTION_PASS',label,name,poses.length);
    }catch(error){
      report.scenarios.push({name,pass:false,error:error.stack,errors,state:await page.evaluate(()=>window.__companionDiagnostics?.()).catch(()=>null)});
      await page.screenshot({path:path.join(out,`${label}-${name}-failed.png`)}).catch(()=>{});
      console.error('REMOTE_MOTION_FAIL',label,name,error.message);
      throw error;
    }finally{await context.close();}
  }
  report.pass=true;
  console.log('REMOTE_COMPLETE_CATALOGUE_VERIFIED',label,parsed.hostname);
}finally{
  await writeFile(path.join(out,`${label}-report.json`),JSON.stringify(report,null,2));
  await browser.close();
}
