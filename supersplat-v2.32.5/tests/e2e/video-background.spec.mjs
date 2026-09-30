import { test, expect, chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { videoFixture, standardVideo, clearAudit, probeVideo } from './video-helpers.mjs';

// Ordinary Playwright pages have a focus override which makes document.hidden
// stay false. Launch ONLY our disposable browser profile and connect without
// that override; never attach to the user's running browser or fake visibility.
test('MF-57 actual background/resume preserves every frame and timestamp', async () => {
    test.skip(process.platform !== 'darwin' && !process.env.METAFLOW_TEST_EXECUTABLE,
        'Set METAFLOW_TEST_EXECUTABLE to a native Chrome/Edge executable for this OS.');
    const output = test.info().outputPath('native-browser');
    await mkdir(output, { recursive: true });
    const profile = await mkdtemp(path.join(output, 'profile-'));
    const processHandle = spawn(process.env.METAFLOW_TEST_EXECUTABLE ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
        `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
        '--disable-sync', '--disable-component-update', '--disable-background-networking', 'about:blank'
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let browser;
    try {
        const endpoint = await new Promise((resolve, reject) => {
            let log = '';
            const timeout = setTimeout(() => reject(new Error('Native browser did not start')), 15000);
            processHandle.once('error', error => { clearTimeout(timeout); reject(error); });
            processHandle.once('exit', () => { clearTimeout(timeout); reject(new Error('Native browser exited')); });
            processHandle.stderr.on('data', data => {
                log += data;
                const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
                if (match) { clearTimeout(timeout); resolve(match[1]); }
            });
        });
        browser = await chromium.connectOverCDP(endpoint, { noDefaults: true, isLocal: true, artifactsDir: output });
        const context = browser.contexts()[0];
        const page = context.pages()[0];
        page.setDefaultTimeout(15000);
        const errors = await videoFixture(page, 'http://127.0.0.1:4356/editor/');
        await page.evaluate(() => { window.recordVideoPixels = true; });
        const render = () => page.evaluate(async settings => {
            const root = await navigator.storage.getDirectory();
            const handle = await root.getFileHandle('mf57-background.mp4', { create: true });
            const ok = await window.scene.events.invoke('render.video', settings, await handle.createWritable());
            const file = await handle.getFile();
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(file);
            });
            return { ok, frames: window.videoAudit.frames, samples: window.videoAudit.samples,
                hashes: await Promise.all(window.videoAudit.hashes), video: dataUrl.split(',')[1] };
        }, standardVideo);
        const foreground = await render();
        expect(foreground.ok).toBe(true);
        await clearAudit(page);
        await page.evaluate(() => {
            const proto = Object.getPrototypeOf(window.scene.camera.workTarget.colorBuffer);
            const read = proto.read;
            proto.read = async function (...args) {
                await new Promise(resolve => setTimeout(resolve, 10));
                return read.apply(this, args);
            };
        });
        const pending = render();
        pending.catch(() => {});
        await page.waitForFunction(() => window.videoAudit.frames.length >= 5);
        const other = await context.newPage();
        await other.bringToFront();
        await page.waitForFunction(() => document.hidden, undefined, { polling: 100 });
        // This is a measured, genuinely hidden page, not a mocked Page API.
        const hiddenAt = await page.evaluate(() => ({ hidden: document.hidden, frames: window.videoAudit.frames.length }));
        await other.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));
        await page.bringToFront();
        await page.waitForFunction(() => !document.hidden);
        const resumed = await pending;
        expect(resumed.ok).toBe(true);
        expect(hiddenAt.hidden).toBe(true);
        expect(hiddenAt.frames).toBeLessThan(foreground.frames.length);
        expect(resumed.frames).toEqual(foreground.frames);
        expect(resumed.samples).toEqual(foreground.samples);
        expect(resumed.hashes).toEqual(foreground.hashes);
        const filename = test.info().outputPath('background-resumed.mp4');
        await writeFile(filename, Buffer.from(resumed.video, 'base64'));
        expect(probeVideo(filename).streams[0].nb_read_frames).toBe('151');
        await test.info().attach('background-evidence', { body: JSON.stringify({ hiddenAt, frames: resumed.frames, samples: resumed.samples }), contentType: 'application/json' });
        expect(errors).toEqual([]);
    } finally {
        await browser?.close();
        processHandle.kill('SIGTERM');
    }
});
