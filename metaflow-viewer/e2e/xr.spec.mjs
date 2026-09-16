import { expect, test } from '@playwright/test';

// Exercise the real viewer UI and engine failure path, without pretending a mock is a headset.
test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        class XrProbe extends EventTarget {
            calls = [];
            isSessionSupported() { return Promise.resolve(true); }
            requestSession(type) {
                this.calls.push(type);
                return new Promise((resolve, reject) => { this.reject = reject; });
            }
        }
        Object.defineProperty(navigator, 'xr', { value: new XrProbe(), configurable: true });
    });
    await page.goto('/e2e-fixture?webgl&noanalytics&noreveal&noanim');
    await expect(page.locator('#loadingWrap')).toHaveClass(/hidden/);
    await expect(page.locator('#vrMode')).toBeVisible();
});

const snapshot = (page) => page.evaluate(() => {
    const { camera, app, state } = window.viewer.global;
    return {
        rig: camera.parent.getLocalPosition().toArray(),
        rotation: camera.parent.getLocalRotation().toArray(),
        eye: camera.getLocalPosition().toArray(),
        near: camera.camera.nearClip, far: camera.camera.farClip,
        budget: app.scene.gsplat.splatBudget, colorAngle: app.scene.gsplat.colorUpdateAngle,
        autoRender: app.autoRender, performanceMode: state.performanceMode
    };
});
const reject = (page, name) => page.evaluate((name) => navigator.xr.reject(new DOMException('Test request failure', name)), name);

test('permission cancellation restores the viewer and allows a single clean retry', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const before = await snapshot(page);
    await page.locator('#vrMode').click();
    await expect(page.locator('#vrMode')).toHaveAttribute('aria-disabled', 'true');
    // A duplicate DOM event during the browser prompt must not create a second session request.
    await page.locator('#vrMode').dispatchEvent('click');
    expect(await page.evaluate(() => navigator.xr.calls)).toEqual(['immersive-vr']);
    await reject(page, 'NotAllowedError');
    await expect(page.locator('#xrStatusText')).toContainText('canceled');
    await expect(page.locator('#vrMode')).toHaveAttribute('aria-disabled', 'false');
    expect(await snapshot(page)).toEqual(before);
    await page.locator('#vrMode').click();
    expect(await page.evaluate(() => navigator.xr.calls.length)).toBe(2);
    await reject(page, 'AbortError');
    await expect(page.locator('#vrMode')).toHaveAttribute('aria-disabled', 'false');
    await page.locator('#settings').click();
    await expect(page.locator('#settingsPanel')).not.toHaveClass(/hidden/);
    expect(errors).toEqual([]);
});

test('AR runtime rejection leaves camera and desktop controls usable', async ({ page }) => {
    const before = await snapshot(page);
    await page.locator('#arMode').click();
    await reject(page, 'NotSupportedError');
    await expect(page.locator('#xrStatusText')).toContainText('AR could not start');
    expect(await snapshot(page)).toEqual(before);
    await expect(page.locator('#xrRetryWebgl')).toHaveClass(/hidden/);
    await page.locator('#vrMode').click();
    expect(await page.evaluate(() => navigator.xr.calls)).toEqual(['immersive-ar', 'immersive-vr']);
    await reject(page, 'NotAllowedError');
    await expect(page.locator('#vrMode')).toHaveAttribute('aria-disabled', 'false');
});
