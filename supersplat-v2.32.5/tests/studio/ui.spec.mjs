import { test, expect } from '@playwright/test';
import { boot } from '../e2e/helpers.mjs';
import { setupCalibrationScene, installVideoAudit, renderVideo, standardVideo, probeVideo } from '../e2e/video-helpers.mjs';
import { selectStudio } from './ui-helpers.mjs';

async function ready(page, model = true) {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await boot(page, '/studio/');
    await page.waitForFunction(() => window.scene.events.functions.has('studio.project'));
    await page.evaluate(() => document.fonts.ready);
    if (model) await page.evaluate(setupCalibrationScene);
    return errors;
}
const project = page => page.evaluate(() => window.scene.events.invoke('studio.project'));
async function clean(page) {
    if (await page.getByRole('button', { name: '保存工程', exact: true }).isEnabled()) {
        const download = page.waitForEvent('download'); await page.getByRole('button', { name: '保存工程', exact: true }).click(); await download;
    }
}
async function annotations(page) {
    await page.evaluate(() => {
        const e = window.scene.events, settings = e.invoke('studio.experience');
        const pose = { position: [0, 0, 5], target: [0, 0, 0], fov: 60 };
        settings.cameras = [{ initial: pose }];
        settings.annotations = [
            { position: [0, 0, 0], title: '中文长标题：空间里的故事', text: '第一行说明\n第二行说明 <b>纯文本</b>', camera: { initial: pose } },
            { position: [0.8, 0.6, 0], title: '第二处空间', text: '排序后仍保留关联视角', camera: { initial: pose } }
        ]; e.invoke('studio.importExperience', settings);
    });
    await expect.poll(async () => (await project(page)).experience.annotations.length).toBe(2);
    await page.getByRole('tab', { name: '标记', exact: true }).click();
    await page.getByRole('button', { name: '01 中文长标题：空间里的故事' }).click();
}

test('brand assets, desktop geometry, timeline and UI-only state', async ({ page }) => {
    const errors = await ready(page, false);
    await expect(page).toHaveTitle('Metaflow Studio');
    for (const image of await page.locator('.studio-brand img').all()) expect(await image.evaluate(e => e.complete && e.naturalWidth > 0)).toBe(true);
    expect(await page.locator('#studio-header').evaluate(e => e.getBoundingClientRect().height)).toBe(48);
    expect(await page.locator('#studio-sidebar').evaluate(e => e.getBoundingClientRect().width)).toBe(384);
    expect(await page.locator('.studio-tabs').evaluate(e => e.getBoundingClientRect().height)).toBe(32);
    expect(await page.locator('link[rel=icon]').getAttribute('href')).toContain('metaflow_logo.svg');
    await expect(page.getByRole('button', { name: '保存工程', exact: true })).toBeDisabled();
    await expect(page.locator('#timeline-panel')).toBeHidden();
    await page.screenshot({ path: test.info().outputPath('desktop-empty.png') });
    await page.getByRole('button', { name: '时间线', exact: true }).click();
    expect(await page.locator('#timeline-panel').evaluate(e => ({ width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height }))).toEqual({ width: 1440, height: 96 });
    await page.getByRole('button', { name: '下一帧', exact: true }).click();
    await page.getByRole('tab', { name: '标记', exact: true }).click();
    await page.getByRole('tab', { name: '场景', exact: true }).click();
    await expect(page.getByRole('button', { name: '保存工程', exact: true })).toBeDisabled();
    await page.screenshot({ path: test.info().outputPath('desktop-timeline.png') });
    expect(errors).toEqual([]);
});

test('slider previews continuously, commits once and preserves input identity', async ({ page }) => {
    const errors = await ready(page); await clean(page);
    const before = (await project(page)).experience.cameras[0].initial.fov;
    const slider = page.getByRole('slider', { name: '视野 FOV', exact: true });
    const box = await slider.boundingBox();
    await page.getByRole('spinbutton', { name: '视野 FOV', exact: true }).evaluate(e => { window.uiInput = e; });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + 45, box.y + box.height / 2, { steps: 12 });
    expect((await project(page)).experience.cameras[0].initial.fov).not.toBe(before);
    expect(await page.getByRole('spinbutton', { name: '视野 FOV', exact: true }).evaluate(e => e === window.uiInput)).toBe(true);
    await page.mouse.up();
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await expect.poll(async () => (await project(page)).experience.cameras[0].initial.fov).toBe(before);
    await expect(page.getByRole('button', { name: '保存工程', exact: true })).toBeDisabled();
    await page.getByRole('switch', { name: '辉光', exact: true }).click();
    const field = page.getByRole('spinbutton', { name: '辉光强度' }); await field.fill('2.5'); await field.press('Tab');
    await page.getByRole('switch', { name: '辉光', exact: true }).click(); await page.getByRole('switch', { name: '辉光', exact: true }).click();
    await expect(page.getByRole('spinbutton', { name: '辉光强度' })).toHaveValue('2.5');
    await selectStudio(page, '色调映射', 'aces');
    expect((await project(page)).experience.tonemapping).toBe('aces'); expect(errors).toEqual([]);
});

test('annotation floating edit cancel, drag order, precision and undo', async ({ page }) => {
    const errors = await ready(page); await annotations(page); await clean(page);
    await page.getByRole('button', { name: '编辑标记', exact: true }).click();
    const title = page.getByRole('textbox', { name: '标记标题' }); await title.fill('这段修改应取消');
    await page.getByRole('button', { name: '取消编辑标记' }).click();
    expect((await project(page)).experience.annotations[0].title).toBe('中文长标题：空间里的故事');
    await expect(page.getByRole('button', { name: '保存工程', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '编辑标记', exact: true }).click();
    await title.fill('修改后的中文标题'); await page.getByRole('textbox', { name: '说明文字' }).fill('新说明\n<b>不执行 HTML</b>');
    await page.screenshot({ path: test.info().outputPath('annotation-edit.png') });
    await page.getByRole('button', { name: '确定标记' }).click();
    await expect.poll(async () => (await project(page)).experience.annotations[0].title).toBe('修改后的中文标题');
    await page.getByRole('button', { name: '拖动标记 1' }).dragTo(page.locator('[data-annotation-index="1"]'));
    await expect.poll(async () => (await project(page)).experience.annotations[1].title).toBe('修改后的中文标题');
    expect((await project(page)).video.selected).toBe(1);
    await page.getByText('精确调整', { exact: true }).click();
    const x = page.getByRole('spinbutton', { name: '位置 X' }); await x.fill('0.2'); await x.press('Tab');
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await expect.poll(async () => (await project(page)).experience.annotations[1].position[0]).toBe(0);
    await page.getByRole('button', { name: '上移', exact: true }).click();
    await expect.poll(async () => (await project(page)).experience.annotations[0].title).toBe('修改后的中文标题');
    await page.screenshot({ path: test.info().outputPath('annotation-selected.png') }); expect(errors).toEqual([]);
});

test('responsive chrome and all secondary actions remain reachable', async ({ page }) => {
    const errors = await ready(page, false);
    for (const width of [1264, 1024, 760, 390]) {
        await page.setViewportSize({ width, height: width === 1264 ? 1184 : 900 });
        expect(await page.locator('#studio-header').evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
        if (width < 760) {
            await expect(page.locator('#studio-sidebar')).toBeHidden(); await page.getByRole('button', { name: '打开场景面板' }).click();
            await expect(page.getByRole('tab', { name: '场景', exact: true })).toBeVisible();
            await page.screenshot({ path: test.info().outputPath(`responsive-${width}-drawer.png`) });
            await page.getByRole('button', { name: '关闭场景面板' }).click();
        } else expect(await page.locator('#studio-sidebar').evaluate(e => e.getBoundingClientRect().width)).toBe(width < 1100 ? 320 : 384);
        await page.locator('.studio-file-menu summary').click();
        await expect(page.locator('.studio-menu-items').getByRole('button', { name: '打开工程', exact: true })).toBeVisible();
        if (width < 1100) await expect(page.locator('.studio-menu-items').getByRole('button', { name: '导入展示设置', exact: true })).toBeVisible();
        await page.screenshot({ path: test.info().outputPath(`responsive-${width}-menu.png`) }); await page.keyboard.press('Escape');
    } expect(errors).toEqual([]);
});

test('save write failure retains dirty state and existing project', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => { window.showSaveFilePicker = async () => ({ createWritable: async () => ({ write: async () => { throw new Error('模拟写入失败'); }, close: async () => {}, abort: async () => {} }) }); });
    const before = await project(page); await page.getByRole('button', { name: '保存工程', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('模拟写入失败'); expect(await project(page)).toEqual(before);
    await expect(page.getByRole('button', { name: '保存工程', exact: true })).toBeEnabled();
});


test('keyboard camera controls, timeline key editing and PCUI dialogs remain usable', async ({ page }) => {
    const errors = await ready(page); await clean(page);
    const menu = page.locator('.studio-file-menu summary'); await menu.focus(); await menu.press('ArrowDown');
    await expect(page.getByRole('button', { name: '打开模型', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown'); await expect(page.getByRole('button', { name: '打开模型文件夹', exact: true })).toBeFocused();
    await page.keyboard.press('Escape'); await expect(menu).toBeFocused();
    const sceneTab = page.getByRole('tab', { name: '场景', exact: true }); await sceneTab.focus(); await sceneTab.press('ArrowRight');
    await expect(page.getByRole('tab', { name: '标记', exact: true })).toBeFocused(); await page.keyboard.press('ArrowLeft');
    await page.getByRole('button', { name: '编辑相机 1' }).click();
    const x = page.getByRole('spinbutton', { name: '相机位置 X', exact: true }); const initial = await x.inputValue();
    await x.fill('2.5'); await x.press('Tab'); await page.getByRole('button', { name: '撤销', exact: true }).click(); await expect(x).toHaveValue(initial);
    await page.getByRole('button', { name: '时间线', exact: true }).click();
    await page.getByRole('button', { name: '添加关键帧', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.scene.events.invoke('track.keys'))).toEqual([0]);
    await page.getByRole('button', { name: '下一帧', exact: true }).click(); await page.getByRole('button', { name: '添加关键帧', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.scene.events.invoke('track.keys'))).toEqual([0, 1]);
    await page.getByRole('button', { name: '删除关键帧', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.scene.events.invoke('track.keys'))).toEqual([0]);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.scene.events.invoke('track.keys'))).toEqual([0, 1]);
    await expect(page.locator('#timeline-panel .time-label.cursor')).toHaveCSS('background-color', 'rgb(66, 210, 246)');
    const ticks = page.locator('#ticks-area');
    expect(await ticks.evaluate(e => e.getBoundingClientRect().right)).toBeLessThanOrEqual(1440);
    await page.screenshot({ path: test.info().outputPath('timeline-keys.png') });
    for (const width of [1440, 1024, 760, 390]) {
        await page.setViewportSize({ width, height: 900 }); await page.getByRole('button', { name: '导出视频', exact: true }).click();
        const dialog = page.locator('#video-settings-dialog #dialog'); await expect(dialog).toBeVisible();
        const rect = await dialog.boundingBox(); expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.x + rect.width).toBeLessThanOrEqual(width);
        expect(rect.y).toBeGreaterThanOrEqual(0); expect(rect.y + rect.height).toBeLessThanOrEqual(900);
        await page.getByRole('combobox', { name: '叠加模式', exact: true }).scrollIntoViewIfNeeded();
        expect(await dialog.evaluate(e => { const r=e.getBoundingClientRect(); return !!document.elementFromPoint(r.x+r.width/2,r.bottom-20)?.closest('#video-settings-dialog'); })).toBe(true);
        await page.screenshot({ path: test.info().outputPath(`video-dialog-${width}.png`) }); await page.keyboard.press('Escape');
    }
    expect(errors).toEqual([]);
});

test('actual video progress uses Metaflow accent and restores editing', async ({ page }) => {
    await page.addInitScript(installVideoAudit); await ready(page); await annotations(page);
    await selectStudio(page, '叠加模式', 'selected');
    await page.evaluate(() => {
        const e = window.scene.events, previous = e.functions.get('studio.overlayFrame');
        e.functions.set('studio.overlayFrame', async (...args) => { await new Promise(resolve => setTimeout(resolve, 70)); return previous(...args); });
        const settings = e.invoke('studio.experience'); settings.postEffectSettings.bloom.enabled = true; e.invoke('studio.importExperience', settings);
    });
    const output = test.info().outputPath('界面回归_中文标记与辉光_1080p30.mp4');
    const rendering = renderVideo(page, { ...standardVideo, startFrame: 0, endFrame: 29, width: 1920, height: 1080, reveal: 'none' }, output);
    const bar = page.locator('#progress-container #bar'); await expect(bar).toBeVisible();
    await expect.poll(() => bar.evaluate(e => getComputedStyle(e).backgroundImage)).toContain('rgb(66, 210, 246)');
    await expect(page.getByRole('button', { name: '保存工程', exact: true })).toBeDisabled();
    await expect.poll(() => bar.evaluate(e => { const percent = [...e.style.backgroundImage.matchAll(/([0-9.]+)%/g)]; return Number(percent[1]?.[1]); })).toBeGreaterThan(5);
    await page.screenshot({ path: test.info().outputPath('video-progress.png') });
    const audit = await rendering; expect(audit.frames).toHaveLength(30);
    expect(probeVideo(output).streams[0].nb_read_frames).toBe('30');
    await expect(page.locator('#progress-container')).toBeHidden();
    await expect(page.getByRole('button', { name: '编辑标记', exact: true })).toBeEnabled();
});

test('representative scene visual evidence at desktop and in-app browser sizes', async ({ page }) => {
    test.skip(!process.env.STUDIO_REAL_ASSETS, 'Uses the explicitly scoped scene fixture.');
    await boot(page, '/studio/?load=/generated/scene.sog&settings=/generated/scene-settings.json');
    await page.waitForFunction(() => window.scene?.events.functions.has('studio.project') && window.scene.events.invoke('scene.splats').length > 0 && window.scene.events.invoke('studio.experience').animTracks.length > 0);
    await page.evaluate(() => document.fonts.ready);
    for (const [width, height] of [[1440, 900], [1264, 1184]]) {
        await page.setViewportSize({ width, height });
        await page.getByRole('tab', { name: '场景', exact: true }).click();
        await page.locator('.studio-panel').evaluate(e => { e.scrollTop = 0; });
        await page.screenshot({ path: test.info().outputPath(`scene-${width}.png`) });
        await page.getByRole('button', { name: '时间线', exact: true }).click();
        await page.screenshot({ path: test.info().outputPath(`scene-timeline-${width}.png`) });
        await page.getByRole('button', { name: '时间线', exact: true }).click();
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => {
        const e = window.scene.events, settings = e.invoke('studio.experience'), pose = settings.cameras[0].initial;
        settings.annotations = [{ position: pose.target, title: '演播室 · 场景介绍', text: '本地配置镜头、标记与展示效果。\n保留模型资产，随时保存工程。', camera: { initial: pose } }];
        e.invoke('studio.importExperience', settings);
    });
    await page.getByRole('tab', { name: '标记', exact: true }).click();
    await page.getByRole('button', { name: '01 演播室 · 场景介绍' }).click();
    await page.screenshot({ path: test.info().outputPath('scene-annotation.png') });
    await page.getByRole('button', { name: '编辑标记', exact: true }).click();
    await page.screenshot({ path: test.info().outputPath('scene-annotation-edit.png') });
    await page.getByRole('button', { name: '取消编辑标记' }).click();
});
