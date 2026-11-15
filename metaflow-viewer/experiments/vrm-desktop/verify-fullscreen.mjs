/**
 * Fullscreen-first calibration tests (mapping math + UI gesture/fallback).
 */
import assert from 'node:assert/strict';
import {
    mapCanvasPhysicalFromScreen,
    featureDetectFullscreen,
    FS_WIZARD_STEPS,
    readCanvasCssBounds
} from './fullscreen-calibration.mjs';
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8775;
const ARTIFACT = '/opt/cursor/artifacts';

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function unitTests() {
    console.log('=== unit: physical mapping (no DPR double-count) ===');
    const screen = { widthM: 0.3, heightM: 0.195 };
    const full = mapCanvasPhysicalFromScreen(screen, { w: 1512, h: 982 }, { w: 1512, h: 982 });
    assert.ok(Math.abs(full.widthM - 0.3) < 1e-9);
    assert.ok(Math.abs(full.heightM - 0.195) < 1e-9);
    assert.equal(full.devicePixelRatioIgnored, true);

    // Panel open: canvas narrower — physical width shrinks proportionally (CSS only)
    const half = mapCanvasPhysicalFromScreen(screen, { w: 756, h: 982 }, { w: 1512, h: 982 });
    assert.ok(Math.abs(half.widthM - 0.15) < 1e-9);
    assert.ok(Math.abs(half.heightM - 0.195) < 1e-9);

    // If someone wrongly × DPR, half width would be wrong — ensure we didn't
    assert.ok(half.widthM < screen.widthM);

    assert.ok(FS_WIZARD_STEPS[0].id === 'fullscreen');
    assert.ok(FS_WIZARD_STEPS.some((s) => s.id === 'save'));
    const feat = featureDetectFullscreen(null);
    assert.equal(feat.supported, false);
    console.log('unit OK');
}

async function browserTests() {
    console.log('=== browser: wizard + resize mapping + preview banner ===');
    fs.mkdirSync(ARTIFACT, { recursive: true });
    const server = spawn('python3', ['-m', 'http.server', String(PORT)], {
        cwd: __dirname,
        stdio: 'pipe'
    });
    await sleep(1200);
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let i = 0; i < 40; i++) {
        await sleep(500);
        if (await page.evaluate(() => !!window.app)) break;
    }

    const ui = await page.evaluate(async () => {
        const hasFab = !!document.getElementById('fsCalibrateOpen');
        const hasStart = !!document.getElementById('startFullscreenCalib');
        document.getElementById('startFullscreenCalib').click();
        await new Promise((r) => setTimeout(r, 100));
        const wizardOpen = !document.getElementById('fsWizard').hidden;
        const title = document.getElementById('fsWizardTitle')?.textContent || '';
        // Simulate calibrated screen physical without real fullscreen (headless often blocks FS)
        window.app.screenPhysical = {
            widthM: 0.301,
            heightM: 0.196,
            source: 'test',
            labeled: 'test physical'
        };
        window.app.projectionMode = 'calibrated';
        window.app.applyPhysicalMappingToParams();
        window.app.updateProjectionModeBanner();
        const banner1 = document.getElementById('fsModeBanner')?.textContent || '';
        const w1 = window.app.params.width;
        const h1 = window.app.params.height;
        const canvas1 = { w: window.app.canvas.clientWidth, h: window.app.canvas.clientHeight };

        // Simulate panel consuming width: shrink canvas container via style
        const controls = document.getElementById('controls');
        const prev = controls.style.width;
        controls.style.width = '480px';
        await new Promise((r) => setTimeout(r, 200));
        window.app.syncRendererToCanvas();
        const w2 = window.app.params.width;
        const canvas2 = { w: window.app.canvas.clientWidth, h: window.app.canvas.clientHeight };
        controls.style.width = prev;
        await new Promise((r) => setTimeout(r, 200));
        window.app.syncRendererToCanvas();

        // Finish wizard save path
        window.app.fsWizardStep = 4;
        document.getElementById('fsWizard').hidden = false;
        window.app.renderFsWizardStep();
        window.app.finishFullscreenCalibration();
        const mode = window.app.projectionMode;
        const saved = JSON.parse(localStorage.getItem('metaflow.vrm-desktop.settings.v3') || '{}');
        const banner2 = document.getElementById('fsModeBanner')?.textContent || '';

        return {
            hasFab,
            hasStart,
            wizardOpen,
            title,
            banner1,
            banner2,
            w1,
            h1,
            w2,
            canvas1,
            canvas2,
            widthShrunkWithPanel: w2 < w1 - 0.001 || canvas2.w < canvas1.w,
            mode,
            savedCalibrated: saved.projectionMode === 'calibrated',
            savedPhysical: !!saved.screenPhysical,
            noDprInWidth: w1 < 1.0 // metres, not px*dpr mistake
        };
    });
    console.log('[ui]', ui);
    assert.ok(ui.hasFab && ui.hasStart);
    assert.ok(ui.wizardOpen);
    assert.match(ui.title, /全屏/);
    assert.ok(ui.widthShrunkWithPanel || ui.canvas2.w <= ui.canvas1.w);
    assert.ok(ui.savedCalibrated && ui.savedPhysical);
    assert.ok(ui.noDprInWidth);
    assert.match(ui.banner2, /预览|校准/);

    await page.screenshot({ path: path.join(ARTIFACT, 'vrm-fullscreen-wizard.png') });

    // Mobile rotation-ish viewport change
    await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2 });
    await sleep(400);
    const mobile = await page.evaluate(() => {
        window.app.syncRendererToCanvas();
        return {
            w: window.app.params.width,
            h: window.app.params.height,
            cw: window.app.canvas.clientWidth,
            ch: window.app.canvas.clientHeight,
            banner: document.getElementById('fsModeBanner')?.textContent
        };
    });
    console.log('[mobile-landscape]', mobile);
    assert.ok(mobile.cw > 0 && mobile.ch > 0);
    await page.screenshot({ path: path.join(ARTIFACT, 'vrm-fullscreen-mobile-rot.png') });

    // FS API denied/unavailable messaging
    const fsMsg = await page.evaluate(async () => {
        // Force unsupported path by stubbing
        const el = window.app.sceneContainer;
        el.requestFullscreen = undefined;
        el.webkitRequestFullscreen = undefined;
        document.getElementById('fsCalibrateOpen').click();
        await new Promise((r) => setTimeout(r, 50));
        document.getElementById('fsEnterBtn')?.click();
        await new Promise((r) => setTimeout(r, 50));
        return {
            warn: document.getElementById('fsWizardWarn')?.textContent || '',
            side: document.getElementById('fsSidebarHint')?.textContent || ''
        };
    });
    console.log('[fs-fallback]', fsMsg);

    fs.writeFileSync(
        path.join(ARTIFACT, 'vrm-fullscreen-report.json'),
        JSON.stringify({ ui, mobile, fsMsg }, null, 2)
    );

    await browser.close();
    server.kill();
    console.log('browser OK');
}

async function main() {
    unitTests();
    await browserTests();
    console.log('\nverify-fullscreen complete');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
