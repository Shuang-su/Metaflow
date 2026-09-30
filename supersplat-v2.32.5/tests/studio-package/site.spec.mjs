import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { boot, writeScene } from '../e2e/helpers.mjs';
import { openFileMenu, selectStudio } from '../studio/ui-helpers.mjs';
import { installVideoAudit, renderVideo, probeVideo } from '../e2e/video-helpers.mjs';

const pose = { position: [0, 0, 5], target: [0, 0, 0], fov: 60 };
function model() {
    const props = ['x','y','z','f_dc_0','f_dc_1','f_dc_2','opacity','scale_0','scale_1','scale_2','rot_0','rot_1','rot_2','rot_3'];
    const points = [];
    for(let y=0;y<20;y++) for(let x=0;x<30;x++) points.push([(x-14.5)*.1,(y-9.5)*.1,Math.sin(x*.3)*Math.cos(y*.3)*.3,x<10?1:-.8,x>=10&&x<20?1:-.8,x>=20?1:-.8,4,-3.2,-3.2,-3.2,1,0,0,0]);
    const data = Buffer.alloc(points.length*props.length*4); points.flat().forEach((v,i)=>data.writeFloatLE(v,i*4));
    return {name:'本地场景.ply', mimeType:'application/octet-stream', buffer:Buffer.concat([Buffer.from(`ply\nformat binary_little_endian 1.0\nelement vertex ${points.length}\n${props.map(p=>`property float ${p}`).join('\n')}\nend_header\n`),data])};
}
async function choose(page, action, file) {
    const chooser = page.waitForEvent('filechooser'); await action(); await (await chooser).setFiles(file);
}
async function start(page) {
    const errors=[]; const requests=[];
    page.on('pageerror', e=>errors.push(e.message));
    page.on('console', m=>{if(m.type()==='error') errors.push(m.text());});
    page.on('request', r=>requests.push({url:r.url(),method:r.method()}));
    await boot(page,'/'); await expect(page).toHaveTitle('Metaflow Studio');
    await openFileMenu(page); await choose(page,()=>page.getByRole('button',{name:'打开模型',exact:true}).click(),model());
    await expect.poll(()=>page.evaluate(()=>window.scene.events.invoke('scene.splats')[0]?.numSplats)).toBe(600);
    return {errors,requests};
}
async function importSettings(page,count) {
    const settings = await page.evaluate(()=>window.scene.events.invoke('studio.experience'));
    settings.cameras=[{initial:pose}]; settings.vendor={retained:'未知扩展'};
    settings.annotations=Array.from({length:count},(_,i)=>({position:[(i%10-4.5)*.2,(Math.floor(i/10)-4.5)*.15,0],title:`测试标记 ${i+1}`,text:'中文说明\n第二行',camera:{initial:pose},extras:{id:i}}));
    await choose(page,()=>page.getByRole('button',{name:'导入展示设置',exact:true}).click(),{name:'settings.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(settings))});
    await page.locator('#popup').getByRole('button',{name:'导入',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.scene.events.invoke('studio.experience').annotations.length)).toBe(count);
    return settings;
}
async function exported(page,name='settings.json') {
    const waiting=page.waitForEvent('download'); await page.getByRole('button',{name:'导出展示设置',exact:true}).click();
    const dest=test.info().outputPath(name); await (await waiting).saveAs(dest); return JSON.parse(await readFile(dest,'utf8'));
}
test('standalone PLY, 26 annotations, edit/undo, Viewer preview and portable JSON',async({page,context})=>{
    const {errors,requests}=await start(page); const original=await importSettings(page,26);
    await page.getByRole('tab',{name:'标记',exact:true}).click();
    await expect(page.getByRole('button',{name:'添加标记',exact:true})).toBeEnabled();
    await page.getByRole('button',{name:'添加标记',exact:true}).click();
    const canvas=await page.locator('#canvas').boundingBox();
    await page.mouse.click(canvas.x+canvas.width/2,canvas.y+canvas.height/2);
    await expect.poll(()=>page.evaluate(()=>window.scene.events.invoke('studio.experience').annotations.length)).toBe(27);
    await expect(page.getByRole('textbox',{name:'标记标题'})).toBeVisible();
    await page.getByRole('textbox',{name:'标记标题'}).fill('新标记：中文交付');
    await page.getByRole('textbox',{name:'说明文字'}).fill('第一行说明\n第二行说明');
    await page.getByRole('button',{name:'确定标记',exact:true}).click();
    await page.getByRole('button',{name:'拖动标记 27',exact:true}).focus(); await page.keyboard.press('ArrowUp');
    await expect.poll(()=>page.evaluate(()=>window.scene.events.invoke('studio.experience').annotations[25].title)).toBe('新标记：中文交付');
    await page.getByRole('button',{name:'删除标记 26',exact:true}).click();
    await page.getByRole('button',{name:'撤销',exact:true}).click();
    const result=await exported(page);
    expect(result.annotations).toHaveLength(27); expect(result.vendor).toEqual(original.vendor); expect(result.annotations[25].text).toBe('第一行说明\n第二行说明');
    await page.getByRole('button',{name:'撤销',exact:true}).hover();
    await expect(page.getByRole('tooltip')).toBeVisible();
    const cdp = await context.newCDPSession(page);
    const shot = await cdp.send('Page.captureScreenshot');
    await writeFile(test.info().outputPath('studio-27-hover.png'), Buffer.from(shot.data, 'base64'));
    await cdp.detach();
    const popup=context.waitForEvent('page'); await page.getByRole('button',{name:'预览',exact:true}).click(); const preview=await popup;
    const previewErrors=[]; preview.on('pageerror',e=>previewErrors.push(e.message));
    await preview.waitForURL('**/studio-preview/**');
    await expect(preview.locator('#annotations')).toBeAttached();
    await expect.poll(()=>preview.locator('#annotations').evaluate(e=>e.children.length)).toBeGreaterThan(0);
    await preview.screenshot({path:test.info().outputPath('viewer-preview.png')});
    expect(await preview.locator('body').textContent()).not.toContain('资产不可用');
    expect(await preview.evaluate(()=>document.baseURI)).toContain('/viewer/');
    expect(previewErrors).toEqual([]); await preview.close();
    await choose(page,()=>page.getByRole('button',{name:'导入展示设置',exact:true}).click(),{name:'settings.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(result))});
    await page.locator('#popup').getByRole('button',{name:'导入',exact:true}).click();
    expect(await exported(page,'roundtrip.json')).toEqual(result);
    expect(errors).toEqual([]); expect(requests.filter(r=>r.method!=='GET'||(!r.url.startsWith('http://127.0.0.1:4369/')&&!r.url.startsWith('blob:')))).toEqual([]);
});
test('100 markers, invalid import preservation, SOG, preview ZIP and video remain usable',async({page})=>{
    await page.addInitScript(installVideoAudit);
    const {errors}=await start(page); await importSettings(page,100);
    await page.getByRole('tab',{name:'标记',exact:true}).click();
    await expect(page.locator('.studio-annotation-row')).toHaveCount(100);
    await page.getByRole('button',{name:'添加标记',exact:true}).click();
    const canvas=await page.locator('#canvas').boundingBox(); await page.mouse.click(canvas.x+canvas.width/2,canvas.y+canvas.height/2);
    await expect.poll(()=>page.evaluate(()=>window.scene.events.invoke('studio.experience').annotations.length)).toBe(101);
    await page.getByRole('textbox',{name:'标记标题'}).fill('中文标点视频'); await page.getByRole('button',{name:'确定标记',exact:true}).click();
    const before=await exported(page);
    for(const raw of ['{broken',JSON.stringify({format:'metaflow-studio',version:2}),JSON.stringify({version:2,means:{files:['a.webp']}})]) {
        await choose(page,()=>page.getByRole('button',{name:'导入展示设置',exact:true}).click(),{name:'bad.json',mimeType:'application/json',buffer:Buffer.from(raw)});
        await expect(page.locator('.studio-status.error')).toBeVisible();
        expect(await page.evaluate(()=>window.scene.events.invoke('studio.experience'))).toEqual(before);
    }
    await page.screenshot({path:test.info().outputPath('studio-101.png')});
    const sogDownload=await writeScene(page,'sog','sample.sog'); const sogFile=test.info().outputPath('sample.sog'); await (await sogDownload).saveAs(sogFile);
    const next=await page.context().newPage(); await boot(next,'/studio/'); await openFileMenu(next);
    await choose(next,()=>next.getByRole('button',{name:'打开模型',exact:true}).click(),sogFile);
    await expect.poll(()=>next.evaluate(()=>window.scene.events.invoke('scene.splats')[0]?.numSplats)).toBe(600);
    const nextPreview = next.waitForEvent('popup'); await next.getByRole('button',{name:'预览',exact:true}).click(); const sogPreview = await nextPreview;
    await expect(sogPreview.locator('#annotations')).toBeAttached(); await sogPreview.screenshot({path:test.info().outputPath('sog-preview.png')}); await sogPreview.close(); await next.close();
    await openFileMenu(page); const zip=page.waitForEvent('download'); await page.getByRole('button',{name:'导出本地预览包',exact:true}).click();
    const zipFile=test.info().outputPath('preview.zip');await(await zip).saveAs(zipFile);
    const names=execFileSync('unzip',['-Z1',zipFile],{encoding:'utf8'});expect(names).toContain('viewer.html');expect(names).toContain('dependencies.json');
    await page.getByRole('tab',{name:'场景',exact:true}).click();await page.getByRole('switch',{name:'辉光',exact:true}).check();
    await page.getByRole('button',{name:'导出视频',exact:true}).click();await expect(page.getByRole('combobox',{name:'叠加模式',exact:true})).toBeVisible();await page.keyboard.press('Escape');
    await selectStudio(page,'叠加模式','selected');
    await page.getByRole('tab',{name:'标记',exact:true}).click();
    await page.getByRole('button',{name:'101 中文标点视频',exact:true}).click();
    await page.evaluate(()=>{window.scene.events.fire('timeline.setFrames',31);});
    const output=test.info().outputPath('annotated.mp4');
    const audit=await renderVideo(page,{startFrame:0,endFrame:2,frameRate:30,width:1920,height:1080,bitrate:6000000,format:'mp4',codec:'h264',transparentBg:false,showDebug:false,projection:'standard',reveal:'none'},output);
    expect(audit.frames).toHaveLength(3);expect(probeVideo(output).streams[0].nb_read_frames).toBe('3');
    execFileSync('ffmpeg',['-v','error','-i',output,'-f','null','-']);expect(errors).toEqual([]);
});


test('upstream Viewer accepts exported 100-marker JSON; narrow chrome and failure recovery', async ({page,context,request}) => {
    const {errors}=await start(page); await importSettings(page,100); const settings=await exported(page);
    const root=test.info().outputPath('upstream'); await mkdir(root,{recursive:true});
    await cp(new URL('../../node_modules/@playcanvas/supersplat-viewer/public/',import.meta.url),root,{recursive:true});
    await writeFile(`${root}/settings.json`,JSON.stringify(settings)); await writeFile(`${root}/scene.ply`,model().buffer);
    const server=spawn(process.execPath,[new URL('../../scripts/serve-studio-package.mjs',import.meta.url).pathname],{env:{...process.env,STUDIO_SITE_ROOT:root,STUDIO_SITE_PORT:'4379'},stdio:'ignore'});
    try {
        await expect.poll(async()=>{try{return(await request.get('http://127.0.0.1:4379/')).status();}catch{return 0;}}).toBe(200);
        const upstream=await context.newPage(); const failures=[]; upstream.on('pageerror',e=>failures.push(e.message));
        await upstream.goto('http://127.0.0.1:4379/?content=scene.ply&settings=settings.json&webgl&noreveal');
        await expect(upstream.locator('#annotations .pc-annotation-hotspot')).toHaveCount(100);
        expect(await upstream.evaluate(async()=> (await window.sse.settings).annotations.length)).toBe(100);
        await upstream.screenshot({path:test.info().outputPath('upstream-100.png')});expect(failures).toEqual([]);await upstream.close();
    } finally { server.kill(); }
    for(const width of [1024,760,390]) {
        await page.setViewportSize({width,height:900});
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
        await openFileMenu(page);await expect(page.getByRole('button',{name:'导出展示设置',exact:true})).toBeVisible();
        await page.screenshot({path:test.info().outputPath(`studio-${width}.png`)});await page.keyboard.press('Escape');
    }
    await page.setViewportSize({width:1440,height:900});
    await page.evaluate(()=>{window.showOpenFilePicker=async()=>{throw new DOMException('cancelled','AbortError');};});
    await openFileMenu(page);await page.getByRole('button',{name:'打开模型',exact:true}).click();
    expect(await page.evaluate(()=>window.scene.events.invoke('studio.experience'))).toEqual(settings);
    await page.evaluate(()=>{window.open=()=>null;});await page.getByRole('button',{name:'预览',exact:true}).click();
    await expect(page.locator('.studio-status')).toContainText('拦截');
    expect(errors).toEqual([]);
});


test('missing referenced sky stays visible and blocks preview; closed authoring session expires', async ({page,context}) => {
    await start(page);await importSettings(page,1);
    const settings=await exported(page); settings.background.skyboxUrl='missing-sky.hdr';
    await choose(page,()=>page.getByRole('button',{name:'导入展示设置',exact:true}).click(),{name:'sky.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(settings))});
    await page.locator('#popup').getByRole('button',{name:'导入',exact:true}).click();
    await expect(page.locator('.studio-status.error')).toContainText('missing-sky.hdr');
    await expect(page.locator('.studio-asset.missing')).toContainText('missing-sky.hdr');
    await page.getByRole('button',{name:'预览',exact:true}).click();
    await expect(page.locator('.studio-status.error')).toContainText('重新定位资产');
    const exportedSettings=await exported(page,'missing.json');expect(exportedSettings.background.skyboxUrl).toBe('missing-sky.hdr');
    settings.background.skyboxUrl='blob:expired';
    await choose(page,()=>page.getByRole('button',{name:'导入展示设置',exact:true}).click(),{name:'temporary.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(settings))});
    await expect(page.locator('.studio-status.error')).toContainText('临时或本机');
    expect(await page.evaluate(()=>window.scene.events.invoke('studio.experience').background.skyboxUrl)).toBe('missing-sky.hdr');
    delete settings.background.skyboxUrl;
    await page.evaluate(settings=>window.scene.events.invoke('studio.importExperience',settings),settings);
    const popup=context.waitForEvent('page');await page.getByRole('button',{name:'预览',exact:true}).click();const preview=await popup;
    await preview.waitForURL('**/studio-preview/**');await expect(preview.locator('#annotations')).toBeAttached();
    await page.close(); await preview.reload();await expect(preview.locator('body')).toContainText('请保持 Studio 页面打开并重新预览');
});
