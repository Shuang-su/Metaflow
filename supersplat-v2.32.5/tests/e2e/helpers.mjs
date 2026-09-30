import { expect } from '@playwright/test';

export async function boot(page, url = '/editor/') {
    await page.addInitScript(() => {
        // Exercise the real file-input/download fallback without native save dialogs.
        window.showOpenFilePicker = undefined;
        window.showSaveFilePicker = undefined;
    });
    await page.goto(url);
    await page.waitForFunction(() => window.scene?.events?.functions.has('doc.load'));
}

export async function loadProject(page, file) {
    await page.evaluate(() => {
        window.scene.events.fire('scene.clear');
        const input = document.createElement('input');
        input.id = 'fixture-file';
        input.type = 'file';
        input.addEventListener('change', () => {
            window.fixtureLoad = window.scene.events.invoke('doc.load', input.files[0]);
        });
        document.body.append(input);
    });
    await page.locator('#fixture-file').setInputFiles(file);
    await page.evaluate(async () => {
        await window.fixtureLoad;
        document.querySelector('#fixture-file').remove();
    });
    await expect(page.locator('#canvas')).toBeVisible();
    return page.evaluate(() => window.scene.events.invoke('scene.splats').map(splat => ({
        name: splat.name, count: splat.numSplats, selected: splat.numSelected, deleted: splat.numDeleted,
        center: splat.worldBound.center.toArray(), halfExtents: splat.worldBound.halfExtents.toArray()
    })));
}

export async function writeScene(page, type, filename, viewerExportSettings) {
    const download = page.waitForEvent('download');
    await page.evaluate(async ({ type, filename, viewerExportSettings }) => {
        await window.scene.events.invoke('scene.write', type, {
            filename, splatIdx: 'all', serializeSettings: { maxSHBands: 3 }, viewerExportSettings
        });
    }, { type, filename, viewerExportSettings });
    return download;
}
