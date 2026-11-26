import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('single-file HTML opens locally and legacy three-colour scenes retain both renderer paths', async ({ context }) => {
    const files = process.env.METAFLOW_TEST_FILES;
    const settings = JSON.parse(await readFile(path.join(files, 'webgpu/settings.json')));
    settings.background.gradient = { topColor:[.1,.3,.8], horizonColor:[.7,.2,.4], bottomColor:[.05,.6,.1], horizonStop:.55,bottomStop:1 };
    await writeFile(path.join(files,'legacy-three.json'),JSON.stringify(settings));
    const post = structuredClone(settings); post.postEffectSettings.sharpness = { enabled:true,amount:.3 };
    await writeFile(path.join(files,'legacy-three-fx.json'),JSON.stringify(post));
    const rgba = structuredClone(settings); rgba.background = { color: [.2,.4,.6,.5] };
    await writeFile(path.join(files,'legacy-rgba.json'),JSON.stringify(rgba));
    const rgb = structuredClone(rgba); rgb.background.color = rgb.background.color.slice(0,3);
    await writeFile(path.join(files,'legacy-rgb.json'),JSON.stringify(rgb));
    const rgbCorners = new Map();
    const targets = [pathToFileURL(path.join(files,'webgpu/gradient.html')).href];
    for (const renderer of ['webgpu','webgl']) for (const fx of ['', '-fx']) targets.push(`/viewer/?${renderer}&noanalytics&noreveal&noanim&content=/generated/webgpu/model.ply&settings=/generated/legacy-three${fx}.json`);
    for (const renderer of ['webgpu','webgl']) for (const tuple of ['rgb','rgba']) targets.push(`/viewer/?${renderer}&noanalytics&noreveal&noanim&content=/generated/webgpu/model.ply&settings=/generated/legacy-${tuple}.json`);
    for (let i=0;i<targets.length;i++) {
        const page = await context.newPage(), errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.goto(targets[i]); await page.waitForFunction(()=>!!window.metaflowViewer?.captureFrame);
        const frame = await page.evaluate(()=>window.metaflowViewer.captureFrame({width:160,height:90,supersample:1}));
        expect(Buffer.from(frame.data,'base64').length).toBe(160*90*4);
        if(i>0 && !targets[i].includes('legacy-rgb')) expect(await page.evaluate(()=>getComputedStyle(document.querySelector('.sse-viewer')).getPropertyValue('--canvas-background'))).toContain('linear-gradient(180deg');
        if (targets[i].includes('legacy-rgb')) { const px=[...Buffer.from(frame.data,'base64').subarray(0,4)]; const renderer=targets[i].includes('?webgl')?'webgl':'webgpu'; if(targets[i].includes('legacy-rgba')) expect(px).toEqual(rgbCorners.get(renderer)); else rgbCorners.set(renderer,px); expect(px[3]).toBe(255); }
        if(i===0 || targets[i].includes('-fx')) expect(Buffer.from(frame.data,'base64')[3]).toBe(255);
        await page.screenshot({path:test.info().outputPath(`compatibility-${i}.png`)}); expect(errors).toEqual([]); await page.close();
    }
});
