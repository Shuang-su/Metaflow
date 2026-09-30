import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';
import { metaflowEditorVersion } from '../src/metaflow-editor-version.ts';

test('MF-56 candidate identity does not claim a new product release', () => {
    assert.equal(metaflowEditorVersion.appSemver, '1.1.0');
    assert.equal(metaflowEditorVersion.development, true);
    assert.equal(metaflowEditorVersion.upstreamGitRef, 'e060989b202548848eb440a5005cd41a8b26f7db');
    assert.equal(metaflowEditorVersion.sourcePath, 'supersplat-v2.32.5');
});

test('MF-56 bundle, runtime version and SW use the same content identity', async () => {
    const js = await readFile(new URL('../dist/index.js', import.meta.url));
    const version = JSON.parse(await readFile(new URL('../dist/version.json', import.meta.url)));
    const sw = await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8');
    const id = createHash('sha256').update(js).digest('hex').slice(0, 16);
    assert.equal(version.buildId, id);
    assert.ok(sw.includes(id));
    assert.ok(!sw.includes('__METAFLOW_EDITOR_BUILD_ID__'));
});

const serviceWorker = async overrides => {
    const handlers = {};
    const context = vm.createContext({
        self: { addEventListener: (name, fn) => { handlers[name] = fn; } },
        console: { log() {} },
        ...overrides
    });
    vm.runInContext(await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8'), context);
    return handlers;
};

test('MF-56 install waits for all precached files and all files exist at /editor/', async () => {
    let urls;
    const handlers = await serviceWorker({ caches: { open: async () => ({ addAll: async entries => { urls = [...entries]; } }) } });
    let completion;
    handlers.install({ waitUntil: promise => { completion = promise; } });
    await completion;
    assert.ok(urls.includes('./version.json'));
    for (const name of ['en', 'de', 'es', 'fr', 'ja', 'ko', 'pt-BR', 'ru', 'zh-CN']) assert.ok(urls.includes(`./static/locales/${name}.json`));
    for (const url of urls) await access(new URL(`../dist/${url === './' ? 'index.html' : url}`, import.meta.url));
});

test('MF-56 a failed cache install rejects and activation only removes Editor-owned caches', async () => {
    const deleted = [];
    const handlers = await serviceWorker({ caches: {
        open: async () => ({ addAll: async () => { throw new Error('offline'); } }),
        keys: async () => ['metaflow-editor-old', 'superSplat-v2.28.0', 'viewer-assets', 'unrelated-app'],
        delete: async key => { deleted.push(key); }
    } });
    let install, activate;
    handlers.install({ waitUntil: promise => { install = promise; } });
    await assert.rejects(install, /offline/);
    handlers.activate({ waitUntil: promise => { activate = promise; } });
    await activate;
    assert.deepEqual(deleted.sort(), ['metaflow-editor-old', 'superSplat-v2.28.0']);
});
