import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const LEGACY_VOXEL_RZ180_ROUTES = [
    '/acg/2568/2026',
    '/acg/j05/xunyangpai',
    '/acg/phoenixfes26/huaijiao',
    '/acg/phoenixfes26/itasha',
    '/acg/phoenixfes26/silver-wolf',
    '/acg/phoenixfes26/stage',
    '/acg/fireflyfes38/azur-lane',
    '/acg/fireflyfes38/cyrene',
    '/acg/fireflyfes38/diaochan',
    '/acg/fireflyfes38/fireflyfes38',
    '/acg/fireflyfes38/fursuit',
    '/acg/fireflyfes38/nangong-yu',
    '/acg/fireflyfes38/remielle-dan',
    '/acg/fireflyfes38/remielle-dan-b',
    '/shenzhen/bijiashan',
    '/shenzhen/dayun',
    '/sztu/c1-bdi-206',
    '/sztu/fes/top10-26'
];

const HISTORICAL_ACG_SCENE_ROUTES = [
    '/acg/j04/itasha',
    '/acg/j04/ggc',
    '/acg/j05/xunyangpai',
    '/acg/phoenixfes26/itasha',
    '/acg/phoenixfes26/stage'
];

test('Dayun index exposes tiled voxel manifest without legacy single-voxel fallback', async () => {
    const index = await readJson(new URL('../../data/index.json', import.meta.url));
    const dayun = index.resources.find((resource) => resource.id === 'dayun');

    assert.ok(dayun, 'dayun resource should exist');
    assert.equal(dayun.route, '/shenzhen/dayun');
    assert.equal(dayun.files.voxelManifest, 'Shenzhen/250917 Dayun/tiled-voxel/voxel-tiles.json');
    assert.equal(dayun.viewer.defaultCameraMode, 'fly');
    assert.equal(dayun.viewer.voxelCoordinateSpace, 'metaflow-rz180');
    assert.equal(dayun.experienceType, 'scene');
    assert.equal(dayun.viewer.animationFirstExitMode, 'orbit');
    assert.equal(dayun.files.voxel, undefined);
    assert.equal(dayun.fileSize.voxel, undefined);
    assert.ok(dayun.fileSize.voxelManifest > 0);
});

test('resource index separates capture source from viewing experience type', async () => {
    const index = await readJson(new URL('../../data/index.json', import.meta.url));
    const allowedTypes = new Set(['character', 'scene', 'object']);

    for (const resource of index.resources) {
        assert.ok(allowedTypes.has(resource.experienceType), `${resource.route} has an invalid experienceType`);
        assert.ok(['scanner', 'photogrammetry'].includes(resource.source), `${resource.route} has an invalid source`);
    }

    for (const route of HISTORICAL_ACG_SCENE_ROUTES) {
        const resource = index.resources.find((entry) => entry.route === route);
        assert.ok(resource, `${route} should exist`);
        assert.equal(resource.experienceType, 'scene');
        assert.notEqual(resource.viewer?.animationFirstExitMode, 'orbit');
    }

    const fireflyScene = index.resources.find((entry) => entry.route === '/acg/fireflyfes38/fireflyfes38');
    assert.equal(fireflyScene?.experienceType, 'scene');

    const cyrene = index.resources.find((entry) => entry.route === '/acg/fireflyfes38/cyrene');
    assert.equal(cyrene?.experienceType, 'character');
    assert.equal(cyrene?.viewer?.animationFirstExitMode, 'orbit');

    const c2Lib = index.resources.find((entry) => entry.route === '/sztu/c2-lib');
    assert.equal(c2Lib?.experienceType, 'scene');
    assert.equal(c2Lib?.viewer?.animationFirstExitMode, 'orbit');
});

test('route config forwards the structured first-animation-exit policy', async () => {
    const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
    const types = await readFile(new URL('../src/types.ts', import.meta.url), 'utf8');
    const cameraManager = await readFile(new URL('../src/camera-manager.ts', import.meta.url), 'utf8');

    assert.match(html, /resource\?\.viewer\?\.animationFirstExitMode/);
    assert.match(types, /AnimationFirstExitMode = 'orbit' \| 'default'/);
    assert.match(cameraManager, /config\.animationFirstExitMode === 'orbit'/);
    assert.doesNotMatch(cameraManager, /location\.pathname|isAcgRoute|isSceneLikeRoute/);
});

test('legacy single voxel starts after first frame and attaches collision at runtime', async () => {
    const indexSource = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
    const viewer = await readFile(new URL('../src/viewer.ts', import.meta.url), 'utf8');
    const cameraManager = await readFile(new URL('../src/camera-manager.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /deferred:\s*\(\)\s*=>\s*\{/);
    assert.match(indexSource, /loadVoxelCollision\(collisionUrl,\s*voxelOptions\)/);
    assert.match(viewer, /events\.once\('firstFrame'/);
    assert.match(viewer, /deferredCollisionLoad\(\)\s*\.then\(attachCollision\)/s);
    assert.match(viewer, /this\.inputController\.collision = nextCollision/);
    assert.match(viewer, /this\.cameraManager\.setCollision\(nextCollision\)/);
    assert.match(cameraManager, /setCollision:\s*\(collision:\s*Collision \| null\) => void/);
    assert.doesNotMatch(viewer, /Promise\.all\(\[gsplatLoad,\s*skyboxLoad,\s*deferredCollisionLoad/);
});

test('README documents every supported URL query parameter', async () => {
    const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8');
    const parameters = [
        'content', 'settings', 'poster', 'skybox', 'environment', 'collision',
        'voxel', 'voxelManifest', 'noui', 'noanim', 'webgl', 'aa', 'nofx', 'noreveal',
        'hpr', 'budget', 'fullload', 'colorize', 'unified', 'debug',
        'ministats', 'heatmap'
    ];

    for (const parameter of parameters) {
        assert.match(readme, new RegExp(`\\\`${parameter}\\\``), `${parameter} should be documented`);
    }
    assert.match(readme, /Ctrl\+Shift\+D/);
    assert.match(readme, /Cmd\+Shift\+D/);
    assert.match(readme, /cb=时间戳/);
});

test('global gsplat reveal is shader-based, color-neutral, and skippable by URL', async () => {
    const reveal = await readFile(new URL('../src/gsplat-reveal-radial.ts', import.meta.url), 'utf8');
    const viewer = await readFile(new URL('../src/viewer.ts', import.meta.url), 'utf8');
    const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
    const types = await readFile(new URL('../src/types.ts', import.meta.url), 'utf8');

    assert.match(reveal, /modifySplatCenter/);
    assert.match(reveal, /modifySplatRotationScale/);
    assert.match(reveal, /modifySplatColor\(vec3 center, inout vec4 color\)\s*\{\s*\}/);
    assert.match(reveal, /fn modifySplatColor\(center: vec3f, color: ptr<function, vec4f>\)\s*\{\s*\}/);
    assert.match(reveal, /uRevealAcceleration/);
    assert.match(reveal, /REVEAL_START_RADIUS = 0\.005/);
    assert.match(reveal, /REVEAL_DOT_SCALE = 0\.035/);
    assert.doesNotMatch(reveal, /REVEAL_DOT_SIZE/);
    assert.match(reveal, /uniform float uRevealDotSize/);
    assert.match(reveal, /uRevealDotSize: f32/);
    assert.match(reveal, /uRevealDotSize \* revealScale \/ REVEAL_DOT_SCALE/);
    assert.match(reveal, /type RevealDotProfile = 'characterSog' \| 'streamingScene' \| 'megaVoxel'/);
    assert.match(reveal, /function calcRevealDotSize\(profile: RevealDotProfile, radius: number\)/);
    assert.match(reveal, /LEGACY_ONLINE_DOT \* 1\.5/);
    assert.match(reveal, /radius \* 0\.000066, 0\.0012\), 0\.015/);
    assert.match(reveal, /radius \* 0\.00022, 0\.004\), 0\.05/);
    assert.match(reveal, /calcRevealDotSize\(this\.dotProfile, this\.radius\)/);
    assert.match(reveal, /dotProfile\?: RevealDotProfile/);
    assert.match(reveal, /DEFAULT_REVEAL_DELAY = 1\.0/);
    assert.match(reveal, /wavesActive/);
    assert.match(reveal, /uRevealOscillation \* 0\.25/);
    assert.doesNotMatch(reveal, /REVEAL_LIFT_BUMP|liftAmount/);
    assert.match(reveal, /this\.speed \* this\.speed \+ 2 \* this\.acceleration \* targetRadius/);
    assert.match(reveal, /REVEAL_PACE_SCALE = 0\.6/);
    assert.match(reveal, /MEGA_VOXEL_PACE_SCALE = 0\.85/);
    assert.match(reveal, /applyMotionProfile/);
    assert.match(reveal, /fitWaveToSceneSize/);
    assert.match(reveal, /REVEAL_REFERENCE_RADIUS = 20/);
    assert.match(reveal, /this\.delay = DEFAULT_REVEAL_DELAY \/ MEGA_VOXEL_PACE_SCALE/);
    assert.match(reveal, /this\.waveRadius = this\.radius/);
    assert.match(reveal, /streamingLod/);
    assert.match(reveal, /subjectBounds\?: BoundingBox/);
    assert.match(reveal, /onComplete\?: \(\) => void/);
    assert.match(reveal, /onSubjectRevealed\?: \(\) => void/);
    assert.match(reveal, /this\.onComplete\?\.\(\)/);
    assert.match(reveal, /this\.onSubjectRevealed\?\.\(\)/);
    assert.match(reveal, /getLiftReachTime/);
    assert.match(reveal, /subjectRevealTime/);
    assert.match(reveal, /attachEntity\(entity: Entity/);
    assert.match(reveal, /WORKBUFFER_UPDATE_ALWAYS = 2/);
    assert.match(reveal, /setWorkBufferAlwaysUpdate\(true\)/);
    assert.match(reveal, /setWorkBufferAlwaysUpdate\(false\)/);
    assert.match(reveal, /activePlacements/);
    assert.match(reveal, /placement\.workBufferUpdate = mode/);
    assert.doesNotMatch(reveal, /gsplatParams\.dirty/);
    assert.doesNotMatch(reveal, /REVEAL_MAX_WAVE_RADIUS/);
    assert.doesNotMatch(reveal, /pendingLoads/);
    assert.doesNotMatch(reveal, /streamingPaused/);
    assert.match(reveal, /MAX_REVEAL_DELTA_TIME = 1 \/ 30/);
    assert.match(reveal, /this\.time \+= Math\.min\(Math\.max\(dt, 0\), MAX_REVEAL_DELTA_TIME\)/);
    assert.doesNotMatch(reveal, /uDotTint|uWaveTint|color\.rgb|\(\*color\)\s*=\s*vec4f/);
    assert.match(reveal, /delete\('gsplatModifyVS'\)/);
    assert.match(reveal, /setWorkBufferModifier\(\{ glsl: shaderGLSL, wgsl: shaderWGSL \}\)/);
    assert.match(reveal, /setWorkBufferModifier\?\.\(null\)/);
    assert.match(reveal, /setParameter\?\.\(name, value\)/);
    assert.match(reveal, /deleteParameter\?\.\(name\)/);
    assert.match(reveal, /rootEntities: Entity\[\]/);
    assert.match(reveal, /Array\.isArray\(rootEntity\)/);
    assert.match(reveal, /gsplatDirector/);
    assert.match(reveal, /camerasMap/);
    assert.match(reveal, /gsplatManager\?\.material/);
    assert.match(reveal, /gsplatManagerShadow\?\.material/);
    assert.match(reveal, /material:created/);
    assert.match(reveal, /uniform float uRevealActive/);
    assert.match(reveal, /uniform uRevealActive: f32/);
    assert.match(reveal, /uRevealActive < 0\.5/);
    assert.match(reveal, /SHADER_CHUNKS_VERSION = '2\.25'/);
    assert.match(reveal, /shaderChunksVersion = SHADER_CHUNKS_VERSION/);

    assert.equal((viewer.match(/startGsplatReveal\([^)]*\);\s+state\.readyToRender = true;/g) || []).length, 2);
    assert.match(viewer, /startGsplatReveal = \(revealCallbacks\?:/);
    assert.match(viewer, /onSubjectRevealed: openHighDetailLod/);
    assert.match(viewer, /highDetailOpened/);
    assert.match(viewer, /events\.on\('performanceMode:changed', applyPerfSettings\);\s+applyPerfSettings\(\);/);
    assert.match(viewer, /environmentLoad: Promise<Entity \| null> \| null/);
    assert.match(viewer, /Promise\.all\(\[gsplatLoad, skyboxLoad, collisionLoad\]\)/);
    assert.doesNotMatch(viewer, /Promise\.all\(\[gsplatLoad, environmentLoad/);
    assert.match(viewer, /environmentLoad\?\.then/);
    assert.match(viewer, /attachEnvironmentToReveal/);
    assert.match(viewer, /gsplatReveal\?\.attachEntity/);
    assert.match(viewer, /mainSubjectBounds/);
    assert.match(viewer, /subjectBounds: mainSubjectBounds/);
    assert.match(viewer, /revealEntities = environmentEntity \? \[gsplatEntity, environmentEntity\] : gsplatEntity/);
    assert.match(viewer, /revealBounds\.add\(transformedEnvironmentBbox\)/);
    assert.match(viewer, /streamingLod: state\.loadingMode === 'streaming-json'/);
    assert.match(viewer, /dotProfile: resolveRevealDotProfile\(config, state\.loadingMode\)/);
    assert.match(viewer, /function resolveRevealDotProfile/);
    assert.match(viewer, /config\.experienceType === 'character'/);
    assert.match(viewer, /config\.voxelManifestUrl/);
    assert.match(viewer, /return 'megaVoxel'/);
    assert.match(viewer, /return 'streamingScene'/);
    assert.match(viewer, /app\.scene\.gsplat\.minPixelSize = 0\.5/);
    assert.match(viewer, /app\.scene\.gsplat\.minPixelSize = 2/);
    assert.match(viewer, /beginRevealWhenSceneVisible/);
    assert.doesNotMatch(viewer, /window\.setTimeout\(begin, 600\)/);
    assert.doesNotMatch(viewer, /loadingWrap\.addEventListener\('transitionend'/);
    assert.doesNotMatch(viewer, /gsplatReveal\?\.restart/);
    assert.match(viewer, /gsplatReveal\.arm\(\)/);
    assert.doesNotMatch(viewer, /gsplatReveal\.arm\(\);\s+this\.gsplatReveal\.beginVisiblePlayback\(\)/);
    assert.match(viewer, /state\.loaded = true;[\s\S]*beginRevealWhenSceneVisible\(\)/);
    assert.match(viewer, /beginVisiblePlayback\(\)/);
    assert.match(viewer, /config\.revealEffect === 'none'/);
    assert.match(html, /url\.searchParams\.has\('noreveal'\) \? 'none' : 'radial'/);
    assert.match(html, /experienceType: \['character', 'scene'\]\.includes\(experienceType\)/);
    assert.match(types, /RevealEffect = 'radial' \| 'none'/);
    assert.match(types, /ExperienceType = 'character' \| 'scene'/);
    assert.match(types, /experienceType\?: ExperienceType/);
});

test('Xunyangpai keeps the public English route and the previous Chinese route alias', async () => {
    const index = await readJson(new URL('../../data/index.json', import.meta.url));
    const resource = index.resources.find((entry) => entry.id === 'xunyangpai');

    assert.ok(resource, 'xunyangpai resource should exist');
    assert.equal(resource.route, '/acg/j05/xunyangpai');
    assert.deepEqual(resource.aliases, ['/acg/j05/寻洋派']);
    assert.equal(resource.viewer?.voxelCoordinateSpace, 'metaflow-rz180');
});

test('route index bypasses stale immutable browser caches', async () => {
    const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
    const netlify = await readFile(new URL('../../netlify.toml', import.meta.url), 'utf8');

    assert.match(html, /fetch\('\/data\/index\.json',\s*\{\s*cache:\s*'no-store'\s*\}\)/s);
    assert.match(
        netlify,
        /\[\[headers\]\]\s+for = "\/data\/index\.json"\s+\[headers\.values\]\s+Cache-Control = "public, max-age=0, must-revalidate"/s
    );
});

test('legacy partial v2 post effects are normalized before Viewer construction', async () => {
    const settings = await readJson(new URL(
        '../../data/ACG/FireflyFes38/260502 172930 03 崩坏星穹铁道 昔涟/settings-v2.json',
        import.meta.url
    ));
    const source = await readFile(new URL('../src/settings.ts', import.meta.url), 'utf8');
    const viewer = await readFile(new URL('../src/viewer.ts', import.meta.url), 'utf8');

    assert.deepEqual(settings.postEffectSettings, { enabled: false });
    assert.match(source, /normalizePostEffectSettings/);
    assert.match(source, /rootDisabled = source\.enabled === false/);
    assert.match(source, /postEffectSettings: normalizePostEffectSettings/);
    assert.match(viewer, /Standard SOG resources use the per-instance sorter/);
    assert.match(viewer, /SOG sorter timeout - forcing first frame/);
});

test('published legacy voxel resources are explicitly marked for Metaflow Rz180 coordinates', async () => {
    const index = await readJson(new URL('../../data/index.json', import.meta.url));
    const collisionResources = index.resources.filter((resource) => resource.files?.voxel || resource.files?.voxelManifest);
    const resourcesByRoute = new Map(collisionResources.map((resource) => [resource.route, resource]));
    const expectedRoutes = [...LEGACY_VOXEL_RZ180_ROUTES].sort();

    for (const route of expectedRoutes) {
        const resource = resourcesByRoute.get(route);
        assert.ok(resource, `${route} should still be present in the resource index`);
        assert.equal(resource.viewer?.voxelCoordinateSpace, 'metaflow-rz180', `${route} should use legacy coordinates`);
    }

    const markedRoutes = collisionResources
    .filter((resource) => resource.viewer?.voxelCoordinateSpace === 'metaflow-rz180')
    .map((resource) => resource.route)
    .sort();

    assert.deepEqual(markedRoutes, expectedRoutes);
});

test('Dayun tiled voxel source is pinned and full manifest paths validate when available', async () => {
    const base = new URL('../../data/Shenzhen/250917 Dayun/tiled-voxel/', import.meta.url);
    const manifestUrl = new URL('voxel-tiles.json', base);
    const rawManifest = await readFile(manifestUrl);
    const expectedSha256 = '4654f0904fd641c92f8d62fd6d90e65bd339d5421083180d267dfd8f12133ef4';
    const expectedSize = 157118;
    const checkLargeFiles = process.env.MCL_SMALL_FIXTURES !== '1';

    if (rawManifest.toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1\n')) {
        assert.equal(checkLargeFiles, false, 'full-data validation requires the resolved LFS object');
        assert.match(rawManifest.toString('utf8'), new RegExp(`oid sha256:${expectedSha256}\\n`));
        assert.match(rawManifest.toString('utf8'), new RegExp(`size ${expectedSize}\\n?$`));
        return;
    }

    assert.equal(rawManifest.byteLength, expectedSize);
    assert.equal(createHash('sha256').update(rawManifest).digest('hex'), expectedSha256);
    const manifest = JSON.parse(rawManifest.toString('utf8'));

    assert.equal(manifest.version, 1);
    assert.equal(manifest.voxelResolution, 0.08);
    assert.equal(manifest.tileSize, 64);
    assert.equal(manifest.overlap, 8);
    assert.equal(manifest.tiles.length, 293);

    for (const tile of manifest.tiles) {
        assert.match(tile.url, /^tiles\/x\d+_z\d+\/walk\.voxel\.json$/);
        if (!checkLargeFiles) continue;
        const jsonStat = await stat(new URL(tile.url, base));
        const binStat = await stat(new URL(tile.url.replace(/\.json$/, '.bin'), base));
        assert.ok(jsonStat.size > 0, `${tile.id} json should not be empty`);
        assert.ok(binStat.size > 0, `${tile.id} bin should not be empty`);
    }
});

test('Chinese locale contains loading labels for newly implemented stages', async () => {
    const zh = await readJson(new URL('../src/locales/zh-CN.json', import.meta.url));
    const requiredKeys = [
        'loading.stage.renderer',
        'loading.stage.index',
        'loading.stage.collision',
        'loading.stage.voxel-meta',
        'loading.stage.voxel-bin',
        'loading.stage.voxel-build',
        'loading.stage.voxel-manifest',
        'loading.stage.voxel-tile',
        'loading.stage.voxel-tile-switch',
        'loading.stage.overlay',
        'loading.stage.complete'
    ];

    for (const key of requiredKeys) {
        assert.equal(typeof zh[key], 'string', `${key} should exist`);
        assert.notEqual(zh[key].trim(), '', `${key} should not be empty`);
    }
});

test('scene background CSS is revealed only after the first rendered frame', async () => {
    const source = await readFile(new URL('../src/viewer.ts', import.meta.url), 'utf8');
    const applyBackgroundStart = source.indexOf('applyBackground(settings: ExperienceSettings)');
    const revealBackgroundStart = source.indexOf('revealSceneBackground()', applyBackgroundStart);
    const applyBackgroundSource = source.slice(applyBackgroundStart, revealBackgroundStart);
    const scss = await readFile(new URL('../src/index.scss', import.meta.url), 'utf8');
    const index = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');

    assert.notEqual(applyBackgroundStart, -1, 'applyBackground should exist');
    assert.notEqual(revealBackgroundStart, -1, 'revealSceneBackground should follow applyBackground');
    assert.doesNotMatch(applyBackgroundSource, /--app-background|--canvas-background/);
    assert.match(source, /state\.loaded = true;\s+this\.revealSceneBackground\(\);/);
    assert.match(scss, /--canvas-background:\s*transparent;/);
    assert.match(index, /alpha:\s*true/);
});

test('Metaflow gradient backgrounds are preserved through CameraFrame compose', async () => {
    const source = await readFile(new URL('../src/viewer.ts', import.meta.url), 'utf8');

    assert.match(source, /composeGradientGlsl/);
    assert.match(source, /composeGradientWgsl/);
    assert.match(source, /sceneBackgroundRevealed/);
    assert.match(source, /composeMainEndPS/);
    assert.match(source, /gl_FragColor = vec4\(result, 1\.0\);/);
    assert.match(source, /output\.color = vec4f\(result, 1\.0\);/);
    assert.match(source, /Metaflow gradients are composited behind transparent splats/);
});

test('collision overlay button is the production UI, not a local debug-only control', async () => {
    const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
    const ui = await readFile(new URL('../src/ui.ts', import.meta.url), 'utf8');
    const viewer = await readFile(new URL('../src/viewer.ts', import.meta.url), 'utf8');

    assert.match(html, /id="showCollision"/);
    const scss = await readFile(new URL('../src/index.scss', import.meta.url), 'utf8');
    assert.match(scss, /#ui\s*\{[^}]*z-index:\s*10;/s);
    assert.match(scss, /html\s*\{[^}]*height:\s*100%;/s);
    assert.match(scss, /body\s*\{[^}]*height:\s*100%;/s);
    assert.match(ui, /events\.on\('hasCollisionOverlay:changed'/);
    assert.match(ui, /dom\.showCollision\.classList\.toggle\('hidden', !value\)/);
    assert.doesNotMatch(ui, /localhost|NODE_ENV|searchParams\.has\(['"]debug['"]\)/);
    assert.match(viewer, /TiledVoxelDebugOverlay/);
    assert.match(viewer, /state\.hasCollisionOverlay = true/);
});

test('Metaflow theme and expandable logo are restored on top of the synced viewer', async () => {
    const scss = await readFile(new URL('../src/index.scss', import.meta.url), 'utf8');
    const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
    const ui = await readFile(new URL('../src/ui.ts', import.meta.url), 'utf8');

    assert.match(scss, /\$clr-accent:\s*#42d2f6;/);
    assert.match(scss, /\$clr-grip:\s*#50c2ff;/);
    assert.doesNotMatch(scss, /\$clr-accent:\s*#F60;/);
    assert.doesNotMatch(scss, /#FFAF50/);
    assert.doesNotMatch(ui, /#F60/);

    assert.match(html, /id="logoWrap"/);
    assert.match(html, /id="logoContainer"/);
    assert.doesNotMatch(html, /id="viewerBranding"/);
    assert.match(scss, /#logoContainer\.expanded #logoWord/);
    assert.match(ui, /logoContainer\.classList\.add\('expanded'\)/);
});

test('Metaflow XR customization is kept with backend-aware WebGPU support', async () => {
    const xr = await readFile(new URL('../src/xr.ts', import.meta.url), 'utf8');

    assert.match(xr, /XrVrNavigation/);
    assert.doesNotMatch(xr, /playcanvas\/scripts\/esm\/xr-navigation\.mjs/);
    assert.match(xr, /renderer === 'webgpu'/);
    assert.match(xr, /XrManager\.isDeviceSupported\(DEVICETYPE_WEBGL2/);
    assert.match(xr, /app\.xr\.on\('available', updateAvailable\)/);
    assert.doesNotMatch(xr, /if \(renderer !== 'webgl'\) \{\s*return;/);
    assert.match(xr, /savedNearClip/);
    assert.match(xr, /savedFarClip/);
    assert.match(xr, /domOverlay\?\.supported/);
    assert.match(xr, /optionalFeatures:\s*\['anchors', 'plane-detection'\]/);
    assert.match(xr, /app\.xr\.on\('error'/);
});

test('walk affordance is shown from resource capability and enabled only when collision is ready', async () => {
    const types = await readFile(new URL('../src/types.ts', import.meta.url), 'utf8');
    const index = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
    const ui = await readFile(new URL('../src/ui.ts', import.meta.url), 'utf8');
    const cameraManager = await readFile(new URL('../src/camera-manager.ts', import.meta.url), 'utf8');

    assert.match(types, /walkCapability:\s*boolean/);
    assert.match(index, /walkCapability:\s*!!\(config\.voxelManifestUrl \|\| config\.voxelUrl \|\| config\.collisionUrl\)/);
    assert.match(ui, /const hasWalkCapability = state\.walkCapability/);
    assert.match(ui, /const walkReady = state\.walkAllowed/);
    assert.match(ui, /fpsCamera\.classList\.toggle\('disabled', hasWalkCapability && !walkReady\)/);
    assert.match(ui, /HTMLButtonElement\)\.disabled = hasWalkCapability && !walkReady/);
    assert.match(cameraManager, /if \(state\.walkAllowed\)/);
});

test('tiled voxel walk readiness waits for the current foot tile, not full neighborhood loading', async () => {
    const tiledSource = await readFile(new URL('../src/collision/tiled-voxel-collision.ts', import.meta.url), 'utf8');
    const viewer = await readFile(new URL('../src/viewer.ts', import.meta.url), 'utf8');

    assert.match(tiledSource, /isCurrentTileLoaded\(\): boolean/);
    assert.match(tiledSource, /this\._loaded\.has\(this\._centerId\)/);
    assert.match(viewer, /collision\.updateForQueryPosition\(-p\.x, p\.z\)/);
    assert.match(viewer, /collision\.isCurrentTileLoaded\(\)/);
    assert.match(viewer, /foot tile/);
    assert.match(viewer, /not the full 3x3 neighborhood/);
});

test('annotation navigator keeps Metaflow overlay avoidance rules', async () => {
    const ui = await readFile(new URL('../src/ui.ts', import.meta.url), 'utf8');

    assert.match(ui, /modal-open/);
    assert.match(ui, /walk-hint-open/);
    assert.match(ui, /events\.on\('uiModal:changed'/);
    assert.match(ui, /events\.on\('walkHint:changed'/);
    assert.match(ui, /annotation navigation sits near the screen edge/);
});

test('voxel coordinate conversion is controlled by resource config, not file version', async () => {
    const source = await readFile(new URL('../src/collision/voxel-collision.ts', import.meta.url), 'utf8');

    assert.doesNotMatch(source, /parseFloat\s*\(\s*metadata\.version/);
    assert.doesNotMatch(source, /options\.flipXY/);
    assert.match(source, /coordinateSpace\?\s*:\s*VoxelCoordinateSpace/);
    assert.match(source, /options\.coordinateSpace\s*===\s*'metaflow-rz180'/);
});

test('single and tiled voxel loaders receive the same coordinate-space option', async () => {
    const indexSource = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
    const tiledSource = await readFile(new URL('../src/collision/tiled-voxel-collision.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /coordinateSpace:\s*config\.voxelCoordinateSpace\s*\?\?\s*'world'/);
    assert.match(indexSource, /loadTiledVoxelCollision\(config\.voxelManifestUrl,\s*voxelOptions\)/);
    assert.match(indexSource, /loadVoxelCollision\(collisionUrl,\s*voxelOptions\)/);
    assert.match(tiledSource, /loadVoxelCollision\(jsonUrl,\s*this\.loadOptions\)/);
});
