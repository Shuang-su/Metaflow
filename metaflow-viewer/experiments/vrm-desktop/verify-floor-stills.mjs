/**
 * Fast visual stills + normal-rAF video after floor math already passed.
 * Forces renderer.render before canvas.toDataURL.
 */
import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn, spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const puppeteer = require('../../node_modules/puppeteer');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = '/opt/cursor/artifacts';
const ZIP = path.join(OUT, 'metaflow-desktop-preview.zip');
const EXTRACT = '/tmp/vrm-floor-stills';
const PORT = 8827;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');

async function extract() {
    fs.rmSync(EXTRACT, { recursive: true, force: true });
    fs.mkdirSync(EXTRACT, { recursive: true });
    await new Promise((res, rej) => {
        const c = spawn('unzip', ['-qo', ZIP, '-d', EXTRACT], { stdio: 'inherit' });
        c.on('exit', (code) => (code === 0 ? res() : rej(new Error(`unzip ${code}`))));
    });
}

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
    return new Promise((r) => server.listen(PORT, '127.0.0.1', () => r(server)));
}

async function waitReady(page, timeout = 120000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
        const d = await page.evaluate(() => window.diagnostics || null);
        if (d?.ready) return d;
        await sleep(400);
    }
    return { timeout: true };
}

async function saveCanvasJpeg(page, dest, quality = 0.78) {
    const dataUrl = await page.evaluate((q) => {
        const app = window.app;
        const c = document.querySelector('canvas');
        if (!c || !app?.renderer) return null;
        app.renderer.render(app.scene, app.camera);
        return c.toDataURL('image/jpeg', q);
    }, quality);
    if (!dataUrl) throw new Error(`no canvas for ${dest}`);
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    if (buf.length < 8000) throw new Error(`blank-ish capture ${dest} (${buf.length} B)`);
    fs.writeFileSync(dest, buf);
}

async function poseClip(page, id) {
    await page.evaluate(async (clipId) => {
        const app = window.app;
        app.setAnimAutoCycle?.(false, { persist: false });
        await app.applyAnimClip(clipId, { persist: false, manual: true });
        for (let i = 0; i < 45; i++) app.stepSimulation(1 / 30);
        app.groundFeetToFloor?.();
        app.renderer.render(app.scene, app.camera);
    }, id);
}

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    const zipSha = sha256(ZIP);
    await extract();
    const server = await serve(EXTRACT);
    const browser = await puppeteer.launch({
        headless: 'new',
        protocolTimeout: 180000,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-webgl',
            '--ignore-gpu-blocklist'
        ]
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1100, height: 700, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitReady(page);
    await page.evaluate(() => window.app.setSuspendRafSimulation?.(true));

    const playlist = await page.evaluate(() => window.app.animPlayer.playlistIds());
    const shots = [];

    for (const scene of ['minimal', 'room']) {
        await page.evaluate((m) => {
            const sel = document.getElementById('sceneMode');
            if (sel) {
                sel.value = m;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
            window.app.setSceneMode?.(m);
        }, scene);
        await page.evaluate(async () => {
            await window.app.loadDefaultModel();
        });
        await waitReady(page);
        await page.evaluate(() => window.app.setSuspendRafSimulation?.(true));

        for (const id of playlist) {
            await poseClip(page, id);
            const dest = path.join(OUT, `after-floor-${scene}-${id}.jpg`);
            await saveCanvasJpeg(page, dest);
            shots.push(dest);
            console.log('shot', scene, id, fs.statSync(dest).size);
        }
    }

    // pixiv quat-idle (was sunk)
    await page.evaluate(() => {
        window.app.setSceneMode?.('minimal');
        const sel = document.getElementById('sceneMode');
        if (sel) {
            sel.value = 'minimal';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    await page.evaluate(async () => {
        await window.app.loadSampleModel();
    });
    await waitReady(page);
    await page.evaluate(() => window.app.setSuspendRafSimulation?.(true));
    for (const id of ['quat-idle', 'chatvrm-idle', 'accad-wait']) {
        await poseClip(page, id);
        const dest = path.join(OUT, `after-floor-pixiv-${id}.jpg`);
        await saveCanvasJpeg(page, dest);
        shots.push(dest);
        console.log('shot pixiv', id, fs.statSync(dest).size);
    }

    // Normal-rAF video on Wenjing minimal
    await page.evaluate(async () => {
        await window.app.loadDefaultModel();
    });
    await waitReady(page);
    await page.evaluate(() => {
        window.app.setSuspendRafSimulation?.(false);
        window.app.setAnimAutoCycle?.(true, { persist: false });
        window.app.animPlayer.setQaDwellSec(3);
        window.app.applyAnimClip('chatvrm-idle', { persist: false });
    });
    const frameDir = path.join(OUT, 'floor-raf-frames');
    fs.rmSync(frameDir, { recursive: true, force: true });
    fs.mkdirSync(frameDir, { recursive: true });
    for (let i = 0; i < 30; i++) {
        await sleep(300);
        await saveCanvasJpeg(page, path.join(frameDir, `f${String(i).padStart(4, '0')}.jpg`), 0.6);
    }
    const mp4 = path.join(OUT, 'floor-contact-normal-raf.mp4');
    spawnSync(
        'ffmpeg',
        ['-y', '-framerate', '5', '-i', path.join(frameDir, 'f%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4],
        { stdio: 'inherit' }
    );

    const report = {
        zipSha256: zipSha,
        playlist,
        shots,
        mp4,
        mp4Bytes: fs.statSync(mp4).size,
        pass: shots.every((s) => fs.statSync(s).size > 8000) && fs.statSync(mp4).size > 20000
    };
    fs.writeFileSync(path.join(OUT, 'floor-stills-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
    server.close();
    if (!report.pass) process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
