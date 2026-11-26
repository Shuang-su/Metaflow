import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { verifyEditorMirrors } from '../../scripts/stage-editor.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const history = () => readJson(new URL('../../metadata/editor-version-history.json', import.meta.url));
const editions = ['supersplat-v3.5.2', 'supersplat-v2.32.5'];

test('generated Editor history preserves earlier releases and defines both 1.4.0 editions', async () => {
    const manifest = await history();
    assert.deepEqual(await readJson(new URL('../../data/editor-version-history.json', import.meta.url)), manifest);
    assert.equal(manifest.current.productName, 'Metaflow Editor');
    assert.equal(manifest.current.displayVersion, '1.4.0');
    assert.equal(manifest.current.appSemver, '1.4.0');
    assert.equal(manifest.current.sourcePath, editions[0]);
    assert.equal(manifest.current.upstream.version, '3.9.2');
    assert.equal(manifest.current.dependencies.playcanvas, '2.24.2');
    assert.equal(manifest.current.dependencies['@playcanvas/splat-transform'], '3.12.0');
    assert.equal(manifest.compatibility.sourcePath, editions[1]);
    assert.equal(manifest.compatibility.upstream.version, '2.32.5');
    assert.equal(manifest.compatibility.runtimeUrl, '/editor-legacy/version.json');
    const entries = new Map(manifest.entries.map(entry => [entry.displayVersion, entry]));
    assert.equal(entries.get('1.0')?.sourcePath, 'supersplat-v2.18.1');
    assert.equal(entries.get('1.1')?.sourcePath, 'supersplat-v2.28.0');
    assert.equal(entries.get('1.1')?.gitRef, 'aa4c35f');
    assert.equal(entries.get('1.2.0')?.gitRef, '83ef04a7c4ffdea5625047f120b7a139aaa2df8c'
    );
    assert.equal(entries.get('1.3.0')?.gitRef, '1074d34f9db25729e9d6abf14d1fb13f084d1b22');
    assert.equal(entries.get('1.3.1')?.gitRef, '3c95767645a506dbe311d3ecce59380c011fe780');
    assert.equal(entries.get('1.3.2')?.gitRef, '7dedcfb65d0a61751b32393f263293ed3e7ef40e');
    assert.equal(entries.get('1.3.2')?.upstream.version, '3.5.2');
    assert.equal(entries.get('1.4.0')?.gitRef, manifest.current.gitRef);
    assert.equal(entries.get('1.4.0')?.status, 'release');
    assert.equal(entries.get('1.4.0')?.trace.releaseTag, 'editor-v1.4.0');
    assert.match(entries.get('1.4.0')?.trace.pullRequest, /^https:\/\/github\.com\/Shuang-su\/Metaflow\/pull\/[1-9][0-9]*$/);
});

test('both Editor mirrors match current source, runtime identity and exact build bytes', async () => {
    const results = await verifyEditorMirrors(root);
    assert.deepEqual(results.map(result => result.edition), ['default', 'compatibility']);
    for (const result of results) {
        assert.equal(result.version, '1.4.0');
        assert.match(result.buildId, /^[a-f0-9]{64}$/);
    }
});

test('Editor ledger preserves old releases and records the new candidate', async () => {
    const ledger = await readFile(new URL('../../docs/metaflow-editor-change-ledger.md', import.meta.url), 'utf8');
    for (const text of ['1.2.0', 'supersplat-v3.5.2', 'supersplat-v2.32.5', 'supersplat-v2.18.1', 'supersplat-v2.28.0', 'legacy ZIP', '100000']) {
        assert.ok(ledger.includes(text), `Ledger missing ${text}`);
    }
});

test('active Editor sources retain branding, 100000 frames and legacy export structure', async () => {
    // Historical sources remain available; they are not the active build inputs.
    await stat(new URL('../../references/supersplat-v2.18.1/src/ui/timeline-panel.ts', import.meta.url));
    await stat(new URL('../../supersplat-v2.28.0/src/metaflow-editor-version.ts', import.meta.url));
    for (const source of editions) {
        const version = await readFile(new URL(`../../${source}/src/metaflow-editor-version.ts`, import.meta.url), 'utf8');
        const timeline = await readFile(new URL(`../../${source}/src/ui/timeline-panel.ts`, import.meta.url), 'utf8');
        const writer = await readFile(new URL(`../../${source}/src/splat-serialize.ts`, import.meta.url), 'utf8');
        assert.match(version, /Metaflow Editor/);
        if (source === editions[0]) {
            assert.match(version, /displayVersion: '1\.4\.0'/);
            assert.match(version, /appSemver: '1\.4\.0'/);
            assert.match(version, /development: false/);
            assert.match(version, /upstreamVersion: '3\.9\.2'/);
        } else {
            assert.match(version, /displayVersion: '1\.4\.0'/);
            assert.match(version, /appSemver: '1\.4\.0'/);
            assert.match(version, /development: false/);
        }
        assert.match(timeline, /max:\s*100000/);
        assert.match(writer, /settings\.json/);
        assert.match(writer, /scene\.compressed\.ply/);
    }
});

test('built editions expose customization strings and retire only the old Editor cache', async () => {
    for (const [destination, upstream] of [['metaflow-editor', '3.9.2'], ['metaflow-editor-legacy', '2.32.5']]) {
        const html = await readFile(new URL(`../../${destination}/index.html`, import.meta.url), 'utf8');
        const bundle = await readFile(new URL(`../../${destination}/index.js`, import.meta.url), 'utf8');
        assert.match(html, /Metaflow Editor/);
        assert.doesNotMatch(html, /serviceWorker\.register\(/);
        for (const text of ['Metaflow Editor', 'SuperSplat Editor', '1.4.0', upstream, 'scene.compressed.ply', 'settings.json', 'legacyZip', 'characterSog', 'streamingScene']) {
            assert.ok(bundle.includes(text), `${destination} missing ${text}`);
        }
        assert.match(bundle, /max:1e5|max:100000/);
    }
    const sw = await readFile(new URL('../../metaflow-editor/sw.js', import.meta.url), 'utf8');
    assert.match(sw, /startsWith\('metaflow-editor-v'\)/);
    assert.match(sw, /registration\.unregister\(\)/);
    assert.doesNotMatch(sw, /caches\.open|\.reload\(|\.navigate\(/);
});
