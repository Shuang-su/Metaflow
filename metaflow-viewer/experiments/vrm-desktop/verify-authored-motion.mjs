/**
 * Authored VRMA QA with FORCED simulation stepping (not rAF-during-screenshot).
 * Sim steps at 30fps; MP4 encodes at 10fps (screenshot every 3rd step) for ~18s.
 * Proof stills: t0/t3/t6 + arms close + side + hstack trio.
 */
import fs from 'fs';
import path from 'path';
import http from 'http';
import { createHash } from 'crypto';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = '/opt/cursor/artifacts';
const ZIP = '/opt/cursor/artifacts/metaflow-desktop-preview.zip';
const EXTRACT = '/tmp/vrm-desktop-authored';
const PORT = 8799;
const SIM_FPS = 30;
const CAP_FPS = 10;
const SECONDS = 18;
const STEPS_PER_CAP = SIM_FPS / CAP_FPS; // 3
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

async function handProbe(page) {
    return page.evaluate(() => {
        const app = window.app;
        const h = app?.vrm?.humanoid;
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
        const head = proj('head');
        const lf = proj('leftFoot') || proj('leftToes');
        return {
            leftClear: lh && hips ? Math.abs(lh.x - hips.x) : 0,
            rightClear: rh && hips ? Math.abs(rh.x - hips.x) : 0,
            opposite: lh && rh && hips ? (lh.x - hips.x) * (rh.x - hips.x) < 0 : false,
            headY: head?.y,
            footY: lf?.y,
            bodyDrive: app.animator?.bodyDrive,
            anim: app.animPlayer?.diagnostics?.()
        };
    });
}

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    if (!fs.existsSync(ZIP)) throw new Error('missing zip');
    const zipSha = sha256(ZIP);
    await extractZip();
    const server = await serve(EXTRACT);
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
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    const ready = await waitReady(page);

    await page.evaluate(async () => {
        window.app.idlePaused = false;
        window.app.animator?.setPaused(false);
        await window.app.applyAnimClip('chatvrm-idle', { persist: false });
    });
    for (let i = 0; i < 30; i++) {
        await page.evaluate(() => window.app.stepSimulation(1 / 30));
    }

    await page.evaluate(() => {
        let el = document.getElementById('qaTimeHud');
        if (!el) {
            el = document.createElement('div');
            el.id = 'qaTimeHud';
            el.style.cssText =
                'position:absolute;left:12px;bottom:12px;z-index:20;padding:6px 10px;background:rgba(0,0,0,0.75);color:#fef08a;font:14px/1.2 monospace;border-radius:4px;';
            document.getElementById('canvas-container')?.appendChild(el);
        }
        el.textContent = 't=0.00s · authored VRMA · forced step';
    });

    const probe0 = await handProbe(page);
    // Full stills via Puppeteer (UI chrome) for arms/side/idle proof
    await page.screenshot({ path: path.join(OUT, 'qa-authored-idle.png'), fullPage: false });
    await page.screenshot({
        path: path.join(OUT, 'qa-authored-arms-close.png'),
        clip: { x: 380, y: 280, width: 420, height: 380 }
    });

    await page.evaluate(() => {
        window.app.params.eye.x = -0.1;
        window.app.updateProjection();
        window.app.stepSimulation(0);
    });
    await page.screenshot({ path: path.join(OUT, 'qa-authored-side.png'), fullPage: false });
    await page.evaluate(() => {
        window.app.params.eye.x = -0.02;
        window.app.updateProjection();
    });

    const frameDir = path.join(OUT, 'qa-authored-frames');
    fs.rmSync(frameDir, { recursive: true, force: true });
    fs.mkdirSync(frameDir, { recursive: true });

    const totalSimSteps = SIM_FPS * SECONDS;
    const proofTimes = [0, 3, 6];
    const proofFrames = {};
    const boneSamples = [];
    let capIdx = 0;

    console.log(`Capturing ${SECONDS}s: sim ${SIM_FPS}fps, encode ${CAP_FPS}fps, steps/cap=${STEPS_PER_CAP}`);

    for (let step = 0; step < totalSimSteps; step++) {
        const t = step / SIM_FPS;
        await page.evaluate((tt) => {
            window.app.stepSimulation(1 / 30);
            const el = document.getElementById('qaTimeHud');
            if (el) el.textContent = `t=${tt.toFixed(2)}s · authored VRMA · forced step`;
        }, t);

        const isProof = proofTimes.some((p) => Math.abs(t - p) < 0.5 / SIM_FPS);
        const isCap = step % STEPS_PER_CAP === 0;

        // JPEG screenshots include DOM HUD timestamps (canvas.toDataURL would not)
        if (isCap || isProof) {
            if (isProof) {
                const fp = path.join(OUT, `qa-authored-t${Math.round(t)}.png`);
                await page.screenshot({ path: fp, fullPage: false, type: 'png' });
                proofFrames[Math.round(t)] = fp;
            }
            if (isCap) {
                const fp = path.join(frameDir, `f${String(capIdx).padStart(4, '0')}.jpg`);
                await page.screenshot({ path: fp, fullPage: false, type: 'jpeg', quality: 78 });
                capIdx++;
            }
        }

        if (step % 15 === 0) {
            const s = await page.evaluate(() => {
                const h = window.app.vrm.humanoid;
                const q = (n) => {
                    const b = h.getNormalizedBoneNode(n);
                    return b ? { x: b.rotation.x, y: b.rotation.y, z: b.rotation.z } : null;
                };
                const THREE = window.THREE;
                const proj = (n) => {
                    const b = h.getNormalizedBoneNode(n);
                    const v = new THREE.Vector3();
                    b.getWorldPosition(v);
                    v.project(window.app.camera);
                    return { x: v.x, y: v.y };
                };
                const lh = proj('leftHand');
                const rh = proj('rightHand');
                const hips = proj('hips');
                return {
                    chest: q('chest'),
                    hips: q('hips'),
                    leftUpperArm: q('leftUpperArm'),
                    leftClear: Math.abs(lh.x - hips.x),
                    rightClear: Math.abs(rh.x - hips.x),
                    anim: window.app.animPlayer.diagnostics(),
                    bodyDrive: window.app.animator.bodyDrive
                };
            });
            boneSamples.push({ t, ...s });
        }

        if (step % 90 === 0) console.log(`  step ${step}/${totalSimSteps} t=${t.toFixed(1)}s caps=${capIdx}`);
    }

    // Side-by-side t0|t3|t6
    const t0 = path.join(OUT, 'qa-authored-t0.png');
    const t3 = path.join(OUT, 'qa-authored-t3.png');
    const t6 = path.join(OUT, 'qa-authored-t6.png');
    const trio = path.join(OUT, 'qa-authored-t0-t3-t6.png');
    if (fs.existsSync(t0) && fs.existsSync(t3) && fs.existsSync(t6)) {
        spawnSync(
            'ffmpeg',
            [
                '-y',
                '-i',
                t0,
                '-i',
                t3,
                '-i',
                t6,
                '-filter_complex',
                '[0:v]drawtext=text=t=0s:x=12:y=12:fontsize=28:fontcolor=yellow:box=1:boxcolor=black@0.6[a];' +
                    '[1:v]drawtext=text=t=3s:x=12:y=12:fontsize=28:fontcolor=yellow:box=1:boxcolor=black@0.6[b];' +
                    '[2:v]drawtext=text=t=6s:x=12:y=12:fontsize=28:fontcolor=yellow:box=1:boxcolor=black@0.6[c];' +
                    '[a][b][c]hstack=inputs=3',
                '-update',
                '1',
                trio
            ],
            { stdio: 'inherit' }
        );
    }

    const mp4 = path.join(OUT, 'qa-authored-idle-motion.mp4');
    await new Promise((resolve, reject) => {
        const ff = spawn(
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
        ff.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
    });

    const rotRange = (key, axis) => {
        const vals = boneSamples.map((s) => s?.[key]?.[axis]).filter((v) => typeof v === 'number');
        if (!vals.length) return 0;
        return Math.max(...vals) - Math.min(...vals);
    };
    const chestRange = rotRange('chest', 'x');
    const hipsRange = Math.max(rotRange('hips', 'y'), rotRange('hips', 'z'));
    const armRange = Math.max(rotRange('leftUpperArm', 'z'), rotRange('leftUpperArm', 'y'));
    const minLeft = Math.min(...boneSamples.map((s) => s.leftClear || 0));
    const minRight = Math.min(...boneSamples.map((s) => s.rightClear || 0));
    const alwaysAuthored = boneSamples.every((s) => s.bodyDrive === 'authored' && s.anim?.active);

    const report = {
        zipSha256: zipSha,
        ready: { modelName: ready?.modelName, animClipId: ready?.animClipId, animMode: ready?.animMode },
        capture: {
            simFps: SIM_FPS,
            encodeFps: CAP_FPS,
            seconds: SECONDS,
            capFrames: capIdx,
            method: 'forced-stepSimulation+jpeg10fps'
        },
        probe0,
        motion: {
            chestRange,
            hipsRange,
            armRange,
            minLeftClear: minLeft,
            minRightClear: minRight,
            samples: boneSamples.length,
            alwaysAuthored,
            boneSamples
        },
        checks: {
            authoredActive: alwaysAuthored,
            // Chest breath overlay + amplified torso should clear this easily
            motionVisible: chestRange > 0.04 || hipsRange > 0.025 || armRange > 0.035,
            // NDC lateral clearance; hands may sit slightly in front of skirt (OK if silhouette reads)
            armsClearSkirt: minLeft > 0.05 && minRight > 0.05 && probe0.opposite,
            fullBody: probe0.headY < 0.95 && probe0.footY > -0.98,
            pageErrors: pageErrors.length === 0,
            proofTrio: fs.existsSync(trio),
            mp4: fs.existsSync(mp4)
        },
        pageErrors,
        shots: {
            idle: path.join(OUT, 'qa-authored-idle.png'),
            arms: path.join(OUT, 'qa-authored-arms-close.png'),
            side: path.join(OUT, 'qa-authored-side.png'),
            t0,
            t3,
            t6,
            trio: fs.existsSync(trio) ? trio : null,
            mp4: fs.existsSync(mp4) ? mp4 : null
        }
    };
    report.pass = Object.values(report.checks).every(Boolean);
    fs.writeFileSync(path.join(OUT, 'qa-authored-motion-report.json'), JSON.stringify(report, null, 2));

    const summary = {
        pass: report.pass,
        zipSha256: zipSha,
        checks: report.checks,
        motion: { chestRange, hipsRange, armRange, minLeft, minRight },
        pageErrors
    };
    fs.writeFileSync(path.join(OUT, 'qa-authored-SUMMARY.txt'), JSON.stringify(summary, null, 2) + '\n');
    console.log(JSON.stringify(summary, null, 2));

    await browser.close();
    server.close();
    if (!report.pass) process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
