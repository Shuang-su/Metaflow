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
