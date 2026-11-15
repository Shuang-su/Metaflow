/**
 * QA natural pose + room scene from ZIP over plain HTTP.
 * Captures before/after-style shots, 60s idle, model/scene switch, arm metrics.
 */
import fs from 'fs';
import path from 'path';
import http from 'http';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import puppeteer from 'puppeteer';

const ZIP = '/opt/cursor/artifacts/metaflow-desktop-preview.zip';
const OUT = '/opt/cursor/artifacts';
const EXTRACT = '/tmp/vrm-desktop-natural';
const PORT = 8796;

function sha256(p) {
    return createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

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
    return page.evaluate(() => window.diagnostics || { timeout: true });
}

async function armMetrics(page) {
    return page.evaluate(() => {
        const app = window.app;
        const h = app?.vrm?.humanoid;
        if (!h) return null;
        const L = h.getNormalizedBoneNode('leftUpperArm');
        const R = h.getNormalizedBoneNode('rightUpperArm');
        const Ll = h.getNormalizedBoneNode('leftLowerArm');
        const elbow = Ll ? Math.abs(Ll.rotation.x) : null;
        // Approximate hang: |z| of upper arm euler from quat
        const fold = (node) => {
            if (!node) return null;
            const e = new window.THREE.Euler().setFromQuaternion(node.quaternion, 'XYZ');
            return { x: e.x, y: e.y, z: e.z, absZ: Math.abs(e.z) };
        };
        return {
            left: fold(L),
            right: fold(R),
            elbowAbsX: elbow,
            poseStyle: window.diagnostics?.poseStyle,
            armFoldRad: window.diagnostics?.armFoldRad,
            sceneMode: app.sceneMode,
            springsActive: app.springsActive
        };
    });
}

async function main() {
    if (!fs.existsSync(ZIP)) throw new Error('missing zip — run build.mjs first');
    const zipSha = sha256(ZIP);
    await extractZip();
    for (const f of ['environment.mjs', 'app.mjs', 'vrm-pose.mjs', 'models/wenjing.vrm']) {
        if (!fs.existsSync(path.join(EXTRACT, f))) throw new Error(`ZIP missing ${f}`);
    }
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
    const logs = [];
    const pageErrors = [];
    const page = await browser.newPage();
    page.on('console', (m) => {
        if (m.type() === 'error') logs.push(m.text());
    });
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

    // Clean load — room + natural pose
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    const ready = await waitReady(page);
    const arms0 = await armMetrics(page);
    await page.screenshot({ path: path.join(OUT, 'qa-natural-room-full.png'), fullPage: false });

    // Close crop of arms (viewport already full; also click nothing — use clip)
    await page.screenshot({
        path: path.join(OUT, 'qa-natural-arms-close.png'),
        clip: { x: 280, y: 220, width: 420, height: 380 }
    });

    // Minimal scene switch
    await page.select('#sceneMode', 'minimal');
    await sleep(600);
    await page.screenshot({ path: path.join(OUT, 'qa-natural-minimal.png'), fullPage: false });
    await page.select('#sceneMode', 'room');
    await sleep(600);

    // Sample model then back
    await page.click('#loadSampleModel');
    let sample = null;
    const tS = Date.now();
    while (Date.now() - tS < 90000) {
        sample = await page.evaluate(() => window.diagnostics);
        if (sample?.ready && /VRM1|Constraint/i.test(sample.modelName || '')) break;
        await sleep(400);
    }
    await page.screenshot({ path: path.join(OUT, 'qa-natural-pixiv-room.png'), fullPage: false });
    await page.click('#loadDefaultModel');
    const tB = Date.now();
    while (Date.now() - tB < 90000) {
        const d = await page.evaluate(() => window.diagnostics);
        if (d?.ready && /Wenjing/i.test(d.modelName || '')) break;
        await sleep(400);
    }
    await page.screenshot({ path: path.join(OUT, 'qa-natural-wenjing-back.png'), fullPage: false });

    // Fullscreen enter for composition shot
    await page.evaluate(async () => {
        try {
            await document.getElementById('canvas-container').requestFullscreen();
        } catch { /* */ }
    });
    await sleep(800);
    await page.screenshot({ path: path.join(OUT, 'qa-natural-fullscreen.png'), fullPage: false });
    await page.evaluate(async () => {
        if (document.fullscreenElement) {
            try { await document.exitFullscreen(); } catch { /* */ }
        }
    });

    // Mobile
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitReady(page);
    await page.screenshot({ path: path.join(OUT, 'qa-natural-mobile.png'), fullPage: false });

    // Desktop idle 60s
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitReady(page);
    const armsBeforeIdle = await armMetrics(page);
    await sleep(60000);
    const armsAfterIdle = await armMetrics(page);
    await page.screenshot({ path: path.join(OUT, 'qa-natural-idle-60s.png'), fullPage: false });

    // Record short motion evidence via CDP screencast-ish: capture frames then ffmpeg
    // Simpler: use puppeteer to grab 3 frames over 2s for parent — plus optional mp4 if ffmpeg works
    const frameDir = path.join(OUT, 'qa-natural-frames');
    fs.rmSync(frameDir, { recursive: true, force: true });
    fs.mkdirSync(frameDir, { recursive: true });
    for (let i = 0; i < 24; i++) {
        await page.screenshot({ path: path.join(frameDir, `f${String(i).padStart(3, '0')}.png`) });
        await sleep(250);
    }
    const mp4 = path.join(OUT, 'qa-natural-idle-motion.mp4');
    await new Promise((resolve) => {
        const ff = spawn(
            'ffmpeg',
            ['-y', '-framerate', '4', '-i', path.join(frameDir, 'f%03d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4],
            { stdio: 'inherit' }
        );
        ff.on('exit', () => resolve());
    });

    const report = {
        zip: ZIP,
        zipSha256: zipSha,
        baseUrl: base,
        ready,
        arms0,
        armsBeforeIdle,
        armsAfterIdle,
        sampleModel: sample?.modelName || null,
        pageErrors,
        consoleErrors: logs.slice(0, 30),
        naturalArms:
            !!arms0 &&
            arms0.left?.absZ > 1.15 &&
            arms0.right?.absZ > 1.15 &&
            arms0.elbowAbsX > 0.25,
        idleStable:
            !!armsAfterIdle &&
            Math.abs((armsAfterIdle.left?.absZ || 0) - (armsBeforeIdle.left?.absZ || 0)) < 0.08,
        shots: {
            room: path.join(OUT, 'qa-natural-room-full.png'),
            arms: path.join(OUT, 'qa-natural-arms-close.png'),
            minimal: path.join(OUT, 'qa-natural-minimal.png'),
            fullscreen: path.join(OUT, 'qa-natural-fullscreen.png'),
            mobile: path.join(OUT, 'qa-natural-mobile.png'),
            idle60: path.join(OUT, 'qa-natural-idle-60s.png'),
            motionMp4: fs.existsSync(mp4) ? mp4 : null
        },
        pass: false
    };
    report.pass =
        !!ready?.ready &&
        report.naturalArms &&
        report.idleStable &&
        pageErrors.length === 0 &&
        ready?.sceneMode === 'room';

    fs.writeFileSync(path.join(OUT, 'qa-natural-scene-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        pass: report.pass,
        zipSha256: zipSha,
        poseStyle: ready?.poseStyle,
        armFoldRad: ready?.armFoldRad,
        leftAbsZ: arms0?.left?.absZ,
        elbowAbsX: arms0?.elbowAbsX,
        sceneMode: ready?.sceneMode,
        naturalArms: report.naturalArms,
        idleStable: report.idleStable,
        pageErrors,
        mp4: report.shots.motionMp4
    }, null, 2));

    await browser.close();
    server.close();
    if (!report.pass) process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
