/**
 * GPU QA: authored VRMA idle on Wenjing — not procedural relabel.
 * Serves local build OR DEPLOY_URL; captures screenshot + 12s MP4; checks mixer active.
 */
import fs from 'fs';
import path from 'path';
import http from 'http';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = '/opt/cursor/artifacts';
const ZIP = '/opt/cursor/artifacts/metaflow-desktop-preview.zip';
const EXTRACT = '/tmp/vrm-desktop-authored';
const PORT = 8799;
const DEPLOY_URL = process.env.DEPLOY_URL || null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');

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

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    let base;
    let server = null;
    let zipSha = null;
    if (DEPLOY_URL) {
        base = DEPLOY_URL.endsWith('/') ? DEPLOY_URL : DEPLOY_URL + '/';
    } else {
        if (!fs.existsSync(ZIP)) throw new Error('missing zip — run build.mjs first');
        zipSha = sha256(ZIP);
        await extractZip();
        server = await serve(EXTRACT);
        base = `http://127.0.0.1:${PORT}/`;
    }

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
    await page.setViewport({ width: 1280, height: 800 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    const ready = await waitReady(page);

    await page.evaluate(() => {
        window.app.idlePaused = false;
        window.app.animator?.setPaused(false);
        // Force ChatVRM authored idle
        return window.app.applyAnimClip?.('chatvrm-idle', { persist: false });
    });
    await sleep(800);

    const probe = await page.evaluate(() => {
        const app = window.app;
        const h = app?.vrm?.humanoid;
        const THREE = window.THREE;
        const proj = (name) => {
            const n = h?.getNormalizedBoneNode(name);
            if (!n) return null;
            const v = new THREE.Vector3();
            n.getWorldPosition(v);
            v.project(app.camera);
            return { x: v.x, y: v.y, z: v.z };
        };
        const lh = proj('leftHand');
        const rh = proj('rightHand');
        const hips = proj('hips');
        const head = proj('head');
        const lf = proj('leftFoot') || proj('leftToes');
        const rf = proj('rightFoot') || proj('rightToes');
        return {
            diagnostics: window.diagnostics,
            anim: app?.animPlayer?.diagnostics?.(),
            bodyDrive: app?.animator?.bodyDrive,
            leftClear: lh && hips ? Math.abs(lh.x - hips.x) : 0,
            rightClear: rh && hips ? Math.abs(rh.x - hips.x) : 0,
            headY: head?.y,
            feetY: [lf?.y, rf?.y],
            hipsPos: (() => {
                const n = h?.getNormalizedBoneNode('hips');
                return n ? { x: n.position.x, y: n.position.y, z: n.position.z } : null;
            })()
        };
    });

    await page.screenshot({ path: path.join(OUT, 'qa-authored-idle.png'), fullPage: false });

    // Sample ACCAD wait briefly
    await page.evaluate(() => window.app.applyAnimClip?.('accad-wait', { persist: false }));
    await sleep(600);
    await page.screenshot({ path: path.join(OUT, 'qa-authored-accad-wait.png'), fullPage: false });
    await page.evaluate(() => window.app.applyAnimClip?.('chatvrm-idle', { persist: false }));
    await sleep(400);

    // 12s motion @ 8fps — bone samples prove authored motion (chest/arm deltas)
    const frameDir = path.join(OUT, 'qa-authored-frames');
    fs.rmSync(frameDir, { recursive: true, force: true });
    fs.mkdirSync(frameDir, { recursive: true });
    const boneSamples = [];
    const nFrames = 96;
    for (let i = 0; i < nFrames; i++) {
        await page.screenshot({ path: path.join(frameDir, `f${String(i).padStart(4, '0')}.png`) });
        if (i % 4 === 0) {
            const s = await page.evaluate(() => {
                const h = window.app?.vrm?.humanoid;
                const q = (name) => {
                    const n = h?.getNormalizedBoneNode(name);
                    return n
                        ? {
                              x: n.rotation.x,
                              y: n.rotation.y,
                              z: n.rotation.z,
                              px: n.position.x,
                              pz: n.position.z
                          }
                        : null;
                };
                return {
                    chest: q('chest'),
                    hips: q('hips'),
                    leftUpperArm: q('leftUpperArm'),
                    rightUpperArm: q('rightUpperArm'),
                    anim: window.app?.animPlayer?.diagnostics?.(),
                    bodyDrive: window.app?.animator?.bodyDrive
                };
            });
            boneSamples.push(s);
        }
        await sleep(125);
    }
    const mp4 = path.join(OUT, 'qa-authored-idle-motion.mp4');
    await new Promise((resolve) => {
        const ff = spawn(
            'ffmpeg',
            ['-y', '-framerate', '8', '-i', path.join(frameDir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4],
            { stdio: 'inherit' }
        );
        ff.on('exit', () => resolve());
    });

    const rotRange = (key, axis) => {
        const vals = boneSamples.map((s) => s?.[key]?.[axis]).filter((v) => typeof v === 'number');
        if (!vals.length) return 0;
        return Math.max(...vals) - Math.min(...vals);
    };
    const chestRange = rotRange('chest', 'x');
    const armRange = Math.max(rotRange('leftUpperArm', 'z'), rotRange('rightUpperArm', 'z'));
    const hipsXZ = Math.max(
        ...boneSamples.map((s) => Math.hypot(s?.hips?.px || 0, s?.hips?.pz || 0))
    );
    const alwaysAuthored = boneSamples.every((s) => s?.bodyDrive === 'authored' && s?.anim?.active);

    const armsVisible = probe.leftClear > 0.03 && probe.rightClear > 0.03;
    const fullBody =
        probe.headY != null &&
        probe.headY < 0.95 &&
        probe.feetY?.[0] != null &&
        probe.feetY[0] > -0.98;

    const report = {
        zipSha256: zipSha,
        base,
        ready: {
            modelName: ready?.modelName,
            animClipId: ready?.animClipId,
            animMode: ready?.animMode
        },
        probe,
        motion: {
            chestRange,
            armRange,
            hipsXZPeak: hipsXZ,
            samples: boneSamples.length,
            alwaysAuthored
        },
        checks: {
            authoredActive: alwaysAuthored,
            motionNotStatic: chestRange > 0.01 || armRange > 0.02,
            armsVisible,
            fullBody,
            noFootSkating: hipsXZ < 0.02,
            pageErrors: pageErrors.length === 0
        },
        pageErrors,
        shots: {
            idle: path.join(OUT, 'qa-authored-idle.png'),
            accad: path.join(OUT, 'qa-authored-accad-wait.png'),
            mp4: fs.existsSync(mp4) ? mp4 : null
        }
    };
    report.pass = Object.values(report.checks).every(Boolean);
    fs.writeFileSync(path.join(OUT, 'qa-authored-motion-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ pass: report.pass, zipSha256: zipSha, checks: report.checks, motion: report.motion, pageErrors }, null, 2));

    await browser.close();
    server?.close();
    if (!report.pass) process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
