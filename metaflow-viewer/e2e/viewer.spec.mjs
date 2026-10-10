import fs from 'node:fs';
const version = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url))).version;

import { expect, test } from '@playwright/test';

const rendererQuery = process.env.E2E_RENDERER === 'webgpu' ? '' : 'webgl&';
const fixtureUrl = `/e2e-fixture?${rendererQuery}noanalytics&noreveal&noanim`;

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        Date.now = () => 1_786_291_200_000;
    });
    await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.sse-viewer > canvas')).toBeVisible();
    await expect(page.locator('.sse-loadingWrap')).toHaveClass(/sse-hidden/, { timeout: 30_000 });
    await expect(page.locator('.sse-controlsWrap')).not.toHaveClass(/sse-hidden/);
});

test('loads the deterministic fixture and exposes versioned controls', async ({ page }) => {
    await page.locator('.sse-info').click();
    await expect(page.locator('.sse-infoPanel')).not.toHaveClass(/sse-hidden/);
    await expect(page.locator('.sse-appVersionLabel')).toHaveText(version);

    await page.keyboard.press('Escape');
    await expect(page.locator('.sse-infoPanel')).toHaveClass(/sse-hidden/);
    await page.locator('.sse-settings').click();
    await expect(page.locator('.sse-settingsPanel')).not.toHaveClass(/sse-hidden/);
    await expect(page.locator('.sse-performanceModeOption')).toContainText(/Performance|性能/);
});

test('matches the stable settings-shell visual baseline', async ({ page }) => {
    test.skip(process.env.E2E_EXTENDED === '1', 'PR baselines are owned by the fixed Chromium/WebGL projects');
    await page.locator('.sse-settings').click();
    await expect(page.locator('.sse-settingsPanel')).not.toHaveClass(/sse-hidden/);
    await page.addStyleTag({ content: '* { font-family: Arial, sans-serif !important; }' });
    await expect(page).toHaveScreenshot('viewer-settings-shell.png', {
        scale: 'css'
    });
});

test('embedded loading timing includes its content and environment prefetches', async ({ page }) => {
    const timings = await page.evaluate(async () => {
        const { createViewer } = await import('/index.js');
        const settings = await (await fetch('/data/e2e/settings.json')).json();
        const container = document.createElement('div');
        container.style.cssText = 'position:fixed;width:320px;height:240px;left:0;top:0';
        document.body.appendChild(container);
        const originalFetch = window.fetch;
        const requests = [];
        window.fetch = (...args) => {
            if (String(args[0]).includes('mf139_sdk')) requests.push(performance.now());
            return originalFetch(...args);
        };
        let viewer;
        try {
            viewer = await createViewer({
                container,
                contentUrl: '/data/e2e/single-gaussian.ply?mf139_sdk=subject',
                environmentUrl: '/data/e2e/single-gaussian.ply?mf139_sdk=environment',
                settings,
                renderer: 'webgl',
                noanim: true,
                noreveal: true
            });
            return {
                started: Number(container.querySelector('.sse-viewer').dataset.loadStarted),
                requests
            };
        } finally {
            window.fetch = originalFetch;
            viewer?.destroy();
            container.remove();
        }
    });
    expect(timings.requests).toHaveLength(2);
    for (const started of timings.requests) expect(started).toBeGreaterThanOrEqual(timings.started);
});
