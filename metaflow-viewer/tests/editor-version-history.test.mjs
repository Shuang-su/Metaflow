import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

test('generated editor version history mirrors metadata source', async () => {
    const manifest = await readJson(new URL('../../metadata/editor-version-history.json', import.meta.url));
    const generated = await readJson(new URL('../../data/editor-version-history.json', import.meta.url));

    assert.deepEqual(generated, manifest);
    assert.equal(manifest.current.productName, 'Metaflow Editor');
    assert.equal(manifest.current.displayVersion, '1.1');
    assert.equal(manifest.current.appSemver, '1.1.0');
    assert.equal(manifest.current.sourcePath, 'supersplat-v2.28.0');
    assert.equal(manifest.current.upstream.version, '2.28.0');

    const entries = new Map(manifest.entries.map((entry) => [entry.displayVersion, entry]));
    assert.equal(entries.get('1.0')?.sourcePath, 'supersplat-v2.18.1');
    assert.equal(entries.get('1.1')?.sourcePath, 'supersplat-v2.28.0');
});

test('editor runtime version json exposes the current release', async () => {
    const manifest = await readJson(new URL('../../metadata/editor-version-history.json', import.meta.url));
    const runtime = await readJson(new URL('../../metaflow-editor/version.json', import.meta.url));

    assert.equal(runtime.productName, manifest.current.productName);
    assert.equal(runtime.displayVersion, manifest.current.displayVersion);
    assert.equal(runtime.appSemver, manifest.current.appSemver);
    assert.deepEqual(runtime.upstream, manifest.current.upstream);
    assert.deepEqual(runtime.dependencies, manifest.current.dependencies);
    assert.equal(runtime.historyUrl, manifest.current.historyUrl);
    assert.equal(runtime.generatedFrom, 'metadata/editor-version-history.json');
});

test('editor ledger documents the structured editor release', async () => {
    const manifest = await readJson(new URL('../../metadata/editor-version-history.json', import.meta.url));
    const ledger = await readFile(new URL('../../docs/metaflow-editor-change-ledger.md', import.meta.url), 'utf8');

    assert.match(ledger, new RegExp(`\\\`${manifest.current.displayVersion}\\\``));
    assert.match(ledger, new RegExp(`\\\`v${manifest.current.upstream.version.replaceAll('.', '\\.')}\\\``));
    assert.match(ledger, /supersplat-v2\.18\.1/);
    assert.match(ledger, /supersplat-v2\.28\.0/);
    assert.match(ledger, /legacy ZIP/);
    assert.match(ledger, /100000/);
});

test('editor source keeps Metaflow version, frame cap, and export compatibility wiring', async () => {
    await stat(new URL('../../supersplat-v2.18.1/src/ui/timeline-panel.ts', import.meta.url));
    await stat(new URL('../../supersplat-v2.28.0/src/metaflow-editor-version.ts', import.meta.url));

    const versionSource = await readFile(new URL('../../supersplat-v2.28.0/src/metaflow-editor-version.ts', import.meta.url), 'utf8');
    const timelineSource = await readFile(new URL('../../supersplat-v2.28.0/src/ui/timeline-panel.ts', import.meta.url), 'utf8');
    const exportSource = await readFile(new URL('../../supersplat-v2.28.0/src/splat-serialize.ts', import.meta.url), 'utf8');

    assert.match(versionSource, /Metaflow Editor/);
    assert.match(versionSource, /displayVersion: '1\.1'/);
    assert.match(versionSource, /appSemver: '1\.1\.0'/);
    assert.match(versionSource, /upstreamVersion: '2\.28\.0'/);
    assert.match(versionSource, /metaflow-editor-v/);
    assert.match(timelineSource, /max:\s*100000/);
    assert.match(exportSource, /legacyZip/);
    assert.match(exportSource, /settingsJson/);
    assert.match(exportSource, /settings\.json/);
    assert.match(exportSource, /scene\.compressed\.ply/);
});

test('built editor exposes Metaflow version, cache name, frame cap, and legacy export strings', async () => {
    const indexHtml = await readFile(new URL('../../metaflow-editor/index.html', import.meta.url), 'utf8');
    const indexJs = await readFile(new URL('../../metaflow-editor/index.js', import.meta.url), 'utf8');
    const sw = await readFile(new URL('../../metaflow-editor/sw.js', import.meta.url), 'utf8');

    assert.match(indexHtml, /Metaflow Editor/);
    assert.ok(indexJs.includes('Metaflow Editor'), 'built editor bundle should contain the Metaflow product name');
    assert.ok(indexJs.includes('SuperSplat Editor'), 'built editor bundle should contain the upstream product name');
    assert.ok(indexJs.includes('1.1.0'), 'built editor bundle should contain the Metaflow semver');
    assert.ok(indexJs.includes('2.28.0'), 'built editor bundle should contain the upstream editor version');
    assert.ok(indexJs.includes('scene.compressed.ply'), 'built editor bundle should contain legacy zip model filename');
    assert.ok(indexJs.includes('settings.json'), 'built editor bundle should contain settings export filename');
    assert.ok(indexJs.includes('legacyZip'), 'built editor bundle should contain legacy zip export type');
    assert.match(indexJs, /max:1e5|max:100000/);
    assert.ok(sw.includes('metaflow-editor-v'), 'service worker should use the Metaflow editor cache prefix');
    assert.ok(sw.includes("appSemver: '1.1.0'"), 'service worker should include the Metaflow editor semver');
    assert.ok(sw.includes("upstreamVersion: '2.28.0'"), 'service worker should include the upstream editor version');
    assert.match(sw, /version\.json/);
});
