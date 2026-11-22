import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
const {origin,scenes}=JSON.parse(readFileSync(new URL('./mf185-scenes.json',import.meta.url),'utf8'));
const browserName=process.env.E2E_BROWSER||'chromium';
const backends=browserName==='chromium'?['webgpu','webgl']:['webgl'];
test.describe('MF-185 independent network readback',()=>{
 test.skip(process.env.E2E_EXTENDED!=='1','Dedicated release acceptance');
 for(const scene of scenes) for(const route of [scene.route,...scene.aliases]) for(const backend of backends){
  test(route+' '+backend,async({page},info)=>{
   test.setTimeout(220000);
   const query=new URLSearchParams({renderer:backend,mf185:'keep'});
   if(scene.id==='szu' && route.endsWith('yuehai'))query.set('track','orbit');
   const read=[],errors=[];page.on('response',r=>{const p=decodeURIComponent(new URL(r.url()).pathname);if(p.includes('/data/'))read.push({p,status:r.status()})});
   page.on('pageerror',e=>errors.push(String(e)));
   const result={route,origin,backend,query:String(query),browser:browserName,transport:'GitHub Actions, fresh browser context, public HTTPS',passed:false};
   const prefix=route.split('/').pop()+'-'+backend;
   try{
    const start=Date.now();await page.goto(origin+route+'?'+query,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>window.resourceViewer?.state.loaded&&window.resourceViewer?.app.stats.frame.gsplats>0,null,{timeout:150000});
    result.firstObservedMs=Date.now()-start;
    const state=()=>page.evaluate(()=>{const v=window.resourceViewer,c=v.app.root.findComponents('camera')[0].entity;return {id:window.resourceEntry.id,model:window.resourceEntry.files.model,device:v.app.graphicsDevice.deviceType,adapter:v.app.graphicsDevice.gpuAdapter?.info?.description||v.app.graphicsDevice.unmaskedRenderer||null,points:v.app.stats.frame.gsplats,mode:v.state.cameraMode,collision:v.state.hasCollision,position:c.getPosition().toArray(),forward:c.forward.toArray(),title:document.title,query:location.search,path:location.pathname}});
    result.first=await state();expect(result.first.id).toBe(scene.id);expect(result.first.device).toBe(backend==='webgl'?'webgl2':backend);expect(result.first.model).toBe(scene.files.model);expect(result.first.path.replace(/\/$/,'')).toBe(scene.route);
    for(const [k,v] of query)expect(new URL(page.url()).searchParams.get(k)).toBe(v);
    expect(read.some(r=>r.status===200&&r.p.endsWith('/'+scene.files.model))).toBeTruthy();
    await page.waitForTimeout(1800);result.settled=await state();
    result.levels=[...new Set(read.map(r=>r.p.match(/\/(\d+)_\d+\/meta\.json$/)?.[1]).filter(Boolean).map(Number))];expect(result.levels.length).toBeGreaterThan(1);
    result.readErrors=read.filter(r=>r.status>=400);result.pageErrors=errors;expect(result.readErrors).toHaveLength(0);expect(errors).toHaveLength(0);
    await page.screenshot({path:info.outputPath(prefix+'.jpg'),type:'jpeg',quality:83});result.passed=true;
   }catch(e){result.error=String(e);result.lastReads=read.slice(-4);throw e;}finally{await fs.writeFile(info.outputPath(prefix+'.json'),JSON.stringify(result,null,2));}
  });
 }
});
