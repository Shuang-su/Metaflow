import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { metaflowEditorVersion } from '../src/metaflow-editor-version.ts';

test('compatibility edition carries the release identity and the WebGL upstream baseline', async () => {
    const history = JSON.parse(await readFile(new URL('../../metadata/editor-version-history.json', import.meta.url), 'utf8'));
    const legacyRelease = history.entries.find(entry => entry.appSemver === '1.2.0');
    assert.equal(legacyRelease?.gitRef, '83ef04a7c4ffdea5625047f120b7a139aaa2df8c');
    assert.equal(metaflowEditorVersion.appSemver, '1.4.0');
    assert.equal(metaflowEditorVersion.appSemver, history.current.appSemver);
    assert.equal(metaflowEditorVersion.displayVersion, metaflowEditorVersion.appSemver);
    assert.equal(metaflowEditorVersion.edition, 'compatibility');
    assert.equal(metaflowEditorVersion.upstreamVersion, '2.32.5');
    assert.equal(metaflowEditorVersion.upstreamVersion, history.compatibility.upstream.version);
    assert.equal(metaflowEditorVersion.development, false);
});

test('compatibility runtime describes the exact bundle and installs no offline worker', async () => {
    const root = new URL('../dist/', import.meta.url);
    const bundle = await readFile(new URL('index.js', root));
    const runtime = JSON.parse(await readFile(new URL('version.json', root), 'utf8'));
    const html = await readFile(new URL('index.html', root), 'utf8');
    assert.equal(runtime.buildId, createHash('sha256').update(bundle).digest('hex'));
    assert.equal(runtime.appSemver, metaflowEditorVersion.appSemver);
    assert.equal(runtime.edition, 'compatibility');
    assert.equal(runtime.development, metaflowEditorVersion.development);
    assert.equal(runtime.upstream.gitRef, metaflowEditorVersion.upstreamGitRef);
    assert.doesNotMatch(html, /sw\.register|serviceWorker\.register/);
});
