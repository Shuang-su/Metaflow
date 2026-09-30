import { test, expect } from '@playwright/test';
import { videoFixture, standardVideo, renderVideo, probeVideo } from './video-helpers.mjs';

test('MF-57 representative SOG scene renders the existing radial opening into a local MP4', async ({ page }) => {
    test.skip(!process.env.METAFLOW_REAL_SOG, 'Provide an explicitly scoped real SOG fixture at /generated/scene.sog.');
    test.setTimeout(240000);
    const errors = await videoFixture(page);
    const check = await page.evaluate(async settings => {
        const e = window.scene.events;
        e.fire('scene.clear');
        await e.invoke('import', [{ filename: 'scene.sog', url: '/generated/scene.sog' }]);
        e.invoke('camera.animTrack').clear();
        e.fire('camera.setPose', {
            position: { x: 0.51621586, y: 1.22616053, z: 1.81170213 },
            target: { x: -1.10290531, y: 0.68592118, z: -3.6313195 }, fov: 75
        }, 0);
        window.scene.camera.onUpdate(0);
        e.fire('select.none');
        return { ...await e.invoke('render.videoPreflight', settings), count: e.invoke('scene.splats')[0].numSplats };
    }, standardVideo);
    expect(check.count).toBeGreaterThan(1_000_000);
    expect(check.revealDuration).toBeLessThan(20);
    // Explicit test-selected range includes the measured completion, without
    // the implementation extending any user-selected range.
    const endFrame = 60 + Math.ceil((check.revealDuration + 0.25) * 30);
    const file = test.info().outputPath('real-sog-particle-opening.mp4');
    const audit = await renderVideo(page, { ...standardVideo, endFrame, width: 1920, height: 1080, bitrate: 15_000_000 }, file);
    expect(audit.frames).toHaveLength(endFrame - 60 + 1);
    expect(probeVideo(file).streams[0]).toMatchObject({ codec_name: 'h264', width: 1920, height: 1080 });
    await test.info().attach('real-scene-evidence', { body: JSON.stringify({ check, endFrame, audit }), contentType: 'application/json' });
    await page.screenshot({ path: test.info().outputPath('real-scene-after-export.png') });
    expect(errors).toEqual([]);
});

test('MF-56 streamed SOG retains upstream LOD selection and static import', async ({ page }) => {
    test.skip(!process.env.METAFLOW_STREAMED_SOG, 'Provide a scoped upstream streamed SOG folder at /generated/streamed.');
    test.setTimeout(240000);
    await videoFixture(page);
    await page.evaluate(() => {
        window.scene.events.fire('scene.clear');
        window.streamImport = window.scene.events.invoke('import', [{ filename: 'lod-meta.json', url: '/generated/streamed/lod-meta.json' }]);
    });
    const popup = page.locator('#popup');
    await expect(popup).toBeVisible();
    const lods = await page.locator('#popup-select').evaluate(el => el.ui.options);
    expect(lods.length).toBeGreaterThan(1);
    // Select the coarsest available LOD via the actual native import dialog.
    await page.locator('#popup-select').click();
    await popup.getByText(lods.at(-1).t, { exact: true }).click();
    await popup.getByRole('button', { name: 'OK', exact: true }).click();
    await page.evaluate(() => window.streamImport);
    const result = await page.evaluate(() => window.scene.events.invoke('scene.splats').map(p => ({ name: p.name, count: p.numSplats })));
    expect(result[0].count).toBeGreaterThan(0);
    await test.info().attach('streamed-sog-lod', { body: JSON.stringify({ lods, result }), contentType: 'application/json' });
    await page.screenshot({ path: test.info().outputPath('streamed-sog-loaded.png') });
});
