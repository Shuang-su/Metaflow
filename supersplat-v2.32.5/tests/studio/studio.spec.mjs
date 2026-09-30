import { selectStudio, openFileMenu } from './ui-helpers.mjs';
import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { boot } from '../e2e/helpers.mjs';
import { setupCalibrationScene, installVideoAudit, renderVideo, probeVideo, clearAudit } from '../e2e/video-helpers.mjs';

const video = { startFrame: 0, endFrame: 2, frameRate: 30, width: 640, height: 360, bitrate: 4000000, format: 'mp4', codec: 'h264', transparentBg: false, showDebug: false, projection: 'standard', reveal: 'none' };
async function ready(page) {
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(installVideoAudit);
    await boot(page, '/studio/');
    await page.waitForFunction(() => window.scene.events.functions.has('studio.project'));
    await page.evaluate(setupCalibrationScene);
    await page.waitForTimeout(200);
    return errors;
}

test('shared scene output reaches viewport and encoded frames for every effect', async ({ page }) => {
    const errors = await ready(page);
    const read = () => page.evaluate(async () => {
        const s = window.scene, rt = s.events.invoke('studio.renderTarget');
        s.forceRender = true; await new Promise(resolve => s.events.once('postrender', resolve));
        const data = new Uint8Array(rt.width * rt.height * 4);
        await rt.colorBuffer.read(0, 0, rt.width, rt.height, { renderTarget: rt, data });
        return { hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data))).join(','), pixels: Array.from(data.slice((Math.floor(rt.height / 2) * rt.width + Math.floor(rt.width / 2)) * 4).slice(0, 4)) };
    });
    const baseline = await read();
    for (const name of ['锐化', '辉光', '调色', '暗角', '色散']) {
        await page.getByRole('switch', { name, exact: true }).check();
        if (name === '锐化') await page.getByRole('spinbutton', { name: '锐化强度' }).fill('0.9');
        if (name === '调色') await page.getByRole('spinbutton', { name: '饱和度' }).fill('0');
        if (name === '色散') await page.getByRole('spinbutton', { name: '色散强度' }).fill('12');
        await page.getByRole('heading', { name: '后处理', exact: true }).click();
        const output = await read(); expect(output.hash, name).not.toBe(baseline.hash);
        await page.getByRole('switch', { name, exact: true }).uncheck();
    }
    await page.getByRole('switch', { name: '调色', exact: true }).check();
    await page.getByRole('spinbutton', { name: '饱和度' }).fill('0'); await page.getByRole('heading', { name: '后处理', exact: true }).click();
    const file = test.info().outputPath('composed.mp4');
    const audit = await renderVideo(page, video, file); expect(audit.frames).toHaveLength(3);
    expect(probeVideo(file).streams[0].nb_read_frames).toBe('3');
    execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-']);
    expect(errors).toEqual([]);
});

test('annotation editing, undo and lightweight project roundtrip', async ({ page }) => {
    const errors = await ready(page);
    await page.getByRole('tab', { name: '标记', exact: true }).click();
    await page.getByRole('button', { name: '添加标记', exact: true }).click();
    await page.locator('#canvas').click({ position: { x: 560, y: 340 } });
    await page.getByRole('button', { name: '编辑标记', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '标记标题' })).toBeVisible();
    await page.getByRole('textbox', { name: '标记标题' }).fill('中文长标题：展览馆中的空间记忆与场景介绍');
    await page.getByRole('textbox', { name: '说明文字' }).fill('第一行说明\n第二行说明 <b>保持纯文本</b>');
    await page.getByRole('button', { name: '确定标记', exact: true }).click();
    await page.getByRole('button', { name: '删除标记 1', exact: true }).click();
    await expect(page.getByRole('heading', { name: '场景标记 · 0' })).toBeVisible();
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await page.getByRole('button', { name: '编辑标记', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '标记标题' })).toHaveValue('中文长标题：展览馆中的空间记忆与场景介绍');
    await page.getByRole('button', { name: '取消编辑标记' }).click();
    const download = page.waitForEvent('download'); await page.getByRole('button', { name: '保存工程', exact: true }).click();
    const path = test.info().outputPath('roundtrip.mfstudio.json'); await (await download).saveAs(path);
    const before = await page.evaluate(() => window.scene.events.invoke('studio.project'));
    expect(before.experience.annotations).toHaveLength(1); expect(before.assets[0].name).toBe('video-calibration.ply');
    await page.evaluate(raw => window.scene.events.invoke('studio.importProject', raw), before);
    expect(await page.evaluate(() => window.scene.events.invoke('studio.project'))).toEqual(before);
    await page.screenshot({ path: test.info().outputPath('studio-annotations.png') });
    expect(errors).toEqual([]);
});

async function installAnnotations(page) {
    await page.evaluate(() => {
        const e = window.scene.events, settings = e.invoke('studio.experience');
        const pose = { position: [0, 0, 5], target: [0, 0, 0], fov: 60 };
        settings.cameras = [{ initial: pose }];
        settings.annotations = [
            { position: [0, 0, 0], title: '空间记忆：中文长标题与多行说明', text: '第一行：欢迎来到场景\n第二行：镜头移动时跟随热点\n<b>纯文本，不执行 HTML</b>', camera: { initial: pose } },
            { position: [1, 0.6, 0], title: '画面边缘的长标题说明', text: '第二个标记', camera: { initial: pose } },
            { position: [0, 0, 10], title: '相机后方不应出现', text: '隐藏', camera: { initial: pose } }
        ];
        e.invoke('studio.importExperience', settings);
    });
    await page.getByRole('tab', { name: '标记', exact: true }).click();
    await page.getByRole('button', { name: '01 空间记忆：中文长标题与多行说明' }).click();
}

test('three overlays, deterministic particles, landscape/portrait/4K files decode and seek', async ({ page }) => {
    test.setTimeout(240000);
    const errors = await ready(page); await installAnnotations(page);
    const cases = [
        ['off', '1080p30-off', { width: 1920, height: 1080, endFrame: 29, reveal: 'none' }],
        ['selected', 'portrait-character', { width: 1080, height: 1920, endFrame: 29, reveal: 'viewer', revealDotProfile: 'characterSog', revealShortClipConfirmed: true }],
        ['titles', '4k60-scene', { width: 3840, height: 2160, endFrame: 6, frameRate: 60, reveal: 'viewer', revealDotProfile: 'streamingScene', revealShortClipConfirmed: true }]
    ];
    for (const [mode, name, settings] of cases) {
        await selectStudio(page, '叠加模式', mode);
        await clearAudit(page);
        const file = test.info().outputPath(`${name}.mp4`);
        const options = { ...video, bitrate: 12000000, ...settings };
        const audit = await renderVideo(page, options, file);
        const expected = Math.floor((options.endFrame - options.startFrame) * options.frameRate / 30) + 1;
        expect(audit.frames).toHaveLength(expected);
        const probe = probeVideo(file); expect(Number(probe.streams[0].nb_read_frames)).toBe(expected);
        expect(probe.frames.every((frame, i) => Math.abs(Number(frame.pts_time) - i / options.frameRate) < 0.00001)).toBe(true);
        execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-']);
        // Verify the browser demuxer can play and seek the actual generated file.
        const { readFile } = await import('node:fs/promises');
        const bytes = (await readFile(file)).toString('base64');
        const playback = await page.evaluate(async bytes => {
            const player = document.createElement('video'); player.muted = true; player.style.cssText = 'position:fixed;bottom:20px;right:20px;width:260px;z-index:1000';
            player.src = URL.createObjectURL(new Blob([Uint8Array.from(atob(bytes), c => c.charCodeAt(0))], { type: 'video/mp4' })); document.body.append(player);
            await new Promise((resolve, reject) => { player.onloadeddata = resolve; player.onerror = reject; });
            await player.play(); player.pause(); player.currentTime = player.duration * 0.6;
            await new Promise(resolve => { player.onseeked = resolve; });
            const result = { duration: player.duration, width: player.videoWidth, height: player.videoHeight, time: player.currentTime };
            const url = player.src; player.pause(); player.removeAttribute('src'); player.load(); player.remove(); URL.revokeObjectURL(url); return result;
        }, bytes);
        expect(playback.width).toBe(options.width); expect(playback.height).toBe(options.height); expect(playback.time).toBeGreaterThan(0);
        await writeFile(test.info().outputPath(`${name}.json`), JSON.stringify({ options, probe, audit, playback }, null, 2));
    }
    await page.screenshot({ path: test.info().outputPath('studio-with-annotations.png') });
    expect(errors).toEqual([]);
});

test('HDR skybox, precision and tone controls affect shared output and survive settings exchange', async ({ page }) => {
    const errors = await ready(page);
    const getHash = () => page.evaluate(async () => {
        const s = window.scene; s.forceRender = true; await new Promise(resolve => s.events.once('postrender', resolve));
        const rt = s.events.invoke('studio.renderTarget'), bytes = new Uint8Array(rt.width * rt.height * 4);
        await rt.colorBuffer.read(0, 0, rt.width, rt.height, { renderTarget: rt, data: bytes });
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).join(',');
    });
    const initial = await getHash();
    const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: '导入天空盒' }).click();
    const header = Buffer.from('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X 4\n');
    await (await chooser).setFiles({ name: 'test.hdr', mimeType: 'application/octet-stream', buffer: Buffer.concat([header, Buffer.from(Array.from({ length: 8 }, (_, i) => [200, 50 + i * 10, 40, 129]).flat())]) });
    await expect(page.locator('.studio-panel').getByText('test.hdr', { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(350);
    const sky = await getHash(); expect(sky).not.toBe(initial);
    await selectStudio(page, '色调映射', 'aces'); const tone = await getHash(); expect(tone).not.toBe(sky);
    await page.getByRole('switch', { name: '高精度渲染' }).uncheck(); expect(await getHash()).not.toBe(tone);
    const current = await page.evaluate(() => window.scene.events.invoke('studio.project'));
    expect(current.experience.background.skyboxUrl).toBe('test.hdr'); expect(current.experience.highPrecisionRendering).toBe(false);
    await renderVideo(page, video, test.info().outputPath('sky-effects.mp4'));
    const webp = await page.evaluate(async () => {
        const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 8;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#167ac9'; ctx.fillRect(0, 0, 16, 8);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp'));
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    const webpChooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: '导入天空盒' }).click();
    await (await webpChooser).setFiles({ name: 'test.webp', mimeType: 'image/webp', buffer: Buffer.from(webp) });
    await expect(page.locator('.studio-panel').getByText('test.webp', { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(200); expect(await getHash()).not.toBe(tone);
    expect(errors).toEqual([]);
});

test('Viewer preview relay supports model ranges and a portable package names missing model dependencies', async ({ page, context }) => {
    const errors = await ready(page); await installAnnotations(page);
    const popup = page.waitForEvent('popup'); await page.getByRole('button', { name: '预览', exact: true }).click(); const preview = await popup;
    const previewErrors = []; preview.on('pageerror', e => previewErrors.push(e.message));
    await preview.waitForFunction(() => window.viewer, undefined, { timeout: 60000 });
    const range = await preview.evaluate(async () => {
        const url = new URL(location.href).searchParams.get('content');
        const response = await fetch(url, { headers: { Range: 'bytes=0-15' } });
        return { status: response.status, length: (await response.arrayBuffer()).byteLength };
    });
    expect(range).toEqual({ status: 206, length: 16 });
    await preview.screenshot({ path: test.info().outputPath('viewer-local-preview.png') });
    await preview.close(); await page.bringToFront();
    await openFileMenu(page);
    const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出本地预览包' }).click();
    const file = test.info().outputPath('local-preview.zip'); await (await download).saveAs(file);
    const contents = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' });
    expect(contents).toContain('settings.json'); expect(contents).toContain('dependencies.json'); expect(contents).not.toContain('video-calibration.ply');
    const settings = JSON.parse(execFileSync('unzip', ['-p', file, 'settings.json'], { encoding: 'utf8' }));
    expect(settings.annotations).toHaveLength(3); expect(JSON.stringify(settings)).not.toContain('blob:');
    expect(previewErrors).toEqual([]); expect(errors).toEqual([]);
});

test('cancellation, unsupported codec, readback and destination failures release Studio and allow retry', async ({ page }) => {
    await ready(page); await installAnnotations(page);
    await selectStudio(page, '叠加模式', 'selected');
    const before = await page.evaluate(() => ({ pose: window.scene.events.invoke('camera.getPose'), frame: window.scene.events.invoke('timeline.frame') }));
    for (const failure of ['cancel', 'initialization', 'readback', 'write', 'close', 'codec']) {
        const result = await page.evaluate(async ({ video, failure }) => {
            const s = window.scene, e = s.events;
            const originalPopup = e.functions.get('showPopup'), popups = [];
            e.functions.set('showPopup', async p => { popups.push(p.message); return { action: 'ok' }; });
            const proto = Object.getPrototypeOf(s.camera.workTarget.colorBuffer), read = proto.read;
            const cancel = failure === 'cancel' ? e.on('progressUpdate', () => e.fire('progressCancel')) : null;
            window.failEncoderInit = failure === 'initialization';
            if (failure === 'readback') proto.read = async () => { throw new Error('Injected GPU readback failure'); };
            let aborts = 0;
            const output = ['write', 'close'].includes(failure) ? {
                async write() { if (failure === 'write') throw new Error('Injected write failure'); },
                async close() { if (failure === 'close') throw new Error('Injected close failure'); },
                async abort() { aborts++; }, async truncate() {}
            } : undefined;
            const ok = await e.invoke('render.video', { ...video, ...(failure === 'codec' ? { codec: 'unsupported' } : {}) }, output);
            proto.read = read; window.failEncoderInit = false; cancel?.off(); e.functions.set('showPopup', originalPopup);
            return { ok, aborts, popups, inert: document.getElementById('studio-header').inert, locked: s.lockedRenderMode, capture: s.camera.captureMode,
                pose: e.invoke('camera.getPose'), frame: e.invoke('timeline.frame'), locks: await navigator.locks.query() };
        }, { video: { ...video, endFrame: 6 }, failure });
        expect(result.ok, failure).toBe(false); expect(result.inert, failure).toBe(false); expect(result.locked, failure).toBe(false); expect(result.capture, failure).toBe(false);
        expect(result.pose).toEqual(before.pose); expect(result.frame).toBe(before.frame);
        expect(result.locks.held.some(l => l.name === 'supersplat-video-render')).toBe(false);
        if (failure !== 'cancel') expect(result.popups.length).toBeGreaterThan(0);
        if (['write', 'close'].includes(failure)) expect(result.aborts).toBe(1);
    }
    await renderVideo(page, video, test.info().outputPath('retry-after-failures.mp4'));
    await page.getByRole('button', { name: '编辑标记', exact: true }).click();
    await page.getByRole('textbox', { name: '标记标题' }).fill('失败恢复后仍可编辑');
    await page.getByRole('button', { name: '确定标记', exact: true }).click();
    expect(await page.evaluate(() => window.scene.events.invoke('studio.experience').annotations[0].title)).toBe('失败恢复后仍可编辑');
});

test('timeline settings and annotation movement, ordering, camera links undo and redo', async ({ page }) => {
    await ready(page); await installAnnotations(page);
    const before = await page.evaluate(() => window.scene.events.invoke('studio.experience').annotations[0]);
    await page.getByText('精确调整', { exact: true }).click();
    await page.getByRole('spinbutton', { name: '位置 X' }).fill('0.2'); await page.getByRole('spinbutton', { name: '位置 X' }).press('Tab');
    await page.getByRole('button', { name: '远离 0.1', exact: true }).click();
    await page.getByRole('button', { name: '下移', exact: true }).click();
    expect(await page.evaluate(() => window.scene.events.invoke('studio.experience').annotations[1].title)).toBe(before.title);
    await page.locator('.studio-disclosure').getByRole('button', { name: '关联当前视角', exact: true }).click();
    await page.getByRole('button', { name: '上移', exact: true }).click();
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    expect(await page.evaluate(() => window.scene.events.invoke('studio.experience').annotations[1].title)).toBe(before.title);
    await page.getByRole('button', { name: '重做', exact: true }).click();
    expect(await page.evaluate(() => window.scene.events.invoke('studio.experience').annotations[0].title)).toBe(before.title);
    await page.getByRole('button', { name: '时间线', exact: true }).click();
    await page.getByRole('spinbutton', { name: '时长（秒）', exact: true }).fill('3');
    await page.getByRole('spinbutton', { name: '时长（秒）', exact: true }).press('Tab');
    expect(await page.evaluate(() => window.scene.events.invoke('timeline.frames'))).toBe(90);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    expect(await page.evaluate(() => window.scene.events.invoke('timeline.frames'))).toBe(301);
});
