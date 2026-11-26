import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { videoFixture } from './video-helpers.mjs';
const state = page => page.evaluate(() => window.scene.events.invoke('background.value'));
async function choose(dialog, label, name) {
    await dialog.getByLabel(label, { exact: true }).click();
    await dialog.getByLabel(label, { exact: true }).getByText(name, { exact: true }).last().click();
}
async function scrub(page, locator, dx, dy = 0, alt = false, cancel = false) {
    const r = await locator.boundingBox(), x = r.x + Math.min(12,r.width/2), y = r.y + r.height/2;
    if (alt) await page.keyboard.down('Alt');
    await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(x+dx,y+dy);
    const hint = await page.locator('.mf-fill-drag-hint').innerText();
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up(); if (alt) await page.keyboard.up('Alt');
    return hint;
}
for (const [edition,url,panel] of [['webgpu','/editor/','appearancePanel'],['webgl','/editor-legacy/','settingsPanel']]) {
    test(`${edition}: palette, native sizing, real scrubbing, history, cancellation and compact layout`, async ({page}) => {
        const errors = await videoFixture(page,url);
        await page.evaluate(panel => window.scene.events.fire(`${panel}.setVisible`,true),panel);
        const button=page.getByRole('button',{name:'Background fill',exact:true});
        const native=page.locator('.settings-panel-row-picker.pcui-color-input').nth(1);
        expect((await button.boundingBox()).width).toBe((await native.boundingBox()).width);
        expect((await button.boundingBox()).height).toBe((await native.boundingBox()).height);
        await button.click();
        const dialog=page.getByRole('dialog',{name:'Background fill'});
        await choose(dialog,'Fill type','Linear');expect((await dialog.boundingBox()).width).toBe(288);
        const view=()=>page.evaluate(()=>{const v=window.scene.events.invoke('docSerialize.view');delete v.background;delete v.bgColor;return v;});
        const camera=await view();
        await dialog.getByLabel('Saturation and brightness').click({position:{x:160,y:60}});
        expect((await state(page)).gradient.stops[0].color[0]).toBeGreaterThan(.5);
        const hue=dialog.getByLabel('Hue',{exact:true});await hue.click({position:{x:150,y:6}});
        const lastHue=await hue.getAttribute('aria-valuenow');
        for (const c of ['000000','888888']) {
            await dialog.getByLabel('HEX',{exact:true}).fill(c);await dialog.getByLabel('HEX',{exact:true}).press('Tab');
            expect(await hue.getAttribute('aria-valuenow')).toBe(lastHue);
        }
        await dialog.getByLabel('Saturation and brightness').click({position:{x:160,y:60}});
        await dialog.getByLabel('Opacity slider',{exact:true}).click({position:{x:130,y:6}});
        expect((await state(page)).gradient.stops[0].opacity).toBeCloseTo(.49,1);
        await page.evaluate(()=>{window.pickerEdits=0;window.scene.events.on('edit.add',()=>window.pickerEdits++);});
        const angle=dialog.getByLabel('Angle',{exact:true});
        const label=dialog.locator('.mf-fill-number:has(input[aria-label="Angle"]) .mf-fill-number-label');
        const before=await state(page);
        expect(await scrub(page,label,10,-40)).toContain('2×');expect((await state(page)).gradient.angle).toBe(200);
        expect(await page.evaluate(()=>window.pickerEdits)).toBe(1);
        await angle.press('Meta+z');expect(await state(page)).toEqual(before);
        await angle.press('Meta+Shift+z');expect((await state(page)).gradient.angle).toBe(200);
        for (const [dy,end,speed] of [[0,210,'1×'],[40,215,'0.5×'],[80,217.5,'0.25×']]) {
            expect(await scrub(page,label,10,dy)).toContain(speed);expect((await state(page)).gradient.angle).toBe(end);
        }
        await scrub(page,angle,10,0,true,true);expect((await state(page)).gradient.angle).toBe(217.5);
        await scrub(page,angle,10,0,true);expect((await state(page)).gradient.angle).toBe(227.5);
        await angle.fill('350');await angle.press('Tab');
        const lr=await label.boundingBox();await page.mouse.move(lr.x+8,lr.y+10);await page.mouse.down();
        await page.mouse.move(lr.x+108,lr.y+10);await page.mouse.move(lr.x+107,lr.y+10);await page.mouse.up();
        expect((await state(page)).gradient.angle).toBe(359);
        await angle.press('ArrowDown');await angle.press('Enter');
        expect((await state(page)).gradient.angle).toBe(358);
        await angle.press('ArrowUp');await angle.press('Enter');
        const saved=await state(page);
        for (const v of ['','not-a-number']) {await angle.fill(v);await angle.press('Tab');expect(await state(page)).toEqual(saved);}
        const ar=await angle.boundingBox();await page.mouse.move(ar.x+10,ar.y+10);await page.keyboard.down('Alt');
        await page.mouse.down();await page.mouse.move(ar.x-30,ar.y+10);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
        await page.mouse.up();await page.keyboard.up('Alt');expect(await state(page)).toEqual(saved);
        // Exercise real pointer lock at the screen edge, then its rejection fallback.
        await page.evaluate(()=>{
            const native=HTMLElement.prototype.requestPointerLock;
            window.nativeLockResults=[];
            HTMLElement.prototype.requestPointerLock=function(){
                const result=native.call(this);
                return Promise.resolve(result).then(()=>window.nativeLockResults.push('granted'),error=>{window.nativeLockResults.push(error.name+': '+error.message);throw error;});
            };
        });
        await angle.fill('0');await angle.press('Tab');
        const edge=await label.boundingBox();
        await page.mouse.move(edge.x+8,edge.y+10);await page.mouse.down();await page.mouse.move(1430,edge.y+10,{steps:8});
        await expect.poll(()=>page.evaluate(()=>window.nativeLockResults.length)).toBe(1);
        const lockResult=await page.evaluate(()=>window.nativeLockResults[0]);
        await test.info().attach('native-pointer-lock',{body:lockResult,contentType:'text/plain'});
        expect(await page.evaluate(()=>!!document.pointerLockElement)).toBe(lockResult==='granted');
        await page.mouse.up();await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(false);
        await angle.fill('359');await angle.press('Tab');
        await page.evaluate(()=>{window.lockAttempts=0;HTMLElement.prototype.requestPointerLock=()=>{window.lockAttempts++;return Promise.reject(new Error('test policy rejection'));};});
        await scrub(page,label,-10);expect((await state(page)).gradient.angle).toBe(349);
        const fallback=await label.boundingBox();await page.mouse.move(fallback.x+8,fallback.y+10);await page.mouse.down();await page.mouse.move(1430,fallback.y+10,{steps:8});
        await page.mouse.move(1429,fallback.y+10);await page.mouse.up();expect((await state(page)).gradient.angle).toBe(359);
        expect(await page.evaluate(()=>window.lockAttempts)).toBe(1);
        const cancelState=await state(page), cr=await label.boundingBox();
        await page.mouse.move(cr.x+8,cr.y+10);await page.mouse.down();await page.mouse.move(cr.x-12,cr.y+10);
        await page.evaluate(()=>document.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1})));
        await page.mouse.up();expect(await state(page)).toEqual(cancelState);
        await dialog.getByLabel('Position',{exact:true}).fill('20');await dialog.getByLabel('Position',{exact:true}).press('Tab');
        await dialog.locator('.mf-fill-strip').click({position:{x:125,y:4}});expect((await state(page)).gradient.stops).toHaveLength(3);
        const h=await dialog.getByRole('button',{name:'Stop 2',exact:true}).boundingBox();
        await page.mouse.move(h.x+7,h.y+7);await page.mouse.down();await page.mouse.move(h.x-100,h.y+7,{steps:8});await page.mouse.up();
        expect(await dialog.locator('.mf-fill-stop[aria-pressed=true]').getAttribute('aria-label')).toBe('Stop 1');
        await choose(dialog,'Color format','RGB');await scrub(page,dialog.getByLabel('G',{exact:true}),20,0,true);
        await choose(dialog,'Fill type','Radial');await scrub(page,dialog.getByLabel('Center X',{exact:true}),-20,0,true);
        expect((await state(page)).gradient.center[0]).toBe(.3);
        const gradient=(await state(page)).gradient;
        await choose(dialog,'Fill type','Solid');await choose(dialog,'Fill type','Radial');expect((await state(page)).gradient).toEqual(gradient);
        expect(await view()).toEqual(camera);
        await page.screenshot({path:test.info().outputPath(`${edition}-picker.png`)});
        await page.setViewportSize({width:1000,height:600});const dr=await dialog.boundingBox();
        expect(dr.y).toBeGreaterThanOrEqual(8);expect(dr.y+dr.height).toBeLessThanOrEqual(592);
        await page.screenshot({path:test.info().outputPath(`${edition}-short.png`)});
        await dialog.getByRole('button',{name:'Close',exact:true}).click();await button.click();expect((await state(page)).gradient).toEqual(gradient);
        await dialog.getByRole('button',{name:'Close',exact:true}).click();
        await page.evaluate(()=>{void window.scene.events.invoke('scene.export','viewer');});
        const exports=page.locator('#export-popup');await exports.locator('.select').first().click();await page.getByText('settings.json',{exact:true}).click();
        const download=page.waitForEvent('download');await exports.getByRole('button',{name:'Export',exact:true}).click();
        const file=test.info().outputPath('settings.json');await (await download).saveAs(file);
        const settings=JSON.parse(await readFile(file,'utf8'));expect(settings.version).toBe(2);expect(settings.background.gradient.stops).toEqual(gradient.stops);
        expect(errors).toEqual([]);
    });
}
