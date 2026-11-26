import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { videoFixture, standardVideo, renderVideo, clearAudit } from './video-helpers.mjs';
import { loadProject } from './helpers.mjs';
const fill = { color: [.12, .16, .2], gradient: { type: 'linear', angle: 90,
    topColor: [1, 0, 0], bottomColor: [0, 0, 1],
    stops: [{ position: 0, color: [1, 0, 0], opacity: 1 }, { position: .5, color: [0, 1, 0], opacity: .75 }, { position: 1, color: [0, 0, 1], opacity: 1 }] } };
async function selectFill(dialog, mode) {
    await dialog.getByLabel('Fill type', { exact: true }).click();
    await dialog.getByText({ solid: 'Solid', linear: 'Linear', radial: 'Radial' }[mode], { exact: true }).last().click();
}
const state = page => page.evaluate(() => window.scene.events.invoke('background.value'));
async function apply(page, value = fill) { await page.evaluate(value => { const e = window.scene.events; e.fire('background.preview', value); e.fire('background.commit'); }, value); }
async function pixels(page, file) {
    const base64 = (await readFile(file)).toString('base64');
    return page.evaluate(async b64 => {
        const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob(); const img = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(img.width, img.height), ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
        const sample = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
        return { w: img.width, h: img.height, corners: [sample(0,0),sample(img.width-1,0),sample(0,img.height-1),sample(img.width-1,img.height-1)] };
    }, base64);
}
async function capture(page, name, settings = {}) {
    const downloaded = page.waitForEvent('download');
    await page.evaluate(settings => window.scene.events.invoke('render.image', { width: 320, height: 180, format: 'png', transparentBg: false, showDebug: false, ...settings }), settings);
    const file = test.info().outputPath(name); await (await downloaded).saveAs(file); return pixels(page, file);
}
for (const [edition, url, panel] of [['webgpu', '/editor/', 'appearancePanel'], ['webgl', '/editor-legacy/', 'settingsPanel']]) {
    test(`${edition}: gradient picker, undo, saved project and legacy solid roundtrip`, async ({ page }) => {
        const errors = await videoFixture(page, url);
        await page.evaluate(panel => window.scene.events.fire(`${panel}.setVisible`, true), panel);
        await page.getByRole('button', { name: 'Background fill', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Background fill' });
        await selectFill(dialog, 'linear');
        await dialog.getByLabel('HEX', { exact: true }).fill('#ff0000'); await dialog.getByLabel('HEX', { exact: true }).press('Tab');
        await dialog.locator('.mf-fill-strip').click({ position: { x: 135, y: 7 } });
        expect((await state(page)).gradient.stops).toHaveLength(3);
        const before = await state(page); const h = await dialog.getByRole('button', { name: 'Stop 2', exact: true }).boundingBox();
        await page.mouse.move(h.x + h.width/2, h.y + 5); await page.mouse.down(); await page.mouse.move(h.x + 45, h.y + 5, { steps: 8 }); await page.mouse.up();
        expect((await state(page)).gradient.stops[1].position).not.toBe(before.gradient.stops[1].position);
        await dialog.press('Meta+z'); await expect.poll(() => state(page)).toEqual(before);
        await dialog.press('Meta+Shift+z'); await expect.poll(async () => (await state(page)).gradient.stops[1].position).not.toBe(before.gradient.stops[1].position);
        await dialog.getByLabel('Angle', { exact: true }).fill('135'); await dialog.getByLabel('Angle', { exact: true }).press('Tab');
        await selectFill(dialog, 'radial');
        await dialog.getByLabel('Center X', { exact: true }).fill('25'); await dialog.getByLabel('Center X', { exact: true }).press('Tab');
        await dialog.getByLabel('Radius Y', { exact: true }).fill('80'); await dialog.getByLabel('Radius Y', { exact: true }).press('Tab');
        const gradient = (await state(page)).gradient;
        await selectFill(dialog, 'solid'); await selectFill(dialog, 'radial');
        expect((await state(page)).gradient).toEqual(gradient);
        await page.screenshot({ path: test.info().outputPath(`${edition}-picker.png`) }); await dialog.press('Escape');
        const savedState = await state(page);
        const download = page.waitForEvent('download'); await page.evaluate(() => { void window.scene.events.invoke('doc.saveAs'); });
        if (edition === 'webgpu') await page.locator('#export-popup').getByRole('button', { name: 'Save', exact: true }).click();
        const project = test.info().outputPath('gradient.ssproj'); await (await download).saveAs(project); await loadProject(page, project);
        expect(await state(page)).toEqual(savedState);
        await page.evaluate(() => { const e = window.scene.events; const v = e.invoke('docSerialize.view'); delete v.background; v.bgColor = [.1,.2,.3,1]; e.invoke('docDeserialize.view', v); });
        expect(await state(page)).toEqual({ color: [.1,.2,.3] }); expect(errors).toEqual([]);
    });
    test(`${edition}: GPU PNG, portrait, panorama, transparent, ordinary and particle video backgrounds`, async ({ page }) => {
        const errors = await videoFixture(page, url); await apply(page);
        const png = await capture(page, 'gradient.png');
        expect(png.corners[0][0]).toBeGreaterThan(250); expect(png.corners[1][2]).toBeGreaterThan(250); expect(png.corners[2]).toEqual(png.corners[0]);
        const portrait = await capture(page, 'portrait.png', { width: 180, height: 320 }); expect(portrait.corners[0][0]).toBeGreaterThan(250);
        const pano = await capture(page, 'panorama.png', { width: 360, height: 180, projection: 'equirect' }); expect(pano.corners[0][0]).toBeGreaterThan(250); expect(pano.corners[1][2]).toBeGreaterThan(250);
        const transparent = await capture(page, 'transparent.png', { transparentBg: true }); expect(transparent.corners.map(c => c[3])).toEqual([0,0,0,0]);
        await page.evaluate(() => {
            window.cornerFrames = [];
            const Native = window.VideoEncoder;
            window.VideoEncoder = class extends Native { encode(frame, options) {
                const clone = frame.clone(); window.cornerFrames.push((async () => { try { const data = new Uint8Array(clone.allocationSize({ format: 'RGBA' })); await clone.copyTo(data, { format: 'RGBA' }); return [...data.slice(0,4)]; } finally { clone.close(); } })()); super.encode(frame, options);
            } };
        });
        for (const reveal of ['none', 'viewer']) {
            await clearAudit(page);
            const audit = await renderVideo(page, { ...standardVideo, width: 320, height: 180, startFrame: 60, endFrame: 65, reveal }, test.info().outputPath(`${reveal}.mp4`));
            expect(audit.frames).toHaveLength(6); expect(audit.capturing).toBe(false);
            const corners = await page.evaluate(() => Promise.all(window.cornerFrames)); expect(corners.every(c => c[0] > 250 && c[3] === 255)).toBe(true);
        }
        expect(await state(page)).toEqual(fill); expect(errors).toEqual([]);
    });
}
