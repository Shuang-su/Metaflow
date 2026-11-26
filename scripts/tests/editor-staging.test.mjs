import { exportViewerFingerprint } from '../prepare-export-viewer.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { editorSourceDigest, editorRuntime, stageEditors, verifyEditorMirrors } from '../stage-editor.mjs';
import { stageEditorSite } from '../stage-editor-site.mjs';
const hash = text => createHash('sha256').update(text).digest('hex');
const save = async (root, file, value) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
};
async function fixture(context) {
    const root = await mkdtemp(path.join(tmpdir(), 'editor-stage-contract-'));
    context.after(() => rm(root, { recursive: true, force: true }));
    const current = { productName: 'Metaflow Editor', displayVersion: '1.2.0', appSemver: '1.2.0',
        date: '2026-10-21', gitRef: 'abcdef1', historyUrl: '/data/editor-version-history.json',
        runtimeUrl: '/editor/version.json', sourcePath: 'default', upstream: { gitRef: '1234567' }, dependencies: {} };
    const history = { current, compatibility: { sourcePath: 'compatibility', runtimeUrl: '/editor-legacy/version.json' },
        entries: [{ type: 'upstream-sync', scope: 'editor', summary: 'fixture', changes: [] }] };
    await save(root, 'metadata/editor-version-history.json', history);
    await save(root, 'data/editor-version-history.json', history);
    await save(root, 'scripts/stage-editor.mjs', 'fixture build script');
    await save(root, 'metaflow-viewer/src/gsplat-reveal-radial.ts', 'fixture shared source');
    await save(root, 'editor-shared/background-picker.ts', 'fixture picker');
    await save(root, 'metadata/version-history.json', { current: { appSemver: '5.23.0' } });
    await save(root, 'netlify.toml', 'fixture public build configuration');
    for (const file of ['package.json', 'package-lock.json', 'rollup.config.mjs', 'site-html.mjs', 'tsconfig.json', 'types.d.ts'])
        await save(root, `metaflow-viewer/${file}`, 'fixture');
    await save(root, 'metaflow-viewer/dist/index.js', 'standalone viewer fixture');
    await save(root, 'metadata/editor-export-viewer.json', { source: await exportViewerFingerprint(root), bundle: hash('standalone viewer fixture') });
    for (const [edition, destination] of [['default', 'metaflow-editor'], ['compatibility', 'metaflow-editor-legacy']]) {
        for (const file of ['package.json', 'package-lock.json', '.nvmrc', 'rollup.config.mjs', 'copy-and-watch.mjs', 'tsconfig.json', 'global.d.ts', 'src/index.ts', 'static/icon.svg']) {
            await save(root, `${edition}/${file}`, 'fixture');
        }
        const item = { ...current, ...(edition === 'compatibility' ? history.compatibility : {}) };
        const bundle = `${edition} release bundle`;
        const sourceDigest = await editorSourceDigest(root, edition);
        const runtime = { ...editorRuntime(history, item, edition, hash(bundle)), sourceDigest };
        await save(root, `${edition}/dist/index.js`, bundle);
        await save(root, `${edition}/dist/version.json`, runtime);
        await cp(path.join(root, edition, 'dist'), path.join(root, destination), { recursive: true });
        await save(root, `${destination}/version.json`, editorRuntime(history, item, edition, hash(bundle)));
        await save(root, `${destination}/build-manifest.json`, { schemaVersion: 1, sourcePath: edition, sourceDigest,
            files: { 'index.js': hash(bundle), 'version.json': hash(await readFile(path.join(root, destination, 'version.json'))) } });
    }
    return root;
}
test('Editor staging accepts matching editions and rejects debug builds', async context => {
    const root = await fixture(context);
    assert.equal((await stageEditors(root)).length, 2);
    const file = 'compatibility/dist/version.json';
    const runtime = JSON.parse(await readFile(path.join(root, file)));
    runtime.buildType = 'debug';
    await save(root, file, runtime);
    await assert.rejects(stageEditors(root), /compatibility: build/);
});
test('Editor source changes invalidate already built mirrors', async context => {
    const root = await fixture(context);
    await save(root, 'default/src/index.ts', 'changed after build');
    await assert.rejects(verifyEditorMirrors(root), /stale Editor build/);
    await assert.rejects(stageEditors(root), /default: build/);
});
test('tampered mirrors and differing fresh dist are rejected independently', async context => {
    const root = await fixture(context);
    assert.equal((await verifyEditorMirrors(root)).length, 2);
    await save(root, 'default/dist/index.js', 'different fresh bundle');
    await assert.rejects(verifyEditorMirrors(root), /fresh dist differs/);
    await save(root, 'default/dist/index.js', 'default release bundle');
    await save(root, 'metaflow-editor/index.js', 'tampered published bytes');
    await assert.rejects(verifyEditorMirrors(root), /staged file hashes differ/);
});
test('complete Editor candidate preserves all non-Editor bytes and does not write through baseline links', async context => {
    const root = await fixture(context);
    const baseline = path.join(root, 'production');
    const files = { 'index.html': 'viewer', 'director/index.js': 'director', 'data/model.sog': 'model',
        'editor/index.js': 'old editor', 'data/editor-version-history.json': 'old history' };
    for (const [file, content] of Object.entries(files)) await save(baseline, file, content);
    await save(baseline, '.DS_Store', 'local Finder metadata');
    await save(root, 'production-manifest.json', { commit: 'abcdef1', files: Object.entries(files).map(([file, content]) => ({ path: file, bytes: Buffer.byteLength(content), sha256: hash(content) })) });
    const args = { baseline, manifest: path.join(root, 'production-manifest.json'), destination: path.join(root, 'candidate'), baselineDeploy: '123456789012345678901234', repository: root };
    const result = await stageEditorSite(args);
    assert.equal(result.preserved, 3);
    assert.equal(await readFile(path.join(args.destination, 'director/index.js'), 'utf8'), 'director');
    await save(args.destination, 'editor/index.js', 'independent candidate edit');
    assert.equal(await readFile(path.join(baseline, 'editor/index.js'), 'utf8'), 'old editor');
    await assert.rejects(stageEditorSite(args), /already exists/);
});

test('shared picker and standalone runtime changes invalidate Editor artifacts', async context => {
    const root = await fixture(context);
    await save(root, 'editor-shared/background-picker.ts', 'changed picker');
    await assert.rejects(verifyEditorMirrors(root), /stale Editor build/);
    await save(root, 'metaflow-viewer/dist/index.js', 'outdated standalone viewer');
    await assert.rejects(verifyEditorMirrors(root), /Standalone export Viewer is stale/);
});
