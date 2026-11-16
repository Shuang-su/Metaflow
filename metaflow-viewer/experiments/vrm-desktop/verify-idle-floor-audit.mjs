/**
 * Full per-clip audit: foot-floor contact + face-obscuring hands.
 * Samples each catalog autoPlaylist clip through its duration on Wenjing,
 * then spot-checks pixiv VRM1. Room + minimal scenes.
 */
import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const puppeteer = require('../../node_modules/puppeteer');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = '/opt/cursor/artifacts/idle-floor-audit';
const ZIP = '/opt/cursor/artifacts/metaflow-desktop-preview.zip';
const EXTRACT = '/tmp/vrm-idle-floor-audit';
const PORT = 8821;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractZip() {
    fs.rmSync(EXTRACT, { recursive: true, force: true });
    fs.mkdirSync(EXTRACT, { recursive: true });
    return new Promise((resolve, reject) => {
        const c = spawn('unzip', ['-qo', ZIP, '-d', EXTRACT], { stdio: 'inherit' });
        c.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`unzip ${code}`))));
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

async function setScene(page, mode) {
    await page.evaluate((m) => {
        const sel = document.getElementById('sceneMode');
        if (sel) {
            sel.value = m;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        window.app?.setSceneMode?.(m);
    }, mode);
    await sleep(200);
}

async function auditClip(page, id) {
    return page.evaluate(async (clipId) => {
        const THREE = window.THREE;
        const app = window.app;
        app.setAnimAutoCycle?.(false, { persist: false });
        await app.applyAnimClip(clipId, { persist: false, manual: true });
        const clip = app.animPlayer.clips.get(clipId);
        const duration = Math.max(1, clip?.duration || 4);
        // Sample ~12 points across one loop (cap long ACCAD wait)
        const sampleSec = Math.min(duration, 10);
        const steps = 8;
        const dt = sampleSec / steps;
        const samples = [];
        const tmp = new THREE.Vector3();
        const wp = (name) => {
            const n =
                app.vrm.humanoid.getNormalizedBoneNode(name) ||
                app.vrm.humanoid.getRawBoneNode(name);
            if (!n) return null;
            n.getWorldPosition(tmp);
            return { x: tmp.x, y: tmp.y, z: tmp.z };
        };
        for (let i = 0; i <= steps; i++) {
            for (let k = 0; k < Math.max(1, Math.round(dt * 30)); k++) {
                app.stepSimulation(1 / 30);
            }
            const head = wp('head');
            const lHand = wp('leftHand');
            const rHand = wp('rightHand');
            const lFoot = wp('leftFoot');
            const rFoot = wp('rightFoot');
            const contactY = app._floorContactWorldY;
            const footYs = [lFoot?.y, rFoot?.y].filter((v) => typeof v === 'number');
            const minFoot = footYs.length ? Math.min(...footYs) : null;
            const floorErr = minFoot != null && contactY != null ? minFoot - contactY : null;
            const handHead = (h) => {
                if (!h || !head) return null;
                const d = Math.hypot(h.x - head.x, h.y - head.y, h.z - head.z);
                const inFront = h.z > head.z - 0.01; // toward camera-ish in room
                const coversFace = d < 0.045 && h.y > head.y - 0.03;
                return { d, coversFace, inFront };
            };
            const lh = handHead(lHand);
            const rh = handHead(rHand);
            samples.push({
                t: +(i * dt).toFixed(2),
                floorErr,
                minFoot,
                contactY,
                leftHandHeadDist: lh?.d ?? null,
                rightHandHeadDist: rh?.d ?? null,
                leftCoversFace: !!lh?.coversFace,
                rightCoversFace: !!rh?.coversFace
            });
        }
        const floorErrs = samples.map((s) => s.floorErr).filter((v) => v != null);
        const maxAbsFloor = floorErrs.length
            ? Math.max(...floorErrs.map((v) => Math.abs(v)))
            : 99;
        const faceHits = samples.filter((s) => s.leftCoversFace || s.rightCoversFace).length;
        const faceHitRatio = faceHits / samples.length;
        const passFloor = maxAbsFloor < 0.008; // 8mm figurine-scale
        const passFace = faceHitRatio <= 0.2; // allow brief gestures
        return {
            id: clipId,
            duration,
            maxAbsFloorErr: +maxAbsFloor.toFixed(5),
            faceHitRatio: +faceHitRatio.toFixed(3),
            faceHits,
            sampleCount: samples.length,
            passFloor,
            passFace,
            pass: passFloor && passFace,
            samples
        };
    }, id);
}

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    if (!fs.existsSync(ZIP)) throw new Error('missing zip — build first');
    await extractZip();
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
    page.setDefaultTimeout(180000);
    await page.setViewport({ width: 1100, height: 700, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitReady(page);
    await page.evaluate(() => {
        window.app.setSuspendRafSimulation?.(true);
        window.app.setAnimAutoCycle?.(false, { persist: false });
    });

    const playlist = await page.evaluate(() => window.app.animPlayer.playlistIds());
    const report = { playlist, scenes: {} };

    for (const scene of ['minimal', 'room']) {
        await setScene(page, scene);
        // reload wenjing to reset transforms
        await page.evaluate(async () => {
            await window.app.loadDefaultModel();
        });
        await waitReady(page);
        await page.evaluate(() => window.app.setSuspendRafSimulation?.(true));

        const clipResults = [];
        for (const id of playlist) {
            const r = await auditClip(page, id);
            clipResults.push(r);
            // Screenshots only for failures + a few anchors (avoid protocol timeouts)
            const wantShot =
                !r.pass ||
                ['chatvrm-idle', 'quat-idle', 'accad-swing', 'accad-wait'].includes(id);
            if (wantShot) {
                try {
                    await page.screenshot({
                        path: path.join(OUT, `wenjing-${scene}-${id}.png`),
                        type: 'jpeg',
                        quality: 70
                    });
                } catch (e) {
                    console.warn('screenshot skip', id, e.message);
                }
            }
            console.log(
                JSON.stringify({
                    scene,
                    id,
                    pass: r.pass,
                    floor: r.maxAbsFloorErr,
                    face: r.faceHitRatio
                })
            );
        }
        report.scenes[scene] = { model: 'wenjing', clips: clipResults };
    }

    // pixiv VRM1 spot-check on minimal for failing-risk clips + defaults
    await setScene(page, 'minimal');
    await page.evaluate(async () => {
        await window.app.loadSampleModel();
    });
    await waitReady(page);
    await page.evaluate(() => window.app.setSuspendRafSimulation?.(true));
    const pixivIds = playlist.filter((id) =>
        ['chatvrm-idle', 'accad-wait', 'accad-swing', 'quat-idle', 'quat-fold', 'accad-urban'].includes(id)
    );
    const pixivResults = [];
    for (const id of pixivIds) {
        const r = await auditClip(page, id);
        pixivResults.push(r);
        try {
            await page.screenshot({
                path: path.join(OUT, `pixiv-minimal-${id}.png`),
                type: 'jpeg',
                quality: 70
            });
        } catch (e) {
            console.warn('pixiv shot skip', id, e.message);
        }
        console.log(JSON.stringify({ scene: 'minimal', model: 'pixiv', id, pass: r.pass, floor: r.maxAbsFloorErr, face: r.faceHitRatio }));
    }
    report.pixivMinimal = pixivResults;

    // Summarize drop recommendations
    const wenjingMinimal = report.scenes.minimal.clips;
    report.dropCandidates = wenjingMinimal.filter((c) => !c.pass).map((c) => ({
        id: c.id,
        reason: [
            !c.passFloor ? `floorErr=${c.maxAbsFloorErr}` : null,
            !c.passFace ? `faceHitRatio=${c.faceHitRatio}` : null
        ].filter(Boolean).join('; ')
    }));
    report.allPassWenjingMinimal = wenjingMinimal.every((c) => c.pass);
    report.allPassWenjingRoom = report.scenes.room.clips.every((c) => c.pass);

    fs.writeFileSync(path.join(OUT, 'audit-report.json'), JSON.stringify(report, null, 2));
    console.log('DROP', JSON.stringify(report.dropCandidates, null, 2));
    console.log('SUMMARY', JSON.stringify({
        allPassWenjingMinimal: report.allPassWenjingMinimal,
        allPassWenjingRoom: report.allPassWenjingRoom,
        dropCandidates: report.dropCandidates
    }, null, 2));

    await browser.close();
    server.close();
    if (report.dropCandidates.length && !report.allPassWenjingMinimal) {
        // non-zero so caller can decide — still wrote report
        process.exitCode = 2;
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
