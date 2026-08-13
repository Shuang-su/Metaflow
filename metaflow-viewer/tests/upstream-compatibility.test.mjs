import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readText = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const readJson = async (path) => JSON.parse(await readText(path));

const flattenKeys = (value, prefix = '') => Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
        return flattenKeys(child, path);
    }
    return [path];
});

test('route and explicit-query precedence remains the Metaflow contract', async () => {
    const html = await readText('../src/index.html');

    assert.match(html, /let contentUrl = url\.searchParams\.has\('content'\) \? url\.searchParams\.get\('content'\) : null/);
    assert.match(html, /if \(pathname !== '\/' && pathname !== '\/index\.html' && !contentUrl\)/);
    assert.match(html, /normalizeRoutePath\(r\?\.route\) === normalizedPath/);
    assert.match(html, /r\.aliases\.some\(\(alias\) => normalizeRoutePath\(alias\) === normalizedPath\)/);
    assert.match(html, /posterUrl = posterUrl \|\| dataUrl\(resource\?\.files\?\.thumbnail\)/);
    assert.match(html, /voxelManifestUrl = voxelManifestUrl \|\| dataUrl\(resource\?\.files\?\.voxelManifest\)/);
    assert.match(html, /voxelUrl = voxelUrl \|\| dataUrl\(resource\?\.files\?\.voxel\)/);
    assert.match(html, /collisionUrl = collisionUrl \|\| dataUrl\(resource\?\.files\?\.collision\)/);
    assert.match(html, /environmentUrl = environmentUrl \|\| dataUrl\(resource\?\.files\?\.environment\)/);
    assert.match(html, /fetch\('\/data\/index\.json', \{\s*cache: 'no-store'\s*\}\)/s);
});

test('legacy SOG and streaming LOD paths keep separate first-frame contracts', async () => {
    const [index, viewer] = await Promise.all([
        readText('../src/index.ts'),
        readText('../src/viewer.ts')
    ]);

    assert.match(index, /(?:interface|type) LoadCallbacks/);
    assert.match(index, /detectStreamingLodByStructure/);
    assert.match(index, /streamingByName[\s\S]*'streaming-json'[\s\S]*'legacy-sog'/);
    assert.match(index, /callbacks\.onMode\(loadMode\)/);
    assert.match(viewer, /const instance = gsplatComponent\.instance/);
    assert.match(viewer, /instance\.sorter\.on\('updated', onSorterUpdated\)/);
    assert.match(viewer, /setTimeout\(\(\) => \{[\s\S]*SOG sorter timeout[\s\S]*\}, 3000\)/);
    assert.match(viewer, /eventHandler\.on\('frame:ready', readyHandler\)/);
    assert.equal((viewer.match(/startGsplatReveal\([^)]*\);\s*state\.readyToRender = true;/g) || []).length, 2);
    assert.equal((viewer.match(/events\.fire\('firstFrame'\)/g) || []).length, 2);
});

test('environment, reveal, loading visibility, and synthetic animation ordering stays non-blocking', async () => {
    const [index, viewer, ui] = await Promise.all([
        readText('../src/index.ts'),
        readText('../src/viewer.ts'),
        readText('../src/ui.ts')
    ]);

    assert.match(index, /const environmentLoad = hasEnvironment \? loadEnvironment\(app, config\) : null/);
    assert.match(index, /return new Viewer\(\s*global,\s*gsplatLoad,\s*environmentLoad,/s);
    assert.match(viewer, /Promise\.all\(\[gsplatLoad, skyboxLoad, collisionLoad\]\)/);
    assert.doesNotMatch(viewer, /Promise\.all\(\[gsplatLoad, environmentLoad/);
    assert.match(viewer, /environmentLoad\?\.then/);
    assert.match(viewer, /events\.on\('firstFrame', \(\) => \{\s*state\.loaded = true;[\s\S]*beginRevealWhenSceneVisible\(\)/);
    assert.match(viewer, /window\.requestAnimationFrame\(\(\) => \{\s*this\.gsplatReveal\?\.beginVisiblePlayback\(\)/);
    assert.match(ui, /events\.on\('loaded:changed'/);
    assert.match(ui, /document\.getElementById\('loadingWrap'\)\.classList\.add\('hidden'\)/);
    assert.match(ui, /document\.documentElement\.style\.setProperty\('--canvas-opacity', '1'\)/);
});

test('streaming SH follows v1.29.1 while staged low-to-high LOD remains local behavior', async () => {
    const viewer = await readText('../src/viewer.ts');

    assert.match(viewer, /gsplat\.colorUpdateAngle = state\.performanceMode \? 1 : 0\.2/);
    assert.doesNotMatch(viewer, /colorUpdateAngle = state\.performanceMode \? 4 : 2/);
    assert.match(viewer, /gsplatComponent\.lodRangeMax = gsplatComponent\.lodRangeMin = lodLevels - 1/);
    assert.match(viewer, /onSubjectRevealed: openHighDetailLod/);
    assert.match(viewer, /events\.on\('performanceMode:changed', applyPerfSettings\)/);
    assert.match(viewer, /app\.scene\.gsplat\.minPixelSize = 0\.5/);
    assert.match(viewer, /app\.scene\.gsplat\.minPixelSize = 2/);
});

test('settings v1/v2 normalization protects partial post-effect data', async () => {
    const [settings, viewer] = await Promise.all([
        readText('../src/settings.ts'),
        readText('../src/viewer.ts')
    ]);

    assert.match(settings, /const defaultPostEffectSettings = \(\): PostEffectSettings/);
    assert.match(settings, /const rootDisabled = source\.enabled === false/);
    assert.match(settings, /enabled: rootDisabled \? false : value\?\.enabled === true/);
    for (const effect of ['sharpness', 'bloom', 'grading', 'vignette', 'fringing']) {
        assert.match(settings, new RegExp(`${effect}: mergeEffect\\(defaults\\.${effect}, source\\.${effect}\\)`));
    }
    assert.match(settings, /version === 2[\s\S]*postEffectSettings: normalizePostEffectSettings\(settings\.postEffectSettings\)/);
    assert.match(viewer, /anyPostEffectEnabled\(postEffectSettings\)/);
});

test('single and tiled collision retain deferred loading, cache degradation, and coordinate conversion', async () => {
    const [index, viewer, tiled, voxel] = await Promise.all([
        readText('../src/index.ts'),
        readText('../src/viewer.ts'),
        readText('../src/collision/tiled-voxel-collision.ts'),
        readText('../src/collision/voxel-collision.ts')
    ]);

    assert.match(index, /loadTiledVoxelCollision\(config\.voxelManifestUrl, voxelOptions\)\.catch/);
    assert.match(index, /deferred: \(\) => \{[\s\S]*loadVoxelCollision\(collisionUrl, voxelOptions\)\.catch/s);
    assert.match(viewer, /events\.once\('firstFrame', \(\) => \{\s*deferredCollisionLoad\(\)/);
    assert.match(viewer, /nextCollision\.onTilesChanged = \(\) => \{/);
    assert.match(tiled, /private readonly _loaded = new Map/);
    assert.match(tiled, /if \(!desired\.has\(id\)\) \{\s*this\._loaded\.delete\(id\)/);
    assert.match(tiled, /\.catch\(\(err: Error\) => \{\s*this\._loading\.delete\(id\);\s*console\.warn\(`Failed to load voxel tile/);
    assert.match(voxel, /options\.coordinateSpace === 'metaflow-rz180'/);
    assert.match(voxel, /return new FlippedVoxelCollision/);
});

test('camera modes, mobile input, and first synthetic-animation exit remain explicit', async () => {
    const [types, cameraManager, inputController, html] = await Promise.all([
        readText('../src/types.ts'),
        readText('../src/camera-manager.ts'),
        readText('../src/input-controller.ts'),
        readText('../src/index.html')
    ]);

    assert.match(types, /CameraMode = 'orbit' \| 'anim' \| 'fly' \| 'walk'/);
    assert.match(types, /InputMode = 'desktop' \| 'touch'/);
    assert.match(types, /AnimationFirstExitMode = 'orbit' \| 'default'/);
    assert.match(cameraManager, /animationFirstExitMode/);
    assert.match(cameraManager, /shouldFirstExitAnimToOrbit/);
    assert.match(cameraManager, /hasHandledFirstAnimExit/);
    assert.match(cameraManager, /resolveAnimationExitMode/);
    assert.match(inputController, /inputMode/);
    assert.match(html, /defaultCameraMode: \['anim', 'orbit', 'fly', 'walk'\]/);
    assert.match(html, /animationFirstExitMode: \['orbit', 'default'\]/);
});

test('every locale keeps key parity and the branded/debug query surface', async () => {
    const locales = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt-BR', 'ru', 'zh-CN'];
    const localeData = await Promise.all(locales.map((locale) => readJson(`../src/locales/${locale}.json`)));
    const expectedKeys = flattenKeys(localeData[0]).sort();
    for (const [index, locale] of locales.entries()) {
        const localeKeys = new Set(flattenKeys(localeData[index]));
        for (const key of expectedKeys) {
            assert.ok(localeKeys.has(key), `${locale} is missing shared locale key ${key}`);
        }
    }

    const [html, ui] = await Promise.all([
        readText('../src/index.html'),
        readText('../src/ui.ts')
    ]);
    assert.match(html, /id="logoContainer"\s+href="https:\/\/metaflow\.shuang-su\.com\/"/s);
    assert.match(html, /url\.searchParams\.has\('noreveal'\) \? 'none' : 'radial'/);
    assert.match(html, /heatmap: url\.searchParams\.has\('heatmap'\)/);
    assert.match(html, /debug: url\.searchParams\.has\('debug'\)/);
    assert.match(ui, /collisionOverlayEnabled/);
});

test('Metaflow dynamic surfaces already request frames explicitly', async () => {
    const sources = new Map(await Promise.all([
        ['reveal', '../src/gsplat-reveal-radial.ts'],
        ['annotations', '../src/annotations.ts'],
        ['debug', '../src/debug/debug-panel.ts'],
        ['xr', '../src/xr.ts'],
        ['viewer', '../src/viewer.ts'],
        ['canvas', '../src/index.ts']
    ].map(async ([name, path]) => [name, await readText(path)])));

    for (const [name, source] of sources) {
        assert.match(source, /renderNextFrame = true/, `${name} must request a frame after a dynamic change`);
    }
    assert.match(sources.get('viewer'), /!nearlyEquals\(world\.data, prevWorld\.data\)/);
    assert.match(sources.get('viewer'), /collisionOverlayEnabled:changed/);
    assert.match(sources.get('canvas'), /performanceMode:changed/);
});

test('underlying upgrade is explicit without changing the released product or Node contract', async () => {
    const [packageJson, rootNode, viewerNode, versionHistory, index, readme] = await Promise.all([
        readJson('../package.json'),
        readText('../../.nvmrc'),
        readText('../.nvmrc'),
        readJson('../../metadata/version-history.json'),
        readText('../src/index.ts'),
        readText('../README.md')
    ]);

    assert.equal(packageJson.version, '5.18.1');
    assert.equal(packageJson.devDependencies.playcanvas, '2.21.3');
    assert.equal(versionHistory.current.displayVersion, '5.18.1');
    assert.equal(versionHistory.current.appSemver, '5.18.1');
    assert.equal(rootNode.trim(), '20.19.0');
    assert.equal(viewerNode.trim(), '20.19.0');
    assert.match(index, /SSV v1\.29\.1 \(PlayCanvas 2\.21\.3\)/);
    assert.match(readme, /活跃源码底层：SuperSplat Viewer `v1\.29\.1`/);
    assert.match(readme, /`metadata\/version-history\.json` 仍记录已发布产品 `5\.18\.1`/);
});
