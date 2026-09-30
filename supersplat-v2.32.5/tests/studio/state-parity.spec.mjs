import { writeFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { boot } from '../e2e/helpers.mjs';

// Playwright's viewport adjustment during screenshot can dispatch mouseleave in
// headful Chrome. Capture the current surface without changing the hovered page.
async function hoverScreenshot(page, name) {
    const cdp = await page.context().newCDPSession(page);
    try {
        const image = await cdp.send('Page.captureScreenshot', {format:'png',captureBeyondViewport:false});
        await writeFile(test.info().outputPath(name),Buffer.from(image.data,'base64'));
        await expect(page.getByRole('tooltip')).toBeVisible();
    } finally { await cdp.detach(); }
}
const keyFrames = page => page.evaluate(() => window.scene.events.invoke('track.keys').slice().sort((a,b)=>a-b));
async function ready(page) {
    await boot(page, '/studio/');
    await page.waitForFunction(() => window.scene?.events.functions.has('studio.project'));
    await page.evaluate(() => {
        const e=window.scene.events,s=e.invoke('studio.experience');
        s.cameras=[{initial:{position:[0,0,5],target:[0,0,0],fov:60}}];
        s.annotations=[{title:'打卡点',text:'中文说明',position:[0,0,0],camera:{initial:{position:[0,0,10],target:[0,0,0],fov:60}}}];
        s.animTracks=[{name:'Camera',duration:3,frameRate:30,loopMode:'pingpong',interpolation:'spline',smoothness:1,keyframes:{times:[0,30,60],values:{position:[0,0,5,1,0,5,2,0,5],target:[0,0,0,0,0,0,0,0,0],fov:[60,60,60]}}}];
        e.invoke('studio.importExperience',s);
    });
    await page.getByRole('button',{name:'时间线',exact:true}).click();
}
async function point(page, frame, yOffset=16) {
    return page.locator('.studio-track-area').evaluate((e,{frame,yOffset})=>{
        const r=e.getBoundingClientRect();return {x:r.x+20+frame*(r.width-40)/90,y:r.y+20+yOffset};
    },{frame,yOffset});
}
async function drag(page, from, to) {
    await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:10});await page.mouse.up();
}

test('standard frame units, loop exchange and legacy project migration',async({page})=>{
    await ready(page);expect(await keyFrames(page)).toEqual([0,30,60]);
    await expect(page.getByRole('combobox',{name:'循环',exact:true})).toContainText('乒乓');
    const fps=page.getByRole('spinbutton',{name:'FPS',exact:true});await fps.fill('60');await fps.press('Tab');
    expect(await keyFrames(page)).toEqual([0,30,60]);
    let saved=await page.evaluate(()=>window.scene.events.invoke('studio.project'));
    expect(saved.version).toBe(2);expect(saved.experience.animTracks[0].duration).toBe(3);expect(saved.experience.animTracks[0].loopMode).toBe('pingpong');
    await page.reload();await page.waitForFunction(()=>window.scene?.events.functions.has('studio.importProject'));
    await page.evaluate(p=>window.scene.events.invoke('studio.importProject',p),saved);
    expect(await keyFrames(page)).toEqual([0,30,60]);
    saved.version=1;delete saved.timeline.loopMode;saved.timeline.loop=false;saved.experience.animTracks[0].keyframes.times=[0,.5,1];
    await page.evaluate(p=>window.scene.events.invoke('studio.importProject',p),saved);
    expect(await keyFrames(page)).toEqual([0,30,60]);
    expect(await page.evaluate(()=>window.scene.events.invoke('studio.project').version)).toBe(2);
});

test('marquee, grouped move, copy, cancel and one undo per gesture',async({page})=>{
    await ready(page);
    const left=await point(page,-1,27),right=await point(page,61,27);
    await drag(page,left,right);await expect(page.locator('.studio-key-selection')).toHaveText('3 已选择');
    await drag(page,await point(page,30),await point(page,40));expect(await keyFrames(page)).toEqual([10,40,70]);
    await page.getByRole('button',{name:'撤销',exact:true}).click();expect(await keyFrames(page)).toEqual([0,30,60]);
    await page.getByRole('button',{name:'关键帧 30',exact:true}).click();
    await page.keyboard.down('Shift');await drag(page,await point(page,30),await point(page,45));await page.keyboard.up('Shift');
    expect(await keyFrames(page)).toEqual([0,30,45,60]);
    await page.getByRole('button',{name:'撤销',exact:true}).click();expect(await keyFrames(page)).toEqual([0,30,60]);
    const a=await point(page,30),b=await point(page,40);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});
    await expect(page.locator('.studio-key-ghost')).toHaveCount(1);await page.keyboard.press('Escape');await page.mouse.up();
    await expect(page.locator('.studio-key-ghost')).toHaveCount(0);expect(await keyFrames(page)).toEqual([0,30,60]);
    await page.getByRole('button',{name:'关键帧 30',exact:true}).click();await page.keyboard.press('Delete');expect(await keyFrames(page)).toEqual([0,60]);
    await page.getByRole('button',{name:'撤销',exact:true}).click();expect(await keyFrames(page)).toEqual([0,30,60]);
    await page.screenshot({path:test.info().outputPath('timeline-parity.png')});
});

test('hover on disabled buttons, bottom dropdown and camera edit mode',async({page})=>{
    await ready(page);
    const remove=page.getByRole('button',{name:'删除所选关键帧',exact:true});await expect(remove).toBeDisabled();const r=await remove.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);
    await expect(page.getByRole('tooltip')).toHaveText('删除所选关键帧');
    await page.getByRole('button',{name:'在播放头添加关键帧',exact:true}).hover();await expect(page.getByRole('tooltip')).toContainText('Enter');
    await hoverScreenshot(page,'key-tooltip.png');
    await page.getByRole('combobox',{name:'循环',exact:true}).click();
    const list=page.locator('.pcui-select-input-list:visible');await expect(list).toBeVisible();await expect(list.getByText('乒乓',{exact:true})).toBeVisible();
    const box=await list.boundingBox();expect(box.y+box.height).toBeLessThanOrEqual(900);
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'编辑相机 1',exact:true}).click();
    await expect(page.getByRole('button',{name:'应用相机视角',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'播放',exact:true})).toBeDisabled();
    await page.evaluate(()=>window.scene.events.fire('camera.setFov',80));
    await page.getByRole('button',{name:'取消相机编辑',exact:true}).click();
    expect(await page.evaluate(()=>window.scene.events.invoke('studio.experience').cameras[0].initial.fov)).toBe(60);
    await page.getByRole('button',{name:'编辑相机 1',exact:true}).click();await page.evaluate(()=>window.scene.events.fire('camera.setFov',80));
    await page.getByRole('button',{name:'应用相机视角',exact:true}).click();
    expect(await page.evaluate(()=>window.scene.events.invoke('studio.experience').cameras[0].initial.fov)).toBe(80);
    await page.getByRole('button',{name:'撤销',exact:true}).click();expect(await page.evaluate(()=>window.scene.events.invoke('studio.experience').cameras[0].initial.fov)).toBe(60);
    await page.getByRole('button',{name:'编辑相机 1',exact:true}).click();await page.screenshot({path:test.info().outputPath('camera-edit-mode.png')});
});

test('annotation distance uses associated camera, text cancel and keyboard confirm',async({page})=>{
    await ready(page);await page.getByRole('tab',{name:'标记',exact:true}).click();
    await page.getByRole('button',{name:'01 打卡点',exact:true}).click();
    await expect(page.locator('.studio-distance')).toHaveText('10.00 m');
    await page.getByRole('button',{name:'向关联相机靠近',exact:true}).click();
    expect(await page.evaluate(()=>window.scene.events.invoke('studio.experience').annotations[0].position[2])).toBeCloseTo(.05,7);
    await page.getByRole('button',{name:'撤销',exact:true}).click();
    await page.getByRole('button',{name:'编辑标记',exact:true}).click();await page.getByRole('textbox',{name:'标记标题',exact:true}).fill('取消不应保存');await page.getByRole('button',{name:'取消编辑标记',exact:true}).click();
    expect(await page.evaluate(()=>window.scene.events.invoke('studio.experience').annotations[0].title)).toBe('打卡点');
    await page.getByRole('button',{name:'编辑标记',exact:true}).click();await page.getByRole('textbox',{name:'标记标题',exact:true}).fill('中文新标题');await page.keyboard.press('Meta+Enter');
    expect(await page.evaluate(()=>window.scene.events.invoke('studio.experience').annotations[0].title)).toBe('中文新标题');
});


test('effect input reject, switch preservation and slider gesture undo',async({page})=>{
    await ready(page);
    await page.getByRole('switch',{name:'调色',exact:true}).check();
    const contrast=page.getByRole('spinbutton',{name:'对比度',exact:true});
    await contrast.fill('1.25');await contrast.press('Tab');
    await contrast.fill('9');await contrast.press('Tab');await expect(contrast).toHaveValue('1.25');
    await page.getByRole('switch',{name:'调色',exact:true}).uncheck();await page.getByRole('switch',{name:'调色',exact:true}).check();await expect(contrast).toHaveValue('1.25');
    const slider=page.getByRole('slider',{name:'对比度',exact:true});const a=await slider.boundingBox();
    await drag(page,{x:a.x+a.width/2,y:a.y+a.height/2},{x:a.x-30,y:a.y+a.height/2});
    expect(await contrast.inputValue()).not.toBe('1.25');
    await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(contrast).toHaveValue('1.25');
});

test('timeline menus and guide remain visible at narrow sizes',async({page})=>{
    await ready(page);
    for(const width of [1024,760,390]) {
        await page.setViewportSize({width,height:900});
        const select=page.getByRole('combobox',{name:'循环',exact:true});await select.scrollIntoViewIfNeeded();await select.click();
        const list=page.locator('.pcui-select-input-list:visible');await expect(list.getByText('乒乓',{exact:true})).toBeVisible();
        const box=await list.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width+1);expect(box.y+box.height).toBeLessThanOrEqual(901);
        await page.screenshot({path:test.info().outputPath(`timeline-menu-${width}.png`)});await page.keyboard.press('Escape');
    }
    await page.setViewportSize({width:1440,height:900});await page.getByRole('button',{name:'打开快捷键指南',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'键盘快捷键'})).toContainText('Ctrl');await page.screenshot({path:test.info().outputPath('shortcut-guide.png')});await page.keyboard.press('Escape');
});


test('asset dialogs preserve provisional files and recover from invalid collision pair',async({page})=>{
    await ready(page);
    await page.getByRole('button',{name:'导入天空盒',exact:true}).click();
    let dialog=page.getByRole('dialog',{name:'导入天空盒',exact:true});
    await expect(dialog.getByRole('button',{name:'导入天空盒',exact:true})).toBeDisabled();
    await expect(dialog).toContainText('WebP');await page.screenshot({path:test.info().outputPath('skybox-empty.png')});await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'导入碰撞文件对',exact:true}).click();dialog=page.getByRole('dialog',{name:'导入碰撞文件',exact:true});
    const submit=dialog.getByRole('button',{name:'导入碰撞文件',exact:true});await expect(submit).toBeDisabled();
    const pick=async file=>{const chooser=page.waitForEvent('filechooser');await dialog.getByRole('button',{name:'选择文件',exact:true}).click();await(await chooser).setFiles(file);};
    await pick({name:'test.voxel.json',mimeType:'application/json',buffer:Buffer.from('{}')});await expect(submit).toBeDisabled();
    await pick({name:'test.voxel.bin',mimeType:'application/octet-stream',buffer:Buffer.from('bad')});await expect(submit).toBeEnabled();await submit.click();
    await expect(dialog.getByRole('alert')).toBeVisible();expect(await page.evaluate(()=>window.scene.events.invoke('studio.project').assets.length)).toBe(0);
    const metadata={version:'1.1',leafSize:4,nodeWordCount:1,leafDataCount:0,voxelResolution:.1,treeDepth:1,gridBounds:{min:[-1,-1,-1],max:[1,1,1]},gaussianBounds:{min:[-1,-1,-1],max:[1,1,1]}};
    await pick({name:'test.voxel.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(metadata))});
    await pick({name:'test.voxel.bin',mimeType:'application/octet-stream',buffer:Buffer.from(new Uint32Array([0xff000000]).buffer)});
    await page.screenshot({path:test.info().outputPath('collision-paired.png')});await submit.click();await expect(dialog).not.toBeVisible();
    expect(await page.evaluate(()=>window.scene.events.invoke('studio.project').assets.filter(a=>a.role==='collision').length)).toBe(2);
    await page.getByRole('button',{name:'撤销',exact:true}).click();expect(await page.evaluate(()=>window.scene.events.invoke('studio.project').assets.length)).toBe(0);
});


test('annotation multi selection, range, independent cards and keyboard reorder',async({page})=>{
    await ready(page);
    await page.evaluate(async()=>{const e=window.scene.events,s=e.invoke('studio.experience');s.annotations=[[-2,0,0],[0,1.5,0],[2,-1,0]].map((position,i)=>({...s.annotations[0],position,title:`点${i+1}`}));await e.invoke('studio.importExperience',s);await e.invoke('studio.importProject',e.invoke('studio.project'));});
    await expect(page.getByRole('button',{name:'保存工程',exact:true})).toBeDisabled();
    await page.getByRole('tab',{name:'标记',exact:true}).click();
    await page.getByRole('button',{name:'01 点1',exact:true}).click();await page.getByRole('button',{name:'02 点2',exact:true}).click({modifiers:['Meta']});
    await expect(page.locator('.studio-annotation-row.selected')).toHaveCount(2);await expect(page.locator('.studio-floating-card')).toHaveCount(2);await expect(page.locator('.studio-distance-card')).toHaveCount(0);
    await expect(page.locator('.studio-annotation-nav')).toContainText('点1');await expect(page.getByRole('button',{name:'保存工程',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:'03 点3',exact:true}).click({modifiers:['Shift']});await expect(page.locator('.studio-annotation-row.selected')).toHaveCount(3);
    await page.getByRole('button',{name:'02 点2',exact:true}).click({modifiers:['Meta']});await expect(page.locator('.studio-annotation-row.selected')).toHaveCount(2);
    const card=page.locator('.studio-floating-card[aria-label="标记 3：点3"]');await card.getByRole('button',{name:'编辑标记',exact:true}).click();await card.getByRole('textbox',{name:'标记标题',exact:true}).fill('保留原名');await card.getByRole('button',{name:'取消编辑标记',exact:true}).click();
    await page.getByRole('button',{name:'拖动标记 1',exact:true}).focus();await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(()=>window.scene.events.invoke('studio.experience').annotations.map(a=>a.title))).toEqual(['点2','点1','点3']);
    await page.getByRole('button',{name:'撤销',exact:true}).click();expect(await page.evaluate(()=>window.scene.events.invoke('studio.experience').annotations.map(a=>a.title))).toEqual(['点1','点2','点3']);
    await expect(page.locator('.studio-annotation-row.selected')).toHaveCount(2);await page.screenshot({path:test.info().outputPath('annotation-multiselect.png')});
});

test('real scene visual states use the reference control hierarchy',async({page})=>{
    await boot(page,'/studio/?load=/generated/scene.sog&settings=/generated/studio-controls-settings.json');
    await page.waitForFunction(()=>window.scene?.events.functions.has('studio.project') && window.scene.events.invoke('studio.project').experience.annotations.length && window.scene.events.invoke('scene.splats').length);
    await page.setViewportSize({width:1437,height:1258});await page.evaluate(()=>document.fonts.ready);await page.getByRole('button',{name:'时间线',exact:true}).click();
    await page.getByRole('button',{name:'在播放头添加关键帧',exact:true}).hover();await expect(page.getByRole('tooltip')).toContainText('Enter');await expect(page.getByRole('tooltip')).toBeVisible();await page.waitForTimeout(300);await expect(page.getByRole('tooltip')).toBeVisible();await hoverScreenshot(page,'real-scene-key-tooltip.png');
    await page.getByRole('button',{name:'编辑相机 1',exact:true}).click();
    const mode=await page.locator('.studio-camera-mode').boundingBox(),canvas=await page.locator('#canvas-container').boundingBox();expect(mode.x-canvas.x).toBe(16);expect(mode.height).toBe(24);
    await page.screenshot({path:test.info().outputPath('real-scene-camera-mode.png')});await page.getByRole('button',{name:'取消相机编辑',exact:true}).click();
    await page.getByRole('tab',{name:'标记',exact:true}).click();await page.getByRole('button',{name:'01 打卡点',exact:true}).click();
    await page.screenshot({path:test.info().outputPath('real-scene-annotation.png')});
    await page.getByRole('button',{name:'添加标记',exact:true}).click();
    const box=await page.locator('#canvas').boundingBox();
    await drag(page,{x:box.x+box.width*.5,y:box.y+box.height*.6},{x:box.x+box.width*.5+25,y:box.y+box.height*.6});
    expect(await page.evaluate(()=>window.scene.events.invoke('studio.experience').annotations.length)).toBe(1);
    await page.mouse.click(box.x+box.width*.5,box.y+box.height*.6);
    await expect(page.getByRole('textbox',{name:'标记标题',exact:true})).toBeVisible();
    await expect(page.getByRole('textbox',{name:'标记标题',exact:true})).toHaveAttribute('maxlength','60');
    await expect(page.getByRole('textbox',{name:'说明文字',exact:true})).toHaveAttribute('maxlength','280');
    expect(await page.evaluate(()=>window.scene.events.invoke('studio.experience').annotations.length)).toBe(2);
    await page.getByRole('button',{name:'取消编辑标记',exact:true}).click();
    await page.evaluate(async()=>{const e=window.scene.events,s=e.invoke('studio.experience');s.annotations=Array.from({length:26},(_,i)=>({...s.annotations[0],title:`原有点${i+1}`}));await e.invoke('studio.importExperience',s);});
    await expect(page.getByRole('button',{name:'添加标记',exact:true})).toBeDisabled();
    await expect(page.getByRole('button',{name:'放置标记',exact:true})).toBeDisabled();
    await page.keyboard.press('c');await expect(page.getByRole('button',{name:'取消添加标记',exact:true})).toHaveCount(0);
    expect(await page.evaluate(()=>window.scene.events.invoke('studio.experience').annotations.length)).toBe(26);
});

test('timeline overlap, zero clamp, stranded keys and full track undo',async({page})=>{
    await ready(page);
    // Drop frame 30 on occupied frame 60: target is replaced, one Undo restores both.
    const start=await point(page,30),end=await point(page,60);
    await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});
    await expect(page.locator('.studio-key-collision')).toHaveCount(1);await page.mouse.up();
    expect(await keyFrames(page)).toEqual([0,60]);await page.getByRole('button',{name:'撤销',exact:true}).click();expect(await keyFrames(page)).toEqual([0,30,60]);
    await drag(page,await point(page,-1,27),await point(page,61,27));
    await drag(page,await point(page,30),await point(page,10));expect(await keyFrames(page)).toEqual([0,30,60]);
    const duration=page.getByRole('spinbutton',{name:'时长（秒）',exact:true});await duration.fill('1');await duration.press('Tab');
    expect(await keyFrames(page)).toEqual([0,30,60]);await expect(page.locator('.studio-track-stranded')).toBeVisible();
    await page.getByRole('button',{name:'删除相机动画',exact:true}).click();expect(await keyFrames(page)).toEqual([]);
    await page.getByRole('button',{name:'撤销',exact:true}).click();expect(await keyFrames(page)).toEqual([0,30,60]);
    await page.screenshot({path:test.info().outputPath('timeline-stranded.png')});
});

test('every effect numeric boundary rejects invalid input and preserves disabled values',async({page})=>{
    await ready(page);
    const groups=[['锐化',[['锐化强度',0,1]]],['辉光',[['辉光强度',0,.1],['模糊层级',1,16]]],['调色',[['亮度',0,3],['对比度',.5,1.5],['饱和度',0,2]]],['暗角',[['暗角强度',0,1],['内边界',0,3],['外边界',0,3],['曲率',.01,10]]],['色散',[['色散强度',0,100]]]];
    for(const [name,fields] of groups){
        const toggle=page.getByRole('switch',{name,exact:true});await toggle.check();
        for(const [label,min,max] of fields){
            const input=page.getByRole('spinbutton',{name:label,exact:true});
            for(const value of [min,max]) {await input.fill(String(value));await input.press('Tab');expect(Number(await input.inputValue())).toBe(value);}
            for(const value of [min-1,max+1]) {await input.fill(String(value));await input.press('Tab');expect(Number(await input.inputValue())).toBe(max);}
        }
        await toggle.uncheck();await toggle.check();
        for(const [label,,max] of fields)expect(Number(await page.getByRole('spinbutton',{name:label,exact:true}).inputValue())).toBe(max);
        await toggle.uncheck();
    }
});

test('camera mouse gestures apply cancel and escape; edge cards flip away from hotspots',async({page})=>{
    await ready(page);
    const pose=()=>page.evaluate(()=>window.scene.events.invoke('studio.experience').cameras[0].initial);
    const original=await pose();
    for(const action of ['取消相机编辑','Escape','应用相机视角']){
        await page.getByRole('button',{name:'编辑相机 1',exact:true}).click();
        const c=await page.locator('#canvas').boundingBox();await drag(page,{x:c.x+c.width*.4,y:c.y+c.height*.4},{x:c.x+c.width*.4+80,y:c.y+c.height*.4+25});
        if(action==='Escape')await page.keyboard.press('Escape');else await page.getByRole('button',{name:action,exact:true}).click();
        if(action==='应用相机视角')expect(await pose()).not.toEqual(original);else expect(await pose()).toEqual(original);
    }
    await page.getByRole('button',{name:'撤销',exact:true}).click();expect(await pose()).toEqual(original);
    await page.evaluate(async()=>{const e=window.scene.events,s=e.invoke('studio.experience');s.animTracks=[];s.annotations[0].position=[2.4,0,0];await e.invoke('studio.importExperience',s);e.fire('camera.setPose',{position:{x:0,y:0,z:5},target:{x:0,y:0,z:0},fov:60},0);window.scene.camera.onUpdate(0);});
    await page.getByRole('tab',{name:'标记',exact:true}).click();await page.getByRole('button',{name:'01 打卡点',exact:true}).click();
    await expect(page.locator('.studio-floating-card')).toBeVisible();const card=await page.locator('.studio-floating-card').boundingBox();const c=await page.locator('#canvas').boundingBox();
    const hotspotX=await page.evaluate(()=>{const s=window.scene,c=s.camera.camera,m=c.viewMatrix.clone().mul2(c.projectionMatrix,c.viewMatrix).data;return ((m[0]*2.4+m[12])/(m[3]*2.4+m[15])+1)*s.canvas.clientWidth/2;});
    expect(card.x+card.width).toBeLessThan(c.x+hotspotX-10);await page.screenshot({path:test.info().outputPath('annotation-edge.png')});
});

test('color picker keyboard entry invalid fields and one undo per drag',async({page})=>{
    await ready(page);
    const color=page.getByRole('button',{name:'背景颜色',exact:true});await color.focus();await page.keyboard.press('Enter');
    const hex=page.getByRole('textbox',{name:'十六进制颜色',exact:true});await expect(hex).toBeVisible();
    await hex.fill('336699');await hex.press('Tab');
    const before=await page.evaluate(()=>window.scene.events.invoke('studio.experience').background.color);
    await hex.fill('nothex');await hex.press('Tab');await expect(hex).toHaveValue('336699');
    for(const name of ['红色通道','绿色通道','蓝色通道']){
        const input=page.getByRole('textbox',{name,exact:true});const value=await input.inputValue();
        await input.fill('999');await input.press('Tab');await expect(input).toHaveValue(value);
        await input.fill('-1');await input.press('Tab');await expect(input).toHaveValue(value);
    }
    const rect=await page.locator('.picker-color:not(.pcui-hidden) .pick-rect').boundingBox();
    await drag(page,{x:rect.x+20,y:rect.y+30},{x:rect.x+100,y:rect.y+100});
    expect(await page.evaluate(()=>window.scene.events.invoke('studio.experience').background.color)).not.toEqual(before);
    await page.keyboard.press('Escape');await expect(hex).not.toBeVisible();
    await page.getByRole('button',{name:'撤销',exact:true}).click();expect(await page.evaluate(()=>window.scene.events.invoke('studio.experience').background.color)).toEqual(before);
});

test('skybox WebP and HDR import preview undo and invalid replacement recovery',async({page})=>{
    await ready(page);
    const webp=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=8;c.height=4;const ctx=c.getContext('2d');ctx.fillStyle='#2277dd';ctx.fillRect(0,0,8,4);return c.toDataURL('image/webp').split(',')[1];});
    const hdr=Buffer.concat([Buffer.from('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 1\n'),Buffer.from([128,64,32,129])]);
    const skyName=()=>page.evaluate(()=>window.scene.events.invoke('studio.experience').background.skyboxUrl);
    for(const file of [{name:'test.webp',mimeType:'image/webp',buffer:Buffer.from(webp,'base64')},{name:'test.hdr',mimeType:'application/octet-stream',buffer:hdr}]){
        await page.getByRole('button',{name:'导入天空盒',exact:true}).click();const dialog=page.getByRole('dialog',{name:'导入天空盒',exact:true});
        const chooser=page.waitForEvent('filechooser');await dialog.getByRole('button',{name:'选择文件',exact:true}).click();await(await chooser).setFiles(file);
        await dialog.getByRole('button',{name:'导入天空盒',exact:true}).click();await expect(dialog).not.toBeVisible();expect(await skyName()).toBe(file.name);
        await expect.poll(()=>page.evaluate(()=>window.scene.app.assets.find('studio-skybox','texture')?.resource?.width)).toBe(file.name.endsWith('webp')?8:1);
        expect(await page.evaluate(()=>window.scene.app.assets.find('studio-skybox','texture').resource.encoding)).toBe(file.name.endsWith('hdr')?'rgbe':'rgbp');
    }
    await page.getByRole('button',{name:'导入天空盒',exact:true}).click();const dialog=page.getByRole('dialog',{name:'导入天空盒',exact:true});
    const chooser=page.waitForEvent('filechooser');await dialog.getByRole('button',{name:'选择文件',exact:true}).click();await(await chooser).setFiles({name:'invalid.hdr',mimeType:'application/octet-stream',buffer:Buffer.from('invalid')});
    await dialog.getByRole('button',{name:'导入天空盒',exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();expect(await skyName()).toBe('test.hdr');
    await page.screenshot({path:test.info().outputPath('skybox-invalid-recovery.png')});await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'撤销',exact:true}).click();expect(await skyName()).toBe('test.webp');
});

test('save rejection preserves dirty edits and edits during a write remain unsaved',async({page})=>{
    await ready(page);
    await page.evaluate(()=>{window.showSaveFilePicker=async()=>({createWritable:async()=>({write:async()=>{throw new Error('模拟写入失败');},close:async()=>{},abort:async()=>{window.aborted=true;}})});});
    await page.getByRole('button',{name:'保存工程',exact:true}).click();await expect(page.locator('.studio-status')).toContainText('模拟写入失败');await expect(page.getByRole('button',{name:'保存工程',exact:true})).toBeEnabled();expect(await page.evaluate(()=>window.aborted)).toBe(true);
    await page.evaluate(()=>{window.showSaveFilePicker=async()=>({createWritable:async()=>({write:async(blob)=>{window.savedText=await blob.text();await new Promise(r=>window.releaseSave=r);},close:async()=>{},abort:async()=>{}})});});
    await page.getByRole('button',{name:'保存工程',exact:true}).click();await page.waitForFunction(()=>typeof window.releaseSave==='function');
    await page.getByRole('switch',{name:'锐化',exact:true}).check();await page.evaluate(()=>window.releaseSave());
    await expect(page.getByRole('button',{name:'保存工程',exact:true})).toBeEnabled();expect(await page.evaluate(()=>JSON.parse(window.savedText).experience.postEffectSettings.sharpness.enabled)).toBe(false);
    expect(await page.evaluate(()=>window.scene.events.invoke('studio.experience').postEffectSettings.sharpness.enabled)).toBe(true);
});
