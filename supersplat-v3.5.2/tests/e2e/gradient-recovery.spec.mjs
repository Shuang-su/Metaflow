import { test, expect } from '@playwright/test';
import { videoFixture, standardVideo, renderVideo, clearAudit } from './video-helpers.mjs';
for (const url of ['/editor/', '/editor-legacy/']) {
    test(`${url} gradient cancellation/read failure restore editing and permit retry`, async ({ page }) => {
        await videoFixture(page, url);
        const result = await page.evaluate(async settings => {
            const scene = window.scene, e = scene.events;
            e.fire('background.preview', { color: [.1,.2,.3], gradient: { type: 'linear', angle: 135, topColor: [1,0,0], bottomColor: [0,0,1], stops: [{position:0,color:[1,0,0]}, {position:1,color:[0,0,1]}] } });
            e.fire('background.commit');
            const snapshot = () => ({ background: e.invoke('background.value'), pose: e.invoke('camera.getPose'), frame: e.invoke('timeline.frame'), selected: e.invoke('selection')?.name, target: scene.camera.targetSizeOverride, capture: scene.camera.captureMode, overlays: scene.camera.renderOverlays });
            const before = structuredClone(snapshot());
            const root = await navigator.storage.getDirectory(); const handle = await root.getFileHandle('gradient-cancel.mp4',{create:true});
            const seed = await handle.createWritable(); await seed.write('preserve-existing-file'); await seed.close();
            const cancel = e.on('progressUpdate', ({progress}) => { if (progress > 10) e.fire('progressCancel'); });
            const completed = await e.invoke('render.video', settings, await handle.createWritable()); cancel.off();
            const afterCancel = structuredClone(snapshot()), previous = await (await handle.getFile()).text();
            const show = e.functions.get('showPopup'); e.functions.set('showPopup', async () => ({ action:'ok' }));
            const proto = Object.getPrototypeOf(scene.camera.workTarget.colorBuffer), read = proto.read;
            let failed;
            try { proto.read = async () => { throw Error('Injected gradient readback failure'); }; failed = await e.invoke('render.video', settings); }
            finally { proto.read = read; e.functions.set('showPopup',show); }
            return { before, afterCancel, afterFailure: snapshot(), completed, previous, failed };
        }, {...standardVideo,width:320,height:180,startFrame:60,endFrame:75});
        expect(result.completed).toBe(false); expect(result.failed).toBe(false); expect(result.previous).toBe('preserve-existing-file');
        expect(result.afterCancel).toEqual(result.before); expect(result.afterFailure).toEqual(result.before);
        await clearAudit(page); const retry = await renderVideo(page,{...standardVideo,width:320,height:180,startFrame:60,endFrame:65},test.info().outputPath('retry.mp4'));
        expect(retry.frames).toHaveLength(6);
    });
}
