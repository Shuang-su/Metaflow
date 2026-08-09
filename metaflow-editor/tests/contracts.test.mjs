import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const readText = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const readJson = async (path) => JSON.parse(await readText(path));

test('Active package identity is Metaflow Editor 1.1.0', async () => {
    const packageJson = await readJson('../package.json');

    assert.equal(packageJson.name, 'metaflow-editor');
    assert.equal(packageJson.version, '1.1.0');
    assert.equal(packageJson.private, true);
    assert.equal(packageJson.license, 'MIT');
    assert.equal(packageJson.devDependencies['@playcanvas/supersplat-viewer'], '1.26.3');
});

test('branding, upstream identity, and service-worker cache contract remain stable', async () => {
    const version = await readText('../src/metaflow-editor-version.ts');
    const index = await readText('../src/index.html');
    const manifest = await readJson('../src/manifest.json');
    const serviceWorker = await readText('../src/sw.ts');

    assert.match(version, /productName: 'Metaflow Editor'/);
    assert.match(version, /displayVersion: '1\.1'/);
    assert.match(version, /appSemver: '1\.1\.0'/);
    assert.match(version, /upstreamVersion: '2\.28\.0'/);
    assert.match(version, /upstreamTag: 'v2\.28\.0'/);
    assert.match(version, /metaflow-editor-v/);
    assert.match(index, /<title>Metaflow Editor<\/title>/);
    assert.equal(manifest.name, 'Metaflow Editor');
    assert.match(serviceWorker, /serviceWorkerCacheName/);
    assert.match(serviceWorker, /version\.json/);
});

test('legacy, settings, HTML, and SOG package contracts remain wired', async () => {
    const fileHandler = await readText('../src/file-handler.ts');
    const serializer = await readText('../src/splat-serialize.ts');
    const exportPopup = await readText('../src/ui/export-popup.ts');

    assert.match(fileHandler, /legacyPackageViewer/);
    assert.match(fileHandler, /viewerSettings/);
    assert.match(serializer, /type: 'html' \| 'zip' \| 'legacyZip' \| 'settingsJson'/);
    assert.match(serializer, /@playcanvas\/supersplat-viewer/);
    assert.match(serializer, /scene\.compressed\.ply/);
    assert.match(serializer, /settings\.json/);
    assert.match(serializer, /viewerSettingsJson/);
    assert.match(exportPopup, /Metaflow legacy ZIP/);
    assert.match(exportPopup, /settings\.json/);
});

test('timeline and locale contracts remain stable', async () => {
    const timeline = await readText('../src/ui/timeline-panel.ts');
    const locales = (await readdir(new URL('../static/locales/', import.meta.url))).sort();

    assert.match(timeline, /max:\s*100000/);
    assert.deepEqual(locales, [
        'de.json',
        'en.json',
        'es.json',
        'fr.json',
        'ja.json',
        'ko.json',
        'pt-BR.json',
        'ru.json',
        'zh-CN.json'
    ]);
});
