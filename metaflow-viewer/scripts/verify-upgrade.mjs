import { chromium, webkit } from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out = process.env.METAFLOW_QA_OUTPUT || new URL('../../.codex-work/viewer-1352/', import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });
const base = process.env.METAFLOW_TEST_BASE_URL || 'http://127.0.0.1:8985';
const index = JSON.parse(fs.readFileSync(new URL('../../data/index.json', import.meta.url)));
const results = [];
const ids = ['mangzhong-2609160002', 'sztuccf260919-a003c0005', 'fireflyfes38', 'dayun', 'bijiashan', 'c1-bdi-206'];
const matrix = process.argv[2] || 'webgl';
const browser = await (matrix === 'webkit' ? webkit : chromium).launch({
    headless: true,
    ...(matrix === 'webkit' ? {} : { channel: 'chromium' }),
    ...(matrix === 'webgpu' ? { args: ['--enable-unsafe-webgpu'] } : {})
});
const save = () => fs.writeFileSync(out + 'browser-' + matrix + '.json', JSON.stringify(results, null, 2));
async function run(name, fn, mobile = false) {
    const errors = [],
        warnings = [];
    const page = await browser.newPage({
        viewport: mobile ? { width: 844, height: 390 } : { width: 1280, height: 800 },
        hasTouch: mobile,
        isMobile: mobile,
        ...(mobile
            ? {
                  userAgent:
                      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
              }
            : {})
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
        if (m.type() === 'warning') warnings.push(m.text());
    });
    const t = Date.now();
    try {
        await page.route('**/qa/embed.html', (route) =>
            route.fulfill({
                contentType: 'text/html',
                body: '<!doctype html><html><head><link rel="stylesheet" href="/index.css"></head><body style="margin:0;background:#222"><script type="module">import {createViewer} from "/index.js";window.createViewer=createViewer;</script></body></html>'
            })
        );
        const detail = await fn(page);
        assert.equal(errors.length, 0, errors.join('\n'));
        results.push({ name, ok: true, ms: Date.now() - t, errors, warnings, detail });
    } catch (e) {
        results.push({ name, ok: false, ms: Date.now() - t, error: String(e), errors, warnings });
    } finally {
        console.log(name, results.at(-1).ok, results.at(-1).error || '');
        await page.close();
        save();
    }
}
const ready = async (p) => p.waitForFunction(() => window.metaflowViewer?.state.loaded, {}, { timeout: 120000 });
const q = matrix === 'webgpu' ? 'noanalytics' : 'webgl&noanalytics';
try {
    for (const id of ids) {
        await run('scene-' + id, async (p) => {
            const r = index.resources.find((x) => x.id === id);
            await p.goto(base + r.route + '?' + q, { waitUntil: 'domcontentloaded' });
            await ready(p);
            await p.waitForTimeout(3500);
            await p.evaluate(() => window.scrubTo(0));
            const details = await p.evaluate(() => ({
                pose: window.getCameraPose(),
                loadingMode: window.metaflowViewer.state.loadingMode,
                collision: window.metaflowViewer.state.hasCollision,
                engine: window.app.graphicsDevice.deviceType,
                environment: !!window.app.root.findByName('environment')
            }));
            assert.equal(details.environment, !!r.files.environment);
            await p.screenshot({ path: out + matrix + '-' + id + '.png' });
            assert.equal(await p.locator('.sse-viewerBranding').getAttribute('aria-label'), 'Metaflow');
            return details;
        });
    }
    await run(
        'mobile-landscape-controls',
        async (p) => {
            await p.goto(base + '/animals/cats/mangzhong/2609160002?' + q);
            await ready(p);
            await p.evaluate(() => {
                const v = window.metaflowViewer;
                v.state.gamingControls = true;
                v.state.cameraMode = 'fly';
            });
            await p.waitForTimeout(500);
            assert(await p.locator('.sse-lookJoystickBase').isVisible());
            assert(await p.locator('.sse-touchMoveUp').isVisible());
            await p.screenshot({ path: out + matrix + '-mobile.png' });
            const before = await p.evaluate(() => window.getCameraPose().position);
            const box = await p.locator('.sse-touchMoveUp').boundingBox();
            await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await p.mouse.down();
            await p.waitForTimeout(250);
            await p.mouse.up();
            return { before, after: await p.evaluate(() => window.getCameraPose().position) };
        },
        true
    );
    if (matrix === 'webgl') {
        await run('dayun-corrupt-chunk-degrades-without-script-errors', async (p) => {
            await p.goto(base + '/shenzhen/dayun?' + q);
            await ready(p);
            await p.evaluate(() => window.scrubTo(0));
            await p.waitForTimeout(3500);
            await p.mouse.move(600, 350);
            await p.mouse.down();
            for (let i = 0; i < 60; i++) {
                await p.mouse.move(600 + 80 * Math.sin(i / 60 * Math.PI * 2), 350 + 40 * Math.cos(i / 60 * Math.PI * 2));
                await p.waitForTimeout(16);
            }
            await p.mouse.up();
            await p.waitForFunction(() => window.app.assets.list().some(a => a.resource?.octree?.assetLoader?._failed?.size));
            const detail = await p.evaluate(async () => {
                const octree = window.app.assets.list().find(a => a.resource?.octree).resource.octree;
                const frame = await window.captureFrame({ width: 64, height: 64 });
                return { failed: [...octree.assetLoader._failed], loadedFiles: octree.fileResources.size, rgbaBytes: atob(frame.data).length };
            });
            assert(detail.failed.some(url => url.endsWith('/1_144/meta.json')));
            assert(detail.loadedFiles > 1);
            assert.equal(detail.rgbaBytes, 64 * 64 * 4);
            return detail;
        });
        await run('legacy-scrub-and-instance-seek-playback-contract', async (p) => {
            await p.goto(base + '/animals/cats/mangzhong/2609160002?' + q);
            await ready(p);
            const detail = await p.evaluate(async () => {
                const v = window.metaflowViewer;
                await window.scrubTo(1);
                const pausedByScrub = v.state.animationPaused;
                const time = v.state.animationTime;
                const pose = window.getCameraPose();
                v.state.animationPaused = false;
                v.seek(2);
                const seekKeepsPlaying = !v.state.animationPaused;
                await window.scrubTo(0);
                const initial = window.getCameraPose();
                v.state.cameraMode = 'orbit';
                v.resetCamera();
                return { pausedByScrub, time, pose, initial, seekKeepsPlaying };
            });
            assert.equal(detail.pausedByScrub, true);
            assert(Math.abs(detail.time - 1) < 0.01);
            assert.equal(detail.seekKeepsPlaying, true);
            assert.notDeepEqual(detail.pose.position, detail.initial.position);
            return detail;
        });
        await run('instance-api-capture-teardown', async (p) => {
            await p.goto(base + '/qa/embed.html');
            await p.waitForFunction(() => typeof window.createViewer === 'function');
            return await p.evaluate(async () => {
                const check = (yes, msg) => {
                    if (!yes) throw Error(msg);
                };
                const settings = await (await fetch('/data/Animals/Cats/mangzhong/2609160002/settings.json')).json();
                const original = JSON.stringify(settings);
                const make = async (ui = false) => {
                    const container = document.createElement('div');
                    container.style.cssText = 'width:500px;height:500px;display:inline-block';
                    document.body.append(container);
                    const v = await window.createViewer({
                        container,
                        settings,
                        contentUrl: '/data/Animals/Cats/mangzhong/2609160002/scene.sog',
                        renderer: 'webgl',
                        ui,
                        noanalytics: true,
                        noanim: true,
                        revealEffect: 'none'
                    });
                    return { v, container };
                };
                const a = await make(),
                    b = await make(true);
                const wait = (v) =>
                    v.state.loaded
                        ? Promise.resolve()
                        : new Promise((resolve) => v.events.once('loaded:changed', resolve));
                await Promise.all([wait(a.v), wait(b.v)]);
                check(!window.app && !window.captureFrame, 'embedded globals leaked');
                check(document.querySelectorAll('.sse-viewer').length === 2, 'two roots');
                check(JSON.stringify(settings) === original, 'settings mutated');
                a.v.state.inputEnabled = false;
                b.v.state.inputEnabled = true;
                a.v.state.cameraMode = 'orbit';
                b.v.state.cameraMode = 'fly';
                check(a.v.state.cameraMode === 'orbit', 'state isolation');
                a.v.seek(2);
                a.v.state.animationPaused = true;
                const oldTime = a.v.state.animationTime;
                const frames = await Promise.all([
                    a.v.captureFrame({ width: 128, height: 64, time: 0, supersample: 1 }),
                    a.v.captureFrame({ width: 64, height: 128, time: 1, supersample: 1 })
                ]);
                check(
                    frames.every((f) => atob(f.data).length === f.width * f.height * 4),
                    'RGBA contract'
                );
                check(Math.abs(a.v.state.animationTime - oldTime) < 0.001, 'capture restoration');
                const big = await a.v.captureFrame({ width: 4096, height: 4096, time: 0, supersample: 1 });
                check(big.width === 4096 && atob(big.data).length === 4096 * 4096 * 4, 'native 4k');
                a.v.destroy();
                a.v.destroy();
                check(document.querySelectorAll('.sse-viewer').length === 1, 'destroy isolation');
                await b.v.captureFrame({ width: 32, height: 32 });
                b.v.destroy();
                let rejected = 0;
                for (let i = 0; i < 8; i++) {
                    const { v, container } = await make(i % 2 === 0);
                    const capture = v.captureFrame({ width: 16, height: 16 }).catch(() => rejected++);
                    v.destroy();
                    await capture;
                    container.remove();
                }
                check(rejected === 8, 'pending capture destroy');
                check(document.querySelectorAll('.sse-viewer').length === 0, 'roots leaked');
                return {
                    twoInstances: true,
                    native4k: true,
                    serializedCapture: true,
                    settingsUnchanged: true,
                    destroyedDuringLoad: rejected
                };
            });
        });
        await run('annotations-api-and-visibility', async (p) => {
            await p.goto(base + '/qa/embed.html');
            await p.waitForFunction(() => !!window.createViewer);
            return await p.evaluate(async () => {
                const settings = await (await fetch('/data/Animals/Cats/mangzhong/2609160002/settings.json')).json();
                settings.annotations = [
                    {
                        title: 'First',
                        text: '',
                        position: settings.cameras[0].initial.target,
                        camera: settings.cameras[0]
                    },
                    {
                        title: '第二个',
                        text: 'Line one\n第二行',
                        position: settings.cameras[0].initial.target,
                        camera: settings.cameras[0]
                    }
                ];
                const container = document.createElement('div');
                container.style.cssText = 'width:800px;height:700px';
                document.body.append(container);
                const v = await window.createViewer({
                    container,
                    settings,
                    contentUrl: '/data/Animals/Cats/mangzhong/2609160002/scene.sog',
                    renderer: 'webgl',
                    noanalytics: true,
                    revealEffect: 'none'
                });
                if (!v.state.loaded) await new Promise((r) => v.events.once('loaded:changed', r));
                v.state.animationPaused = true;
                v.selectAnnotation(1);
                if (v.state.selectedAnnotation !== 1 || !v.state.animationPaused) throw Error('annotation state');
                v.state.showAnnotations = false;
                if (v.state.selectedAnnotation !== 1) throw Error('hide clears selection');
                v.selectAnnotation(null);
                if (v.state.selectedAnnotation !== null) throw Error('clear selection');
                v.destroy();
                return { selected: true, hiddenSelectionRetained: true, cleared: true };
            });
        });
        await run('nonblocking-environment-failure', async (p) => {
            await p.route('**/environment.compressed.ply', (route) => route.fulfill({ status: 404, body: 'missing' }));
            await p.goto(base + '/acg/sztuccf260919/sakuramatou1?' + q);
            await ready(p);
            return await p.evaluate(() => ({
                loaded: window.metaflowViewer.state.loaded,
                environment: !!window.app.root.findByName('environment')
            }));
        });
        await run('terminal-subject-failure', async (p) => {
            let calls = 0;
            await p.route('**/scene.sog', (route) => {
                calls++;
                return route.fulfill({ status: 404, body: 'missing' });
            });
            await p.goto(base + '/animals/cats/mangzhong/2609160002?' + q);
            await p.waitForFunction(() => window.metaflowViewer?.state.loadingStage === 'error');
            assert.equal(calls, 1);
            assert((await p.locator('.sse-loadingStatus').innerText()).includes('失败'));
            return { requests: calls };
        });
        await run('transient-subject-retry', async (p) => {
            let calls = 0;
            await p.route('**/scene.sog', (route) => {
                calls++;
                return calls < 3 ? route.fulfill({ status: 503, body: 'retry' }) : route.continue();
            });
            await p.goto(base + '/animals/cats/mangzhong/2609160002?' + q);
            await ready(p);
            assert.equal(calls, 3);
            return { requests: calls };
        });
        await run('keyboard-focus-isolation-and-capture-recovery', async (p) => {
            await p.goto(base + '/qa/embed.html');
            await p.waitForFunction(() => !!window.createViewer);
            await p.evaluate(async () => {
                const settings = await (await fetch('/data/Animals/Cats/mangzhong/2609160002/settings.json')).json();
                window.pair = [];
                for (let i = 0; i < 2; i++) {
                    const container = document.createElement('div');
                    container.style.cssText = 'width:500px;height:400px;display:inline-block';
                    document.body.append(container);
                    const v = await window.createViewer({
                        container,
                        settings,
                        contentUrl: '/data/Animals/Cats/mangzhong/2609160002/scene.sog',
                        renderer: 'webgl',
                        noanalytics: true,
                        noanim: true,
                        revealEffect: 'none'
                    });
                    if (!v.state.loaded) await new Promise((r) => v.events.once('loaded:changed', r));
                    v.state.cameraMode = 'orbit';
                    window.pair.push(v);
                }
            });
            await p.locator('.sse-viewer').first().focus();
            await p.keyboard.press('2');
            assert.deepEqual(await p.evaluate(() => window.pair.map((v) => v.state.cameraMode)), ['fly', 'orbit']);
            await p.locator('.sse-viewer').nth(1).focus();
            await p.keyboard.press('2');
            assert.deepEqual(await p.evaluate(() => window.pair.map((v) => v.state.cameraMode)), ['fly', 'fly']);
            await p.evaluate(() => (window.pair[1].state.inputEnabled = false));
            await p.keyboard.press('1');
            assert.deepEqual(await p.evaluate(() => window.pair.map((v) => v.state.cameraMode)), ['fly', 'fly']);
            return await p.evaluate(async () => {
                const v = window.pair[0];
                await v.captureFrame({ width: 32, height: 32 });
                const device = v.app.graphicsDevice;
                const grab = device.readTextureAsync;
                device.readTextureAsync = () => Promise.reject(Error('injected readback failure'));
                let rejected = false;
                try {
                    await v.captureFrame({ width: 64, height: 64 });
                } catch {
                    rejected = true;
                } finally {
                    device.readTextureAsync = grab;
                }
                if (!rejected) throw Error('failure did not propagate');
                const result = await v.captureFrame({ width: 64, height: 64 });
                if (result.width !== 64) throw Error('queue did not recover');
                for (const x of window.pair) x.destroy();
                return { focusedOnly: true, disabledIgnored: true, captureFailureRecovered: true };
            });
        });
        await run('delayed-collision-after-first-frame', async (p) => {
            let release;
            const gate = new Promise((r) => (release = r));
            let requests = 0;
            await p.route('**/walk.voxel.json', async (route) => {
                requests++;
                await gate;
                await route.continue();
            });
            try {
                await p.goto(base + '/animals/cats/mangzhong/2609160002?' + q);
                await ready(p);
                assert.equal(await p.evaluate(() => window.metaflowViewer.state.walkAllowed), false);
                assert.equal(await p.evaluate(() => window.metaflowViewer.state.hasCollision), false);
                release();
                await p.waitForFunction(() => window.metaflowViewer.state.hasCollision);
                return { subjectReadyBeforeCollision: true, requests };
            } finally {
                release();
            }
        });
        await run('missing-tiled-collision-degrades', async (p) => {
            let failures = 0;
            await p.route('**/tiled-voxel/**/*.bin', (route) => {
                failures++;
                return route.fulfill({ status: 404, body: 'missing tile' });
            });
            await p.goto(base + '/shenzhen/dayun?' + q);
            await ready(p);
            await p.waitForTimeout(3500);
            const detail = await p.evaluate(() => ({
                loaded: window.metaflowViewer.state.loaded,
                walk: window.metaflowViewer.state.walkAllowed
            }));
            assert.equal(detail.loaded, true);
            assert.equal(detail.walk, false);
            assert(failures > 0);
            return { ...detail, failedTiles: failures };
        });
        await run('legacy-settings-url-and-xr-unavailable', async (p) => {
            await p.goto(base + '/qa/embed.html');
            await p.waitForFunction(() => !!window.createViewer);
            const resource = index.resources.find((r) => r.id === 'cyrene');
            assert(resource);
            return await p.evaluate(async (resource) => {
                const container = document.createElement('div');
                container.style.cssText = 'width:600px;height:500px';
                document.body.append(container);
                const v = await window.createViewer({
                    container,
                    settings: '/data/' + resource.files.settings,
                    contentUrl: '/data/' + resource.files.model,
                    renderer: 'webgl',
                    noanalytics: true,
                    revealEffect: 'none'
                });
                if (!v.state.loaded) await new Promise((r) => v.events.once('loaded:changed', r));
                let rejected = false;
                try {
                    await v.startXR('vr');
                } catch {
                    rejected = true;
                }
                if (v.state.canStartVR || !rejected || v.state.xrMode !== null) throw Error('unavailable XR state');
                v.destroy();
                return { legacyUrlLoaded: true, unsupportedXrRejected: true };
            }, resource);
        });
    }
} finally {
    await browser.close();
    save();
}
if (results.some((r) => !r.ok)) process.exitCode = 1;
