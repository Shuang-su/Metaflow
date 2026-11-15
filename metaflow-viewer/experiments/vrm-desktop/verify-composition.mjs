/**
 * Composition QA: visible arms beside hips, in-frame room props, perceptible idle.
 * Serves ZIP over plain HTTP; fails if hands buried or props off-screen.
 */
import fs from 'fs';
import path from 'path';
import http from 'http';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import puppeteer from 'puppeteer';

const ZIP = '/opt/cursor/artifacts/metaflow-desktop-preview.zip';
const OUT = '/opt/cursor/artifacts';
const EXTRACT = '/tmp/vrm-desktop-comp';
const PORT = 8798;

const sha256 = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractZip() {
    fs.rmSync(EXTRACT, { recursive: true, force: true });
    fs.mkdirSync(EXTRACT, { recursive: true });
    return new Promise((resolve, reject) => {
        const c = spawn('unzip', ['-qo', ZIP, '-d', EXTRACT], { stdio: 'inherit' });
        c.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`unzip ${code}`))));
    });
}

function serve() {
    const root = EXTRACT;
    const ct = (f) => {
        if (f.endsWith('.html')) return 'text/html; charset=utf-8';
        if (f.endsWith('.mjs') || f.endsWith('.js')) return 'text/javascript; charset=utf-8';
        if (f.endsWith('.vrm')) return 'model/gltf-binary';
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

async function waitReady(page, timeout = 90000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
        const d = await page.evaluate(() => window.diagnostics || null);
        if (d?.ready) return d;
        if (d?.error && !d?.loading) return d;
        await sleep(400);
    }
    return { timeout: true };
}

async function propNdc(page) {
    return page.evaluate(() => {
        const app = window.app;
        const markers = app?.envRoot?.userData?.propMarkers;
        if (!markers || !app.camera) return null;
        const THREE = window.THREE;
        const out = {};
        for (const [k, p] of Object.entries(markers)) {
            const v = new THREE.Vector3(p.x, p.y, p.z);
            app.deskRoot.localToWorld(v);
            v.project(app.camera);
            out[k] = { x: v.x, y: v.y, z: v.z, inView: Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95 && v.z < 1 };
        }
        return out;
    });
}

async function handNdc(page) {
    return page.evaluate(() => {
        const app = window.app;
        const h = app?.vrm?.humanoid;
        if (!h) return null;
        const THREE = window.THREE;
        const proj = (name) => {
            const n = h.getNormalizedBoneNode(name);
            if (!n) return null;
            const v = new THREE.Vector3();
            n.getWorldPosition(v);
            v.project(app.camera);
            return { x: v.x, y: v.y, z: v.z };
        };
        const lh = proj('leftHand');
        const rh = proj('rightHand');
        const hips = proj('hips');
        const leftClear = lh && hips ? Math.abs(lh.x - hips.x) : 0;
        const rightClear = rh && hips ? Math.abs(rh.x - hips.x) : 0;
        const opposite =
            lh && rh && hips
                ? (lh.x - hips.x) * (rh.x - hips.x) < 0
                : false;
        return {
            leftHand: lh,
            rightHand: rh,
            hips,
            leftClear,
            rightClear,
            opposite,
            // Both hands laterally clear of hip center and on opposite sides
            leftOutside: leftClear > 0.045,
            rightOutside: rightClear > 0.045 && opposite
        };
    });
}

async function main() {
    if (!fs.existsSync(ZIP)) throw new Error('missing zip');
    const zipSha = sha256(ZIP);
    await extractZip();
    const server = await serve();
    const base = `http://127.0.0.1:${PORT}/`;

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

    // Prefer no reduced-motion
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.evaluate(() => {
        localStorage.clear();
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    const ready = await waitReady(page);

    // Force idle unpaused
    await page.evaluate(() => {
        if (window.app) {
            window.app.idlePaused = false;
            window.app.animator?.setPaused(false);
            const el = document.getElementById('idlePaused');
            if (el) el.checked = false;
        }
    });

    const silhouette = ready?.silhouette || null;
    const hands = await handNdc(page);
    const props = await propNdc(page);

    await page.screenshot({ path: path.join(OUT, 'qa-comp-room-full.png'), fullPage: false });
    // Arms close-up: middle of character
    await page.screenshot({
        path: path.join(OUT, 'qa-comp-arms-close.png'),
        clip: { x: 220, y: 240, width: 500, height: 380 }
    });

    // Side-ish: nudge eye X for lateral read of arms
    await page.evaluate(() => {
        window.app.params.eye.x = -0.08;
        window.app.updateProjection();
    });
    await sleep(300);
    await page.screenshot({ path: path.join(OUT, 'qa-comp-arms-side.png'), fullPage: false });
    await page.evaluate(() => {
        window.app.params.eye.x = -0.02;
        window.app.updateProjection();
    });

    // Fullscreen
    await page.evaluate(async () => {
        try { await document.getElementById('canvas-container').requestFullscreen(); } catch { /* */ }
    });
    await sleep(700);
    await page.screenshot({ path: path.join(OUT, 'qa-comp-fullscreen.png'), fullPage: false });
    await page.evaluate(async () => {
        if (document.fullscreenElement) {
            try { await document.exitFullscreen(); } catch { /* */ }
        }
    });

    // Mobile
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await waitReady(page);
    await page.evaluate(() => {
        window.app.idlePaused = false;
        window.app.animator?.setPaused(false);
    });
    await page.screenshot({ path: path.join(OUT, 'qa-comp-mobile.png'), fullPage: false });

    // Desktop 20s motion capture @ 8fps
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await waitReady(page);
    await page.evaluate(() => {
        window.app.idlePaused = false;
        window.app.animator?.setPaused(false);
        // Reset phases so first frames show motion from mid-cycle
        if (window.app.animator) {
            window.app.animator.breathingPhase = 0;
            window.app.animator.weightPhase = 0;
            window.app.animator.blinkTimer = 1.9;
            window.app.animator.blinkInterval = 2.0;
        }
    });

    const frameDir = path.join(OUT, 'qa-comp-frames');
    fs.rmSync(frameDir, { recursive: true, force: true });
    fs.mkdirSync(frameDir, { recursive: true });
    const motionSamples = [];
    const nFrames = 160; // 20s @ 8fps
    for (let i = 0; i < nFrames; i++) {
        await page.screenshot({ path: path.join(frameDir, `f${String(i).padStart(4, '0')}.png`) });
        if (i % 8 === 0) {
            const m = await page.evaluate(() => window.app?.animator?.getMotionDiagnostics?.() || null);
            motionSamples.push(m);
        }
        await sleep(125);
    }
    const mp4 = path.join(OUT, 'qa-comp-idle-motion.mp4');
    await new Promise((resolve) => {
        const ff = spawn(
            'ffmpeg',
            ['-y', '-framerate', '8', '-i', path.join(frameDir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4],
            { stdio: 'inherit' }
        );
        ff.on('exit', () => resolve());
    });

    const chestPeak = Math.max(...motionSamples.map((m) => Math.abs(m?.chestDelta || 0)));
    const hipsPeak = Math.max(...motionSamples.map((m) => Math.abs(m?.hipsDelta || 0)));
    const blinks = motionSamples[motionSamples.length - 1]?.blinkCount || 0;
    const everPaused = motionSamples.some((m) => m?.paused);
    const reduced = motionSamples.some((m) => m?.reducedMotion);

    const propsInView = props && props.window?.inView && props.shelf?.inView && props.plant?.inView;
    const armsVisible = !!(hands?.leftOutside && hands?.rightOutside);
    const idleAlive = chestPeak > 0.02 && hipsPeak > 0.008 && blinks >= 2 && !everPaused && !reduced;

    const report = {
        zipSha256: zipSha,
        ready: {
            modelName: ready?.modelName,
            poseStyle: ready?.poseStyle,
            armFoldRad: ready?.armFoldRad,
            sceneMode: ready?.sceneMode,
            silhouette
        },
        hands,
        props,
        motion: { chestPeak, hipsPeak, blinks, everPaused, reduced, samples: motionSamples.length },
        checks: {
            armsVisible,
            propsInView,
            idleAlive,
            pageErrors: pageErrors.length === 0
        },
        pass: armsVisible && propsInView && idleAlive && pageErrors.length === 0,
        shots: {
            room: path.join(OUT, 'qa-comp-room-full.png'),
            arms: path.join(OUT, 'qa-comp-arms-close.png'),
            side: path.join(OUT, 'qa-comp-arms-side.png'),
            fullscreen: path.join(OUT, 'qa-comp-fullscreen.png'),
            mobile: path.join(OUT, 'qa-comp-mobile.png'),
            motionMp4: fs.existsSync(mp4) ? mp4 : null
        }
    };

    fs.writeFileSync(path.join(OUT, 'qa-comp-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        pass: report.pass,
        zipSha256: zipSha,
        armsVisible,
        propsInView,
        idleAlive,
        hands,
        props,
        motion: report.motion,
        pageErrors
    }, null, 2));

    await browser.close();
    server.close();
    if (!report.pass) process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
