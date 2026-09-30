import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { boot } from '../e2e/helpers.mjs';
import { setupCalibrationScene } from '../e2e/video-helpers.mjs';

test('whole workspace control states and portal layering', async ({ page }) => {
    test.setTimeout(180000);
    const inventory = [], errors = []; page.on('pageerror', e => errors.push(e.message));
    await boot(page, '/studio/');
    await page.waitForFunction(() => window.scene.events.functions.has('studio.project'));
    await page.evaluate(setupCalibrationScene);
    const audit = async state => {
        const root = state === 'video-dialog' ? page.locator('#video-settings-dialog') : state === 'shortcuts' ? page.locator('.studio-shortcut-dialog') : page;
        const buttons = root.locator('button:visible,summary:visible,[role=switch]:visible,.pcui-select-input:visible');
        for (let i = 0; i < await buttons.count(); i++) {
            const button = buttons.nth(i);
            const details = await button.evaluate(e => {
                const s = getComputedStyle(e), r=e.getBoundingClientRect();
                return { name:e.getAttribute('aria-label') || e.textContent.trim(), disabled:e.disabled || e.classList.contains('pcui-disabled'), width:r.width,height:r.height,background:s.backgroundColor,color:s.color, icons:[...e.querySelectorAll('svg')].map(svg=>({name:svg.dataset.icon,viewBox:svg.getAttribute('viewBox'),width:svg.getBoundingClientRect().width,height:svg.getBoundingClientRect().height})) };
            });
            if (!details.disabled) {
                await button.hover();
                details.hover = await button.evaluate(e=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color,outline:getComputedStyle(e).outlineStyle}));
            }
            inventory.push({state,...details});
        }
        await fs.writeFile(test.info().outputPath('control-inventory.json'),JSON.stringify(inventory,null,2));
    };
    await audit('scene');
    for(const name of ['锐化','辉光','调色','暗角','色散','渐变背景']) await page.getByRole('switch',{name,exact:true}).click();
    await audit('effects');
    await page.getByRole('button',{name:'时间线',exact:true}).click();
    await audit('timeline');
    for(const width of [1440,1123,760,390]) {
        await page.setViewportSize({width,height:900});
        const combo=page.getByRole('combobox',{name:'循环',exact:true}); await combo.scrollIntoViewIfNeeded(); await combo.click();
        const list=page.locator('.studio-select-portal:visible'); await expect(list).toBeVisible();
        expect(await list.evaluate(e=>{const r=e.getBoundingClientRect();return e.parentElement===document.body && r.top>=0 && r.bottom<=innerHeight && !!document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.studio-select-portal');})).toBe(true);
        await page.screenshot({path:test.info().outputPath(`loop-${width}.png`)});
        await list.getByText('单次',{exact:true}).click();
        await expect(combo).toHaveAttribute('aria-expanded','false');
    }
    await page.setViewportSize({width:1440,height:900});
    await page.evaluate(async()=>{const e=window.scene.events,s=e.invoke('studio.experience'),pose={position:[0,0,5],target:[0,0,0],fov:60};s.cameras=[{initial:pose}];s.annotations=[{position:[0,0,0],title:'打卡点',text:'中文说明\n第二行',camera:{initial:pose}},{position:[.8,.6,0],title:'第二处空间',text:'',camera:{initial:pose}}];await e.invoke('studio.importExperience',s);});
    await page.getByRole('tab',{name:'标记',exact:true}).click(); await page.getByRole('button',{name:'01 打卡点',exact:true}).click();
    await audit('annotations');
    await page.getByRole('button',{name:'定位标记 1',exact:true}).hover();
    await page.screenshot({path:test.info().outputPath('annotations-hover.png')});
    await page.getByRole('button',{name:'编辑标记',exact:true}).click(); await audit('annotation-editor');
    await page.screenshot({path:test.info().outputPath('annotation-editor.png')}); await page.getByRole('button',{name:'取消编辑标记',exact:true}).click();
    await page.locator('.studio-disclosure > summary').filter({hasText:'精确调整'}).click(); await audit('annotation-details');
    await page.getByRole('button',{name:'打开快捷键指南',exact:true}).click(); await expect(page.getByRole('dialog',{name:'键盘快捷键'})).toBeVisible(); await audit('shortcuts');
    await page.screenshot({path:test.info().outputPath('shortcut-guide.png')}); await page.keyboard.press('Escape');
    await page.locator('.studio-file-menu > summary').click(); await audit('file-menu'); await page.screenshot({path:test.info().outputPath('file-menu.png')}); await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'导出视频',exact:true}).click(); await audit('video-dialog');
    for (const combo of await page.locator('#video-settings-dialog .pcui-select-input').all()) {
        if (!await combo.isVisible() || await combo.evaluate(e=>e.classList.contains('pcui-disabled'))) continue;
        await combo.scrollIntoViewIfNeeded(); await combo.click();
        await expect(page.locator('.studio-select-portal:visible')).toBeVisible(); await page.keyboard.press('Escape');
        await expect(page.locator('#video-settings-dialog')).toBeVisible();
    }
    await page.screenshot({path:test.info().outputPath('video-dialog.png')}); await page.keyboard.press('Escape');
    await fs.writeFile(test.info().outputPath('control-inventory.json'),JSON.stringify(inventory,null,2));
    expect(errors).toEqual([]);
    expect(inventory.flatMap(e=>e.icons).filter(e=>e.width>0 && e.width<14)).toEqual([]);
});

test('real scene settings render numbered annotations in the Viewer preview', async ({ page }) => {
    await page.setViewportSize({width:1437,height:1258});
    await boot(page, '/studio/?load=/generated/scene.sog&settings=/generated/scene-settings.json');
    await page.waitForFunction(()=>window.scene?.events.functions.has('studio.project') && window.scene.events.invoke('studio.project').assets.some(a=>a.role==='model'));
    await page.waitForFunction(()=>window.scene.events.invoke('studio.experience').animTracks.length>0);
    await page.evaluate(async()=>{const e=window.scene.events,s=e.invoke('studio.experience'),initial=s.cameras[0].initial;s.annotations=[{position:initial.target,title:'打卡点',text:'与 Viewer 共用编号热点\n保留中文标题与说明',camera:{initial}}];s.startMode='default';await e.invoke('studio.importExperience',s);e.fire('timeline.setPlaying',false);});
    await page.getByRole('tab',{name:'标记',exact:true}).click(); await page.getByRole('button',{name:'01 打卡点',exact:true}).click();
    await page.getByRole('button',{name:'时间线',exact:true}).click();
    await page.getByRole('button',{name:'定位标记 1',exact:true}).hover();
    await page.screenshot({path:test.info().outputPath('real-scene-annotations.png')});
    const saved=page.waitForEvent('download'); await page.getByRole('button',{name:'导出展示设置',exact:true}).click();await (await saved).saveAs(test.info().outputPath('experience-settings.json'));
    const opening=page.waitForEvent('popup');await page.getByRole('button',{name:'预览',exact:true}).click();const viewer=await opening;
    await viewer.waitForFunction(()=>window.viewer,undefined,{timeout:60000});
    await expect(viewer.locator('.pc-annotation-hotspot')).toHaveCount(1);
    const settings=await viewer.evaluate(()=>window.viewer.global.settings.annotations);
    expect(settings[0].title).toBe('打卡点');expect(settings[0].text).toContain('中文');
    await viewer.locator('.pc-annotation-hotspot').click();
    await expect(viewer.locator('.pc-annotation')).toContainText('打卡点');
    await expect(viewer.locator('.pc-annotation')).toHaveCSS('opacity','1');
    await viewer.screenshot({path:test.info().outputPath('real-viewer-annotations.png')});await viewer.close();
});
