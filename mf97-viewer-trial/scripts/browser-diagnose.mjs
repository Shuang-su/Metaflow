import { loadAssetConfig } from "../../scripts/mf97/asset-config.mjs";
import { chromium } from '../../metaflow-viewer/node_modules/@playwright/test/index.mjs';
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--ignore-gpu-blocklist']});const page=await browser.newPage(); const errors=[];
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('pageerror',e=>errors.push(e.stack));
page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});
await page.goto('http://127.0.0.1:5185/?scene=apms-2026');
for(let i=0;i<12;i++){await page.waitForTimeout(5000);console.log(JSON.stringify(await page.evaluate(()=>({loaded:window.mf97?.viewer.state.loaded,stage:window.mf97?.viewer.state.loadingStage,status:window.mf97?.viewer.state.loadingStatus,progress:window.mf97?.viewer.state.progress}))));if(await page.evaluate(()=>window.mf97?.viewer.state.loaded))break;}
console.log(JSON.stringify({errors,body:await page.locator('body').innerText(),viewer:await page.evaluate(()=>({mf:!!window.mf97,state:window.mf97?.viewer.state,loaded:!!window.mf97?.viewer.state.loaded}))},null,2));
await page.screenshot({path:loadAssetConfig().roots.continuation + '/evidence/diagnose.png'});await browser.close();
