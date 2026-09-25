import { expect, test } from '@playwright/test';

const rendererQuery = process.env.E2E_RENDERER === 'webgpu' ? '' : 'webgl&';
const fixtureUrl = `/e2e-fixture?${rendererQuery}noanalytics&noreveal&noanim`;

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        Date.now = () => 1_786_291_200_000;
    });
    await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#application-canvas')).toBeVisible();
    await expect(page.locator('#loadingWrap')).toHaveClass(/hidden/, { timeout: 30_000 });
    await expect(page.locator('#controlsWrap')).not.toHaveClass(/hidden/);
});

test('loads the deterministic fixture and exposes versioned controls', async ({ page }) => {
    await page.locator('#info').click();
    await expect(page.locator('#infoPanel')).not.toHaveClass(/hidden/);
    await expect(page.locator('#appVersionLabel')).toHaveText('5.19.2');

    await page.keyboard.press('Escape');
    await expect(page.locator('#infoPanel')).toHaveClass(/hidden/);
    await page.locator('#settings').click();
    await expect(page.locator('#settingsPanel')).not.toHaveClass(/hidden/);
    await expect(page.locator('#performanceModeOption')).toContainText(/Performance|性能/);
});

test('matches the stable settings-shell visual baseline', async ({ page }) => {
    test.skip(process.env.E2E_EXTENDED === '1', 'PR baselines are owned by the fixed Chromium/WebGL projects');
    await page.locator('#settings').click();
    await expect(page.locator('#settingsPanel')).not.toHaveClass(/hidden/);
    await page.addStyleTag({ content: '* { font-family: Arial, sans-serif !important; }' });
    await expect(page).toHaveScreenshot('viewer-settings-shell.png', {
        scale: 'css'
    });
});
