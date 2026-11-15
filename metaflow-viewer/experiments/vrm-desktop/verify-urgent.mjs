/**
 * Urgent visual verification: Wenjing VRM0 facing camera + framing.
 */
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8770;
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

async function capture(page, name, loadAction) {
    if (loadAction) await loadAction();
    // Wenjing is ~32MB; wait until diagnostics.ready or timeout
    for (let i = 0; i < 40; i++) {
        await sleep(1000);
        const ready = await page.evaluate(() => !!window.diagnostics?.ready && !!window.app?.vrm);
        if (ready) break;
    }
    await sleep(2000);
    const diag = await page.evaluate(() => ({
        diagnostics: window.diagnostics,
        status: document.getElementById('status')?.textContent,
        eye: window.app?.params?.eye,
        sceneRotY: window.app?.vrm?.scene?.rotation?.y,
        personY: window.app?.personRoot?.position?.y
    }));
    console.log(`\n[${name}]`, JSON.stringify(diag, null, 2));
    const out = path.join(ARTIFACT, `vrm-urgent-${name}.png`);
    await page.screenshot({ path: out, type: 'png' });
    console.log('saved', out, fs.statSync(out).size, 'bytes');
    return diag;
}

async function main() {
    const server = await startServer();
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-unsafe-swiftshader', '--use-gl=swiftshader']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    page.on('console', (m) => {
        if (['error', 'warning', 'log'].includes(m.type())) {
            const t = m.text();
            if (t.includes('[VRM]') || t.includes('[Pose]') || t.includes('[Normalize]') || m.type() === 'error') {
                console.log(`[browser ${m.type()}]`, t);
            }
        }
    });
    page.on('pageerror', (e) => console.error('[pageerror]', e.message));

    try {
        await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        const wenjing = await capture(page, 'wenjing-1280x800');
        if (!wenjing.diagnostics?.ready) throw new Error('Wenjing failed to load');
        if (wenjing.diagnostics.metaVersion === '0' && !wenjing.diagnostics.rotatedVRM0) {
            throw new Error('VRM0 loaded but rotateVRM0 flag false');
        }
        if (Math.abs((wenjing.sceneRotY || 0) - Math.PI) > 0.01 && wenjing.diagnostics.metaVersion === '0') {
            throw new Error(`Expected VRM0 scene.rotation.y=PI, got ${wenjing.sceneRotY}`);
        }
        if (!/文镜|Wenjing|彩茫|Unknown/i.test(wenjing.status || '') && !(wenjing.diagnostics.modelName)) {
            console.warn('Unexpected status/name:', wenjing.status, wenjing.diagnostics.modelName);
        }

        await capture(page, 'vrm1-sample-1280x800', async () => {
            await page.click('#loadSampleModel');
        });

        await page.setViewport({ width: 1024, height: 768 });
        await page.click('#loadDefaultModel');
        await capture(page, 'wenjing-1024x768');

        console.log('\nUrgent verification captures complete');
    } finally {
        await browser.close();
        server.kill();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
