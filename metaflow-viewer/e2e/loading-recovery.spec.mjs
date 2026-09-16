import { expect, test } from '@playwright/test';

const url='/e2e-fixture?webgl&noanalytics&noreveal&noanim';
test('failed model download exposes reload and a clean retry renders the scene',async({page})=>{
 await page.route('**/single-gaussian.ply',route=>route.abort('failed'));
 await page.goto(url);
 await expect(page.locator('#loadingRetry')).toBeVisible();
 await expect(page.locator('#loadingRecoveryMessage')).toContainText('Loading failed');
 await page.unroute('**/single-gaussian.ply');
 await page.locator('#loadingRetry').click();
 await expect(page.locator('#loadingWrap')).toHaveClass(/hidden/);
 await expect(page.locator('#controlsWrap')).toBeVisible();
 await expect(page.locator('#loadingRecovery')).toBeHidden();
});
test('suspended animation frames show a wake-up hint without automatically reloading',async({page})=>{
 let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
 await page.clock.install();
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
 await page.goto(url);
 await expect(page.locator('#loadingRetry')).toHaveText('Reload scene');
 await page.clock.fastForward(21000);
 await expect(page.locator('#loadingRecoveryMessage')).toContainText('Wake your headset');
 await expect(page.locator('#loadingRetry')).toBeVisible();
 expect(await page.evaluate(()=>viewer.global.app.frame)).toBe(0);
 expect(navigations).toBe(1);
});
