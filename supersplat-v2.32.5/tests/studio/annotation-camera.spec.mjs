import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { boot } from '../e2e/helpers.mjs';

const poseA = { position: [0, 0, 5], target: [0, 0, 0], fov: 60 };
const poseB = { position: [3, 1, 7], target: [0, 0, 0], fov: 55 };
async function moveCamera(page, pose) {
    await page.evaluate(pose => {
        const e = window.scene.events;
        e.fire('camera.setPose', { position: {x:pose.position[0],y:pose.position[1],z:pose.position[2]}, target: {x:pose.target[0],y:pose.target[1],z:pose.target[2]}, fov: pose.fov }, 0);
        window.scene.camera.onUpdate(0);
    }, pose);
}
async function expectPose(page, pose) {
    await expect.poll(() => page.evaluate(expected => {
        const p = window.scene.events.invoke('camera.getPose');
        return Math.max(...[p.position.x,p.position.y,p.position.z].map((v, i) => Math.abs(v - expected.position[i])), ...[p.target.x,p.target.y,p.target.z].map((v, i) => Math.abs(v - expected.target[i])), Math.abs(p.fov - expected.fov));
    }, pose)).toBeLessThan(0.001);
}

test('annotation focus reads reassociated camera through undo redo and distance edits', async ({ page }) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await boot(page, '/studio/');
    await page.evaluate(async pose => {
        const e = window.scene.events, settings = e.invoke('studio.experience');
        settings.cameras = [{ initial: pose }];
        settings.annotations = [{ position: [0, 0, 0], title: '镜头关联检查', text: '保存新镜头后定位', camera: { initial: pose } }];
        await e.invoke('studio.importExperience', settings);
    }, poseA);
    await page.getByRole('tab', { name: '标记', exact: true }).click();
    const focus = page.getByRole('button', { name: '定位标记 1', exact: true });
    await focus.click(); await expectPose(page, poseA);
    // Keep the inspector DOM alive: changing camera values must not require tab switching.
    await focus.evaluate(el => { window.focusButtonUnderTest = el; });
    await moveCamera(page, poseB);
    await page.locator('.studio-annotation-cards').getByRole('button', { name: '关联当前视角', exact: true }).click();
    const saved = await page.evaluate(() => window.scene.events.invoke('studio.experience').annotations[0].camera.initial);
    expect(saved.position[0]).toBeCloseTo(3, 3);
    expect(await focus.evaluate(el => el === window.focusButtonUnderTest)).toBe(true);
    await moveCamera(page, poseA); await focus.click(); await expectPose(page, saved);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await focus.click(); await expectPose(page, poseA);
    await page.getByRole('button', { name: '重做', exact: true }).click();
    await moveCamera(page, poseA); await focus.click(); await expectPose(page, saved);
    await page.getByRole('button', { name: '向关联相机靠近', exact: true }).click();
    const annotation = await page.evaluate(() => window.scene.events.invoke('studio.experience').annotations[0]);
    annotation.position.forEach((v, i) => expect(v).toBeCloseTo(saved.position[i] * 0.005, 5));
    await moveCamera(page, poseA); await focus.click(); await expectPose(page, saved);
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出展示设置', exact: true }).click();
    const file = test.info().outputPath('reassociated-settings.json'); await (await waiting).saveAs(file);
    expect(JSON.parse(await readFile(file, 'utf8')).annotations[0].camera.initial).toEqual(saved);
    await page.screenshot({ path: test.info().outputPath('reassociated-camera.png') });
    expect(errors).toEqual([]);
});
