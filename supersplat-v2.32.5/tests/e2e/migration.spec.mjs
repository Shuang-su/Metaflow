import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { boot, loadProject, writeScene } from './helpers.mjs';

const samples = process.env.METAFLOW_SAMPLE_DIR;
const small = samples && path.join(samples, '260118 182644 J04 Surtr.ssproj');
const large = samples && path.join(samples, '260118 150009 J04 间谍过家家 约尔2/260118 145712 J04 Yor2.ssproj');

test('MF-56 candidate page, runtime version and live controls', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/editor/');
    await expect(page).toHaveTitle('Metaflow Editor');
    await expect(page.locator('#app-label')).toContainText('Metaflow Editor v1.1 (development)');
    await page.waitForFunction(() => window.scene?.events?.functions.has('doc.load'));
    expect(await page.locator('[data-nextjs-dialog], .vite-error-overlay').count()).toBe(0);
    const runtime = await (await page.request.get('/editor/version.json')).json();
    expect(runtime.sourcePath).toBe('supersplat-v2.32.5');
    expect(runtime.development).toBe(true);
    expect(runtime.upstream.gitRef).toBe('e060989b202548848eb440a5005cd41a8b26f7db');
    await page.locator('#status-bar').getByText('TIMELINE', { exact: true }).click();
    await page.locator('#totalFrames input').fill('100000');
    await page.locator('#totalFrames input').press('Enter');
    expect(await page.evaluate(() => window.scene.events.invoke('timeline.frames'))).toBe(100000);
    await page.screenshot({ path: test.info().outputPath('candidate-page.png') });
    expect(errors).toEqual([]);
});

for (const [name, file] of [['small', small], ['large', large]]) {
    test(`MF-56 ${name} project editing, undo/redo, save and reopen`, async ({ page }) => {
        test.skip(!file || !existsSync(file), 'Provide METAFLOW_SAMPLE_DIR with the approved local project fixtures.');
        test.setTimeout(240_000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await boot(page);
        const before = await loadProject(page, file);
        expect(before.length).toBeGreaterThan(0);
        expect(before[0].count).toBeGreaterThan(0);
        const edit = await page.evaluate(async () => {
            const e = window.scene.events;
            const splat = e.invoke('scene.splats')[0];
            e.fire('selection', splat);
            const drain = () => e.invoke('queue', () => {});
            e.fire('select.all'); await drain();
            const selected = splat.numSelected;
            e.fire('select.delete'); await drain();
            const deleted = splat.numDeleted;
            e.fire('edit.undo'); await drain();
            const undone = splat.numDeleted;
            e.fire('edit.redo'); await drain();
            const redone = splat.numDeleted;
            e.fire('edit.undo'); await drain();
            e.fire('select.none'); await drain();
            return { selected, deleted, undone, redone };
        });
        expect(edit.selected).toBe(before[0].count);
        expect(edit.deleted).toBe(before[0].count);
        expect(edit.undone).toBe(0);
        expect(edit.redone).toBe(edit.deleted);
        const download = page.waitForEvent('download');
        await page.evaluate(() => window.scene.events.invoke('doc.saveAs'));
        const saved = test.info().outputPath(`${name}-roundtrip.ssproj`);
        await (await download).saveAs(saved);
        const after = await loadProject(page, saved);
        expect(after.map(s => s.count)).toEqual(before.map(s => s.count));
        for (let i = 0; i < before.length; ++i) {
            for (let c = 0; c < 3; ++c) expect(after[i].center[c]).toBeCloseTo(before[i].center[c], 4);
        }
        await page.screenshot({ path: test.info().outputPath(`${name}-reopened.png`) });
        await test.info().attach('project-counts', { body: JSON.stringify({ before, after, edit }), contentType: 'application/json' });
        expect(errors).toEqual([]);
    });
}

test('MF-56 legacy ZIP and settings-only preserve settings and fixed package structure', async ({ page }) => {
    test.skip(!small || !existsSync(small), 'Provide METAFLOW_SAMPLE_DIR.');
    await boot(page);
    await loadProject(page, small);
    await page.evaluate(() => { void window.scene.events.invoke('scene.export', 'viewer'); });
    const popup = page.locator('#export-popup');
    await expect(popup).toBeVisible();
    await popup.locator('.select').first().click();
    await page.getByText('settings.json', { exact: true }).click();
    const settingsDownload = page.waitForEvent('download');
    await popup.getByRole('button', { name: 'Export', exact: true }).click();
    const settingsPath = test.info().outputPath('settings.json');
    await (await settingsDownload).saveAs(settingsPath);
    const { readFile } = await import('node:fs/promises');
    const experienceSettings = JSON.parse(await readFile(settingsPath, 'utf8'));
    expect(experienceSettings.version).toBe(2);
    expect(experienceSettings.cameras.length).toBeGreaterThan(0);
    expect(experienceSettings.animTracks.length).toBeGreaterThan(0);
    const legacy = await writeScene(page, 'legacyPackageViewer', 'legacy.zip', { type: 'legacyZip', experienceSettings });
    const zipPath = test.info().outputPath('legacy.zip');
    await legacy.saveAs(zipPath);
    const entries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).trim().split('\n').sort();
    expect(entries).toEqual(['index.css', 'index.html', 'index.js', 'scene.compressed.ply', 'settings.json']);
    expect(JSON.parse(execFileSync('unzip', ['-p', zipPath, 'settings.json'], { encoding: 'utf8' }))).toEqual(experienceSettings);
    const model = await writeScene(page, 'compressedPly', 'scene.compressed.ply');
    await model.saveAs(test.info().outputPath('scene.compressed.ply'));
});
