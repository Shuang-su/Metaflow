import { selectStudio, openFileMenu } from './ui-helpers.mjs';
import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { boot } from '../e2e/helpers.mjs';
import { setupCalibrationScene, installVideoAudit, renderVideo, clearAudit } from '../e2e/video-helpers.mjs';
const video = { startFrame: 0, endFrame: 1, frameRate: 30, width: 640, height: 360, bitrate: 4000000, format: 'mp4', codec: 'h264', transparentBg: false, showDebug: false, projection: 'standard', reveal: 'none' };
async function ready(page) {
    await page.addInitScript(installVideoAudit); await boot(page, '/studio/');
    await page.waitForFunction(() => window.scene.events.functions.has('studio.project'));
    await page.evaluate(setupCalibrationScene);
}
async function choose(page, button, files) {
    if (['打开工程', '打开模型', '重新定位资产'].includes(button)) await openFileMenu(page);
    const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: button, exact: true }).click();
    await (await chooser).setFiles(files);
}

test('closed project restores settings, reports missing model and relinks without changing source bytes', async ({ page, context }) => {
    await ready(page);
    await page.getByText('本地资源', { exact: true }).click();
    await page.getByRole('textbox', { name: '场景名称' }).fill('保存重开验收'); await page.getByRole('textbox', { name: '场景名称' }).press('Tab');
    await page.getByRole('switch', { name: '辉光', exact: true }).check();
    const modelBytes = await page.evaluate(async () => Array.from(new Uint8Array(await window.calibrationFile.arrayBuffer())));
    const modelPath = test.info().outputPath('video-calibration.ply'); await writeFile(modelPath, Buffer.from(modelBytes));
    const saving = page.waitForEvent('download'); await page.getByRole('button', { name: '保存工程', exact: true }).click();
    const filename = test.info().outputPath('保存重开.mfstudio.json'); await (await saving).saveAs(filename);
    const saved = JSON.parse(await readFile(filename, 'utf8')); await page.close();
    const reopened = await context.newPage(); await boot(reopened, '/studio/');
    await reopened.waitForFunction(() => window.scene.events.functions.has('studio.project'));
    await choose(reopened, '打开工程', filename);
    await expect(reopened.getByRole('status')).toContainText('重新定位');
    expect(await reopened.evaluate(() => window.scene.events.invoke('scene.splats').length)).toBe(0);
    expect(await reopened.evaluate(() => window.scene.events.invoke('studio.project'))).toEqual(saved);
    await openFileMenu(reopened); await choose(reopened, '重新定位资产', modelPath);
    await expect.poll(() => reopened.evaluate(() => window.scene.events.invoke('scene.splats')[0]?.numSplats)).toBe(600);
    const restored = await reopened.evaluate(() => window.scene.events.invoke('studio.project'));
    expect(restored.experience).toEqual(saved.experience); expect(restored.timeline).toEqual(saved.timeline); expect(restored.video).toEqual(saved.video);
    expect(await readFile(modelPath)).toEqual(Buffer.from(modelBytes));
    await openFileMenu(reopened);
    await reopened.getByRole('button', { name: '新建工程', exact: true }).click();
    await expect(reopened.locator('#popup')).toBeVisible(); await reopened.locator('#popup').getByRole('button', { name: '继续编辑', exact: true }).click();
    expect(await reopened.evaluate(() => window.scene.events.invoke('scene.splats').length)).toBe(1);
    await reopened.close();
});

test('paired collision import rejects truncation and enables world-space floor walking in Viewer', async ({ page }) => {
    await ready(page);
    await page.evaluate(async () => {
        const bytes = await window.calibrationFile.arrayBuffer(); const header = new TextDecoder().decode(bytes.slice(0, 500));
        const start = header.indexOf('end_header\n') + 11; const view = new DataView(bytes);
        for (let i = 0; i < 600; i++) { const p = start + i * 56; view.setFloat32(p, view.getFloat32(p, true) * 4, true); view.setFloat32(p + 8, view.getFloat32(p + 8, true) * 15, true); }
        const e = window.scene.events; e.fire('scene.clear');
        await e.invoke('import', [{ filename: 'floor-scene.ply', contents: new File([bytes], 'floor-scene.ply') }]);
        const settings = e.invoke('studio.experience'); settings.cameras = [{ initial: { position: [0, 3, 8], target: [0, 0, 0], fov: 60 } }]; e.invoke('studio.importExperience', settings);
    });
    const metadata = { version: '1.1', nodeCount: 1, nodeWordCount: 1, nodeStride: 1, leafDataCount: 2, leafSize: 4, voxelResolution: 4, treeDepth: 0,
        gridBounds: { min: [-8, -4, -8], max: [8, 12, 8] }, gaussianBounds: { min: [-8, -4, -8], max: [8, 12, 8] } };
    const json = { name: 'floor.voxel.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(metadata)) };
    await choose(page, '导入碰撞文件对', [json, { name: 'floor.voxel.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(1) }]);
    await expect(page.getByRole('status')).toContainText('长度');
    await choose(page, '导入碰撞文件对', [json, { name: 'floor.voxel.bin', mimeType: 'application/octet-stream', buffer: Buffer.from(new Uint32Array([0, 0x000f000f, 0x000f000f]).buffer) }]);
    await expect(page.getByRole('status')).toContainText('碰撞已校验');
    const opening = page.waitForEvent('popup'); await page.getByRole('button', { name: '预览', exact: true }).click(); const viewer = await opening;
    await viewer.waitForFunction(() => window.viewer?.inputController?.collision, undefined, { timeout: 60000 });
    const collision = await viewer.evaluate(() => { const v = window.viewer, c = v.inputController.collision;
        return { floor: c.queryRay(0, 2, 0, 0, -1, 0, 10), free: c.isFreeAt(0, 2, 0), allowed: v.global.state.walkAllowed }; });
    expect(collision.free).toBe(true); expect(collision.floor).toEqual({ x: 0, y: 0, z: 0 }); expect(collision.allowed).toBe(true);
    await expect.poll(() => viewer.locator('#logoIcon').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
    await viewer.locator('#fpsCamera').click();
    await expect.poll(() => viewer.evaluate(() => window.viewer.global.state.cameraMode)).toBe('walk');
    await viewer.keyboard.press('Escape'); await viewer.screenshot({ path: test.info().outputPath('collision-walk-preview.png') }); await viewer.close();
});

test('extracted preview package runs on an independent local origin after Studio closes', async ({ page, context }) => {
    await ready(page);
    const model = Buffer.from(await page.evaluate(async () => Array.from(new Uint8Array(await window.calibrationFile.arrayBuffer()))));
    await openFileMenu(page); const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出本地预览包', exact: true }).click();
    const zip = test.info().outputPath('standalone.zip'); await (await download).saveAs(zip);
    const root = test.info().outputPath('unpacked'); await mkdir(root); execFileSync('unzip', ['-q', zip, '-d', root]); await writeFile(path.join(root, 'video-calibration.ply'), model);
    await page.close();
    const server = createServer(async (req, res) => {
        const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); const file = path.resolve(root, `.${name === '/' ? '/index.html' : name}`);
        if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
        try { const info = await stat(file); if (!info.isFile()) throw new Error('not file');
            const mime = { '.svg': 'image/svg+xml', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm' };
            res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'Content-Length': info.size }); createReadStream(file).pipe(res);
        } catch { res.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const viewer = await context.newPage(); const errors = []; viewer.on('pageerror', e => errors.push(e.message));
    try {
        await viewer.goto(`http://127.0.0.1:${server.address().port}/`);
        await viewer.waitForFunction(() => window.viewer?.global?.state.loaded, undefined, { timeout: 60000 });
        await expect.poll(() => viewer.locator('#logoIcon').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
        expect(await viewer.evaluate(() => navigator.serviceWorker.controller)).toBeNull(); expect(errors).toEqual([]);
        await viewer.screenshot({ path: test.info().outputPath('independent-preview.png') });
    } finally {
        await viewer.close();
        await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    }
});

test('encoder receives the composed viewport pixels, annotation modes differ and export input is frozen', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => {
        const e = window.scene.events, settings = e.invoke('studio.experience');
        settings.cameras = [{ initial: { position: [0, 0, 5], target: [0, 0, 0], fov: 60 } }];
        settings.annotations = [{ position: [0, 0, 0], title: '中文长标题：最终合成', text: '多行说明\n<b>按纯文本绘制</b>', camera: settings.cameras[0] }];
        settings.postEffectSettings.bloom.enabled = true; settings.postEffectSettings.vignette.enabled = true; e.invoke('studio.importExperience', settings);
        const overlay = e.functions.get('studio.overlayFrame'); window.compositionAudit = [];
        e.functions.set('studio.overlayFrame', async (data, width, height) => {
            const rt = e.invoke('studio.renderTarget'), raw = new Uint8Array(data.length); await rt.colorBuffer.read(0, 0, width, height, { renderTarget: rt, data: raw });
            const flip = new Uint8Array(raw.length); for (let y = 0; y < height; y++) flip.set(raw.subarray(y * width * 4, (y + 1) * width * 4), (height - y - 1) * width * 4);
            const same = flip.every((v, i) => v === data[i]); let blocked = false;
            try { e.invoke('studio.importExperience', e.invoke('studio.experience')); } catch { blocked = true; }
            await overlay(data, width, height); window.compositionAudit.push({ same, blocked, inert: document.getElementById('timeline-panel').inert });
        }); window.recordVideoPixels = true;
    });
    await page.getByRole('tab', { name: '标记', exact: true }).click(); await page.getByRole('button', { name: '01 中文长标题：最终合成' }).click();
    const hashes = [];
    for (const mode of ['off', 'selected', 'titles']) {
        await selectStudio(page, '叠加模式', mode); await clearAudit(page);
        const audit = await renderVideo(page, video, test.info().outputPath(`${mode}.mp4`)); hashes.push(audit.hashes[0]);
    }
    expect(new Set(hashes).size).toBe(3);
    expect(await page.evaluate(() => window.compositionAudit)).toEqual(Array.from({ length: 6 }, () => ({ same: true, blocked: true, inert: true })));
});

test('existing ssproj camera keys and model reopen in Studio and enter lightweight project settings', async ({ page, context }) => {
    await ready(page);
    await page.evaluate(() => {
        const e = window.scene.events, track = e.invoke('camera.animTrack');
        track.addKey(0); track.addKey(90);
    });
    const saving = page.waitForEvent('download'); await page.evaluate(() => window.scene.events.invoke('doc.saveAs'));
    const file = test.info().outputPath('existing.ssproj'); await (await saving).saveAs(file);
    const reopened = await context.newPage(); await boot(reopened, '/studio/');
    await reopened.waitForFunction(() => window.scene.events.functions.has('studio.project'));
    await choose(reopened, '打开模型', file);
    await expect.poll(() => reopened.evaluate(() => window.scene.events.invoke('scene.splats')[0]?.numSplats)).toBe(600);
    const project = await reopened.evaluate(() => window.scene.events.invoke('studio.project'));
    expect(project.assets.some(a => a.name === 'existing.ssproj')).toBe(true);
    await test.info().attach('ssproj-state', { body: JSON.stringify({ project, poseSets: await reopened.evaluate(() => window.scene.events.invoke('docSerialize.poseSets')) }), contentType: 'application/json' });
    expect(project.experience.animTracks[0].keyframes.times).toEqual([0, 3]);
    await reopened.evaluate(() => window.scene.events.invoke('studio.changeTimeline', 'frameRate', 60));
    expect(await reopened.evaluate(() => window.scene.events.invoke('camera.animTrack').keys)).toEqual([0, 90]);
    await reopened.evaluate(() => window.scene.events.fire('edit.undo'));
    await expect.poll(() => reopened.evaluate(() => window.scene.events.invoke('timeline.frameRate'))).toBe(30);
    await reopened.evaluate(() => window.scene.events.invoke('studio.changeTimeline', 'frames', 120));
    const changed = await reopened.evaluate(() => window.scene.events.invoke('studio.project'));
    await reopened.evaluate(raw => window.scene.events.invoke('studio.importProject', raw), changed);
    expect(await reopened.evaluate(() => window.scene.events.invoke('studio.project'))).toEqual(changed);
    await reopened.close();
});
