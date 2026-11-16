/**
 * Read-only normal-rAF QA for ZIP 842df070.
 * Does NOT call stepSimulation / inject amp / use URL flags.
 * Page-internal rAF samples + canvas JPEG for real-time playback video.
 */
import fs from 'fs';
import path from 'path';
import http from 'http';
import { createHash } from 'crypto';
import { spawn, spawnSync } from 'child_process';
import puppeteer from 'puppeteer';

const OUT = '/opt/cursor/artifacts';
const ZIP = '/opt/cursor/artifacts/metaflow-desktop-preview.zip';
const EXTRACT = '/tmp/vrm-desktop-raf-qa';
const PORT = 8801;
const EXPECT_ZIP = '842df070bb700ab07aecdad675d9a4da492cb6aa638141ac5c4b80f1247a4887';
const WAIT_MS = 18000;
const CAP_FPS = 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');

function serve(root) {
    const ct = (f) => {
        if (f.endsWith('.html')) return 'text/html; charset=utf-8';
        if (f.endsWith('.mjs') || f.endsWith('.js')) return 'text/javascript; charset=utf-8';
        if (f.endsWith('.json')) return 'application/json; charset=utf-8';
        if (f.endsWith('.vrm') || f.endsWith('.vrma')) return 'model/gltf-binary';
        return 'application/octet-stream';
    };
    const server = http.createServer((req, res) => {
        let rel = decodeURIComponent((req.url || '/').split('?')[0]);
        if (rel === '/') rel = '/index.html';
        const fp = path.normalize(path.join(root, rel));
        if (!fp.startsWith(root) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
            res.writeHead(404);
            res.end('missing');
            return;
        }
        res.writeHead(200, { 'Content-Type': ct(fp), 'Cache-Control': 'no-store' });
        fs.createReadStream(fp).pipe(res);
    });
    return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

async function waitReady(page, timeout = 120000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
        const d = await page.evaluate(() => window.diagnostics || null);
        if (d?.ready) return d;
        if (d?.error && !d?.loading) return d;
        await sleep(400);
    }
    return { timeout: true };
}

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    const zipSha = sha256(ZIP);
    if (zipSha !== EXPECT_ZIP) {
        throw new Error(`ZIP mismatch: got ${zipSha} expected ${EXPECT_ZIP}`);
    }
    if (!fs.existsSync(path.join(EXTRACT, 'index.html'))) {
        spawnSync('unzip', ['-qo', ZIP, '-d', EXTRACT], { stdio: 'inherit' });
    }

    // Product hygiene: no qaTimeHud / URL flag handlers in shipped JS
    const appSrc = fs.readFileSync(path.join(EXTRACT, 'app.mjs'), 'utf8');
    const playerSrc = fs.readFileSync(path.join(EXTRACT, 'vrm-animation-player.mjs'), 'utf8');
    const hygiene = {
        zipShaMatches: zipSha === EXPECT_ZIP,
        hasQaTimeHudInProduct: /qaTimeHud/.test(appSrc + playerSrc),
        hasUrlSearchParamsHook: /URLSearchParams|location\.search/.test(appSrc),
        stepSimulationIsSharedTick: /requestAnimationFrame\(\(\) => this\.animate\(\)\)/.test(appSrc) &&
            /this\.stepSimulation\(delta\)/.test(appSrc),
        torsoAmpInProductBind: /amplifyAuthoredIdle/.test(playerSrc),
        note: 'amplifyAuthoredIdle runs in bindVrm for all authored clips (product, not test-injected)'
    };

    const server = await serve(EXTRACT);
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-webgl',
            '--ignore-gpu-blocklist'
        ]
    });
    const pageErrors = [];
    const page = await browser.newPage();
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

    // Fresh clean page — no query flags
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    const ready = await waitReady(page);
    const pageUrl = page.url();

    // Ensure idle not paused via UI only (user-visible control), then leave rAF alone
    await page.evaluate(() => {
        const el = document.getElementById('idlePaused');
        if (el?.checked) {
            el.checked = false;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    await sleep(1500);

    const probe0 = await page.evaluate(() => {
        const app = window.app;
        const h = app.vrm.humanoid;
        const THREE = window.THREE;
        const proj = (n) => {
            const b = h.getNormalizedBoneNode(n);
            const v = new THREE.Vector3();
            b.getWorldPosition(v);
            v.project(app.camera);
            return { x: v.x, y: v.y, z: v.z };
        };
        const action = app.animPlayer?.actions?.get?.(app.animPlayer.currentId);
        return {
            modelName: app.modelName,
            sceneMode: app.sceneMode,
            bodyDrive: app.animator?.bodyDrive,
            anim: app.animPlayer?.diagnostics?.(),
            actionTime: action?.time ?? null,
            mixerTime: app.animPlayer?.mixer?.time ?? null,
            idlePaused: !!app.idlePaused,
            leftClear: Math.abs(proj('leftHand').x - proj('hips').x),
            rightClear: Math.abs(proj('rightHand').x - proj('hips').x),
            footY: (proj('leftFoot') || proj('leftToes')).y,
            headY: proj('head').y,
            calledStepFromOutside: false,
            href: location.href
        };
    });

    // Keep page "active" so headless does not freeze rAF
    try {
        const cdp = await page.createCDPSession();
        await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    } catch {
        /* older chrome may lack this */
    }

    await page.screenshot({ path: path.join(OUT, 'qa-normal-raf-t0.png'), type: 'png' });

    // Phase A: light wall-clock wait — NO toDataURL (avoids starving app rAF).
    // Sample bones on setInterval; app.animate continues via its own rAF+clock.getDelta.
    const metricResult = await page.evaluate(async (waitMs) => {
        const app = window.app;
        const THREE = window.THREE;
        const samples = [];
        const wall0 = performance.now();
        const action0 = app.animPlayer?.actions?.get?.(app.animPlayer.currentId);
        const mixer0 = app.animPlayer?.mixer?.time ?? 0;
        const actionTime0 = action0?.time ?? 0;
        let rafCount = 0;
        let stepCallsFromProbe = 0;
        let animateCalls = 0;

        const origStep = app.stepSimulation.bind(app);
        app.stepSimulation = function (...args) {
            const stack = new Error().stack || '';
            if (!/animate/.test(stack)) stepCallsFromProbe++;
            else animateCalls++;
            return origStep(...args);
        };
        const rafProbe = () => {
            rafCount++;
            if (performance.now() - wall0 < waitMs + 200) requestAnimationFrame(rafProbe);
        };
        requestAnimationFrame(rafProbe);

        const sampleOnce = () => {
            const h = app.vrm?.humanoid;
            if (!h) return;
            const q = (n) => {
                const b = h.getNormalizedBoneNode(n);
                return b ? { x: b.rotation.x, y: b.rotation.y, z: b.rotation.z } : null;
            };
            const proj = (n) => {
                const b = h.getNormalizedBoneNode(n);
                const v = new THREE.Vector3();
                b.getWorldPosition(v);
                v.project(app.camera);
                return { x: v.x, y: v.y };
            };
            const lh = proj('leftHand');
            const rh = proj('rightHand');
            const hips = proj('hips');
            const lf = proj('leftFoot') || proj('leftToes');
            const act = app.animPlayer?.actions?.get?.(app.animPlayer.currentId);
            samples.push({
                wall: performance.now() - wall0,
                chest: q('chest'),
                hips: q('hips'),
                leftClear: Math.abs(lh.x - hips.x),
                rightClear: Math.abs(rh.x - hips.x),
                footY: lf?.y,
                actionTime: act?.time ?? null,
                mixerTime: app.animPlayer?.mixer?.time ?? null,
                bodyDrive: app.animator?.bodyDrive,
                active: !!app.animPlayer?.active
            });
        };
        sampleOnce();
        await new Promise((resolve) => {
            const id = setInterval(() => {
                sampleOnce();
                if (performance.now() - wall0 >= waitMs) {
                    clearInterval(id);
                    sampleOnce();
                    resolve();
                }
            }, 250);
        });

        app.stepSimulation = origStep;
        const act = app.animPlayer?.actions?.get?.(app.animPlayer.currentId);
        return {
            phase: 'metrics-only-wall-wait',
            wallElapsedMs: performance.now() - wall0,
            rafCount,
            animateCalls,
            samples,
            actionTime0,
            actionTime1: act?.time ?? null,
            mixer0,
            mixer1: app.animPlayer?.mixer?.time ?? null,
            stepCallsOutsideAnimate: stepCallsFromProbe,
            anim: app.animPlayer?.diagnostics?.(),
            bodyDrive: app.animator?.bodyDrive,
            idlePaused: !!app.idlePaused
        };
    }, WAIT_MS);

    // Phase B: CDP screencast while app rAF runs (no page.evaluate toDataURL starvation)
    const frameDir = path.join(OUT, 'qa-normal-raf-frames');
    fs.rmSync(frameDir, { recursive: true, force: true });
    fs.mkdirSync(frameDir, { recursive: true });
    const cdp2 = await page.createCDPSession();
    let capIdx = 0;
    let lastFrameAt = 0;
    const minFrameGap = 1000 / CAP_FPS;
    const videoWall0 = Date.now();
    const onFrame = async (params) => {
        try {
            await cdp2.send('Page.screencastFrameAck', { sessionId: params.sessionId });
        } catch {
            /* ignore */
        }
        const now = Date.now();
        if (now - lastFrameAt < minFrameGap) return;
        lastFrameAt = now;
        const idx = capIdx++;
        fs.writeFileSync(
            path.join(frameDir, `f${String(idx).padStart(4, '0')}.jpg`),
            Buffer.from(params.data, 'base64')
        );
    };
    cdp2.on('Page.screencastFrame', onFrame);
    await cdp2.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 70,
        maxWidth: 1280,
        maxHeight: 800,
        everyNthFrame: 1
    });
    await sleep(WAIT_MS);
    try {
        await cdp2.send('Page.stopScreencast');
    } catch {
        /* ignore */
    }
    cdp2.off('Page.screencastFrame', onFrame);
    const videoWallElapsedMs = Date.now() - videoWall0;

    const captureResult = {
        phaseA: 'metrics-only-wall-wait',
        phaseB: 'cdp-screencast',
        samples: metricResult.samples,
        actionTime0: metricResult.actionTime0,
        actionTime1: metricResult.actionTime1,
        mixer0: metricResult.mixer0,
        mixer1: metricResult.mixer1,
        stepCallsOutsideAnimate: metricResult.stepCallsOutsideAnimate,
        anim: metricResult.anim,
        bodyDrive: metricResult.bodyDrive,
        idlePaused: metricResult.idlePaused,
        metricWallElapsedMs: metricResult.wallElapsedMs,
        metricRafCount: metricResult.rafCount,
        animateCalls: metricResult.animateCalls,
        wallElapsedMs: videoWallElapsedMs,
        frameCount: capIdx,
        rafCount: metricResult.rafCount
    };

    const wallEnd = Date.now();
    await page.screenshot({ path: path.join(OUT, 'qa-normal-raf-tend.png'), type: 'png' });
    await page.screenshot({
        path: path.join(OUT, 'qa-normal-raf-arms-close.png'),
        clip: { x: 380, y: 280, width: 420, height: 380 }
    });

    // Side view still (camera only — no stepSimulation)
    await page.evaluate(() => {
        window.app.params.eye.x = -0.1;
        window.app.updateProjection();
    });
    await sleep(400);
    await page.screenshot({ path: path.join(OUT, 'qa-normal-raf-side.png'), type: 'png' });
    await page.evaluate(() => {
        window.app.params.eye.x = -0.02;
        window.app.updateProjection();
    });

    // Feature retention: scene room↔minimal, model pixiv↔wenjing, settings persist keys
    const featureChecks = await page.evaluate(async () => {
        const app = window.app;
        const out = { scene: {}, model: {}, persist: {} };
        const startScene = app.sceneMode;
        app.setSceneMode('minimal');
        out.scene.afterMinimal = app.sceneMode;
        app.setSceneMode('room');
        out.scene.afterRoom = app.sceneMode;
        out.scene.restored = app.sceneMode === 'room' && startScene;

        const beforeModel = app.modelName;
        // pixiv sample
        try {
            await app.loadVRM('./models/minimal-avatar.vrm');
            out.model.pixivReady = !!window.diagnostics?.ready;
            out.model.pixivName = app.modelName;
            out.model.pixivMeta = app.metaVersion;
        } catch (e) {
            out.model.pixivError = String(e);
        }
        try {
            await app.loadVRM('./models/wenjing.vrm');
            out.model.wenjingReady = !!window.diagnostics?.ready;
            out.model.wenjingName = app.modelName;
            out.model.wenjingMeta = app.metaVersion;
            out.model.authoredAfterReload = app.animPlayer?.diagnostics?.();
            out.model.bodyDrive = app.animator?.bodyDrive;
        } catch (e) {
            out.model.wenjingError = String(e);
        }
        out.model.switched = beforeModel;

        const raw = localStorage.getItem('vrm-desktop-settings') || localStorage.getItem('metaflow-vrm-desktop') || '';
        out.persist.hasSettings = !!raw;
        out.persist.keys = Object.keys(localStorage);
        out.persist.sceneModeInSettings = app.settings?.sceneMode;
        out.persist.hasFullscreenHelpers =
            typeof app.beginFullscreenCalibration === 'function' ||
            typeof app.enterFullscreenCalibration === 'function' ||
            typeof app.startFullscreenCalibration === 'function' ||
            !!document.getElementById('fullscreenBtn') ||
            !!document.querySelector('[id*="fullscreen"], [id*="Fullscreen"]');
        // UI presence
        out.persist.fullscreenButton =
            !!document.getElementById('btnFullscreen') ||
            !!document.getElementById('fullscreenCalibrate') ||
            Array.from(document.querySelectorAll('button')).some((b) => /全屏/.test(b.textContent || ''));
        return out;
    });

    const mp4 = path.join(OUT, 'qa-normal-raf-idle-motion.mp4');
    const nFrames = fs.readdirSync(frameDir).filter((f) => f.endsWith('.jpg')).length;
    if (nFrames < 10) {
        console.warn(`screencast sparse (${nFrames}); falling back to timed puppeteer jpeg`);
        fs.rmSync(frameDir, { recursive: true, force: true });
        fs.mkdirSync(frameDir, { recursive: true });
        const t0 = Date.now();
        let i = 0;
        while (Date.now() - t0 < WAIT_MS) {
            await page.screenshot({
                path: path.join(frameDir, `f${String(i).padStart(4, '0')}.jpg`),
                type: 'jpeg',
                quality: 70
            });
            i++;
            await sleep(Math.max(0, 1000 / CAP_FPS - 20));
        }
        captureResult.frameCount = i;
        captureResult.phaseB = 'puppeteer-jpeg-interval-fallback';
    } else {
        captureResult.frameCount = nFrames;
    }
    spawnSync(
        'ffmpeg',
        [
            '-y',
            '-framerate',
            String(CAP_FPS),
            '-i',
            path.join(frameDir, 'f%04d.jpg'),
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            '-movflags',
            '+faststart',
            mp4
        ],
        { stdio: 'inherit' }
    );

    const samples = captureResult.samples || [];
    const rotRange = (key, axis) => {
        const vals = samples.map((s) => s?.[key]?.[axis]).filter((v) => typeof v === 'number');
        if (!vals.length) return 0;
        return Math.max(...vals) - Math.min(...vals);
    };
    const chestRange = rotRange('chest', 'x');
    const hipsRange = Math.max(rotRange('hips', 'y'), rotRange('hips', 'z'));
    const minLeft = Math.min(...samples.map((s) => s.leftClear || 0));
    const minRight = Math.min(...samples.map((s) => s.rightClear || 0));
    const footYs = samples.map((s) => s.footY).filter((v) => typeof v === 'number');
    const footDrift = footYs.length ? Math.max(...footYs) - Math.min(...footYs) : 0;
    const alwaysAuthored = samples.every((s) => s.bodyDrive === 'authored' && s.active);
    // Looping clip: action.time wraps — integrate positive deltas from phase-A samples
    let actionAdvance = 0;
    for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1].actionTime;
        const b = samples[i].actionTime;
        if (typeof a === 'number' && typeof b === 'number') {
            actionAdvance += b >= a ? b - a : b; // wrap
        }
    }
    const mixerAdvance =
        captureResult.mixer1 != null && captureResult.mixer0 != null
            ? captureResult.mixer1 - captureResult.mixer0
            : null;
    // Phase A wall clock is the authoritative real-time wait
    const wallSec = (captureResult.metricWallElapsedMs || captureResult.wallElapsedMs || 0) / 1000;

    const report = {
        objective: 'normal-rAF playback QA (no forced stepSimulation)',
        zipSha256: zipSha,
        expectZip: EXPECT_ZIP,
        tipCommit: 'f85a06a1d67ae0706eff29280278d573a183f5bd',
        pageUrl,
        hygiene,
        ready,
        probe0,
        capture: {
            method: 'phaseA:wall-wait+setInterval samples; phaseB:CDP screencast (no stepSimulation)',
            waitMs: WAIT_MS,
            encodeFps: CAP_FPS,
            metricWallElapsedMs: captureResult.metricWallElapsedMs,
            videoWallElapsedMs: captureResult.wallElapsedMs,
            wallElapsedSec: wallSec,
            metricRafCount: captureResult.metricRafCount,
            animateCallsDuringMetrics: captureResult.animateCalls,
            frameCount: captureResult.frameCount,
            phaseB: captureResult.phaseB,
            actionTime0: captureResult.actionTime0,
            actionTime1: captureResult.actionTime1,
            actionAdvanceSec: actionAdvance,
            mixer0: captureResult.mixer0,
            mixer1: captureResult.mixer1,
            mixerAdvanceSec: mixerAdvance,
            wallVsAnimRatio: actionAdvance > 0 && wallSec > 0 ? actionAdvance / wallSec : null,
            stepCallsOutsideAnimate: captureResult.stepCallsOutsideAnimate,
            note: 'Metrics from undisturbed wall wait on normal app.animate←rAF; video via CDP screencast without forced step'
        },
        motion: {
            chestRange,
            hipsRange,
            minLeftClear: minLeft,
            minRightClear: minRight,
            footYDrift: footDrift,
            alwaysAuthored,
            sampleCount: samples.length
        },
        featureChecks,
        checks: {
            zipExact: zipSha === EXPECT_ZIP,
            noProductQaHud: !hygiene.hasQaTimeHudInProduct,
            noUrlFlags: !hygiene.hasUrlSearchParamsHook && !/\?/.test(pageUrl.split(PORT)[1] || ''),
            noForcedStep: (captureResult.stepCallsOutsideAnimate || 0) === 0,
            authoredActive: alwaysAuthored,
            // Headless can still under-schedule rAF; require >=70% wall or strong animate tick count
            animAdvancesWithWall:
                actionAdvance > wallSec * 0.7 ||
                (mixerAdvance != null && mixerAdvance > wallSec * 0.7) ||
                (captureResult.animateCalls || 0) > wallSec * 30,
            motionVisible: chestRange > 0.03 || hipsRange > 0.02,
            armsClear: minLeft > 0.05 && minRight > 0.05,
            feetStable: footDrift < 0.05,
            sceneSwitch: featureChecks.scene?.afterMinimal === 'minimal' && featureChecks.scene?.afterRoom === 'room',
            modelSwitch:
                !!featureChecks.model?.pixivReady &&
                !!featureChecks.model?.wenjingReady &&
                (featureChecks.model?.wenjingMeta === '0' || /wenjing/i.test(featureChecks.model?.wenjingName || '')),
            fullscreenUiPresent: !!featureChecks.persist?.fullscreenButton,
            mp4: fs.existsSync(mp4),
            pageErrors: pageErrors.length === 0
        },
        pageErrors,
        shots: {
            t0: path.join(OUT, 'qa-normal-raf-t0.png'),
            tend: path.join(OUT, 'qa-normal-raf-tend.png'),
            arms: path.join(OUT, 'qa-normal-raf-arms-close.png'),
            side: path.join(OUT, 'qa-normal-raf-side.png'),
            mp4
        },
        licensing: {
            chatvrm: 'MIT (pixiv/ChatVRM idle_loop.vrma) — notices in ATTRIBUTIONS.md + animations/LICENSE-ChatVRM-MIT.txt',
            accad: 'CC BY 3.0 — notices in ATTRIBUTIONS.md + animations/README-ACCAD.md',
            newAssets: false
        }
    };
    report.pass = Object.values(report.checks).every(Boolean);
    fs.writeFileSync(path.join(OUT, 'qa-normal-raf-report.json'), JSON.stringify(report, null, 2));
    const summary = {
        pass: report.pass,
        zipSha256: zipSha,
        checks: report.checks,
        capture: report.capture,
        motion: report.motion,
        pageErrors
    };
    fs.writeFileSync(path.join(OUT, 'qa-normal-raf-SUMMARY.txt'), JSON.stringify(summary, null, 2) + '\n');
    console.log(JSON.stringify(summary, null, 2));

    await browser.close();
    server.close();
    if (!report.pass) process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
