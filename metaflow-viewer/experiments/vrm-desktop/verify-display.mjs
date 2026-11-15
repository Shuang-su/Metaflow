/**
 * Display calibration unit + browser tests (Mac presets, WM fallback, persistence).
 */
import assert from 'node:assert/strict';
import {
    sizeFromDiagonalAspect,
    enrichPreset,
    listDisplayPresets,
    MACBOOK_PRESETS,
    EXTERNAL_PRESETS,
    screenProfileKey,
    calibrateFromRuler,
    applyCustomExternal,
    suggestViewportPhysicalMeters,
    featureDetectWindowManagement,
    capabilitiesVsLimitations,
    CREDIT_CARD_MM
} from './display-calibration.mjs';
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8774;
const ARTIFACT = '/opt/cursor/artifacts';

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function unitTests() {
    console.log('=== unit: presets & math ===');
    const mba = enrichPreset(MACBOOK_PRESETS[0]);
    assert.ok(mba.physical?.widthCm > 20 && mba.physical.widthCm < 40);
    assert.match(mba.physicalLabel, /推算/);
    assert.match(mba.label, /手动/);

    const ext = enrichPreset(EXTERNAL_PRESETS.find((p) => p.id === 'ext-27-16x9'));
    assert.ok(Math.abs(ext.aspect - 16 / 9) < 1e-6);
    assert.ok(ext.physical.heightCm < ext.physical.widthCm);

    const ultra = enrichPreset(EXTERNAL_PRESETS.find((p) => p.id === 'ext-34-21x9'));
    assert.ok(ultra.aspect > 2);

    const all = listDisplayPresets();
    assert.ok(all.length >= 8);
    assert.ok(all.every((p) => p.source));

    const custom = applyCustomExternal({ widthCm: 60, heightCm: 34 });
    assert.equal(custom.widthM, 0.6);
    assert.equal(custom.derived, false);

    const fromDiag = applyCustomExternal({ diagonalIn: 27, aspect: 16 / 9 });
    assert.ok(fromDiag.derived);

    const layers = {
        viewportCssPx: { w: 1280, h: 800 },
        screenLogicalPx: { w: 1920, h: 1080 },
        devicePixelRatio: 2,
        backingApproxPx: { w: 2560, h: 1600 },
        screenAvailLogicalPx: { w: 1920, h: 1055 }
    };
    const suggest = suggestViewportPhysicalMeters(0.6, 0.3375, layers);
    assert.ok(suggest.widthM < 0.6);
    assert.match(suggest.labeled, /未自动写入/);

    // 85.6 CSS px spanning a real 85.6 mm card → 1 px/mm → 856 px screen ≈ 85.6 cm wide
    const ruler = calibrateFromRuler(85.6, CREDIT_CARD_MM.width, {
        ...layers,
        screenLogicalPx: { w: 856, h: 540 }
    });
    assert.ok(Math.abs(ruler.widthCm - 85.6) < 0.2);

    const k1 = screenProfileKey({ width: 1920, height: 1080, devicePixelRatio: 2, isInternal: false });
    const k2 = screenProfileKey({ width: 1920, height: 1080, devicePixelRatio: 2, isInternal: true });
    assert.notEqual(k1, k2);
    assert.match(k1, /^s_/);

    const caps = capabilitiesVsLimitations();
    assert.ok(caps.can.length && caps.cannot.length);
    assert.ok(caps.cannot.some((t) => /机型/.test(t)));

    console.log('unit OK');
}

async function browserTests() {
    console.log('=== browser: Safari-like fallback + simulated WM ===');
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

    // --- Fallback path (no getScreenDetails) ---
    await page.evaluateOnNewDocument(() => {
        try {
            delete window.getScreenDetails;
        } catch {
            window.getScreenDetails = undefined;
        }
    });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let i = 0; i < 60; i++) {
        await sleep(500);
        if (await page.evaluate(() => window.app && document.getElementById('displayPreset')?.options?.length)) break;
    }

    const fallback = await page.evaluate(async () => {
        const note = document.getElementById('windowMgmtNote')?.textContent || '';
        const recognize = document.getElementById('recognizeDisplays');
        recognize.click();
        await new Promise((r) => setTimeout(r, 300));
        const status = document.getElementById('status')?.textContent || '';
        const layers = {
            viewport: document.getElementById('displayLayerGrid')?.textContent,
            presets: [...document.getElementById('displayPreset').options].map((o) => o.value)
        };
        // Apply MBA preset → suggest → commit
        document.getElementById('displayPreset').value = 'mba-13-6';
        document.getElementById('displayPreset').dispatchEvent(new Event('change'));
        document.getElementById('applyDisplayPreset').click();
        const suggestBefore = document.getElementById('displaySuggestNote')?.textContent || '';
        const wBefore = window.app.params.width;
        document.getElementById('commitSuggestedDisplay').click();
        const wAfter = window.app.params.width;

        // Persist screen profile
        document.getElementById('screenProfileLabel').value = '测试档案';
        document.getElementById('saveScreenProfile').click();
        const raw = localStorage.getItem('metaflow.vrm-desktop.screen-profiles.v1');
        const profiles = raw ? JSON.parse(raw) : {};

        // Fake "Safari" explanation presence
        return {
            note,
            status,
            layers,
            suggestBefore,
            widthChanged: wAfter !== wBefore,
            profileCount: Object.keys(profiles).length,
            hasMba: layers.presets.includes('mba-13-6'),
            hasUltra: layers.presets.includes('ext-34-21x9'),
            noFakeDetect: !/已检测|detected model/i.test(note + status + suggestBefore)
        };
    });
    console.log('[fallback]', fallback);
    assert.ok(/无 getScreenDetails|不会伪造|手动/.test(fallback.note + fallback.status));
    assert.ok(fallback.hasMba && fallback.hasUltra);
    assert.ok(fallback.widthChanged);
    assert.ok(fallback.profileCount >= 1);
    assert.ok(fallback.noFakeDetect);
    await page.screenshot({ path: path.join(ARTIFACT, 'vrm-display-fallback.png') });

    // --- Simulated Window Management API ---
    await page.evaluate(() => {
        const makeScreen = (label, width, height, isInternal, isPrimary) => {
            const s = {
                label,
                width,
                height,
                availWidth: width,
                availHeight: height - 40,
                left: isPrimary ? 0 : width,
                top: 0,
                devicePixelRatio: 2,
                isInternal,
                isPrimary,
                addEventListener() {},
                removeEventListener() {}
            };
            return s;
        };
        const builtin = makeScreen('Built-in Retina', 1512, 982, true, true);
        const external = makeScreen('DELL U2720Q', 2560, 1440, false, false);
        let current = builtin;
        const listeners = { currentscreenchange: [], screenschange: [] };
        const details = {
            screens: [builtin, external],
            get currentScreen() {
                return current;
            },
            addEventListener(type, fn) {
                listeners[type]?.push(fn);
            },
            removeEventListener(type, fn) {
                const arr = listeners[type];
                if (!arr) return;
                const i = arr.indexOf(fn);
                if (i >= 0) arr.splice(i, 1);
            },
            _switch(toExternal) {
                current = toExternal ? external : builtin;
                listeners.currentscreenchange.forEach((fn) => fn());
            }
        };
        window.getScreenDetails = async () => details;
        window.__fakeScreenDetails = details;
    });

    // Need reload? getScreenDetails is set on current page — app featureDetect already ran.
    // Call request path via button; app uses window.getScreenDetails at click time — OK.
    const wm = await page.evaluate(async () => {
        document.getElementById('recognizeDisplays').click();
        await new Promise((r) => setTimeout(r, 400));
        const listText = document.getElementById('screenList')?.textContent || '';
        const status = document.getElementById('status')?.textContent || '';
        // Save calibration on builtin
        document.getElementById('screenProfileLabel').value = '内建';
        window.app.params.width = 0.22;
        window.app.params.height = 0.14;
        document.getElementById('saveScreenProfile').click();
        const wBeforeSwitch = window.app.params.width;
        // Switch to external — should refresh suggestion, NOT overwrite params
        window.__fakeScreenDetails._switch(true);
        await new Promise((r) => setTimeout(r, 200));
        const wAfterSwitch = window.app.params.width;
        const suggest = document.getElementById('displaySuggestNote')?.textContent || '';
        const status2 = document.getElementById('status')?.textContent || '';
        return {
            listText,
            status,
            status2,
            preservedWidth: wAfterSwitch === wBeforeSwitch,
            listHasExternal: /2560|外接|DELL|U2720/i.test(listText)
        };
    });
    console.log('[wm-sim]', wm);
    assert.ok(/显示器|读取/.test(wm.status));
    assert.ok(wm.preservedWidth, 'switching screens must not overwrite live params');
    await page.screenshot({ path: path.join(ARTIFACT, 'vrm-display-wm-sim.png') });

    // --- DPR / resize persistence ---
    const persist = await page.evaluate(async () => {
        document.getElementById('saveSettings').click();
        const before = localStorage.getItem('metaflow.vrm-desktop.settings.v2');
        // trigger resize observer path
        window.dispatchEvent(new Event('resize'));
        await new Promise((r) => setTimeout(r, 100));
        const after = localStorage.getItem('metaflow.vrm-desktop.settings.v2');
        const profiles = localStorage.getItem('metaflow.vrm-desktop.screen-profiles.v1');
        return {
            settingsStable: before === after,
            hasProfiles: !!profiles && profiles.length > 2
        };
    });
    console.log('[persist]', persist);
    assert.ok(persist.settingsStable);
    assert.ok(persist.hasProfiles);

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3 });
    await sleep(500);
    await page.screenshot({ path: path.join(ARTIFACT, 'vrm-display-mobile.png') });

    const report = { fallback, wm, persist, ok: true };
    fs.writeFileSync(path.join(ARTIFACT, 'vrm-display-report.json'), JSON.stringify(report, null, 2));

    await browser.close();
    server.kill();
    console.log('browser OK');
}

async function main() {
    unitTests();
    // featureDetect in node has no window — skip
    await browserTests();
    console.log('\nverify-display complete');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
