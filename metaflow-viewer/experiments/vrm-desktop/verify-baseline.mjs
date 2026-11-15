/**
 * Usability baseline verification: pose, quality tiers, idle springs, UI layout.
 */
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8771;
const ARTIFACT = '/opt/cursor/artifacts';

async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function startServer() {
    const server = spawn('python3', ['-m', 'http.server', String(PORT)], {
        cwd: __dirname,
        stdio: 'pipe'
    });
    await sleep(1500);
    return server;
}

async function waitReady(page, timeoutSec = 90, { expectName = null, afterGen = null } = {}) {
    for (let i = 0; i < timeoutSec; i++) {
        await sleep(1000);
        const state = await page.evaluate(() => ({
            ready: !!window.diagnostics?.ready && !!window.app?.vrm,
            loading: !!window.diagnostics?.loading,
            failed: window.diagnostics?.ready === false && !window.diagnostics?.loading,
            name: window.diagnostics?.modelName,
            gen: window.diagnostics?.generation,
            meta: window.diagnostics?.metaVersion,
            quat: window.diagnostics?.leftUpperArmQuat
        }));
        if (state.failed && afterGen != null && state.gen >= afterGen) return false;
        if (!state.ready || state.loading) continue;
        if (afterGen != null && !(state.gen > afterGen)) continue;
        if (expectName && !(state.name || '').toLowerCase().includes(expectName.toLowerCase())) continue;
        return state;
    }
    return false;
}

async function snap(page, name) {
    const out = path.join(ARTIFACT, `vrm-baseline-${name}.png`);
    await page.screenshot({ path: out, type: 'png' });
    console.log('saved', out, fs.statSync(out).size, 'bytes');
    return out;
}

async function main() {
    fs.mkdirSync(ARTIFACT, { recursive: true });
    const server = await startServer();
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-unsafe-swiftshader', '--use-gl=swiftshader']
    });
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('[pageerror]', e.message));
    page.on('console', (m) => {
        if (m.type() === 'error' || (m.type() === 'log' && m.text().includes('[Pose]'))) {
            console.log(`[browser ${m.type()}]`, m.text());
        }
    });

    const report = { checks: [], failures: [] };

    try {
        await page.setViewport({ width: 1280, height: 800 });
        await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // --- Wenjing load ---
        const wenjingReady = await waitReady(page, 100, { expectName: 'Wenjing' });
        if (!wenjingReady) {
            report.failures.push('Wenjing failed to load');
            throw new Error('Wenjing load failed');
        }
        const wenjing = await page.evaluate(() => ({
            d: window.diagnostics,
            status: document.getElementById('status')?.textContent,
            pixelRatio: window.app?.renderer?.getPixelRatio?.(),
            shadows: window.app?.renderer?.shadowMap?.enabled,
            restPose: window.app?.restPoseSet,
            springs: window.app?.springsActive,
            quality: window.app?.profile?.id,
            sceneRotY: window.app?.vrm?.scene?.rotation?.y,
            personY: window.app?.personRoot?.position?.y,
            armAngle: (() => {
                const n = window.app?.vrm?.humanoid?.getNormalizedBoneNode?.('leftUpperArm');
                return n ? { x: n.quaternion.x, y: n.quaternion.y, z: n.quaternion.z, w: n.quaternion.w } : null;
            })(),
            headerVisible: (() => {
                const title = document.querySelector('.app-title');
                const r = title?.getBoundingClientRect();
                return r && r.top >= 0 && r.bottom <= window.innerHeight;
            })(),
            statusVisible: (() => {
                const s = document.getElementById('status');
                const r = s?.getBoundingClientRect();
                return r && r.top >= 0 && r.bottom <= window.innerHeight;
            })(),
            canvasH: window.app?.canvas?.clientHeight
        }));
        console.log('\n[wenjing]', JSON.stringify(wenjing, null, 2));
        report.checks.push({ name: 'wenjing-load', ...wenjing });

        if (wenjing.d?.metaVersion === '0' && !wenjing.d?.rotatedVRM0) {
            report.failures.push('VRM0 not rotated');
        }
        if (wenjing.d?.metaVersion === '0' && Math.abs((wenjing.sceneRotY || 0) - Math.PI) > 0.01) {
            report.failures.push(`VRM0 rotation.y expected PI, got ${wenjing.sceneRotY}`);
        }
        if (!wenjing.restPose) report.failures.push('restPose not applied');
        // Quaternion should not be near identity if arms folded
        const aq = wenjing.armAngle;
        if (aq && Math.abs(aq.z) < 0.05 && Math.abs(aq.x) < 0.05) {
            report.failures.push('leftUpperArm still near identity — rest pose not visible');
        }
        if (!wenjing.headerVisible) report.failures.push('app title offscreen at 1280x800');
        if (!wenjing.statusVisible) report.failures.push('status offscreen at 1280x800');
        if (!(wenjing.canvasH > 200)) report.failures.push('canvas too short');

        await sleep(2500);
        await snap(page, 'wenjing-1280x800');

        // --- Quality tiers actually change renderer ---
        const qualitySweep = await page.evaluate(async () => {
            const results = {};
            for (const q of ['battery', 'balanced', 'quality']) {
                const sel = document.getElementById('qualityPreset');
                sel.value = q;
                sel.dispatchEvent(new Event('change'));
                await new Promise((r) => setTimeout(r, 200));
                results[q] = {
                    profile: window.app.profile.id,
                    pixelRatio: window.app.renderer.getPixelRatio(),
                    shadows: window.app.renderer.shadowMap.enabled,
                    springs: window.app.springsActive,
                    keyIntensity: window.app.lights.key.intensity,
                    fillVisible: window.app.lights.fill.visible
                };
            }
            // restore balanced
            const sel = document.getElementById('qualityPreset');
            sel.value = 'balanced';
            sel.dispatchEvent(new Event('change'));
            return results;
        });
        console.log('\n[quality]', JSON.stringify(qualitySweep, null, 2));
        report.checks.push({ name: 'quality-sweep', qualitySweep });
        if (!(qualitySweep.battery.pixelRatio <= qualitySweep.balanced.pixelRatio)) {
            report.failures.push('battery DPR should be <= balanced');
        }
        if (qualitySweep.battery.shadows !== false) report.failures.push('battery should disable shadows');
        if (qualitySweep.quality.shadows !== true) report.failures.push('quality should enable shadows');
        if (qualitySweep.battery.springs !== false) report.failures.push('battery should disable springs');
        if (qualitySweep.battery.pixelRatio === qualitySweep.quality.pixelRatio &&
            qualitySweep.battery.shadows === qualitySweep.quality.shadows) {
            report.failures.push('quality dropdown appears inert');
        }
        await snap(page, 'wenjing-quality-battery');

        // --- Long idle then pose/lookAt stress ---
        await page.evaluate(() => {
            const sel = document.getElementById('qualityPreset');
            sel.value = 'balanced';
            sel.dispatchEvent(new Event('change'));
        });
        console.log('Simulating idle + lookAt drift (8s)...');
        await page.evaluate(() => {
            // Nudge eye to force lookAt movement
            if (window.app?.params?.eye) {
                window.app.params.eye.x = 0.08;
                window.app.updateProjection();
            }
        });
        await sleep(8000);
        await page.evaluate(() => {
            document.getElementById('resettleSprings')?.click();
            if (window.app?.params?.eye) {
                window.app.params.eye.x = -0.02;
                window.app.updateProjection();
            }
        });
        await sleep(2000);
        const afterIdle = await page.evaluate(() => ({
            ready: window.diagnostics?.ready,
            restPose: window.app?.restPoseSet,
            springs: window.app?.springsActive,
            status: document.getElementById('status')?.textContent
        }));
        console.log('\n[after-idle]', afterIdle);
        report.checks.push({ name: 'after-idle', ...afterIdle });
        await snap(page, 'wenjing-after-idle');

        // --- VRM1 sample ---
        const genBeforeSample = await page.evaluate(() => window.diagnostics?.generation || 0);
        await page.click('#loadSampleModel');
        const vrm1Ready = await waitReady(page, 90, { afterGen: genBeforeSample });
        if (!vrm1Ready) {
            report.failures.push('VRM1 sample failed to load');
        } else {
            const vrm1 = await page.evaluate(() => ({
                d: window.diagnostics,
                restPose: window.app?.restPoseSet,
                meta: window.diagnostics?.metaVersion,
                name: window.diagnostics?.modelName,
                sceneRotY: window.app?.vrm?.scene?.rotation?.y,
                armAngle: (() => {
                    const n = window.app?.vrm?.humanoid?.getNormalizedBoneNode?.('leftUpperArm');
                    return n ? { x: n.quaternion.x, y: n.quaternion.y, z: n.quaternion.z, w: n.quaternion.w } : null;
                })()
            }));
            console.log('\n[vrm1]', JSON.stringify(vrm1, null, 2));
            report.checks.push({ name: 'vrm1', ...vrm1 });
            if (vrm1.meta === '0') report.failures.push('sample should not be VRM0');
            if (/wenjing/i.test(vrm1.name || '')) report.failures.push('sample still showing Wenjing');
            await sleep(2000);
            await snap(page, 'vrm1-1280x800');

            await sleep(5000);
            await page.click('#resettleSprings');
            await sleep(1500);
            await snap(page, 'vrm1-after-idle');
        }

        // --- Mobile layout ---
        await page.setViewport({ width: 390, height: 844 });
        const genBeforeMobile = await page.evaluate(() => window.diagnostics?.generation || 0);
        await page.click('#loadDefaultModel');
        if (!(await waitReady(page, 100, { expectName: 'Wenjing', afterGen: genBeforeMobile }))) {
            report.failures.push('Wenjing reload failed on mobile viewport');
        } else {
            await sleep(2000);
            const mobile = await page.evaluate(() => {
                const title = document.querySelector('.app-title')?.getBoundingClientRect();
                const status = document.getElementById('status')?.getBoundingClientRect();
                const canvas = document.getElementById('main-canvas')?.getBoundingClientRect();
                return {
                    titleTop: title?.top,
                    statusTop: status?.top,
                    canvasH: canvas?.height,
                    bodyOverflow: document.body.scrollHeight > window.innerHeight + 2,
                    controlsScrollable: document.getElementById('controls')?.scrollHeight >
                        document.getElementById('controls')?.clientHeight
                };
            });
            console.log('\n[mobile]', mobile);
            report.checks.push({ name: 'mobile', ...mobile });
            // On mobile, title is in the controls panel which may need scroll — canvas must be visible
            if (!(mobile.canvasH > 150)) report.failures.push('mobile canvas too short');
            await snap(page, 'wenjing-mobile-390x844');
        }

        // Desktop layout again after reload
        await page.setViewport({ width: 1024, height: 768 });
        await sleep(1500);
        await snap(page, 'wenjing-1024x768');

        const reportPath = path.join(ARTIFACT, 'vrm-baseline-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log('\nReport:', reportPath);
        console.log('Failures:', report.failures.length ? report.failures : 'none');
        if (report.failures.length) process.exitCode = 1;
    } finally {
        await browser.close();
        server.kill();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
