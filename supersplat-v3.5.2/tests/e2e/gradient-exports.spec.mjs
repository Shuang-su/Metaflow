import { test, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { videoFixture } from './video-helpers.mjs';
import { writeScene } from './helpers.mjs';
const fill = { color: [.1,.2,.3], gradient: { type: 'radial', center: [.3,.6], radius: [.7,.5], angle: 123,
    topColor: [1,0,0], bottomColor: [0,0,1], stops: [{ position: 0, color: [1,0,0], opacity: 1 }, { position: .4, color: [0,1,0], opacity: .5 }, { position: 1, color: [0,0,1], opacity: 1 }] } };
for (const [edition, url] of [['webgpu','/editor/'],['webgl','/editor-legacy/']]) {
    test(`${edition}: all gradient exports include an offline runtime and match Viewer capture`, async ({ page, context }) => {
        test.setTimeout(180_000);
        const files = path.join(process.env.METAFLOW_TEST_FILES, edition); await mkdir(files, { recursive: true });
        const errors = await videoFixture(page, url);
        await page.evaluate(fill => { const e = window.scene.events; e.fire('background.preview', fill); e.fire('background.commit'); void e.invoke('scene.export', 'viewer'); }, fill);
        const popup = page.locator('#export-popup'); await popup.locator('.select').first().click(); await page.getByText('settings.json', { exact: true }).click();
        const sd = page.waitForEvent('download'); await popup.getByRole('button', { name: 'Export', exact: true }).click();
        const settingsFile = path.join(files, 'settings.json'); await (await sd).saveAs(settingsFile);
        const settings = JSON.parse(await readFile(settingsFile, 'utf8')); expect(settings.version).toBe(2); expect(settings.background.gradient.stops).toEqual(fill.gradient.stops);
        for (const [type, filename, exportType] of [['htmlViewer','gradient.html','html'], ['packageViewer','gradient.zip','zip'], ['packageViewer','legacy.zip','legacyZip'], ['compressedPly','model.ply']]) {
            await (await writeScene(page, type, filename, exportType && { type: exportType, experienceSettings: settings })).saveAs(path.join(files,filename));
        }
        for (const name of ['gradient','legacy']) {
            const dir = path.join(files,name); await mkdir(dir,{recursive:true}); execFileSync('unzip',['-o',path.join(files,`${name}.zip`),'-d',dir]);
            const entries = execFileSync('unzip',['-Z1',path.join(files,`${name}.zip`)],{encoding:'utf8'}).trim().split('\n').sort();
            expect(entries).toEqual(['index.css','index.html','index.js',name === 'legacy' ? 'scene.compressed.ply' : 'scene.sog','settings.json'].sort());
        }
        const fx = structuredClone(settings); fx.postEffectSettings.sharpness = { enabled: true, amount: .3 };
        await writeFile(path.join(files, 'settings-fx.json'), JSON.stringify(fx));
        let reference;
        for (const target of [`/generated/${edition}/gradient.html`, `/generated/${edition}/gradient/index.html`, `/generated/${edition}/legacy/index.html`, `/viewer/?${edition === 'webgl' ? 'webgl' : 'webgpu'}&noanalytics&noreveal&noanim&content=/generated/${edition}/model.ply&settings=/generated/${edition}/settings.json`, `/viewer/?${edition === 'webgl' ? 'webgl' : 'webgpu'}&noanalytics&noreveal&noanim&content=/generated/${edition}/model.ply&settings=/generated/${edition}/settings-fx.json`]) {
            const preview = await context.newPage(), remote = [], failed = [];
            preview.on('request', req => { if (!req.url().startsWith('http://127.0.0.1:4388/') && !/^(data|blob):/.test(req.url())) remote.push(req.url()); });
            preview.on('pageerror', e => failed.push(e.message));
            await preview.goto(target);
            await preview.waitForFunction(() => !!window.metaflowViewer?.captureFrame);
            const capture = await preview.evaluate(() => window.metaflowViewer.captureFrame({ width: 320, height: 180, supersample: 1 }));
            const bytes = Buffer.from(capture.data,'base64');
            const corner = [...bytes.subarray(0,4)]; expect(corner[3]).toBe(255); expect(corner[2]).toBeGreaterThan(200);
            if (!reference) reference = corner; else corner.forEach((v,i) => expect(Math.abs(v-reference[i])).toBeLessThanOrEqual(2));
            await preview.screenshot({path: test.info().outputPath(`${target.includes('viewer') ? 'online' : target.includes('legacy') ? 'legacy' : target.includes('gradient.html') ? 'html' : 'package'}.png`)});
            expect(remote).toEqual([]); expect(failed).toEqual([]); await preview.close();
        }
        await writeFile(test.info().outputPath('settings.json'),JSON.stringify(settings,null,2)); expect(errors).toEqual([]);
    });
}
