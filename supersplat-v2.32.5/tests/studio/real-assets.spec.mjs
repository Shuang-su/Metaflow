import { selectStudio, openFileMenu } from './ui-helpers.mjs';
import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { boot } from '../e2e/helpers.mjs';
import { installVideoAudit, renderVideo, probeVideo, clearAudit } from '../e2e/video-helpers.mjs';

test.skip(!process.env.STUDIO_REAL_ASSETS, 'Provide explicitly scoped representative assets through METAFLOW_TEST_FILES.');
const options = { startFrame: 0, endFrame: 89, frameRate: 30, width: 1920, height: 1080, bitrate: 15000000,
    transparentBg: false, showDebug: false, projection: 'standard', format: 'mp4', codec: 'h264', reveal: 'viewer', revealShortClipConfirmed: true };
async function start(page, url) {
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(installVideoAudit); await boot(page, url);
    await page.waitForFunction(() => window.scene.events.invoke('scene.splats').length > 0, undefined, { timeout: 120000 });
    return errors;
}

async function playAndSeek(page, file) {
    const bytes = (await readFile(file)).toString('base64');
    const playback = await page.evaluate(async bytes => {
        const video = document.createElement('video'); video.muted = true;
        const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(bytes), c => c.charCodeAt(0))], { type: 'video/mp4' }));
        video.src = url; document.body.append(video);
        await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; });
        await video.play(); video.pause(); video.currentTime = video.duration * 0.75;
        await new Promise(resolve => { video.onseeked = resolve; });
        const result = { duration: video.duration, time: video.currentTime, width: video.videoWidth, height: video.videoHeight };
        // Stop pending range requests before releasing the playback Blob URL.
        video.pause(); video.removeAttribute('src'); video.load(); video.remove(); URL.revokeObjectURL(url); return result;
    }, bytes);
    expect(playback.time).toBeGreaterThan(0);
    await writeFile(`${file}.playback.json`, JSON.stringify(playback, null, 2));
}

test('representative character uses animated camera, CJK selected description, repeatable particle capture', async ({ page }) => {
    test.setTimeout(240000);
    const errors = await start(page, '/studio/?load=/generated/character.sog&settings=/generated/character-settings.json');
    await page.waitForFunction(() => window.scene.events.invoke('studio.experience').animTracks.length > 0);
    await page.evaluate(() => {
        const e = window.scene.events, settings = e.invoke('studio.experience');
        const initial = settings.cameras[0].initial;
        settings.annotations = [{ position: initial.target, title: '傩戏大祭司 · 人物粒子开场', text: '中文说明与三维热点同步\n当前镜头来自已有相机动画\n独立 Studio 本地样片', camera: { initial } }];
        settings.postEffectSettings.vignette.enabled = true;
        e.invoke('studio.importExperience', settings);
    });
    await page.getByRole('tab', { name: '标记', exact: true }).click();
    await page.getByRole('button', { name: '01 傩戏大祭司 · 人物粒子开场' }).click();
    await selectStudio(page, '叠加模式', 'selected');
    const file = test.info().outputPath('人物_1080x1920_30fps_6秒.mp4');
    const settings = { ...options, width: 1080, height: 1920, endFrame: 179, revealDotProfile: 'characterSog' };
    const audit = await renderVideo(page, settings, file);
    expect(audit.frames).toHaveLength(180); expect(probeVideo(file).streams[0].nb_read_frames).toBe('180');
    execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-']); await playAndSeek(page, file);
    await page.screenshot({ path: test.info().outputPath('studio-character.png') });
    // Short 4K60 capture; repeat encoded input hashes verify all post-processing
    // and frozen annotation layers are deterministic at the same clock samples.
    const short = { ...options, width: 3840, height: 2160, frameRate: 60, endFrame: 9, revealDotProfile: 'characterSog' };
    await page.evaluate(() => { window.recordVideoPixels = true; }); await clearAudit(page);
    const first = await renderVideo(page, short, test.info().outputPath('人物_4K60_短样片.mp4'));
    await playAndSeek(page, test.info().outputPath('人物_4K60_短样片.mp4'));
    await clearAudit(page);
    const second = await renderVideo(page, short, test.info().outputPath('人物_4K60_重复验证.mp4'));
    expect(first.hashes).toEqual(second.hashes); expect(first.frames).toEqual(second.frames);
    await writeFile(test.info().outputPath('character-evidence.json'), JSON.stringify({ count: await page.evaluate(() => window.scene.events.invoke('scene.splats')[0].numSplats), settings, audit, repeat: { frames: first.frames, hashes: first.hashes } }, null, 2));
    expect(errors).toEqual([]);
});

test('representative full scene SOG composes particle video with hotspot titles', async ({ page }) => {
    test.setTimeout(240000);
    const errors = await start(page, '/studio/?load=/generated/scene.sog&settings=/generated/scene-settings.json');
    await page.waitForFunction(() => window.scene.events.invoke('studio.experience').animTracks.length > 0);
    await page.evaluate(() => {
        const e = window.scene.events, settings = e.invoke('studio.experience'), pose = settings.cameras[0].initial;
        settings.annotations = [{ position: pose.target, title: '演播室场景 · 本地展示配置', text: '场景样本', camera: { initial: pose } }];
        settings.postEffectSettings.sharpness = { enabled: true, amount: 0.25 }; e.invoke('studio.importExperience', settings);
    });
    await selectStudio(page, '叠加模式', 'titles');
    const file = test.info().outputPath('演播室_1920x1080_30fps_12秒.mp4');
    const audit = await renderVideo(page, { ...options, endFrame: 719, revealDotProfile: 'streamingScene' }, file);
    const probe = probeVideo(file); expect(probe.streams[0].nb_read_frames).toBe('360');
    execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-']); await playAndSeek(page, file);
    await page.screenshot({ path: test.info().outputPath('studio-scene.png') });
    await writeFile(test.info().outputPath('scene-evidence.json'), JSON.stringify({ audit, probe }, null, 2));
    expect(errors).toEqual([]);
});

for (const [format, name, source] of [['streamed', 'lod-meta.json', '/generated/streamed/lod-meta.json'], ['lcc2', 'meta.lcc2', '/generated/lcc2/meta.lcc2']]) {
    test(`${format} chosen LOD is materialized, recorded, and previewed as the same single layer`, async ({ page }) => {
        test.setTimeout(240000);
        await page.addInitScript(installVideoAudit); await boot(page, '/studio/'); await page.waitForFunction(() => window.scene.events.functions.has('studio.project'));
        await page.evaluate(({ name, source }) => { window.lodImport = window.scene.events.invoke('import', [{ filename: name, url: source }]); }, { name, source });
        const popup = page.locator('#popup'); await expect(popup).toBeVisible();
        const choices = await page.locator('#popup-select').evaluate(e => e.ui.options); expect(choices.length).toBeGreaterThan(1);
        await page.locator('#popup-select').click(); await popup.getByText(choices.at(-1).t, { exact: true }).click();
        await popup.getByRole('button', { name: /^(确定|OK)$/ }).click();
        await page.evaluate(() => window.lodImport);
        const project = await page.evaluate(() => window.scene.events.invoke('studio.project'));
        expect(project.assets.some(a => a.lod === choices.length - 1)).toBe(true);
        await page.getByText('本地资源', { exact: true }).click();
        await expect(page.locator('.studio-asset').filter({ hasText: `LOD ${choices.length - 1}` })).toBeVisible();
        expect(project.assets.filter(a => a.role === 'model')).toHaveLength(1);
        const count = await page.evaluate(() => window.scene.events.invoke('scene.splats')[0].numSplats); expect(count).toBeGreaterThan(0);
        if (format === 'lcc2') expect(count).toBe(431796);
        const previewEvent = page.waitForEvent('popup', { timeout: 120000 }); await page.getByRole('button', { name: '预览', exact: true }).click();
        const preview = await previewEvent; await preview.waitForFunction(() => window.viewer, undefined, { timeout: 120000 });
        expect(new URL(preview.url()).searchParams.get('content')).toContain('studio-preview.ply');
        await preview.screenshot({ path: test.info().outputPath(`${format}-single-lod-preview.png`) }); await preview.close();
        await page.evaluate(project => window.scene.events.invoke('studio.importProject', project), project);
        expect(await page.evaluate(() => window.scene.events.invoke('scene.splats')[0].numSplats)).toBe(count);
        await expect(popup).toBeHidden();
        await writeFile(test.info().outputPath(`${format}-evidence.json`), JSON.stringify({ choices, count, project }, null, 2));
    });
}
