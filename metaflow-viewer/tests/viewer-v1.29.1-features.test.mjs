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
