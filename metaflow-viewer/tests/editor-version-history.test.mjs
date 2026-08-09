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
    assert.equal(manifest.current.sourcePath, 'metaflow-editor');
    assert.equal(manifest.current.upstreamSnapshotPath, 'supersplat-v2.28.0');
    assert.equal(manifest.current.upstream.version, '2.28.0');

    const entries = new Map(manifest.entries.map((entry) => [entry.displayVersion, entry]));
    assert.equal(entries.get('1.0')?.sourcePath, 'supersplat-v2.18.1');
    assert.equal(entries.get('1.1')?.sourcePath, 'supersplat-v2.28.0');
});

test('editor runtime metadata is generated inside the ignored Active dist', async () => {
    const generator = await readFile(new URL('../../scripts/generate_editor_version.py', import.meta.url), 'utf8');
    const gitignore = await readFile(new URL('../../metaflow-editor/.gitignore', import.meta.url), 'utf8');

    assert.match(generator, /"metaflow-editor" \/ "dist" \/ "version\.json"/);
    assert.match(generator, /upstreamSnapshotPath/);
    assert.match(gitignore, /^dist$/m);
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
    await stat(new URL('../../supersplat-v2.28.0/LICENSE', import.meta.url));

    const versionSource = await readFile(new URL('../../metaflow-editor/src/metaflow-editor-version.ts', import.meta.url), 'utf8');
    const timelineSource = await readFile(new URL('../../metaflow-editor/src/ui/timeline-panel.ts', import.meta.url), 'utf8');
    const exportSource = await readFile(new URL('../../metaflow-editor/src/splat-serialize.ts', import.meta.url), 'utf8');

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

test('editor runtime baseline records the complete non-map 1.1.0 file set', async () => {
    const baseline = await readJson(new URL('../../metadata/editor-runtime-baseline.json', import.meta.url));

    assert.equal(baseline.editorVersion, '1.1.0');
    assert.equal(baseline.sourcePath, 'metaflow-editor');
    assert.equal(baseline.buildPath, 'metaflow-editor/dist');
    assert.equal(Object.keys(baseline.files).length, 26);
    assert.equal(baseline.files['index.js'], '8bc4743c4f0b3a2cbe8488bf429d806be65f662f63ffc469ce695d1a39b05abf');
    assert.equal(baseline.files['sw.js'], 'a0af903ab42d9ea57d5c8de503a407e27005f9342f0ccb2c25e2c13bba5ae459');
});
