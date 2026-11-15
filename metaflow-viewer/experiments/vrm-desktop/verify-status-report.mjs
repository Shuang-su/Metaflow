/**
 * Concrete status regression at current HEAD: pose, springs, composition,
 * display presets, fullscreen wizard. Writes JSON + screenshots.
 */
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { execSync } from 'child_process';
import { listDisplayPresets } from './display-calibration.mjs';
import { FS_WIZARD_STEPS, mapCanvasPhysicalFromScreen } from './fullscreen-calibration.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8776;
const ARTIFACT = '/opt/cursor/artifacts';

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function waitReady(page, { afterGen = null, expectName = null } = {}, timeoutSec = 100) {
    for (let i = 0; i < timeoutSec; i++) {
        await sleep(1000);
        const s = await page.evaluate(() => ({
            ready: !!window.diagnostics?.ready,
            loading: !!window.diagnostics?.loading,
            name: window.diagnostics?.modelName,
            gen: window.diagnostics?.generation,
            springs: window.app?.springsActive,
            rest: window.app?.restPoseSet
        }));
        if (!s.ready || s.loading) continue;
        if (afterGen != null && !(s.gen > afterGen)) continue;
        if (expectName && !(s.name || '').toLowerCase().includes(expectName.toLowerCase())) continue;
        return s;
    }
    return null;
}

async function measurePose(page) {
    return page.evaluate(() => {
        const h = window.app?.vrm?.humanoid;
        if (!h) return { error: 'no humanoid' };
        const w = (n) => {
            const node = h.getNormalizedBoneNode(n);
            const p = new THREE.Vector3();
            node.getWorldPosition(p);
            return { x: p.x, y: p.y, z: p.z };
        };
        const leftHand = w('leftHand');
        const rightHand = w('rightHand');
        const leftShoulder = w('leftUpperArm');
        const rightShoulder = w('rightUpperArm');
        const hips = w('hips');
        const head = w('head');
        const leftFoot = w('leftFoot');
        const q = h.getNormalizedBoneNode('leftUpperArm').quaternion;
        const cam = window.app.camera;
        const toNdc = (pos) => {
            const p = new THREE.Vector3(pos.x, pos.y, pos.z);
            p.project(cam);
            return { x: p.x, y: p.y, sy: 1 - (p.y + 1) / 2 };
        };
        const headN = toNdc(head);
        const footN = toNdc(leftFoot);
        const handDropL = leftShoulder.y - leftHand.y;
        const handDropR = rightShoulder.y - rightHand.y;
        const handSpread = Math.abs(leftHand.x - rightHand.x);
        const shoulderSpread = Math.abs(leftShoulder.x - rightShoulder.x);
        // T-pose heuristic: hands near shoulder height AND spread >> shoulder width
        const looksLikeTPose =
            handDropL < 0.01 &&
            handDropR < 0.01 &&
            handSpread > shoulderSpread * 1.8;
        const looksLikeAPose = handDropL > 0.015 && handDropR > 0.015;
        return {
            leftUpperArmQuat: [q.x, q.y, q.z, q.w],
            handDropL,
            handDropR,
            handSpread,
            shoulderSpread,
            looksLikeTPose,
            looksLikeAPose,
            springsActive: window.app.springsActive,
            springsNote: window.app.springsFallbackNote,
            restPose: window.app.restPoseSet,
            meta: window.diagnostics?.metaVersion,
            name: window.diagnostics?.modelName,
            headSy: headN.sy,
            footSy: footN.sy,
            topMargin: headN.sy,
            personY: window.app.personRoot.position.y,
            contactShadow: !!window.app.contactShadow?.visible,
            lights: {
                key: window.app.lights.key.intensity,
                fill: window.app.lights.fill.visible,
                rim: window.app.lights.rim.visible,
                hemi: window.app.lights.hemi.visible
            },
            quality: window.app.profile?.id,
            bgIsTexture: !!(window.app.scene.background && window.app.scene.background.isTexture)
        };
    });
}

async function measureHair(page) {
    return page.evaluate(() => {
        const h = window.app.vrm.humanoid;
        const head = h.getNormalizedBoneNode('head');
        const hp = new THREE.Vector3();
        head.getWorldPosition(hp);
        let maxY = hp.y;
        let hairBones = 0;
        window.app.vrm.scene.traverse((o) => {
            if (!o.isBone) return;
            if (!/hair|Hair|髪|Kami/i.test(o.name || '')) return;
            hairBones++;
            const p = new THREE.Vector3();
            o.getWorldPosition(p);
            maxY = Math.max(maxY, p.y);
        });
        return {
            hairBones,
            hairDelta: maxY - hp.y,
            spiked: maxY - hp.y > 0.08,
            springsActive: window.app.springsActive
        };
    });
}

async function main() {
    const commit = execSync('git rev-parse HEAD', { cwd: path.resolve(__dirname, '../../..') })
        .toString()
        .trim();
    const short = commit.slice(0, 8);
    fs.mkdirSync(ARTIFACT, { recursive: true });

    const presets = listDisplayPresets();
    const displayInventory = {
        macbook: presets.filter((p) => p.kind === 'builtin').map((p) => ({
            id: p.id,
            label: p.label,
            diagonalIn: p.diagonalIn,
            physicalCm: p.physical
                ? `${p.physical.widthCm.toFixed(1)}×${p.physical.heightCm.toFixed(1)}`
                : null,
            source: p.source
        })),
        external: presets.filter((p) => p.kind === 'external').map((p) => ({
            id: p.id,
            label: p.label,
            diagonalIn: p.diagonalIn,
            aspect: p.aspect,
            physicalCm: p.physical
                ? `${p.physical.widthCm.toFixed(1)}×${p.physical.heightCm.toFixed(1)}`
                : null,
            source: p.source
        })),
        wizardSteps: FS_WIZARD_STEPS.map((s) => s.id),
        mappingSanity: mapCanvasPhysicalFromScreen(
            { widthM: 0.3, heightM: 0.2 },
            { w: 750, h: 1000 },
            { w: 1500, h: 1000 }
        )
    };

    const server = spawn('python3', ['-m', 'http.server', String(PORT)], {
        cwd: __dirname,
        stdio: 'pipe'
    });
    await sleep(1500);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--enable-unsafe-swiftshader',
            '--use-gl=swiftshader'
        ]
    });
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('[pageerror]', e.message));

    const report = {
        commit,
        commitShort: short,
        generatedAt: new Date().toISOString(),
        failures: [],
        checks: {}
    };

    try {
        await page.setViewport({ width: 1280, height: 800 });
        await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // --- Wenjing initial ---
        const wReady = await waitReady(page, { expectName: 'Wenjing' });
        if (!wReady) report.failures.push('Wenjing failed to load');
        await sleep(2500);
        const wenjing = await measurePose(page);
        const wenjingHair = await measureHair(page);
        report.checks.wenjing = { ...wenjing, hair: wenjingHair, load: wReady };
        console.log('\n[wenjing]', JSON.stringify(report.checks.wenjing, null, 2));
        if (wenjing.looksLikeTPose) report.failures.push('Wenjing still looksLikeTPose numerically');
        if (!wenjing.looksLikeAPose) report.failures.push('Wenjing does not meet A-pose handDrop heuristic');
        if (wenjing.springsActive) report.failures.push('Wenjing springs should default OFF');
        if (!(wenjing.topMargin < 0.35)) report.failures.push(`Wenjing head too low / empty top (sy=${wenjing.topMargin})`);
        if (!wenjing.bgIsTexture) report.failures.push('background should be gradient texture');
        if (!wenjing.lights.fill) report.failures.push('fill light should be on in balanced');

        await page.screenshot({
            path: path.join(ARTIFACT, `status-${short}-wenjing-desktop-1280x800.png`),
            type: 'png'
        });

        // Fullscreen wizard open (cannot fully FS in headless — capture overlay)
        await page.click('#startFullscreenCalib');
        await sleep(300);
        const fsUi = await page.evaluate(() => ({
            open: !document.getElementById('fsWizard')?.hidden,
            title: document.getElementById('fsWizardTitle')?.textContent,
            banner: document.getElementById('fsModeBanner')?.textContent,
            hasEnter: !!document.getElementById('fsEnterBtn')
        }));
        report.checks.fullscreenWizard = fsUi;
        if (!fsUi.open) report.failures.push('fullscreen wizard did not open');
        await page.screenshot({
            path: path.join(ARTIFACT, `status-${short}-wenjing-fs-wizard.png`),
            type: 'png'
        });
        await page.click('#fsWizardCollapse');
        await sleep(200);

        // --- VRM1 springs OFF (default) ---
        const gen0 = await page.evaluate(() => window.diagnostics?.generation || 0);
        await page.click('#loadSampleModel');
        const v1Ready = await waitReady(page, { afterGen: gen0 });
        if (!v1Ready) report.failures.push('VRM1 failed to load');
        await sleep(2000);
        let vrm1 = await measurePose(page);
        let vrm1Hair = await measureHair(page);
        report.checks.vrm1_springsOff = { ...vrm1, hair: vrm1Hair };
        console.log('\n[vrm1 off]', JSON.stringify(report.checks.vrm1_springsOff, null, 2));
        if (vrm1.looksLikeTPose) report.failures.push('VRM1 looksLikeTPose with springs off');
        if (!vrm1.looksLikeAPose) report.failures.push('VRM1 not A-pose with springs off');
        if (vrm1.springsActive) report.failures.push('VRM1 springs should default OFF');
        if (vrm1Hair.spiked) report.failures.push('VRM1 hair spiked even with springs OFF');
        await page.screenshot({
            path: path.join(ARTIFACT, `status-${short}-vrm1-springs-off.png`),
            type: 'png'
        });

        // Enable springs + idle/lookAt stress — expect possible spike; document honestly
        await page.evaluate(() => {
            const t = document.getElementById('springsEnabled');
            t.checked = true;
            t.dispatchEvent(new Event('change'));
        });
        await sleep(500);
        await page.evaluate(() => {
            window.app.params.eye.x = 0.1;
            window.app.updateProjection();
        });
        await sleep(6000);
        await page.evaluate(() => {
            window.app.params.eye.x = -0.02;
            window.app.updateProjection();
        });
        await sleep(2000);
        vrm1Hair = await measureHair(page);
        vrm1 = await measurePose(page);
        report.checks.vrm1_springsOnAfterIdle = { ...vrm1, hair: vrm1Hair };
        console.log('\n[vrm1 on+idle]', JSON.stringify(report.checks.vrm1_springsOnAfterIdle, null, 2));
        await page.screenshot({
            path: path.join(ARTIFACT, `status-${short}-vrm1-springs-on-idle.png`),
            type: 'png'
        });
        // Turn springs back off + resettle for clean state
        await page.evaluate(() => {
            const t = document.getElementById('springsEnabled');
            t.checked = false;
            t.dispatchEvent(new Event('change'));
            document.getElementById('resettleSprings')?.click();
        });
        await sleep(1500);
        const vrm1Settled = { pose: await measurePose(page), hair: await measureHair(page) };
        report.checks.vrm1_afterDisableResettle = vrm1Settled;
        await page.screenshot({
            path: path.join(ARTIFACT, `status-${short}-vrm1-resettled.png`),
            type: 'png'
        });

        // --- Mobile Wenjing ---
        await page.setViewport({ width: 390, height: 844 });
        const gen1 = await page.evaluate(() => window.diagnostics?.generation || 0);
        await page.click('#loadDefaultModel');
        if (!(await waitReady(page, { expectName: 'Wenjing', afterGen: gen1 }))) {
            report.failures.push('Wenjing mobile reload failed');
        }
        await sleep(2000);
        const mobile = await measurePose(page);
        report.checks.wenjing_mobile = mobile;
        await page.screenshot({
            path: path.join(ARTIFACT, `status-${short}-wenjing-mobile-390x844.png`),
            type: 'png'
        });

        // Display inventory (node-side)
        report.checks.display = displayInventory;

        // Calibrator smoke: open wizard still works after model switches
        await page.setViewport({ width: 1280, height: 800 });
        await sleep(400);
        await page.click('#fsCalibrateOpen');
        await sleep(200);
        const calibStable = await page.evaluate(() => ({
            open: !document.getElementById('fsWizard')?.hidden,
            presets: document.getElementById('displayPreset')?.options?.length || 0,
            banner: document.getElementById('fsModeBanner')?.textContent
        }));
        report.checks.calibratorStable = calibStable;
        if (!calibStable.open) report.failures.push('calibrator unstable after model switches');
        await page.screenshot({
            path: path.join(ARTIFACT, `status-${short}-calibrator-stable.png`),
            type: 'png'
        });
    } finally {
        await browser.close();
        server.kill();
    }

    // ZIP checksum if present
    const zipPath = path.join(ARTIFACT, 'metaflow-desktop-preview.zip');
    let zipSha = null;
    if (fs.existsSync(zipPath)) {
        zipSha = execSync(`sha256sum "${zipPath}"`).toString().trim().split(' ')[0];
    }
    report.zip = {
        path: zipPath,
        sha256: zipSha,
        note: 'Must match rebuild from this commit; regenerate if code changes after this report'
    };
    report.failuresCount = report.failures.length;
    report.verdict =
        report.failures.length === 0
            ? 'REGRESSION_PASS_WITH_KNOWN_LIMITATIONS'
            : 'REGRESSION_HAS_FAILURES';

    const out = path.join(ARTIFACT, `status-report-${short}.json`);
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    // Also write stable name for PR
    fs.writeFileSync(path.join(ARTIFACT, 'status-report-latest.json'), JSON.stringify(report, null, 2));
    console.log('\nReport:', out);
    console.log('Failures:', report.failures.length ? report.failures : 'none');
    console.log('Verdict:', report.verdict);
    if (report.failures.length) process.exitCode = 1;
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
