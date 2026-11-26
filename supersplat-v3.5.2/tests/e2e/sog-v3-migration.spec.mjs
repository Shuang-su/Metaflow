import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { writeScene } from './helpers.mjs';
import { videoFixture } from './video-helpers.mjs';

test('exports v3 by default, exports compatibility v2 and reopens both files', async ({ page, context }, info) => {
    const errors = await videoFixture(page, '/editor/');
    const folder = path.join(process.env.METAFLOW_TEST_FILES, 'editor-sog');
    await mkdir(folder, { recursive: true });
    const popup = page.locator('#export-popup');

    for (const version of [3, 2]) {
        await page.evaluate(() => { void window.scene.events.invoke('scene.export', 'sog'); });
        await expect(popup.getByText('SOG version', { exact: true })).toBeVisible();
        await expect(popup.locator('.pcui-select-input-value', { hasText: /^SOG v3$/ })).toBeVisible();
        if (version === 2) {
            await popup.locator('.pcui-select-input-value', { hasText: /^SOG v3$/ }).click();
            await popup.getByText('SOG v2 (compatibility)', { exact: true }).click();
        }
        const next = page.waitForEvent('download');
        await popup.getByRole('button', { name: 'Export', exact: true }).click();
        const filename = `editor-v${version}.sog`;
        const dest = path.join(folder, filename);
        await (await next).saveAs(dest);
        const meta = JSON.parse(execFileSync('unzip', ['-p', dest, 'meta.json'], { encoding: 'utf8' }));
        expect(meta.version).toBe(version);
        expect(meta.count).toBe(600);
        expect(meta.quats.files).toEqual(['quats.webp']);

        const preview = await context.newPage();
        await preview.goto(`/viewer/?webgl&noanalytics&noreveal&noanim&content=/generated/editor-sog/${filename}&settings=/data/e2e/settings.json`);
        await preview.waitForFunction(() => window.metaflowViewer?.state.readyToRender);
        await preview.screenshot({ path: info.outputPath(`viewer-v${version}.png`) });
        await preview.close();

        const imported = await page.evaluate(async filename => {
            const events = window.scene.events;
            events.fire('scene.clear');
            const blob = await (await fetch('/generated/editor-sog/' + filename)).blob();
            await events.invoke('import', [{ filename, contents: new File([blob], filename) }]);
            return events.invoke('scene.splats').map(splat => splat.numSplats);
        }, filename);
        expect(imported).toEqual([600]);
    }

    const settings = await page.evaluate(async () => {
        const response = await fetch('/data/e2e/settings.json');
        return response.json();
    });
    const html = path.join(folder, 'regular.html');
    await (await writeScene(page, 'htmlViewer', 'regular.html', { type: 'html', experienceSettings: settings })).saveAs(html);
    const zip = path.join(folder, 'regular.zip');
    await (await writeScene(page, 'packageViewer', 'regular.zip', { type: 'zip', experienceSettings: settings })).saveAs(zip);
    const unpacked = path.join(folder, 'regular');
    await mkdir(unpacked, { recursive: true });
    execFileSync('unzip', ['-o', zip, '-d', unpacked]);

    const { js } = await import('../../../metaflow-viewer/dist/index.js');
    expect(await readFile(path.join(unpacked, 'index.js'), 'utf8')).toBe(js);

    for (const target of ['regular.html', 'regular/index.html']) {
        const preview = await context.newPage();
        const remote = [];
        await preview.route('**/*', route => {
            if (route.request().url().startsWith('http://127.0.0.1:4388/')) return route.continue();
            remote.push(route.request().url());
            return route.abort();
        });
        await preview.goto('/generated/editor-sog/' + target);
        await preview.waitForFunction(() => window.metaflowViewer?.state.readyToRender);
        const rendered = await preview.evaluate(() => window.metaflowViewer.app.stats.frame.gsplats);
        expect(rendered).toBeGreaterThan(0);
        expect(remote).toEqual([]);
        await preview.close();
    }
    expect(errors).toEqual([]);
});
