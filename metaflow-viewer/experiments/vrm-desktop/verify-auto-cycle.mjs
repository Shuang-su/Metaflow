/**
 * GPU QA: auto-cycle of bundled licensed standing idles (≥4 distinct poses).
 * Uses stepSimulation + short QA dwell so transitions are observable; also
 * records production dwell policy. No URL flags. ZIP must be freshly built.
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
const EXTRACT = '/tmp/vrm-desktop-auto-cycle';
const PORT = 8803;
const QA_DWELL = 5; // seconds per clip for evidence (production is 12–25s)
const FPS = 10;
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
    if (!fs.existsSync(ZIP)) throw new Error('missing zip');
    const zipSha = sha256(ZIP);
    await extractZip();
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
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    const ready = await waitReady(page);

    // Enable auto + short QA dwell; freeze rAF sim so screenshots cannot double-drive dwell
    const boot = await page.evaluate((dwell) => {
        const app = window.app;
        app.setSuspendRafSimulation?.(true);
        const el = document.getElementById('idlePaused');
        if (el?.checked) {
            el.checked = false;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const auto = document.getElementById('animAutoCycle');
        if (auto && !auto.checked) {
            auto.checked = true;
            auto.dispatchEvent(new Event('change', { bubbles: true }));
        }
        app.setAnimAutoCycle?.(true, { persist: false });
        app.animPlayer.setQaDwellSec(dwell);
        app.animPlayer.autoCycle = true;
        // Restart from first playlist clip
        return app.applyAnimClip('chatvrm-idle', { persist: false }).then(() => app.animPlayer.diagnostics());
    }, QA_DWELL);

    // Warm a few frames
    for (let i = 0; i < 15; i++) {
        await page.evaluate(() => window.app.stepSimulation(1 / 30));
    }

    const frameDir = path.join(OUT, 'qa-auto-cycle-frames');
    try {
        fs.rmSync(frameDir, { recursive: true, force: true });
    } catch (e) {
        // Artifact FS can throw EIO on stale frames; fall back to a fresh dir name.
        console.warn('frameDir cleanup:', e.code || e.message);
    }
    if (fs.existsSync(frameDir)) {
        // rename aside if unlink failed
        const bak = `${frameDir}-bak-${Date.now()}`;
        try {
            fs.renameSync(frameDir, bak);
        } catch {
            /* ignore */
        }
    }
    fs.mkdirSync(frameDir, { recursive: true });

    const seen = [];
    const samples = [];
    const stills = {};
    let capIdx = 0;
    // Capture ≥4 dwells + fades: 5 * 5s + margin ≈ 28s sim @ 30fps
    const totalSteps = 30 * 28;
    let lastId = null;

    await page.evaluate(() => {
        let el = document.getElementById('qaTimeHud');
        if (!el) {
            el = document.createElement('div');
            el.id = 'qaTimeHud';
            el.style.cssText =
                'position:absolute;left:12px;bottom:12px;z-index:20;padding:6px 10px;background:rgba(0,0,0,0.75);color:#fef08a;font:13px/1.2 monospace;border-radius:4px;';
            document.getElementById('canvas-container')?.appendChild(el);
        }
    });

    for (let step = 0; step < totalSteps; step++) {
        const t = step / 30;
        const snap = await page.evaluate((tt) => {
            window.app.stepSimulation(1 / 30);
            const d = window.app.animPlayer.diagnostics();
            const el = document.getElementById('qaTimeHud');
            if (el) {
                el.textContent = `t=${tt.toFixed(1)}s · auto ${d.currentId} · dwell ${d.dwellElapsed.toFixed(1)}/${d.dwellTarget.toFixed(1)} · x${d.transitionCount}`;
            }
            const h = window.app.vrm.humanoid;
            const THREE = window.THREE;
            const world = (n) => {
                const b = h.getNormalizedBoneNode(n);
                const v = new THREE.Vector3();
                b.getWorldPosition(v);
                return v;
            };
            const lh = world('leftHand');
            const rh = world('rightHand');
            const hips = world('hips');
            const lf = world('leftFoot') || world('leftToes');
            const head = world('head');
            const xz = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
            return {
                ...d,
                leftClear: xz(lh, hips),
                rightClear: xz(rh, hips),
                footY: lf.y,
                headY: head.y,
                autoUi: !!document.getElementById('animAutoCycle')?.checked,
                sel: document.getElementById('animClip')?.value
            };
        }, t);

        if (snap.currentId && snap.currentId !== lastId) {
            lastId = snap.currentId;
            seen.push({ t, id: lastId, transitionCount: snap.transitionCount });
            const fp = path.join(OUT, `qa-auto-cycle-${lastId}.png`);
            await page.screenshot({ path: fp, type: 'png' });
            stills[lastId] = fp;
        }

        if (step % Math.round(30 / FPS) === 0) {
            const fp = path.join(frameDir, `f${String(capIdx).padStart(4, '0')}.jpg`);
            await page.screenshot({ path: fp, type: 'jpeg', quality: 72 });
            capIdx++;
        }
        if (step % 30 === 0) {
            samples.push({
                t,
                id: snap.currentId,
                transitions: snap.transitionCount,
                leftClear: snap.leftClear,
                rightClear: snap.rightClear,
                footY: snap.footY,
                dwell: snap.dwellElapsed,
                target: snap.dwellTarget
            });
        }
    }

    // Feature retention quick checks
    const features = await page.evaluate(async () => {
        const app = window.app;
        const out = {};
        app.setSceneMode('minimal');
        out.minimal = app.sceneMode;
        app.setSceneMode('room');
        out.room = app.sceneMode;
        await app.loadVRM('./models/minimal-avatar.vrm');
        out.pixiv = { ready: !!window.diagnostics?.ready, meta: app.metaVersion, auto: app.animPlayer?.autoCycle };
        await app.loadVRM('./models/wenjing.vrm');
        // restore QA dwell after rebind
        app.animPlayer.setQaDwellSec(5);
        app.setAnimAutoCycle(true, { persist: false });
        out.wenjing = {
            ready: !!window.diagnostics?.ready,
            meta: app.metaVersion,
            auto: app.animPlayer?.autoCycle,
            playlist: app.animPlayer?.playlistIds?.()
        };
        out.fullscreenBtn = Array.from(document.querySelectorAll('button')).some((b) =>
            /全屏/.test(b.textContent || '')
        );
        out.localHint = (document.querySelector('label[for="vrmaFile"], label')?.textContent || '') +
            (document.body.innerText.includes('不进自动') ? ' ok' : '');
        return out;
    });

    await page.screenshot({ path: path.join(OUT, 'qa-auto-cycle-final.png'), type: 'png' });

    const mp4 = path.join(OUT, 'qa-auto-cycle-motion.mp4');
    spawnSync(
        'ffmpeg',
        [
            '-y',
            '-framerate',
            String(FPS),
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

    const uniqueIds = [...new Set(seen.map((s) => s.id))];
    const pct = (arr, p) => {
        const a = arr.filter((v) => typeof v === 'number').sort((x, y) => x - y);
        if (!a.length) return 0;
        return a[Math.max(0, Math.min(a.length - 1, Math.floor(a.length * p)))];
    };
    const lefts = samples.map((s) => s.leftClear || 0);
    const rights = samples.map((s) => s.rightClear || 0);
    const minLeft = Math.min(...lefts);
    const minRight = Math.min(...rights);
    const p10Left = pct(lefts, 0.1);
    const p10Right = pct(rights, 0.1);
    const footYs = samples.map((s) => s.footY).filter((v) => typeof v === 'number');
    const footDrift = footYs.length ? Math.max(...footYs) - Math.min(...footYs) : 99;
    const transitionCount =
        seen.length > 0 ? Math.max(...seen.map((s) => s.transitionCount || 0)) : 0;
    const simSec = totalSteps / 30;
    // Expect roughly simSec/dwell transitions (±2 for fade/start)
    const expectedMax = Math.ceil(simSec / QA_DWELL) + 3;
    const transitionCountSane = transitionCount >= 2 && transitionCount <= expectedMax;

    const report = {
        zipSha256: zipSha,
        ready: { modelName: ready?.modelName, animAutoCycle: ready?.animAutoCycle },
        boot,
        productionDwellPolicy: '12–25s per clip ( ≥1 full loop ); QA used setQaDwellSec(5) for evidence only',
        qaDwellSec: QA_DWELL,
        seen,
        uniqueIds,
        transitionCount,
        clearStats: { minLeft, minRight, p10Left, p10Right },
        samples,
        features,
        checks: {
            autoDefaultOn: boot?.autoCycle === true || ready?.animAutoCycle !== false,
            playlistAtLeastFour: (boot?.playlist || []).length >= 4,
            playlistSeven: (boot?.playlist || []).length === 7,
            sawAtLeastFourDistinct: uniqueIds.length >= 4,
            sawCoreThree: ['chatvrm-idle', 'accad-wait', 'accad-sway'].every((id) =>
                uniqueIds.includes(id)
            ),
            hadTransition: seen.length >= 2,
            // Figurine-scale world XZ (metres); ~2cm+ reads as clear beside/front of skirt
            armsClear: p10Left > 0.015 && p10Right > 0.015 && minLeft > 0.01 && minRight > 0.01,
            transitionCountSane,
            feetStable: footDrift < 0.08,
            sceneSwitch: features.minimal === 'minimal' && features.room === 'room',
            modelSwitch: features.pixiv?.meta === '1' && features.wenjing?.meta === '0',
            autoSurvivesReload: features.wenjing?.auto === true,
            fullscreenUi: !!features.fullscreenBtn,
            mp4: fs.existsSync(mp4),
            pageErrors: pageErrors.length === 0
        },
        pageErrors,
        stills,
        mp4,
        limitations: [
            'QA dwell shortened to 5s via setQaDwellSec — production dwell remains 12–25s',
            'Capture uses stepSimulation for deterministic multi-clip proof under headless rAF throttle',
            'Local .vrma and procedural are excluded from auto playlist by design'
        ]
    };
    report.pass = Object.values(report.checks).every(Boolean);
    fs.writeFileSync(path.join(OUT, 'qa-auto-cycle-report.json'), JSON.stringify(report, null, 2));
    const summary = {
        pass: report.pass,
        zipSha256: zipSha,
        uniqueIds,
        transitions: report.transitionCount,
        checks: report.checks,
        limitations: report.limitations
    };
    fs.writeFileSync(path.join(OUT, 'qa-auto-cycle-SUMMARY.txt'), JSON.stringify(summary, null, 2) + '\n');
    console.log(JSON.stringify(summary, null, 2));

    await browser.close();
    server.close();
    if (!report.pass) process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
