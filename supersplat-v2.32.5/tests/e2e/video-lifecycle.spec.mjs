import { test, expect } from '@playwright/test';
import { videoFixture, standardVideo, renderVideo, clearAudit } from './video-helpers.mjs';

const snapshot = page => page.evaluate(() => {
    const s = window.scene;
    return {
        pose: s.events.invoke('camera.getPose'), frame: s.events.invoke('timeline.frame'), playing: s.events.invoke('timeline.playing'),
        overlays: s.camera.renderOverlays, gizmo: s.gizmoLayer.enabled, target: s.camera.targetSizeOverride,
        locked: s.lockedRenderMode, capture: s.camera.captureMode, selected: s.events.invoke('selection')?.name,
        splats: s.events.invoke('scene.splats').map(p => ({
            selected: p.numSelected, deleted: p.numDeleted, locked: p.numLocked, visible: p.visible,
            reveal: Object.keys(p.entity.gsplat.instance.material.parameters).filter(k => k.startsWith('uReveal'))
        }))
    };
});

test('MF-57 video settings default off, explain 360 restriction, and return from a short range', async ({ page }) => {
    await videoFixture(page);
    await page.evaluate(() => {
        window.scene.events.fire('timeline.setFrames', 31);
        void window.scene.events.invoke('show.videoSettingsDialog');
    });
    const dialog = page.locator('#video-settings-dialog');
    await expect(dialog).toBeVisible();
    const toggle = page.locator('#video-reveal-option');
    expect(await toggle.evaluate(el => el.ui.value)).toBe(false);
    await toggle.click();
    expect(await toggle.evaluate(el => el.ui.value)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('particle-setting.png') });
    await dialog.getByRole('button', { name: 'Render', exact: true }).click();
    const popup = page.locator('#popup');
    await expect(popup).toContainText('The opening will be cut short');
    await popup.getByRole('button', { name: 'Return to adjust', exact: true }).click();
    await expect(dialog).toBeVisible();
    expect(await toggle.evaluate(el => el.ui.value)).toBe(true);
    await dialog.locator('.select').first().click();
    await dialog.getByText('360° Equirectangular', { exact: true }).click();
    expect(await toggle.evaluate(el => ({ value: el.ui.value, disabled: el.ui.disabled }))).toEqual({ value: false, disabled: true });
    await expect(page.locator('#video-reveal-hint')).toContainText('not 360°');
    await page.screenshot({ path: test.info().outputPath('360-restriction.png') });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    const result = await page.evaluate(async settings => {
        try { await window.scene.events.invoke('render.videoPreflight', settings); return 'unexpected pass'; }
        catch (error) { return error.message; }
    }, { ...standardVideo, projection: 'equirect' });
    expect(result).toContain('not 360°');
});

test('MF-57 cancellation aborts a real OPFS transaction and preserves the previous file', async ({ page }) => {
    const errors = await videoFixture(page);
    const before = await snapshot(page);
    const result = await page.evaluate(async settings => {
        const e = window.scene.events;
        const root = await navigator.storage.getDirectory();
        const handle = await root.getFileHandle('mf57-cancel-existing.mp4', { create: true });
        const seed = await handle.createWritable();
        await seed.write('keep-this-existing-user-content');
        await seed.close();
        const cancel = e.on('progressUpdate', ({ progress }) => { if (progress > 10) e.fire('progressCancel'); });
        const savedSorters = e.invoke('scene.splats').map(s => s.entity.gsplat.instance.sorter);
        const completed = await e.invoke('render.video', settings, await handle.createWritable());
        cancel.off();
        const content = await (await handle.getFile()).text();
        const restoredSorters = e.invoke('scene.splats').every((s, i) => s.entity.gsplat.instance.sorter === savedSorters[i]);
        return { completed, content, restoredSorters, encoders: window.videoAudit.encoders.map(enc => enc.state), locks: await navigator.locks.query() };
    }, standardVideo);
    expect(result.completed).toBe(false);
    expect(result.content).toBe('keep-this-existing-user-content');
    expect(result.restoredSorters).toBe(true);
    expect(result.encoders).toEqual(['closed']);
    expect(result.locks.held.some(l => l.name === 'supersplat-video-render')).toBe(false);
    expect(await snapshot(page)).toEqual(before);
    await renderVideo(page, { ...standardVideo, endFrame: 65 }, test.info().outputPath('retry-after-cancel.mp4'));
    expect(errors).toEqual([]);
});

for (const failure of ['initialization', 'reclaim', 'readback', 'file-write', 'file-close']) {
    test(`MF-57 ${failure} failure restores the Editor and allows a clean retry`, async ({ page }) => {
        await videoFixture(page);
        const before = await snapshot(page);
        const result = await page.evaluate(async ({ settings, failure }) => {
            const s = window.scene;
            const e = s.events;
            const realPopup = e.functions.get('showPopup');
            const popups = [];
            // Capture the same error payload without waiting for a human in
            // fault-injection cases; the real dialog is tested separately.
            e.functions.set('showPopup', async options => { popups.push(options); return { action: 'ok' }; });
            const proto = Object.getPrototypeOf(s.camera.workTarget.colorBuffer);
            const read = proto.read;
            window.failEncoderInit = failure === 'initialization';
            window.failEncoderReclaim = failure === 'reclaim';
            if (failure === 'readback') proto.read = async () => { throw new Error('Injected pixel readback failure'); };
            let aborts = 0, closes = 0;
            const file = failure.startsWith('file-') ? {
                async write() { if (failure === 'file-write') throw new Error('Injected destination write failure'); },
                async close() { closes++; if (failure === 'file-close') throw new Error('Injected destination close failure'); },
                async abort() { aborts++; }, async truncate() {}
            } : undefined;
            const savedSorters = e.invoke('scene.splats').map(p => p.entity.gsplat.instance.sorter);
            const completed = await e.invoke('render.video', settings, file);
            const states = window.videoAudit.encoders.map(enc => enc.state);
            window.failEncoderInit = false;
            window.failEncoderReclaim = false;
            proto.read = read;
            e.functions.set('showPopup', realPopup);
            return { completed, states, popups, aborts, closes, restoredSorters: e.invoke('scene.splats').every((p, i) => p.entity.gsplat.instance.sorter === savedSorters[i]) };
        }, { settings: { ...standardVideo, endFrame: 65 }, failure });
        expect(result.completed).toBe(false);
        expect(result.popups).toHaveLength(1);
        expect(result.popups[0].message).toContain('Injected');
        expect(result.states.every(state => state === 'closed')).toBe(true);
        expect(result.restoredSorters).toBe(true);
        expect(result.closes).toBe(failure === 'file-close' ? 1 : 0);
        if (failure.startsWith('file-')) expect(result.aborts).toBe(1);
        expect(await snapshot(page)).toEqual(before);
        await renderVideo(page, { ...standardVideo, endFrame: 65 }, test.info().outputPath(`retry-${failure}.mp4`));
    });
}

test('MF-57 empty scenes, dynamic sequences and unsupported codec fail before encoding', async ({ page }) => {
    await videoFixture(page);
    const answers = await page.evaluate(async settings => {
        const e = window.scene.events;
        const results = [];
        const probe = async () => {
            try { await e.invoke('render.videoPreflight', settings); results.push('unexpected pass'); }
            catch (error) { results.push(error.message); }
        };
        const sequence = e.functions.get('sequence.active');
        e.functions.set('sequence.active', () => true);
        await probe();
        e.functions.set('sequence.active', sequence);
        const support = VideoEncoder.isConfigSupported;
        VideoEncoder.isConfigSupported = async () => ({ supported: false });
        await probe();
        VideoEncoder.isConfigSupported = support;
        e.fire('scene.clear');
        await probe();
        return { results, encoderCount: window.videoAudit.encoders.length };
    }, standardVideo);
    expect(answers.results[0]).toContain('static Gaussian');
    expect(answers.results[1]).toContain('Unsupported video configuration');
    expect(answers.results[2]).toContain('visible');
    expect(answers.encoderCount).toBe(0);
});

test('MF-57 a non-responsive sorter times out, restores its worker and permits retry', async ({ page }) => {
    await videoFixture(page);
    const before = await snapshot(page);
    const result = await page.evaluate(async settings => {
        const e = window.scene.events;
        const popup = e.functions.get('showPopup');
        const messages = [];
        e.functions.set('showPopup', async options => { messages.push(options.message); return { action: 'ok' }; });
        const post = Worker.prototype.postMessage;
        Worker.prototype.postMessage = function (data, ...rest) {
            if (data.cameraPosition && Object.hasOwn(data, 'mapping')) return;
            return post.call(this, data, ...rest);
        };
        const ok = await e.invoke('render.video', settings);
        Worker.prototype.postMessage = post;
        e.functions.set('showPopup', popup);
        return { ok, messages, encoders: window.videoAudit.encoders.map(enc => enc.state) };
    }, standardVideo);
    expect(result.ok).toBe(false);
    expect(result.messages).toEqual(['Gaussian sorting timed out']);
    expect(result.encoders).toEqual(['closed']);
    expect(await snapshot(page)).toEqual(before);
    await renderVideo(page, { ...standardVideo, endFrame: 65 }, test.info().outputPath('retry-sort-timeout.mp4'));
});

test('MF-56 ordinary PLY sequence export still swaps instances and can be exported twice', async ({ page }) => {
    const errors = await videoFixture(page);
    await page.evaluate(async () => {
        const e = window.scene.events;
        e.fire('scene.clear');
        const files = [0, 1, 2].map(i => new File([window.calibrationFile], `frame${i}.ply`));
        e.fire('sequence.setPlyFrames', files);
        await e.invoke('plysequence.setFrameAsync', 0);
        e.fire('timeline.setFrame', 0);
    });
    const settings = { ...standardVideo, startFrame: 0, endFrame: 2, reveal: 'none' };
    await renderVideo(page, settings, test.info().outputPath('ordinary-sequence-first.mp4'));
    await clearAudit(page);
    await renderVideo(page, settings, test.info().outputPath('ordinary-sequence-repeat.mp4'));
    expect(await page.evaluate(() => window.scene.events.invoke('scene.allSplats').length)).toBe(1);
    expect(errors).toEqual([]);
});
