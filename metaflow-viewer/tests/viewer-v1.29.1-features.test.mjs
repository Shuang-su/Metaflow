import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readText = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const readJson = async (path) => JSON.parse(await readText(path));

test('captureFrame has a normalized serialized contract and restores all shared camera state', async () => {
    const [capture, viewer, globals] = await Promise.all([
        readText('../src/capture.ts'),
        readText('../src/viewer.ts'),
        readText('../types.d.ts')
    ]);

    assert.match(globals, /captureFrame\?: \(options\?: \{ time\?: number; width\?: number; height\?: number; supersample\?: number \}\)/);
    assert.match(capture, /Number\.isFinite/);
    assert.match(capture, /Math\.min\(8, Math\.max\(1,/);
    assert.match(capture, /const outW = [\s\S]*480/);
    assert.match(capture, /const outH = [\s\S]*outW/);
    assert.match(capture, /try \{[\s\S]*\} finally \{[\s\S]*setCameraTarget\(saved\.renderTarget\)/);
    assert.match(viewer, /let captureQueue: Promise<unknown> = Promise\.resolve\(\)/);
    assert.match(viewer, /captureQueue\.then\(run, run\)/);
    assert.match(viewer, /captureCameraState/);
    assert.match(viewer, /restoreCameraState/);
    assert.match(viewer, /savedAnimationTime/);
    assert.match(viewer, /savedAnimationPaused/);
});

test('annotation visibility is branded, persistent, route-stable, and hides active tooltips', async () => {
    const [index, types, html, ui, annotations] = await Promise.all([
        readText('../src/index.ts'),
        readText('../src/types.ts'),
        readText('../src/index.html'),
        readText('../src/ui.ts'),
        readText('../src/annotations.ts')
    ]);

    assert.match(types, /showAnnotations: boolean/);
    assert.match(index, /localStorage\.getItem\('showAnnotations'\)/);
    assert.match(index, /showAnnotations: storedShowAnnotations !== null \? storedShowAnnotations === 'true' : true/);
    assert.match(html, /id="annotationsRow"[\s\S]*data-i18n="settings\.show-annotations"[\s\S]*id="annotationsCheck"/);
    assert.match(ui, /annotationsRow[\s\S]*annotationsOption[\s\S]*annotationsCheck/);
    assert.match(ui, /global\.settings\.annotations\.length === 0/);
    assert.match(ui, /localStorage\.setItem\('showAnnotations', String\(value\)\)/);
    assert.match(ui, /!state\.showAnnotations[\s\S]*annotationNav\.classList\.add\('hidden'\)/);
    assert.match(annotations, /!state\.showAnnotations \|\| state\.controlsHidden/);
    assert.match(annotations, /Annotation\.activeAnnotation\.hideTooltip\(\)/);

    for (const locale of ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt-BR', 'ru', 'zh-CN']) {
        const data = await readJson(`../src/locales/${locale}.json`);
        assert.equal(typeof data['settings.show-annotations'], 'string', `${locale} annotation label`);
    }
});

test('5.19.0 clears inferred controls once and only persists subsequent state changes', async () => {
    const [index, ui] = await Promise.all([
        readText('../src/index.ts'),
        readText('../src/ui.ts')
    ]);

    assert.match(index, /preferenceMigrationKey = 'metaflowViewerPreferenceMigration'/);
    assert.match(index, /preferenceMigrationVersion = '5\.19\.0'/);
    assert.match(
        index,
        /getItem\(preferenceMigrationKey\) !== preferenceMigrationVersion[\s\S]*removeItem\('performanceMode'\)[\s\S]*removeItem\('gamingControls'\)[\s\S]*removeItem\('retinaDisplay'\)[\s\S]*setItem\(preferenceMigrationKey, preferenceMigrationVersion\)/
    );
    assert.match(index, /performanceMode: storedPerformanceMode !== null \? storedPerformanceMode === 'true' : platform\.mobile/);
    assert.match(index, /gamingControls: localStorage\.getItem\('gamingControls'\) === 'true'/);
    assert.match(ui, /events\.on\('performanceMode:changed', \(value: boolean\) => \{\s*localStorage\.setItem\('performanceMode', String\(value\)\)/);
    assert.match(ui, /events\.on\('gamingControls:changed', \(value: boolean\) => \{\s*localStorage\.setItem\('gamingControls', String\(value\)\)/);

    const performanceUi = ui.slice(ui.indexOf('const updatePerformanceMode'), ui.indexOf('// Gaming mode toggle'));
    const gamingUi = ui.slice(ui.indexOf('const updateGamingControls'), ui.indexOf('// Annotation visibility toggle'));
    assert.doesNotMatch(performanceUi.match(/const updatePerformanceMode = \(\) => \{[\s\S]*?\n    \};/)?.[0] ?? '', /localStorage\.setItem/);
    assert.doesNotMatch(gamingUi.match(/const updateGamingControls = \(\) => \{[\s\S]*?\n    \};/)?.[0] ?? '', /localStorage\.setItem/);
    assert.match(index, /storedShowAnnotations/);
    assert.doesNotMatch(index, /removeItem\('showAnnotations'\)/);
});

test('configured locale selection preserves URL defaults and browser fallback', async () => {
    const [html, index, localization, types, globals] = await Promise.all([
        readText('../src/index.html'),
        readText('../src/index.ts'),
        readText('../src/localization.ts'),
        readText('../src/types.ts'),
        readText('../types.d.ts')
    ]);

    assert.match(types, /lang\?: string; \/\/ override the UI language/);
    assert.match(globals, /config: Record<string, unknown> & \{ lang\?: string \}/);
    assert.match(html, /lang: url\.searchParams\.get\('lang'\) \|\| undefined/);
    assert.match(index, /initLocalization\(config\.lang\)/);
    assert.match(localization, /const detectLocale = \(lang\?: string\)/);
    assert.match(localization, /const candidates = \[lang, \.\.\.\(navigator\.languages \?\? \[navigator\.language\]\)\]/);
    assert.match(localization, /const initLocalization = \(lang\?: string\)/);
    assert.doesNotMatch(localization, /location\.search/);
    assert.match(localization, /return 'en'/);
});

test('heatmap keeps one URL flag and degrades explicitly on WebGL', async () => {
    const [html, viewer, types] = await Promise.all([
        readText('../src/index.html'),
        readText('../src/viewer.ts'),
        readText('../src/types.ts')
    ]);

    assert.equal((html.match(/searchParams\.has\('heatmap'\)/g) || []).length, 1);
    assert.match(types, /heatmap: boolean/);
    assert.match(viewer, /config\.heatmap && renderer === 'webgl'/);
    assert.match(viewer, /Heatmap[\s\S]*WebGPU/);
    assert.match(viewer, /overlay\.mode = config\.heatmap \? 'heatmap' : 'overlay'/);
});

test('XR detection is backend-aware while retaining Metaflow navigation and reload UX', async () => {
    const [xr, ui] = await Promise.all([
        readText('../src/xr.ts'),
        readText('../src/ui.ts')
    ]);

    assert.match(xr, /XrManager\.isDeviceSupported\(DEVICETYPE_WEBGL2, 'immersive-ar'\)/);
    assert.match(xr, /app\.xr\.on\('available', updateAvailable\)/);
    assert.match(xr, /parent\.script\.create\(XrVrNavigation\)/);
    assert.match(xr, /XR_NEAR_CLIP/);
    assert.match(xr, /optionalFeatures: \['anchors', 'plane-detection'\]/);
    assert.doesNotMatch(xr, /if \(renderer !== 'webgl'\) \{\s*return;/);
    assert.match(ui, /global\.app\.xr\.isAvailable\(type === 'AR' \? 'immersive-ar' : 'immersive-vr'\)/);
    assert.match(ui, /location\.replace\(reloadUrl\.toString\(\)\)/);
    assert.match(ui, /global\.analytics\.track\('xr_requested'/);
});

test('model and environment prefetches retry only transient failures and expose a terminal model error', async () => {
    const [html, index, types, ui, viewer] = await Promise.all([
        readText('../src/index.html'),
        readText('../src/index.ts'),
        readText('../src/types.ts'),
        readText('../src/ui.ts'),
        readText('../src/viewer.ts')
    ]);

    assert.match(html, /retryableResponseStatuses = new Set\(\[408, 425, 429\]\)/);
    assert.match(html, /response\.status >= 500/);
    assert.match(html, /const maxAttempts = 3/);
    assert.match(html, /waitForRetry\(500 \* 2 \*\* \(attempt - 1\)\)/);
    assert.match(html, /environmentContents: environmentUrl \? fetchWithRetry\(environmentUrl\) : null/);
    assert.match(html, /contents: fetchWithRetry\(contentUrl\)/);
    assert.doesNotMatch(html, /retryableResponseStatuses[^;]*404/);

    assert.match(types, /\| 'error'/);
    assert.match(index, /state\.progress = 100;[\s\S]*state\.loadingStage = 'error'/);
    assert.match(index, /请检查网络后刷新页面重试/);
    assert.match(index, /app\.autoRender = false;[\s\S]*app\.renderNextFrame = false;/);
    assert.match(ui, /error: '加载失败'/);
    assert.match(ui, /loadingBar\.classList\.toggle\('failed', stage === 'error'\)/);
    assert.match(viewer, /const viewerReady = Promise\.all/);
    assert.match(viewer, /viewerReady\.catch[\s\S]*Initialization stopped after resource load failure/);
});
