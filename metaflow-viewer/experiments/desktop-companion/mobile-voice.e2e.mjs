import {chromium,devices} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const evidence=process.env.EVIDENCE_DIR||'/tmp/companion-evidence';await mkdir(evidence,{recursive:true});
const url='http://127.0.0.1:4173/';
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
function wav(){
  const rate=16000,frames=rate*5,b=Buffer.alloc(44+frames*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(frames*2,40);
  for(let i=0;i<frames;i++)b.writeInt16LE(Math.round(Math.sin(i/rate*440*Math.PI*2)*5000*(.55+.45*Math.sin(i/rate*8))),44+i*2);return b;
}
const scenarios=[
  ['iphone',{...devices['iPhone 13']},'iphone-standard'],
  ['mini',{viewport:{width:744,height:1133},deviceScaleFactor:2,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'},'ipad-mini'],
  ['mac',{viewport:{width:1440,height:900},deviceScaleFactor:1,userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'},'macbook']
];
const report=[];
try{
  for(const [name,options,profile] of scenarios){
    const context=await browser.newContext(options),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.emulateMedia({reducedMotion:'reduce'});
    try{
      await page.goto(url,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.__companionDiagnostics?.().ready,{},{timeout:90000});
      assert.match(await page.title(),/iPhone.*iPad mini/);
      const first=await page.evaluate(()=>window.__companionDiagnostics());
      assert.equal(first.profile,profile);assert.equal(first.graphics,true);assert.ok(first.renderer.triangles>100);assert.equal(first.renderer.modelCount,1);
      assert.equal(first.cameraActive,false);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);assert.equal(overflow,false);
      await page.screenshot({path:`${evidence}/${name}-stage.png`});
      await page.locator('#motion-speech').click();
      await page.locator('[data-gesture="nod"]').click();
      await page.waitForFunction(()=>window.__companionDiagnostics().renderer.gesture==='nod');
      const during=await page.evaluate(()=>window.__companionDiagnostics());
      assert.deepEqual(during.renderer.cameraPosition,first.renderer.cameraPosition,'gesture must not orbit camera');
      await page.locator('#stop-gesture').click();
      await page.waitForFunction(()=>window.__companionDiagnostics().renderer.gesture===null);
      await page.locator('#speech-text').fill('这是动作和语音联动测试。');
      assert.equal(await page.locator('#speech-text').inputValue(),'这是动作和语音联动测试。');
      await page.locator('#speech-audio').setInputFiles({name:'lipsync-test.wav',mimeType:'audio/wav',buffer:wav()});
      await page.locator('#audio-play').click();
      await page.waitForFunction(()=>{const d=window.__companionDiagnostics();return d.voice.kind==='file'&&d.renderer.speaking&&d.renderer.mouthLevel>.02;},{},{timeout:15000});
      await page.locator('#speech-stop').click();
      await page.waitForFunction(()=>{const d=window.__companionDiagnostics();return !d.voice.active&&!d.renderer.speaking&&d.renderer.mouthLevel===0;});
      await page.screenshot({path:`${evidence}/${name}-controls.png`});
      if(name==='iphone'){
        await page.locator('#close-settings').click();
        await page.setViewportSize({width:844,height:390});
        await page.locator('#motion-speech').click();
        await page.locator('#speech-stop').scrollIntoViewIfNeeded();assert.ok(await page.locator('#speech-stop').isVisible());
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
        await page.screenshot({path:`${evidence}/iphone-landscape.png`});
      }
      if(name==='mac'){
        await page.locator('#model-choice').selectOption('reconstruction');
        await page.waitForFunction(()=>{const d=window.__companionDiagnostics();return d.ready&&d.model.includes('重建版')&&!d.renderer.loading;},{},{timeout:90000});
        await page.locator('[data-gesture="wave"]').click();
        await page.waitForFunction(()=>window.__companionDiagnostics().renderer.gesture==='wave');
      }
      const result={name,pass:true,profile,viewport:options.viewport,triangles:first.renderer.triangles,voice:'actual local WAV playback and analyser',systemTts:'lifecycle tested with unit doubles; device voices not verified',errors};
      assert.equal(errors.filter(x=>!x.includes('favicon.ico')).length,0,errors.join('\n'));
      report.push(result);console.log('BROWSER_PASS',JSON.stringify(result));
    }catch(e){await page.screenshot({path:`${evidence}/${name}-failed.png`}).catch(()=>{});console.log('BROWSER_FAIL',name,e.message,JSON.stringify(errors));report.push({name,pass:false,error:e.message,errors});}
    await context.close();
  }
}finally{await browser.close();await writeFile(`${evidence}/report.json`,JSON.stringify({url,engine:'CI Chromium / software WebGL; viewport emulation, not physical Apple devices',scenarios:report},null,2));}
if(report.some(r=>!r.pass))process.exitCode=1;
