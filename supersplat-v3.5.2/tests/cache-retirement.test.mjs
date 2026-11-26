import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('Editor retirement removes only its caches and never reloads open clients', async () => {
    const listeners = {}, waits = [], removed = [];
    let unregister = 0, skipped = 0;
    const self = {
        addEventListener(name, fn) { listeners[name] = fn; },
        skipWaiting() { skipped++; return Promise.resolve(); },
        registration: { async unregister() { unregister++; } },
        clients: { matchAll() { throw new Error('Open client navigation is forbidden'); } }
    };
    vm.runInNewContext(await readFile(new URL('../static/sw.js', import.meta.url), 'utf8'), {
        self, caches: { async keys() { return ['metaflow-editor-v1.1.0-ss2.28.0', 'studio-local-assets', 'viewer-cache']; },
            async delete(name) { removed.push(name); } }
    });
    for (const name of ['install', 'activate']) listeners[name]({ waitUntil(p) { waits.push(p); } });
    await Promise.all(waits);
    assert.deepEqual(removed, ['metaflow-editor-v1.1.0-ss2.28.0']);
    assert.equal(unregister, 1);
    assert.equal(skipped, 1);
    assert.equal(listeners.fetch, undefined);
});
