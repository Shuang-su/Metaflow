import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { selectStudio } from './ui-helpers.mjs';
import { boot } from '../e2e/helpers.mjs';
import { setupCalibrationScene, installVideoAudit, renderVideo, standardVideo, probeVideo } from '../e2e/video-helpers.mjs';

async function ready(page) {
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(installVideoAudit); await boot(page, '/studio/');
    await page.waitForFunction(() => window.scene.events.functions.has('studio.project'));
    await page.evaluate(() => document.fonts.ready); return errors;
}
const gradient = { topColor: [0.1,0.2,0.6], horizonColor: [0.7,0.8,0.9], bottomColor: [0.2,0.1,0.05], horizonStop: 0.55, bottomStop: 1 };
const expectedColor = (y, g = gradient) => {
    const h=g.horizonStop??.55,b=g.bottomStop??1,c=g.horizonColor??g.bottomColor;
    const first=y<h, a=first?g.topColor:c, z=first?c:g.bottomColor;
    const t=Math.max(0,Math.min(1,first?y/Math.max(h,.00001):(y-h)/Math.max(b-h,.00001)));
    return a.map((v,i)=>255*Math.pow(Math.pow(v,2.2)*(1-t)+Math.pow(z[i],2.2)*t,1/2.2));
};
const sample = page => page.evaluate(async () => {
    const s=window.scene; s.forceRender=true; await new Promise(r=>s.events.once('postrender',r));
    const rt=s.events.invoke('studio.renderTarget'), data=new Uint8Array(rt.width*rt.height*4);
    await rt.colorBuffer.read(0,0,rt.width,rt.height,{renderTarget:rt,data});
    return [.1,.5,.9].map(y=>Array.from(data.slice((Math.floor((1-y)*rt.height)*rt.width+3)*4,(Math.floor((1-y)*rt.height)*rt.width+3)*4+4)));
});
function checkSamples(samples,g=gradient,tolerance=3) { samples.forEach((rgba,i)=>{ expectedColor([.1,.5,.9][i],g).forEach((v,c)=>expect(Math.abs(rgba[c]-v)).toBeLessThan(tolerance)); expect(rgba[3]).toBe(255); }); }

test('Viewer gradient semantics reach GPU, survive effects, UI editing and saved project', async ({page})=>{
    const errors=await ready(page);
    for(const g of [gradient,{topColor:[.1,.3,.5],bottomColor:[.8,.6,.4]},{...gradient,horizonStop:0,bottomStop:.6}]) {
        await page.evaluate(g=>{const e=window.scene.events,s=e.invoke('studio.experience'); s.background.gradient=g; e.invoke('studio.importExperience',s);},g);
        checkSamples(await sample(page),g);
    }
    await page.evaluate(g=>{const e=window.scene.events,s=e.invoke('studio.experience'); s.background.gradient=g; s.tonemapping='aces'; for(const effect of Object.values(s.postEffectSettings))effect.enabled=true; e.invoke('studio.importExperience',s);},gradient);
    checkSamples(await sample(page));
    const stop=page.getByRole('spinbutton',{name:'中间位置 %',exact:true}); await stop.fill('40'); await stop.press('Tab');
    checkSamples(await sample(page),{...gradient,horizonStop:.4});
    await page.getByRole('button',{name:'撤销',exact:true}).click(); await expect(stop).toHaveValue('55');
    const toggle=page.getByRole('switch',{name:'渐变背景',exact:true}); await toggle.uncheck(); await toggle.check();
    checkSamples(await sample(page));
    const dl=page.waitForEvent('download'); await page.getByRole('button',{name:'保存工程',exact:true}).click(); const file=test.info().outputPath('gradient.mfstudio.json'); await(await dl).saveAs(file);
    const saved=JSON.parse(await readFile(file,'utf8')); expect(saved.experience.background.gradient).toEqual(gradient);
    await page.reload(); await page.waitForFunction(()=>window.scene?.events.functions.has('studio.importProject'));
    await page.evaluate(p=>window.scene.events.invoke('studio.importProject',p),saved); checkSamples(await sample(page));
    await page.screenshot({path:test.info().outputPath('gradient-1440.png')}); expect(errors).toEqual([]);
});

test('timeline selection deletes as one undo and toolbar matches measured groups',async({page})=>{
    const errors=await ready(page); await page.setViewportSize({width:1437,height:1184});
    await page.getByRole('button',{name:'时间线',exact:true}).click();
    await page.evaluate(()=>{const e=window.scene.events;e.invoke('studio.changeTimeline','frames',180);e.invoke('studio.changeTimeline','frameRate',30); for(const frame of [0,30,90])e.fire('track.addKey',frame);});
    await page.getByRole('button',{name:'关键帧 30',exact:true}).click();
    await page.getByRole('button',{name:'关键帧 90',exact:true}).click({modifiers:['Meta']});
    await expect(page.locator('.studio-key-selection')).toHaveText('2 已选择');
    await page.getByRole('button',{name:'删除关键帧',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.scene.events.invoke('track.keys'))).toEqual([0]);
    await page.getByRole('button',{name:'撤销',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.scene.events.invoke('track.keys'))).toEqual([0,30,90]);
    await page.getByRole('button',{name:'删除相机动画',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.scene.events.invoke('track.keys'))).toEqual([]);
    await page.getByRole('button',{name:'撤销',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.scene.events.invoke('track.keys'))).toEqual([0,30,90]);
    const group=page.locator('.studio-tool-group'); await expect(group).toHaveCount(4);
    const toolbar=await page.getByRole('toolbar',{name:'视口工具'}).boundingBox(); expect(toolbar.height).toBe(46); expect(toolbar.width).toBe(397);
    const play=await page.getByRole('button',{name:'上一关键帧',exact:true}).boundingBox(); expect(play.x).toBeGreaterThan(400);
    const last=await page.getByRole('button',{name:'关键帧 90',exact:true}).boundingBox(); expect(last.x).toBeLessThan(1437);
    await page.screenshot({path:test.info().outputPath('timeline-toolbar-1437.png')});
    await page.getByRole('button',{name:'关键帧 30',exact:true}).focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Delete');
    await expect.poll(()=>page.evaluate(()=>window.scene.events.invoke('track.keys'))).toEqual([0,90]);
    expect(errors).toEqual([]);
});

test('gradient with Chinese annotation and post effects reaches 1080p video',async({page})=>{
    const errors=await ready(page);await page.evaluate(setupCalibrationScene);
    await page.evaluate(g=>{ const e=window.scene.events,s=e.invoke('studio.experience');s.background.gradient=g;s.tonemapping='aces';s.postEffectSettings.bloom.enabled=true;
        s.annotations=[{position:[0,0,0],title:'渐变背景 · 中文标记',text:'与 Viewer 共用渐变参数\n预览和视频使用同一输出',camera:{initial:{position:[0,0,5],target:[0,0,0],fov:60}}}];e.invoke('studio.importExperience',s); },gradient);
    await selectStudio(page,'叠加模式','titles');
    const file=test.info().outputPath('gradient-chinese-1080p30.mp4');
    const audit=await renderVideo(page,{...standardVideo,startFrame:0,endFrame:29,width:1920,height:1080,reveal:'none'},file);
    expect(audit.frames).toHaveLength(30);expect(probeVideo(file).streams[0].nb_read_frames).toBe('30');
    execFileSync('ffmpeg',['-v','error','-i',file,'-f','null','-']);
    const rgb=execFileSync('ffmpeg',['-v','error','-i',file,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'],{maxBuffer:8*1024*1024});
    [.1,.5,.9].forEach(y=>expectedColor(y).forEach((v,c)=>expect(Math.abs(rgb[(Math.floor(y*1080)*1920+1916)*3+c]-v)).toBeLessThan(8)));
    await page.screenshot({path:test.info().outputPath('gradient-model.png')});expect(errors).toEqual([]);
});

test('hover, press, selected, disabled and focus states use reference icon sizes', async ({page})=>{
    await boot(page,'/studio/?load=/generated/scene.sog&settings=/generated/scene-settings.json');
    await page.waitForFunction(()=>window.scene?.events.functions.has('studio.project') && window.scene.events.invoke('scene.splats').length);
    await page.setViewportSize({width:1437,height:1184});
    await page.getByRole('button',{name:'时间线',exact:true}).click();
    const toolbar=page.getByRole('toolbar',{name:'视口工具'}),fly=page.getByRole('button',{name:'Fly 模式',exact:true});
    const style=()=>fly.evaluate(e=>({bg:getComputedStyle(e).backgroundColor,border:getComputedStyle(e).borderColor,shadow:getComputedStyle(e).boxShadow,outline:getComputedStyle(e).outlineStyle}));
    await page.mouse.move(450,100);const normal=await style();
    await fly.hover();await expect(page.getByRole('tooltip')).toHaveText('Fly 模式');const hover=await style();expect(hover.bg).not.toBe(normal.bg);
    await page.screenshot({path:test.info().outputPath('scene-hover-fly-1437.png')});
    const rect=await toolbar.boundingBox();const clip={x:Math.floor(rect.x)-10,y:Math.floor(rect.y)-60,width:Math.ceil(rect.width)+20,height:110};
    await page.screenshot({path:test.info().outputPath('toolbar-hover.png'),clip});
    await page.mouse.down();await expect.poll(async()=>(await style()).bg).not.toBe(hover.bg);await page.mouse.up();
    await page.mouse.move(450,100);const selected=await style();expect(selected.shadow).toBe('none');expect(selected.outline).toBe('none');
    await expect(fly).toHaveAttribute('aria-pressed','true');
    await page.screenshot({path:test.info().outputPath('toolbar-selected.png'),clip});
    await fly.focus();await page.keyboard.press('Tab');const focus=page.getByRole('button',{name:'取景',exact:true});
    await expect(focus).toBeFocused();expect(await focus.evaluate(e=>getComputedStyle(e).outlineStyle)).toBe('solid');
    await page.screenshot({path:test.info().outputPath('toolbar-keyboard-focus.png'),clip});
    const add=page.getByRole('button',{name:'添加关键帧',exact:true});await add.hover();await expect(page.getByRole('tooltip')).toHaveText('添加关键帧');
    const tip=await page.getByRole('tooltip').boundingBox();expect(tip.y+tip.height).toBeLessThan(1089);
    await page.screenshot({path:test.info().outputPath('timeline-hover.png'),clip:{x:480,y:1040,width:957,height:144}});
    expect(await toolbar.locator('.studio-camera-icon').evaluateAll(es=>es.every(e=>e.getBoundingClientRect().width===32&&e.getBoundingClientRect().height===32))).toBe(true);
    expect(await toolbar.locator('.studio-icon:not(.studio-camera-icon)').evaluateAll(es=>es.every(e=>e.getBoundingClientRect().width===16&&e.getAttribute('stroke-width')==='2'))).toBe(true);
    await expect(page.getByRole('button',{name:'重做',exact:true})).toBeDisabled();
    const save=page.getByRole('button',{name:'保存工程',exact:true});await page.mouse.move(450,100);const bg=await save.evaluate(e=>getComputedStyle(e).backgroundColor);await save.hover();await expect.poll(()=>save.evaluate(e=>getComputedStyle(e).backgroundColor)).not.toBe(bg);
    await page.screenshot({path:test.info().outputPath('save-hover.png'),clip:{x:890,y:0,width:547,height:50}});
});
