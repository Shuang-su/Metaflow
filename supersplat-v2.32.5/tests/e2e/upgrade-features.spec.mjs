import { test, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { boot, loadProject, writeScene } from './helpers.mjs';

const samples = process.env.METAFLOW_SAMPLE_DIR;
const small = samples && path.join(samples, '260118 182644 J04 Surtr.ssproj');

test('MF-56 language changes live without replacing the document', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
        window.languageTestScene = window.scene;
        window.scene.events.fire('settingsPanel.setVisible', true);
    });
    const panel = page.locator('#settings-panel');
    await expect(panel).toBeVisible();
    await panel.locator('.settings-panel-row-select').first().click();
    await page.getByText('中文 (简体)', { exact: true }).click();
    await expect(panel).toContainText('语言');
    expect(await page.evaluate(() => window.scene === window.languageTestScene)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('live-zh-CN.png') });
    await panel.locator('.settings-panel-row-select').first().click();
    await page.getByText('English', { exact: true }).click();
    await expect(panel).toContainText('Language');
});

test('MF-56 single/multiple camera keys and loop export use the new upstream semantics', async ({ page }) => {
    test.skip(!small || !existsSync(small), 'Provide METAFLOW_SAMPLE_DIR.');
    await boot(page);
    await loadProject(page, small);
    const states = await page.evaluate(() => {
        const e = window.scene.events;
        const track = e.invoke('camera.animTrack');
        track.clear();
        track.addKey(10);
        e.fire('timeline.time', 80);
        window.scene.camera.onUpdate(0);
        const single = e.invoke('camera.getPose');
        const next = { position: window.scene.camera.position.clone().copy(single.position).addScalar(0.5), target: single.target, fov: 65 };
        e.fire('camera.setPose', next, 0);
        window.scene.camera.onUpdate(0);
        track.addKey(100);
        e.fire('timeline.time', 55);
        window.scene.camera.onUpdate(0);
        const middle = e.invoke('camera.getPose');
        e.fire('timeline.setLoop', false);
        return { keys: [...track.keys], single, middle, loop: e.invoke('timeline.loop') };
    });
    expect(states.keys).toEqual([10, 100]);
    expect(states.loop).toBe(false);
    for (const value of Object.values(states.middle.position)) expect(Number.isFinite(value)).toBe(true);
    await page.evaluate(() => { void window.scene.events.invoke('scene.export', 'viewer'); });
    const popup = page.locator('#export-popup');
    await expect(popup).toBeVisible();
    await popup.locator('.select').first().click();
    await page.getByText('settings.json', { exact: true }).click();
    const download = page.waitForEvent('download');
    await popup.getByRole('button', { name: 'Export', exact: true }).click();
    const file = test.info().outputPath('loop-none-settings.json');
    await (await download).saveAs(file);
    const settings = JSON.parse(await readFile(file, 'utf8'));
    expect(settings.animTracks[0].loopMode).toBe('none');
    expect(settings.animTracks[0].keyframes.times).toEqual([10, 100]);
    expect(settings.animTracks[0].frameRate).toBe(60);
    await test.info().attach('keyframe-and-settings', { body: JSON.stringify({ states, settings }), contentType: 'application/json' });
});

test('MF-56 native HTML/Package, SPZ and current Viewer round trip', async ({ page, context }) => {
    const files = process.env.METAFLOW_TEST_FILES;
    test.skip(!small || !existsSync(small) || !files, 'Provide METAFLOW_SAMPLE_DIR and an isolated METAFLOW_TEST_FILES directory.');
    test.setTimeout(240_000);
    await mkdir(files, { recursive: true });
    await boot(page);
    await loadProject(page, small);
    await page.evaluate(() => {
        const e = window.scene.events;
        e.invoke('camera.animTrack').clear();
        e.fire('select.none');
        e.fire('camera.setTonemapping', 'none');
    });
    await page.evaluate(() => { void window.scene.events.invoke('scene.export', 'viewer'); });
    const popup = page.locator('#export-popup');
    await popup.locator('.select').first().click();
    await page.getByText('settings.json', { exact: true }).click();
    const settingsDownload = page.waitForEvent('download');
    await popup.getByRole('button', { name: 'Export', exact: true }).click();
    const settingsPath = path.join(files, 'native-settings.json');
    await (await settingsDownload).saveAs(settingsPath);
    const settings = JSON.parse(await readFile(settingsPath, 'utf8'));
    for (const [type, filename, exportType] of [
        ['htmlViewer', 'native.html', 'html'], ['packageViewer', 'native.zip', 'zip'],
        ['legacyPackageViewer', 'legacy.zip', 'legacyZip'], ['compressedPly', 'native.compressed.ply'], ['spz', 'native.spz']
    ]) {
        const download = await writeScene(page, type, filename, exportType && { type: exportType, experienceSettings: settings });
        await download.saveAs(path.join(files, filename));
    }
    const html = await readFile(path.join(files, 'native.html'), 'utf8');
    expect(html).toContain('<html');
    for (const [name, dir] of [['native.zip', 'native-package'], ['legacy.zip', 'legacy-package']]) {
        const target = path.join(files, dir);
        await mkdir(target, { recursive: true });
        execFileSync('unzip', ['-o', path.join(files, name), '-d', target]);
    }
    for (const url of ['/generated/native.html', '/generated/native-package/index.html', '/generated/legacy-package/index.html']) {
        const preview = await context.newPage();
        const errors = [];
        preview.on('pageerror', e => errors.push(e.message));
        await preview.addInitScript(() => { window.firstFrame = () => { window.previewReady = true; }; });
        await preview.goto(url);
        await expect(preview.locator('canvas').first()).toBeVisible();
        await preview.waitForFunction(() => window.previewReady === true);
        await preview.screenshot({ path: test.info().outputPath(`${url.includes('legacy') ? 'legacy' : url.includes('package') ? 'package' : 'html'}-preview.png`) });
        expect(errors).toEqual([]);
        await preview.close();
    }
    const viewer = await context.newPage();
    const errors = [];
    viewer.on('pageerror', e => errors.push(e.message));
    await viewer.goto('/viewer/?webgl&noanalytics&noreveal&noanim&content=/generated/native.compressed.ply&settings=/generated/native-settings.json');
    await viewer.waitForFunction(() => typeof window.captureFrame === 'function');
    const capture = await viewer.evaluate(() => window.captureFrame({ width: 640, height: 360, supersample: 1 }));
    const pixels = Buffer.from(capture.data, 'base64');
    const foreground = Array.from({ length: pixels.length / 4 }, (_, i) => pixels[i * 4] + pixels[i * 4 + 1] + pixels[i * 4 + 2]).filter(v => v > 15).length;
    const actualPose = await viewer.evaluate(() => window.getCameraPose());
    await test.info().attach('current-viewer-compatibility', { body: JSON.stringify({ foreground, actualPose, settings }), contentType: 'application/json' });
    expect(foreground).toBeGreaterThan(1000);
    expect(errors).toEqual([]);
    await viewer.screenshot({ path: test.info().outputPath('viewer-roundtrip.png') });
    await page.bringToFront();
    const before = await page.evaluate(() => window.scene.events.invoke('scene.splats').reduce((n, s) => n + s.numSplats, 0));
    await page.evaluate(async () => {
        window.scene.events.fire('scene.clear');
        await window.scene.events.invoke('import', [{ filename: 'native.spz', url: '/generated/native.spz' }]);
    });
    expect(await page.evaluate(() => window.scene.events.invoke('scene.splats').reduce((n, s) => n + s.numSplats, 0))).toBe(before);
    await writeFile(test.info().outputPath('export-settings.json'), JSON.stringify(settings, null, 2));
});
