import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { videoFixture } from './video-helpers.mjs';
import { writeScene } from './helpers.mjs';

test('MF-56 LCC2 old/new metadata protocols import native SOG/SPZ chunks', async ({ page }) => {
    const errors = await videoFixture(page);
    const chunks = {};
    for (const format of ['spz', 'sog']) {
        const download = await writeScene(page, format, `fixture.${format}`);
        const file = test.info().outputPath(`fixture.${format}`);
        await download.saveAs(file);
        chunks[format] = (await readFile(file)).toString('base64');
    }
    for (const legacy of [false, true]) {
        const result = await page.evaluate(async ({ legacy, chunk }) => {
            const e = window.scene.events;
            e.fire('scene.clear');
            const root = {
                // The old protocol implies .sog and appends that extension;
                // newer metadata explicitly supports SPZ chunks.
                [legacy ? 'files' : 'splatFiles']: [legacy ? '/fixture' : 'fixture.spz'],
                [legacy ? 'child_num' : 'childNum']: 1,
                child: [{ data: { '3dgs': { name: 0, start: 0, count: 600 } } }]
            };
            const metadata = legacy ? { total_splats: 600, lod_3dgs_info: [600], lod_level: 1, root } :
                { totalSplats: 600, lodSplats: [600], totalLevels: 1, splatType: '.spz', root };
            const text = JSON.stringify(metadata);
            const bytes = Uint8Array.from(atob(chunk), c => c.charCodeAt(0));
            await e.invoke('import', [
                { filename: 'meta.lcc2', contents: new File([text], 'meta.lcc2') },
                { filename: legacy ? 'fixture.sog' : 'fixture.spz', contents: new File([bytes], legacy ? 'fixture.sog' : 'fixture.spz') }
            ]);
            return e.invoke('scene.allSplats').map(p => ({ count: p.numSplats, bounds: p.worldBound.halfExtents.toArray() }));
        }, { legacy, chunk: chunks[legacy ? 'sog' : 'spz'] });
        expect(result[0].count).toBe(600);
        expect(result[0].bounds.every(Number.isFinite)).toBe(true);
    }
    await page.screenshot({ path: test.info().outputPath('lcc2-calibration.png') });
    expect(errors).toEqual([]);
});
