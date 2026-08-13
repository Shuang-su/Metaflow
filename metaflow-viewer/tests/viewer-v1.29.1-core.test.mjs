import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readText = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('loading renders continuously before both legacy and streaming paths switch on demand', async () => {
    const viewer = await readText('../src/viewer.ts');
    const legacyPath = viewer.slice(viewer.indexOf('const instance = gsplatComponent.instance'), viewer.indexOf('// quality budget'));
    const streamingPath = viewer.slice(viewer.indexOf('// quality budget'));

    assert.match(viewer, /app\.autoRender = true/);
    assert.match(legacyPath, /app\.once\('frameend',[\s\S]*app\.autoRender = false/);
    assert.match(streamingPath, /ready && loading === 0[\s\S]*app\.autoRender = false/);
    assert.match(streamingPath, /eventHandler\.on\('frame:request',[\s\S]*app\.renderNextFrame = true/);
    assert.doesNotMatch(viewer, /forceRenderNextFrame|idleTime < 4|force continuous rendering until 4s/);
});

test('loading visibility remains gated and the v1.29.1 near clip is clamped', async () => {
    const [viewer, html, index, ui] = await Promise.all([
        readText('../src/viewer.ts'),
        readText('../src/index.html'),
        readText('../src/index.ts'),
        readText('../src/ui.ts')
    ]);

    assert.match(viewer, /cameraEntity\.camera\.nearClip = Math\.min\(1(?:\.0)?, near\)/);
    assert.match(html, /setProperty\('--canvas-opacity', '0'\)[\s\S]*if \(poster\)/);
    assert.match(index, /app\.start\(\);[\s\S]*initPoster\(events\);[\s\S]*camera\.addComponent\('camera'\)/);
    assert.doesNotMatch(index, /if \(config\.poster\)[\s\S]{0,80}initPoster\(events\)/);
    assert.match(ui, /loaded:changed[\s\S]*setProperty\('--canvas-opacity', '1'\)/);
});

test('streaming quality keeps Metaflow SH while writing LOD range on the component', async () => {
    const viewer = await readText('../src/viewer.ts');
    const applyPerf = viewer.slice(viewer.indexOf('const applyPerfSettings'), viewer.indexOf('if (config.fullload)'));

    assert.match(applyPerf, /gsplat\.colorUpdateAngle = state\.performanceMode \? 4 : 2/);
    assert.match(applyPerf, /gsplatComponent\.lodRangeMin = 0/);
    assert.match(applyPerf, /gsplatComponent\.lodRangeMax = 1000/);
    assert.match(applyPerf, /app\.renderNextFrame = true/);
    assert.doesNotMatch(viewer, /gsplat\.lodRange(?:Min|Max)/);
});

test('persistent streaming parameters are set before the work-buffer can start', async () => {
    const viewer = await readText('../src/viewer.ts');
    const initialReadySubscription = viewer.lastIndexOf("eventHandler.on('frame:ready', readyHandler)");

    for (const contract of [
        'gsplat.minContribution = 1',
        'gsplat.alphaClip = 1 / 255',
        'gsplat.antiAlias = config.aa',
        'gsplat.debug = config.colorize ? GSPLAT_DEBUG_LOD : GSPLAT_DEBUG_NONE'
    ]) {
        const position = viewer.indexOf(contract);
        assert.ok(position >= 0, `missing streaming contract: ${contract}`);
        assert.ok(position < initialReadySubscription, `${contract} must precede frame:ready`);
    }
});
