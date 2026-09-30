import { test, expect } from '@playwright/test';
import { videoFixture, standardVideo, renderVideo, probeVideo } from './video-helpers.mjs';

test('MF-56/MF-57 real LCC2 selects each LOD and renders a static particle video', async ({ page }) => {
    test.skip(!process.env.METAFLOW_LCC2, 'Provide an explicitly scoped real LCC2 folder at /generated/lcc2.');
    test.setTimeout(240000);
    const errors = await videoFixture(page);
    const expected = [865423, 431796];
    const imports = [];
    // Check both native LOD choices, leaving the full-detail static model for
    // video. Environment exclusion is the pinned upstream LCC2 reader's rule.
    for (const lod of [1, 0]) {
        await page.evaluate(() => {
            window.scene.events.fire('scene.clear');
            window.lcc2Import = window.scene.events.invoke('import', [{ filename: 'meta.lcc2', url: '/generated/lcc2/meta.lcc2' }]);
        });
        const popup = page.locator('#popup');
        await expect(popup).toBeVisible();
        const choices = await page.locator('#popup-select').evaluate(el => el.ui.options);
        expect(choices).toHaveLength(2);
        if (await page.locator('#popup-select').evaluate(el => el.ui.value) !== String(lod)) {
            await page.locator('#popup-select').click();
            await popup.getByText(choices[lod].t, { exact: true }).click();
        }
        await popup.getByRole('button', { name: 'OK', exact: true }).click();
        await page.evaluate(() => window.lcc2Import);
        const result = await page.evaluate(() => window.scene.events.invoke('scene.splats').map(s => ({
            count: s.numSplats, center: s.worldBound.center.toArray(), size: s.worldBound.halfExtents.toArray()
        })));
        expect(result[0].count).toBe(expected[lod]);
        expect([...result[0].center, ...result[0].size].every(Number.isFinite)).toBe(true);
        imports.push({ lod, choices, result });
    }
    const check = await page.evaluate(async settings => {
        const s = window.scene;
        const e = s.events;
        const { center, halfExtents } = s.bound;
        const distance = halfExtents.length() * 2.2;
        e.invoke('camera.animTrack').clear();
        e.fire('camera.setPose', {
            position: { x: center.x, y: center.y + distance * 0.08, z: center.z + distance },
            target: { x: center.x, y: center.y, z: center.z }, fov: 60
        }, 0);
        s.camera.onUpdate(0);
        e.fire('select.none');
        return e.invoke('render.videoPreflight', settings);
    }, standardVideo);
    const endFrame = 60 + Math.ceil((check.revealDuration + 0.25) * 30);
    const file = test.info().outputPath('real-lcc2-particle-opening.mp4');
    const audit = await renderVideo(page, { ...standardVideo, endFrame, width: 1920, height: 1080, bitrate: 15_000_000 }, file);
    expect(audit.frames).toHaveLength(endFrame - 60 + 1);
    expect(probeVideo(file).streams[0]).toMatchObject({ codec_name: 'h264', width: 1920, height: 1080 });
    await page.screenshot({ path: test.info().outputPath('lcc2-after-render.png') });
    await test.info().attach('lcc2-evidence', { body: JSON.stringify({ imports, check, endFrame, audit }), contentType: 'application/json' });
    expect(errors).toEqual([]);
});
