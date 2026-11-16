/**
 * Prove mesh soles stay on floor for every autoPlaylist clip (Wenjing + pixiv,
 * minimal + room). Also captures mid-clip stills and a short normal-rAF video.
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
const EXTRACT = '/tmp/vrm-floor-contact';
const PORT = 8825;
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

/** Canvas capture avoids Puppeteer Page.captureScreenshot GPU timeouts. */
async function saveCanvasJpeg(page, dest, quality = 0.72) {
    const dataUrl = await page.evaluate((q) => {
        const app = window.app;
        const c = document.querySelector('canvas');
        if (!c || !app?.renderer) return null;
        // Force a present so toDataURL is not an empty cleared buffer.
        app.renderer.render(app.scene, app.camera);
        return c.toDataURL('image/jpeg', q);
    }, quality);
    if (!dataUrl) throw new Error(`no canvas for ${dest}`);
    fs.writeFileSync(dest, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

async function measureClip(page, id) {
    return page.evaluate(async (clipId) => {
        const THREE = window.THREE;
        const app = window.app;
        app.setAnimAutoCycle?.(false, { persist: false });
        await app.applyAnimClip(clipId, { persist: false, manual: true });
        const clip = app.animPlayer.clips.get(clipId);
        const dur = Math.min(Math.max(clip?.duration || 3, 2), 5);
        const errs = [];
        const soleYs = [];
        for (let t = 0; t < dur; t += 0.5) {
            for (let i = 0; i < 12; i++) app.stepSimulation(1 / 30);
            app.vrm.scene.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(app.vrm.scene);
            const contact = app._floorContactWorldY;
            // Not sunk below floor; allow small lift band (SOLE_LIFT≈0.0035 + estimator slack).
            const err = box.min.y - contact;
            errs.push(err);
            soleYs.push(box.min.y);
        }
        const minSole = Math.min(...soleYs);
        const maxSole = Math.max(...soleYs);
        const sunk = errs.filter((e) => e < -0.0008).length;
        const hover = errs.filter((e) => e > 0.012).length;
        const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
        return {
            id: clipId,
            minSoleAboveContact: +Math.min(...errs).toFixed(5),
            maxSoleAboveContact: +Math.max(...errs).toFixed(5),
            meanSoleAboveContact: +mean.toFixed(5),
            soleYRange: +(maxSole - minSole).toFixed(5),
            sunkSamples: sunk,
            hoverSamples: hover,
            passFloor: sunk === 0 && hover === 0 && Math.min(...errs) >= -0.0008 && Math.max(...errs) <= 0.012,
            contactY: app._floorContactWorldY
        };
    }, id);
}

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    const zipSha = sha256(ZIP);
    await extract();
    const server = await serve(EXTRACT);
    const browser = await puppeteer.launch({
        headless: 'new',
        protocolTimeout: 120000,
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
    await page.setViewport({ width: 960, height: 600, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitReady(page);
    await page.evaluate(() => window.app.setSuspendRafSimulation?.(true));

    const playlist = await page.evaluate(() => window.app.animPlayer.playlistIds());
    const report = { zipSha256: zipSha, playlist, matrices: {} };

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

        const rows = [];
        for (const id of playlist) {
            const r = await measureClip(page, id);
            rows.push(r);
            // Stills only for key clips (canvas encode is expensive under SwiftShader)
            if (['chatvrm-idle', 'quat-idle', 'accad-wait', 'accad-conversation'].includes(id)) {
                await saveCanvasJpeg(page, path.join(OUT, `floor-${scene}-${id}.jpg`), 0.65);
            }
            console.log(JSON.stringify({ scene, model: 'wenjing', ...r }));
        }
        report.matrices[`wenjing-${scene}`] = rows;
    }

    // pixiv spot — all clips measured; stills for sink-risk ids
    await page.evaluate(() => {
        const sel = document.getElementById('sceneMode');
        if (sel) {
            sel.value = 'minimal';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        window.app.setSceneMode?.('minimal');
    });
    await page.evaluate(async () => {
        await window.app.loadSampleModel();
    });
    await waitReady(page);
    await page.evaluate(() => window.app.setSuspendRafSimulation?.(true));
    const pixivRows = [];
    for (const id of playlist) {
        const r = await measureClip(page, id);
        pixivRows.push(r);
        if (['chatvrm-idle', 'quat-idle', 'accad-wait'].includes(id)) {
            await saveCanvasJpeg(page, path.join(OUT, `floor-pixiv-${id}.jpg`), 0.65);
        }
        console.log(JSON.stringify({ scene: 'minimal', model: 'pixiv', ...r }));
    }
    report.matrices['pixiv-minimal'] = pixivRows;

    // Normal-rAF transition video (resume rAF, short auto cycle)
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
    for (let i = 0; i < 24; i++) {
        await sleep(350);
        await saveCanvasJpeg(page, path.join(frameDir, `f${String(i).padStart(4, '0')}.jpg`), 0.5);
    }
    const mp4 = path.join(OUT, 'floor-contact-normal-raf.mp4');
    spawnSync(
        'ffmpeg',
        [
            '-y',
            '-framerate',
            '5',
            '-i',
            path.join(frameDir, 'f%04d.jpg'),
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            mp4
        ],
        { stdio: 'inherit' }
    );

    const allRows = Object.values(report.matrices).flat();
    report.checks = {
        playlistEight: playlist.length === 8,
        allFloorPass: allRows.every((r) => r.passFloor),
        mp4: fs.existsSync(mp4)
    };
    report.pass = Object.values(report.checks).every(Boolean);
    fs.writeFileSync(path.join(OUT, 'floor-contact-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ pass: report.pass, checks: report.checks, zipSha256: zipSha }, null, 2));

    await browser.close();
    server.close();
    if (!report.pass) process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
