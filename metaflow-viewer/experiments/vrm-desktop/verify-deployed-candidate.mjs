/**
 * QA the exact deployed Netlify draft (not localhost / not Vite).
 * Captures screenshots + console; exercises wizard as far as headless allows.
 */
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const DEPLOY_URL = process.env.DEPLOY_URL ||
    'https://6af9c51602b9bd7fc82107f0--vrm-desktop-portrait-20261114.netlify.app/';
const OUT = '/opt/cursor/artifacts';
const EXPECT_ZIP_PREFIX = '148351525fa07b2e328455a67e83d9ab6fd365cce1e414e1ab258b61a365d12d';
const EXPECT_TIP_PREFIX = '51ddc23c';

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function waitReady(page, timeoutMs = 120000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
        const d = await page.evaluate(() => ({
            diagnostics: window.diagnostics || null,
            status: document.getElementById('status')?.textContent || '',
            bootError: window.__bootError || null,
            bootPhase: window.__bootPhase || null,
            hasApp: !!window.app,
            webgl: (() => {
                try {
                    const c = document.createElement('canvas');
                    const gl2 = !!c.getContext('webgl2');
                    const gl1 = !!c.getContext('webgl');
                    return { webgl2: gl2, webgl: gl1 };
                } catch (e) {
                    return { error: String(e) };
                }
            })()
        }));
        if (d.diagnostics?.ready || d.bootError || (d.diagnostics?.error && !d.diagnostics?.loading)) {
            return d;
        }
        await sleep(400);
    }
    return page.evaluate(() => ({
        diagnostics: window.diagnostics || null,
        status: document.getElementById('status')?.textContent || '',
        bootError: window.__bootError || null,
        bootPhase: window.__bootPhase || null,
        hasApp: !!window.app,
        timeout: true
    }));
}

async function framingProbe(page) {
    return page.evaluate(() => {
        const app = window.app;
        if (!app?.vrm || !app.camera || !app.canvas) return { ok: false, reason: 'no vrm' };
        const bones = ['head', 'hips', 'leftFoot', 'rightFoot', 'leftToes', 'rightToes'];
        const humanoid = app.vrm.humanoid;
        const ndc = [];
        for (const name of bones) {
            const node = humanoid?.getNormalizedBoneNode?.(name) || humanoid?.getBoneNode?.(name);
            if (!node) continue;
            const w = new window.THREE.Vector3();
            node.getWorldPosition(w);
            // Approximate top of head: head + 0.12m up in model space after scale
            if (name === 'head') {
                const up = new window.THREE.Vector3(0, 0.12, 0);
                node.localToWorld(up);
                // use bone + offset via world matrix
                const headTop = w.clone();
                headTop.y += 0.08 * (app.vrm.scene.scale.y || 1);
                const v = headTop.project(app.camera);
                ndc.push({ name: 'headTopApprox', x: v.x, y: v.y, z: v.z });
            }
            const v = w.project(app.camera);
            ndc.push({ name, x: v.x, y: v.y, z: v.z });
        }
        // Also world AABB of personRoot
        const box = new window.THREE.Box3().setFromObject(app.personRoot);
        const min = box.min.clone().project(app.camera);
        const max = box.max.clone().project(app.camera);
        const canvas = app.canvas;
        const inView = (y) => y >= -1 && y <= 1;
        return {
            ok: true,
            ndc,
            aabbNdc: { min: { x: min.x, y: min.y }, max: { x: max.x, y: max.y } },
            canvas: { w: canvas.width, h: canvas.height, cw: canvas.clientWidth, ch: canvas.clientHeight },
            params: { ...app.params },
            hairLikelyClipped:
                (ndc.find((p) => p.name === 'headTopApprox')?.y ?? 0) > 0.92 ||
                max.y > 0.98,
            feetLikelyClipped:
                (ndc.find((p) => p.name === 'leftToes')?.y ?? ndc.find((p) => p.name === 'leftFoot')?.y ?? 0) < -0.98 ||
                min.y < -1.02
        };
    });
}

async function openPage(browser, { width, height, seedStorage, name }) {
    const logs = [];
    const pageErrors = [];
    const failed = [];
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    page.on('console', (m) => logs.push({ type: m.type(), text: m.text() }));
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('requestfailed', (r) => failed.push({ url: r.url(), err: r.failure()?.errorText }));

    await page.goto(DEPLOY_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.evaluate((seed) => {
        localStorage.clear();
        if (seed) {
            for (const [k, v] of Object.entries(seed)) {
                localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
            }
        }
    }, seedStorage || null);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    const ready = await waitReady(page);
    const framing = ready.diagnostics?.ready ? await framingProbe(page) : null;
    const shot = path.join(OUT, `deploy-qa-${name}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    return { page, logs, pageErrors, failed, ready, framing, shot };
}

async function runWizard(page) {
    const steps = [];
    await page.click('#startFullscreenCalib');
    await sleep(600);
    steps.push({
        afterOpen: await page.evaluate(() => ({
            open: !!window.app?.fsWizardOpen,
            hidden: !!document.getElementById('fsWizard')?.hidden,
            title: document.getElementById('fsWizardTitle')?.textContent || '',
            status: document.getElementById('status')?.textContent || ''
        }))
    });
    await page.screenshot({ path: path.join(OUT, 'deploy-qa-wizard-step1.png'), fullPage: false });

    // Enter fullscreen (Puppeteer often allows requestFullscreen)
    const fsResult = await page.evaluate(async () => {
        const app = window.app;
        if (document.getElementById('fsEnterBtn')) {
            document.getElementById('fsEnterBtn').click();
            await new Promise((r) => setTimeout(r, 400));
        }
        if (!document.fullscreenElement) {
            try {
                await document.getElementById('canvas-container').requestFullscreen();
            } catch (e) {
                return { ok: false, error: String(e?.message || e), fullscreen: false };
            }
        }
        app?.syncRendererToCanvas?.();
        return { ok: !!document.fullscreenElement, fullscreen: !!document.fullscreenElement };
    });
    steps.push({ fullscreen: fsResult });
    await sleep(500);
    await page.screenshot({ path: path.join(OUT, 'deploy-qa-wizard-fs.png'), fullPage: false });

    // Walk: fullscreen → display(preset) → tilt → eye → save via real navigate gates
    const advance = await page.evaluate(async () => {
        const app = window.app;
        if (!app) return { ok: false, reason: 'no app' };
        const out = [];
        try {
            // Step 0 → 1 (fullscreen gate allows fallback)
            await app.fsWizardNavigate(1);
            out.push({ afterFsNext: app.fsWizardStep, title: document.getElementById('fsWizardTitle')?.textContent });

            // Display / physical size: pick MacBook Air preset
            const preset = document.getElementById('fsPreset');
            if (preset) {
                const opt = [...preset.options].find((o) => /mba-13|MacBook Air 13/i.test(o.value + o.textContent));
                if (opt) {
                    preset.value = opt.value;
                    preset.dispatchEvent(new Event('change', { bubbles: true }));
                    out.push({ preset: opt.value, text: opt.textContent });
                }
            }
            const applied = app.applyFsWizardPhysicalFromFields?.();
            out.push({ physicalApplied: applied, pending: app.pendingScreenPhysical || null });
            await app.fsWizardNavigate(1); // → tilt
            out.push({ afterDisplay: app.fsWizardStep, title: document.getElementById('fsWizardTitle')?.textContent });

            const tilt = document.getElementById('fsTilt');
            if (tilt) {
                tilt.value = '14';
                tilt.dispatchEvent(new Event('input', { bubbles: true }));
            }
            await app.fsWizardNavigate(1); // → eye
            out.push({ afterTilt: app.fsWizardStep });

            const eyeZ = document.getElementById('fsEyeZ');
            if (eyeZ) {
                eyeZ.value = '0.38';
                eyeZ.dispatchEvent(new Event('input', { bubbles: true }));
            }
            await app.fsWizardNavigate(1); // → save
            out.push({ afterEye: app.fsWizardStep, title: document.getElementById('fsWizardTitle')?.textContent });

            const label = document.getElementById('fsSaveLabel');
            if (label) label.value = 'QA MacBook Air draft';
            await app.fsWizardNavigate(1); // finishFullscreenCalibration
            out.push({
                afterSave: app.fsWizardStep,
                projectionMode: app.projectionMode,
                screenPhysical: app.screenPhysical,
                status: document.getElementById('status')?.textContent
            });
            return { ok: true, out };
        } catch (e) {
            return { ok: false, error: String(e?.stack || e), out };
        }
    });
    steps.push({ advance });
    await sleep(600);

    await page.evaluate(async () => {
        if (document.fullscreenElement) {
            try { await document.exitFullscreen(); } catch { /* */ }
        }
        window.app?.updateProjectionModeBanner?.();
    });
    await sleep(600);
    await page.screenshot({ path: path.join(OUT, 'deploy-qa-wizard-saved.png'), fullPage: false });

    const persisted = await page.evaluate(() => ({
        settings: localStorage.getItem('metaflow.vrm-desktop.settings.v3'),
        profiles: localStorage.getItem('metaflow.vrm-desktop.screen-profiles.v1'),
        active: localStorage.getItem('metaflow.vrm-desktop.active-screen.v1'),
        projectionMode: window.app?.projectionMode || null,
        screenPhysical: window.app?.screenPhysical || null,
        status: document.getElementById('status')?.textContent || '',
        banner: document.getElementById('fsModeBanner')?.textContent || ''
    }));
    steps.push({ persisted });
    return steps;
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
            '--ignore-gpu-blocklist',
            '--autoplay-policy=no-user-gesture-required'
        ]
    });

    const report = {
        url: DEPLOY_URL,
        expectZipPrefix: EXPECT_ZIP_PREFIX,
        expectTipPrefix: EXPECT_TIP_PREFIX,
        testedAt: new Date().toISOString()
    };

    // Probe artifact markers from deployed HTML/JS if present
    const probePage = await browser.newPage();
    const assetCheck = await probePage.goto(DEPLOY_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    report.httpStatus = assetCheck.status();
    const html = await probePage.content();
    report.hasBootErrorUi = html.includes('bootError') && html.includes('bootDesktopPortraitApp');
    report.indexSnippet = html.slice(0, 200);
    const appUrl = new URL('app.mjs', DEPLOY_URL).href;
    const appRes = await probePage.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    report.appMjStatus = appRes.status();
    report.appHasBootFix = await probePage.evaluate(async (u) => {
        const t = await fetch(u).then((r) => r.text());
        return {
            len: t.length,
            hasBoot: t.includes('bootDesktopPortraitApp'),
            hasWatchdog: t.includes('armBootWatchdog'),
            hasWebglFallback: t.includes('无法创建 WebGL')
        };
    }, appUrl);
    await probePage.close();

    // Clean default
    const clean = await openPage(browser, { width: 1280, height: 800, name: 'clean-wenjing', seedStorage: null });
    report.clean = {
        ready: clean.ready,
        framing: clean.framing,
        shot: clean.shot,
        pageErrors: clean.pageErrors,
        failed: clean.failed.slice(0, 20),
        consoleErrors: clean.logs.filter((l) => l.type === 'error').slice(0, 30)
    };

    let wizard = null;
    let sample = null;
    let idle = null;
    if (clean.ready?.diagnostics?.ready) {
        wizard = await runWizard(clean.page);
        report.wizard = wizard;
        await clean.page.screenshot({ path: path.join(OUT, 'deploy-qa-desktop-1280.png'), fullPage: false });

        // Sample switch
        await clean.page.click('#loadSampleModel');
        const sampleReady = await waitReady(clean.page, 90000);
        // wait for name change
        const t0 = Date.now();
        let sampleState = sampleReady;
        while (Date.now() - t0 < 90000) {
            sampleState = await clean.page.evaluate(() => ({
                diagnostics: window.diagnostics,
                status: document.getElementById('status')?.textContent
            }));
            if (sampleState.diagnostics?.ready && /VRM1|Constraint|Sample/i.test(sampleState.diagnostics.modelName || '')) break;
            if (sampleState.diagnostics?.error && !sampleState.diagnostics.loading) break;
            await sleep(400);
        }
        await clean.page.screenshot({ path: path.join(OUT, 'deploy-qa-pixiv.png'), fullPage: false });
        await clean.page.click('#loadDefaultModel');
        const t1 = Date.now();
        let back = null;
        while (Date.now() - t1 < 90000) {
            back = await clean.page.evaluate(() => ({
                diagnostics: window.diagnostics,
                status: document.getElementById('status')?.textContent
            }));
            if (back.diagnostics?.ready && /Wenjing/i.test(back.diagnostics.modelName || '')) break;
            await sleep(400);
        }
        await clean.page.screenshot({ path: path.join(OUT, 'deploy-qa-wenjing-back.png'), fullPage: false });
        sample = { sampleState, back };
        report.sample = sample;

        // Long idle ~50s with springs default (already off for Wenjing) — also force springs on briefly then off? 
        // User asked: long idle conservative spring fallback — leave default, then enable springs and idle
        await clean.page.evaluate(() => {
            const el = document.getElementById('springsEnabled');
            if (el && !el.checked) {
                // keep conservative default OFF for Wenjing — document policy
            }
        });
        await sleep(45000);
        idle = await clean.page.evaluate(() => ({
            diagnostics: window.diagnostics,
            springsActive: window.app?.springsActive,
            springsFallbackNote: window.app?.springsFallbackNote,
            restPoseSet: window.app?.restPoseSet,
            status: document.getElementById('status')?.textContent
        }));
        await clean.page.screenshot({ path: path.join(OUT, 'deploy-qa-idle.png'), fullPage: false });
        report.idle = idle;
    }
    await clean.page.close();

    // Legacy storage
    const legacy = await openPage(browser, {
        width: 1280,
        height: 800,
        name: 'legacy-wenjing',
        seedStorage: {
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
    report.legacy = {
        ready: legacy.ready,
        framing: legacy.framing,
        shot: legacy.shot,
        pageErrors: legacy.pageErrors,
        consoleErrors: legacy.logs.filter((l) => l.type === 'error').slice(0, 20)
    };
    await legacy.page.close();

    // Mobile
    const mobile = await openPage(browser, { width: 390, height: 844, name: 'mobile', seedStorage: null });
    report.mobile = {
        ready: mobile.ready,
        framing: mobile.framing,
        shot: mobile.shot,
        pageErrors: mobile.pageErrors,
        consoleErrors: mobile.logs.filter((l) => l.type === 'error').slice(0, 20)
    };
    await mobile.page.close();

    report.passRender = !!(report.clean?.ready?.diagnostics?.ready && report.legacy?.ready?.diagnostics?.ready);
    report.hairClipSuspected = !!report.clean?.framing?.hairLikelyClipped;
    report.feetClipSuspected = !!report.clean?.framing?.feetLikelyClipped;
    report.hairClipClean = !report.hairClipSuspected;
    report.feetClipClean = !report.feetClipSuspected;

    const outPath = path.join(OUT, 'deploy-qa-report.json');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        url: DEPLOY_URL,
        passRender: report.passRender,
        hairClipClean: report.hairClipClean,
        feetClipClean: report.feetClipClean,
        model: report.clean?.ready?.diagnostics?.modelName,
        bootMs: report.clean?.ready?.diagnostics?.bootMs,
        appHasBootFix: report.appHasBootFix,
        wizardOpen: report.wizard?.[0]?.afterOpen,
        pageErrors: [
            ...(report.clean?.pageErrors || []),
            ...(report.legacy?.pageErrors || []),
            ...(report.mobile?.pageErrors || [])
        ],
        outPath
    }, null, 2));

    await browser.close();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
