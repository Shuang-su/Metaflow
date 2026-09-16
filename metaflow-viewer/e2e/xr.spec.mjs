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

// Render the shipping spatial menu and exercise its ray selection path in the real viewer.
// This does not emulate stereo optics, native tracking or controller hardware.
test('spatial menu names the available mode switch and confirms the resulting posture and movement state', async ({ page }) => {
    await page.evaluate(() => {
        const g=viewer.global, nav=g.camera.parent.script.get('xrVrNavigation');
        nav.sessionVR=true;
        nav.preferences={locomotion:'continuous',posture:'standing'};
        const refresh=()=>{
            nav.menu.update(nav.preferences,nav.actionStatus??'grounded',new Set(),new Set([{
                gamepad:{axes:[0,0,0,0]}
            }]));
            g.app.renderNextFrame=true;
        };
        window.__xrMenuSelect=(action)=>{
            const menu=nav.menu,index=menu.rows.findIndex(row=>row.action===action);
            if(index<0)throw Error(`Missing menu action: ${action}`);
            const transform=menu.entity.getWorldTransform();
            const origin=transform.transformPoint(g.camera.getPosition().clone().set(0,0,1));
            const target=transform.transformPoint(origin.clone().set(0,.5-(242+index*84+35)/1024,0));
            const source={getOrigin:()=>origin,getDirection:()=>target.clone().sub(origin).normalize()};
            menu.begin(source);menu.select(source);refresh();
            return {preferences:{...nav.preferences},open:menu.open,status:menu.status,rows:menu.rows.map(row=>row.label)};
        };
        nav.menu.show();refresh();
    });
    const initial=await page.evaluate(()=>viewer.global.camera.parent.script.get('xrVrNavigation').menu.rows.map(row=>row.label));
    expect(initial).toContain('Switch to comfort mode (teleport)');
    const comfort=await page.evaluate(()=>window.__xrMenuSelect('locomotion'));
    expect(comfort.preferences.locomotion).toBe('comfort');
    expect(comfort.rows).toContain('Switch to continuous movement');
    expect(comfort.open).toBe(true);
    const seated=await page.evaluate(()=>window.__xrMenuSelect('posture'));
    expect(seated.preferences.posture).toBe('seated');
    expect(seated.rows).toContain('Switch to standing posture');
    const blocked=await page.evaluate(()=>{
        const g=viewer.global,previous=g.collision;
        g.collision={isReadyAt:()=>true,queryCapsule:()=>true};
        const result=window.__xrMenuSelect('posture');g.collision=previous;return result;
    });
    expect(blocked.preferences.posture).toBe('seated');
    expect(blocked.status).toBe('posture-blocked');
    expect(blocked.open).toBe(true);
    const restored=await page.evaluate(()=>window.__xrMenuSelect('locomotion'));
    expect(restored.preferences.locomotion).toBe('continuous');
    expect(await page.evaluate(()=>window.__xrMenuSelect('resume').open)).toBe(false);
});
