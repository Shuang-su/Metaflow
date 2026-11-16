/**
 * GPU smoke QA against the exact Netlify DRAFT URL (not localhost).
 * Arms/hands, feet/head framing, scene switch, FS+legacy migrate, sample, mobile, blink cadence.
 */
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const DEPLOY_URL =
    process.env.DEPLOY_URL ||
    'https://6af9df4cf8b7ab03f7970227--vrm-desktop-portrait-20261114.netlify.app/';
const DEPLOY_ID = '6af9df4cf8b7ab03f7970227';
const EXPECT_ZIP = 'b1246a48e14b59c7476c5364527e25e34e0733951273b73a9e8a3f156b2fe038';
const OUT = '/opt/cursor/artifacts';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function handFeetHead(page) {
    return page.evaluate(() => {
        const app = window.app;
        const h = app?.vrm?.humanoid;
        if (!h || !app?.camera) return null;
        const THREE = window.THREE;
        const proj = (name, yBoost = 0) => {
            const n = h.getNormalizedBoneNode(name);
            if (!n) return null;
            const v = new THREE.Vector3();
            n.getWorldPosition(v);
            v.y += yBoost;
            v.project(app.camera);
            return { x: v.x, y: v.y, z: v.z };
        };
        const lh = proj('leftHand');
        const rh = proj('rightHand');
        const hips = proj('hips');
        const head = proj('head', 0.01);
        const lFoot = proj('leftFoot') || proj('leftToes');
        const rFoot = proj('rightFoot') || proj('rightToes');
        const leftClear = lh && hips ? Math.abs(lh.x - hips.x) : 0;
        const rightClear = rh && hips ? Math.abs(rh.x - hips.x) : 0;
        const opposite = lh && rh && hips ? (lh.x - hips.x) * (rh.x - hips.x) < 0 : false;
        return {
            leftClear,
            rightClear,
            opposite,
            armsVisible: leftClear > 0.04 && rightClear > 0.04 && opposite,
            headInFrame: head ? head.y < 0.95 && head.y > -0.95 : false,
            feetInFrame: !!(lFoot && rFoot && lFoot.y > -0.98 && rFoot.y > -0.98),
            feetStableY: lFoot && rFoot ? Math.abs(lFoot.y - rFoot.y) < 0.08 : false,
            head,
            lFoot,
            rFoot,
            poseStyle: window.diagnostics?.poseStyle || null,
            springsActive: app.springsActive,
            idlePaused: !!app.idlePaused || !!app.animator?.paused
        };
    });
}

async function propCheck(page) {
    return page.evaluate(() => {
        const app = window.app;
        const markers = app?.envRoot?.userData?.propMarkers;
        if (!markers || !app.camera) return { mode: app?.sceneMode, markers: null };
        const THREE = window.THREE;
        const out = {};
        for (const [k, p] of Object.entries(markers)) {
            const v = new THREE.Vector3(p.x, p.y, p.z);
            app.deskRoot.localToWorld(v);
            v.project(app.camera);
            out[k] = { x: v.x, y: v.y, z: v.z, inView: Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95 && v.z < 1 };
        }
        return { mode: app.sceneMode, markers: out };
    });
}

async function openDeploy(browser, { width, height, seed, name }) {
    const pageErrors = [];
    const page = await browser.newPage();
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await page.goto(DEPLOY_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.evaluate((seed) => {
        localStorage.clear();
        if (seed) {
            for (const [k, v] of Object.entries(seed)) {
                localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
            }
        }
    }, seed || null);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    const ready = await waitReady(page);
    await page.evaluate(() => {
        if (window.app) {
            window.app.idlePaused = false;
            window.app.animator?.setPaused(false);
            const el = document.getElementById('idlePaused');
            if (el) el.checked = false;
        }
    });
    const shot = path.join(OUT, `draft-smoke-${name}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    return { page, ready, pageErrors, shot };
}

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-webgl',
            '--enable-webgl2',
            '--ignore-gpu-blocklist'
        ]
    });

    const report = {
        url: DEPLOY_URL,
        deployId: DEPLOY_ID,
        expectZipSha256: EXPECT_ZIP,
        testedAt: new Date().toISOString(),
        blinkNote:
            'blinkCount is actual eyelid closures (animator.blinkCount++), not motion-sample frame counts. Prior report 17/20s was inflated by QA forcing blinkInterval=2.0 + screenshot deltaTime spikes.'
    };

    // Hash marker from deployed animator (blinkInterval defaults)
    const animUrl = new URL('vrm-animator.mjs', DEPLOY_URL).href;
    const animTxt = await (await fetch(animUrl)).text();
    report.deployedBlink = {
        hasInterval22: /blinkInterval\s*=\s*this\.reducedMotion\s*\?\s*5\.0\s*:\s*2\.2/.test(animTxt),
        resampleExpr: (animTxt.match(/blinkInterval\s*=\s*([^\n;]+)/g) || []).slice(0, 3),
        foldHint: animTxt.includes('breathingAmplitude')
    };

    // --- Clean desktop ---
    const clean = await openDeploy(browser, { width: 1280, height: 800, name: 'room-idle', seed: null });
    report.clean = { ready: clean.ready, pageErrors: clean.pageErrors, shot: clean.shot };
    let checks = {};

    if (clean.ready?.ready) {
        const body = await handFeetHead(clean.page);
        const props = await propCheck(clean.page);
        report.body = body;
        report.props = props;
        checks.armsVisible = !!body?.armsVisible;
        checks.fullBody = !!(body?.headInFrame && body?.feetInFrame);
        checks.feetStable = !!body?.feetStableY;
        checks.springsOff = body?.springsActive === false || body?.springsActive == null;
        checks.idleNotPaused = body?.idlePaused === false;
        checks.roomProps =
            !!props?.markers?.window?.inView &&
            !!props?.markers?.shelf?.inView &&
            !!props?.markers?.plant?.inView;

        // Natural blink cadence over 20s wall clock — DO NOT force interval
        await clean.page.evaluate(() => {
            if (window.app?.animator) {
                window.app.animator.blinkCount = 0;
                window.app.animator.blinkTimer = 0;
                // leave default blinkInterval from constructor / last resample
            }
        });
        const blinkIntervals = [];
        const tBlink0 = Date.now();
        let lastCount = 0;
        while (Date.now() - tBlink0 < 20000) {
            await sleep(250);
            const m = await clean.page.evaluate(() => ({
                count: window.app?.animator?.blinkCount || 0,
                interval: window.app?.animator?.blinkInterval || null,
                paused: !!window.app?.animator?.paused,
                reduced: !!window.app?.animator?.reducedMotion
            }));
            if (m.count > lastCount) {
                blinkIntervals.push({ atMs: Date.now() - tBlink0, count: m.count, nextInterval: m.interval });
                lastCount = m.count;
            }
        }
        const blinkFinal = await clean.page.evaluate(() => window.app?.animator?.getMotionDiagnostics?.());
        report.blinkLive20s = {
            closures: blinkFinal?.blinkCount ?? lastCount,
            samples: blinkIntervals,
            paused: blinkFinal?.paused,
            reduced: blinkFinal?.reducedMotion,
            meanIntervalHint:
                blinkIntervals.length > 1
                    ? (blinkIntervals[blinkIntervals.length - 1].atMs - blinkIntervals[0].atMs) /
                      (blinkIntervals.length - 1) /
                      1000
                    : null
        };
        // Accept natural ~3–7 closures / 20s (≈3–6s). Fail if ≥10 (twitchy).
        checks.blinkNatural = report.blinkLive20s.closures >= 2 && report.blinkLive20s.closures <= 8;

        await clean.page.screenshot({ path: path.join(OUT, 'draft-smoke-idle-20s.png'), fullPage: false });

        // Scene switch room → minimal → room
        await clean.page.evaluate(() => {
            const sel = document.getElementById('sceneMode');
            if (sel) {
                sel.value = 'minimal';
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (window.app?.setSceneMode) {
                window.app.setSceneMode('minimal');
            }
        });
        await sleep(800);
        const minimal = await propCheck(clean.page);
        await clean.page.screenshot({ path: path.join(OUT, 'draft-smoke-minimal.png'), fullPage: false });
        await clean.page.evaluate(() => {
            const sel = document.getElementById('sceneMode');
            if (sel) {
                sel.value = 'room';
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (window.app?.setSceneMode) {
                window.app.setSceneMode('room');
            }
        });
        await sleep(800);
        const roomBack = await propCheck(clean.page);
        const bodyBack = await handFeetHead(clean.page);
        await clean.page.screenshot({ path: path.join(OUT, 'draft-smoke-room-back.png'), fullPage: false });
        report.sceneSwitch = { minimal, roomBack, bodyBack };
        checks.sceneSwitch =
            minimal?.mode === 'minimal' &&
            roomBack?.mode === 'room' &&
            !!roomBack?.markers?.window?.inView &&
            !!bodyBack?.armsVisible;

        // FS wizard + persist
        await clean.page.click('#startFullscreenCalib');
        await sleep(500);
        const wizard = await clean.page.evaluate(async () => {
            const app = window.app;
            const out = { open: !!app?.fsWizardOpen };
            try {
                if (!document.fullscreenElement) {
                    try {
                        await document.getElementById('canvas-container').requestFullscreen();
                    } catch (e) {
                        out.fsError = String(e?.message || e);
                    }
                }
                out.fullscreen = !!document.fullscreenElement;
                await app.fsWizardNavigate(1);
                const preset = document.getElementById('fsPreset');
                if (preset) {
                    const opt = [...preset.options].find((o) => /mba-13|MacBook Air 13/i.test(o.value + o.textContent));
                    if (opt) {
                        preset.value = opt.value;
                        preset.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
                app.applyFsWizardPhysicalFromFields?.();
                await app.fsWizardNavigate(1);
                const tilt = document.getElementById('fsTilt');
                if (tilt) {
                    tilt.value = '14';
                    tilt.dispatchEvent(new Event('input', { bubbles: true }));
                }
                await app.fsWizardNavigate(1);
                const eyeZ = document.getElementById('fsEyeZ');
                if (eyeZ) {
                    eyeZ.value = '0.38';
                    eyeZ.dispatchEvent(new Event('input', { bubbles: true }));
                }
                await app.fsWizardNavigate(1);
                const label = document.getElementById('fsSaveLabel');
                if (label) label.value = 'Draft smoke QA';
                await app.fsWizardNavigate(1);
                out.projectionMode = app.projectionMode;
                out.screenPhysical = app.screenPhysical;
                out.v3 = localStorage.getItem('metaflow.vrm-desktop.settings.v3');
                out.profiles = localStorage.getItem('metaflow.vrm-desktop.screen-profiles.v1');
                out.active = localStorage.getItem('metaflow.vrm-desktop.active-screen.v1');
                out.ok = true;
            } catch (e) {
                out.ok = false;
                out.error = String(e?.stack || e);
            }
            if (document.fullscreenElement) {
                try {
                    await document.exitFullscreen();
                } catch {
                    /* */
                }
            }
            return out;
        });
        await sleep(400);
        await clean.page.screenshot({ path: path.join(OUT, 'draft-smoke-fs-saved.png'), fullPage: false });
        report.wizard = wizard;
        checks.fsPersist = !!(wizard?.ok && wizard?.v3 && wizard?.screenPhysical);

        // Sample model → Wenjing back
        await clean.page.click('#loadSampleModel');
        const t0 = Date.now();
        let sampleName = null;
        while (Date.now() - t0 < 90000) {
            const d = await clean.page.evaluate(() => window.diagnostics);
            if (d?.ready && d.modelName && !/Wenjing/i.test(d.modelName)) {
                sampleName = d.modelName;
                break;
            }
            if (d?.error && !d?.loading) break;
            await sleep(400);
        }
        await clean.page.screenshot({ path: path.join(OUT, 'draft-smoke-sample.png'), fullPage: false });
        await clean.page.click('#loadDefaultModel');
        const t1 = Date.now();
        let backName = null;
        while (Date.now() - t1 < 90000) {
            const d = await clean.page.evaluate(() => window.diagnostics);
            if (d?.ready && /Wenjing/i.test(d.modelName || '')) {
                backName = d.modelName;
                break;
            }
            await sleep(400);
        }
        const afterSample = await handFeetHead(clean.page);
        await clean.page.screenshot({ path: path.join(OUT, 'draft-smoke-wenjing-back.png'), fullPage: false });
        report.sample = { sampleName, backName, afterSample };
        checks.sampleRoundtrip = !!(sampleName && backName && afterSample?.armsVisible);
    }
    await clean.page.close();

    // Legacy v2 migrate
    const legacy = await openDeploy(browser, {
        width: 1280,
        height: 800,
        name: 'legacy-v2',
        seed: {
            'metaflow.vrm-desktop.settings.v2': {
                widthM: 0.3,
                heightM: 0.2,
                tiltDeg: 15,
                eyeX: -0.01,
                eyeY: 0.03,
                eyeZ: 0.4,
                quality: 'quality',
                springsEnabled: false
            }
        }
    });
    const legacyMig = await legacy.page.evaluate(() => ({
        ready: !!window.diagnostics?.ready,
        v3: localStorage.getItem('metaflow.vrm-desktop.settings.v3'),
        eyeZ: window.app?.params?.eye?.z,
        model: window.diagnostics?.modelName
    }));
    report.legacy = { ...legacyMig, pageErrors: legacy.pageErrors, shot: legacy.shot };
    checks.legacyMigrate = !!(legacyMig.ready && legacyMig.v3 && Math.abs((legacyMig.eyeZ || 0) - 0.4) < 0.02);
    await legacy.page.close();

    // Mobile
    const mobile = await openDeploy(browser, { width: 390, height: 844, name: 'mobile', seed: null });
    const mobileBody = mobile.ready?.ready ? await handFeetHead(mobile.page) : null;
    report.mobile = {
        ready: mobile.ready,
        body: mobileBody,
        pageErrors: mobile.pageErrors,
        shot: mobile.shot
    };
    checks.mobile =
        !!mobile.ready?.ready &&
        !!mobileBody?.armsVisible &&
        !!mobileBody?.headInFrame &&
        !!mobileBody?.feetInFrame;
    await mobile.page.close();

    const pageErrors = [
        ...(report.clean?.pageErrors || []),
        ...(report.legacy?.pageErrors || []),
        ...(report.mobile?.pageErrors || [])
    ];
    checks.noPageErrors = pageErrors.length === 0;

    report.checks = checks;
    report.pass = Object.values(checks).every(Boolean);
    report.pageErrors = pageErrors;

    const outPath = path.join(OUT, 'draft-smoke-report.json');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(
        JSON.stringify(
            {
                pass: report.pass,
                url: DEPLOY_URL,
                deployId: DEPLOY_ID,
                checks,
                blinkLive20s: report.blinkLive20s,
                blinkNote: report.blinkNote,
                deployedBlink: report.deployedBlink,
                pageErrors,
                outPath
            },
            null,
            2
        )
    );

    await browser.close();
    if (!report.pass) process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
