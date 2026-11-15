/**
 * P0: serve the exact ZIP over plain HTTP (no Vite), empty + legacy localStorage,
 * prove Wenjing boots and fullscreen wizard UI opens. Captures screenshots + console.
 */
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_ZIP = '/opt/cursor/artifacts/metaflow-desktop-preview.zip';
const OUT_DIR = '/opt/cursor/artifacts';
const EXTRACT_DIR = '/tmp/vrm-desktop-p0-zip';
const PORT = 8793;

function sha256File(p) {
    return createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function contentType(filePath) {
    if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
    if (filePath.endsWith('.mjs') || filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
    if (filePath.endsWith('.vrm')) return 'model/gltf-binary';
    if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
    if (filePath.endsWith('.json')) return 'application/json';
    return 'application/octet-stream';
}

function extractZip(zipPath, dest) {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    const r = spawn('unzip', ['-o', '-q', zipPath, '-d', dest], { stdio: 'inherit' });
    return new Promise((resolve, reject) => {
        r.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`unzip exit ${code}`))));
    });
}

function startStaticServer(root, port) {
    const server = http.createServer((req, res) => {
        try {
            const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
            let rel = urlPath === '/' ? '/index.html' : urlPath;
            const filePath = path.normalize(path.join(root, rel));
            if (!filePath.startsWith(root)) {
                res.writeHead(403);
                res.end('forbidden');
                return;
            }
            if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                res.writeHead(404);
                res.end('not found');
                return;
            }
            res.writeHead(200, {
                'Content-Type': contentType(filePath),
                'Cache-Control': 'no-store'
            });
            fs.createReadStream(filePath).pipe(res);
        } catch (err) {
            res.writeHead(500);
            res.end(String(err));
        }
    });
    return new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => resolve(server));
    });
}

async function waitForReady(page, timeoutMs = 90000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const d = await page.evaluate(() => ({
            diagnostics: window.diagnostics || null,
            status: document.getElementById('status')?.textContent || '',
            bootPhase: window.__bootPhase || null,
            bootError: window.__bootError || null,
            hasApp: !!window.app,
            wizardOpen: !!window.app?.fsWizardOpen,
            canvasPx: (() => {
                const c = document.getElementById('main-canvas');
                return c ? { w: c.width, h: c.height } : null;
            })()
        }));
        if (d.diagnostics?.ready) return d;
        if (d.bootError || (d.diagnostics?.error && !d.diagnostics?.loading)) {
            return d;
        }
        await new Promise((r) => setTimeout(r, 500));
    }
    return page.evaluate(() => ({
        diagnostics: window.diagnostics || null,
        status: document.getElementById('status')?.textContent || '',
        bootPhase: window.__bootPhase || null,
        bootError: window.__bootError || null,
        hasApp: !!window.app,
        timeout: true
    }));
}

async function runScenario(browser, baseUrl, { name, seedStorage }) {
    const logs = [];
    const pageErrors = [];
    const page = await browser.newPage();
    page.on('console', (msg) => logs.push({ type: msg.type(), text: msg.text() }));
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    page.on('requestfailed', (req) => {
        logs.push({
            type: 'requestfailed',
            text: `${req.url()} :: ${req.failure()?.errorText || 'failed'}`
        });
    });

    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

    if (seedStorage) {
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.evaluate((payload) => {
            localStorage.clear();
            for (const [k, v] of Object.entries(payload)) {
                localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
            }
        }, seedStorage);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    } else {
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    }

    const ready = await waitForReady(page, 90000);
    const shotReady = path.join(OUT_DIR, `p0-${name}-wenjing-ready.png`);
    await page.screenshot({ path: shotReady, fullPage: false });

    let wizard = null;
    let shotWizard = null;
    if (ready.diagnostics?.ready && ready.hasApp) {
        await page.click('#startFullscreenCalib');
        await new Promise((r) => setTimeout(r, 800));
        wizard = await page.evaluate(() => ({
            open: !!window.app?.fsWizardOpen,
            step: window.app?.fsWizardStep ?? null,
            overlayVisible: !document.getElementById('fsWizard')?.hidden,
            title: document.getElementById('fsWizardTitle')?.textContent || '',
            status: document.getElementById('status')?.textContent || ''
        }));
        shotWizard = path.join(OUT_DIR, `p0-${name}-wizard-open.png`);
        await page.screenshot({ path: shotWizard, fullPage: false });

        // pixiv sample should change status / model (may take a bit)
        const beforeName = ready.diagnostics?.modelName || '';
        await page.click('#loadSampleModel');
        const sampleStarted = Date.now();
        let sample = null;
        while (Date.now() - sampleStarted < 60000) {
            sample = await page.evaluate(() => ({
                diagnostics: window.diagnostics || null,
                status: document.getElementById('status')?.textContent || ''
            }));
            if (
                sample.diagnostics?.ready &&
                sample.diagnostics?.modelName &&
                sample.diagnostics.modelName !== beforeName
            ) {
                break;
            }
            if (sample.diagnostics?.error && !sample.diagnostics?.loading) break;
            await new Promise((r) => setTimeout(r, 400));
        }
        const shotSample = path.join(OUT_DIR, `p0-${name}-pixiv-sample.png`);
        await page.screenshot({ path: shotSample, fullPage: false });
        await page.close();
        return {
            name,
            ready,
            wizard,
            sample: {
                ready: !!sample?.diagnostics?.ready,
                modelName: sample?.diagnostics?.modelName || null,
                metaVersion: sample?.diagnostics?.metaVersion || null,
                status: sample?.status
            },
            shots: { ready: shotReady, wizard: shotWizard, sample: shotSample },
            logs: logs.slice(-40),
            pageErrors
        };
    }

    await page.close();
    return {
        name,
        ready,
        wizard,
        sample: null,
        shots: { ready: shotReady, wizard: shotWizard, sample: null },
        logs: logs.slice(-40),
        pageErrors
    };
}

async function main() {
    if (!fs.existsSync(ARTIFACT_ZIP)) {
        throw new Error(`Missing artifact zip: ${ARTIFACT_ZIP}`);
    }
    const zipSha = sha256File(ARTIFACT_ZIP);
    console.log('ZIP SHA256', zipSha);
    await extractZip(ARTIFACT_ZIP, EXTRACT_DIR);

    // Sanity: required modules present in ZIP extract
    for (const rel of [
        'index.html',
        'app.mjs',
        'settings.mjs',
        'fullscreen-calibration.mjs',
        'vendor/three.module.js',
        'vendor/three-vrm.module.js',
        'vendor/addons/loaders/GLTFLoader.js',
        'models/wenjing.vrm',
        'models/minimal-avatar.vrm'
    ]) {
        const p = path.join(EXTRACT_DIR, rel);
        if (!fs.existsSync(p)) throw new Error(`ZIP missing ${rel}`);
    }

    const server = await startStaticServer(EXTRACT_DIR, PORT);
    const baseUrl = `http://127.0.0.1:${PORT}/`;
    console.log('Serving', baseUrl);

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

    const empty = await runScenario(browser, baseUrl, { name: 'empty-storage', seedStorage: null });
    const legacy = await runScenario(browser, baseUrl, {
        name: 'legacy-v2-storage',
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

    await browser.close();
    server.close();

    const report = {
        zip: ARTIFACT_ZIP,
        zipSha256: zipSha,
        baseUrl,
        empty,
        legacy,
        pass:
            !!empty.ready?.diagnostics?.ready &&
            !!empty.wizard?.open &&
            !!legacy.ready?.diagnostics?.ready &&
            !!legacy.wizard?.open
    };

    const reportPath = path.join(OUT_DIR, 'p0-boot-verify.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        pass: report.pass,
        zipSha256: zipSha,
        emptyReady: empty.ready?.diagnostics?.ready,
        emptyModel: empty.ready?.diagnostics?.modelName,
        emptyWizard: empty.wizard?.open,
        emptyStatus: empty.ready?.status,
        legacyReady: legacy.ready?.diagnostics?.ready,
        legacyWizard: legacy.wizard?.open,
        emptyBootError: empty.ready?.bootError,
        pageErrors: [...empty.pageErrors, ...legacy.pageErrors],
        reportPath
    }, null, 2));

    if (!report.pass) process.exit(1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
