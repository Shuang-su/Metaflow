import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { rollup } from 'rollup';

const packageRoot = resolve(new URL('..', import.meta.url).pathname);
const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));

test('package exports import without creating global or DOM state', async () => {
    const globalKeysBefore = Reflect.ownKeys(globalThis);
    const hadWindow = Object.hasOwn(globalThis, 'window');
    const hadDocument = Object.hasOwn(globalThis, 'document');

    const root = await import(new URL(`../dist/index.js?purity=${Date.now()}`, import.meta.url));
    const settings = await import(new URL(`../dist/settings.js?purity=${Date.now()}`, import.meta.url));

    assert.equal(typeof root.html, 'string');
    assert.equal(typeof root.css, 'string');
    assert.equal(typeof root.js, 'string');
    assert.equal(typeof settings.importSettings, 'function');
    assert.equal(typeof settings.validateSettings, 'function');
    assert.deepEqual(Reflect.ownKeys(globalThis), globalKeysBefore);
    assert.equal(Object.hasOwn(globalThis, 'window'), hadWindow);
    assert.equal(Object.hasOwn(globalThis, 'document'), hadDocument);
});

const bundleConsumer = async (source) => {
    const fixture = await mkdtemp(join(tmpdir(), 'metaflow-viewer-rollup-'));
    const entry = join(fixture, 'entry.mjs');
    await writeFile(entry, source);

    const bundle = await rollup({
        input: entry,
        treeshake: true,
        plugins: [
            {
                name: 'resolve-metaflow-viewer-fixture',
                resolveId(sourceId) {
                    if (sourceId === 'metaflow-viewer') {
                        return {
                            id: join(packageRoot, packageJson.exports['.'].import),
                            moduleSideEffects: packageJson.sideEffects !== false
                        };
                    }
                    if (sourceId === 'metaflow-viewer/settings') {
                        return {
                            id: join(packageRoot, packageJson.exports['./settings'].import),
                            moduleSideEffects: packageJson.sideEffects !== false
                        };
                    }
                    return null;
                }
            }
        ]
    });
    const generated = await bundle.generate({ format: 'esm' });
    await bundle.close();
    return generated.output[0].code;
};

test('Rollup retains used root and settings exports but removes a bare import', async () => {
    assert.equal(packageJson.sideEffects, false);

    const rootNamed = await bundleConsumer(
        "import { html } from 'metaflow-viewer'; export const rootLength = html.length;"
    );
    assert.match(rootNamed, /rootLength/);
    assert.match(rootNamed, /川流Metaflow/);

    const settingsNamed = await bundleConsumer(
        "import { validateSettings } from 'metaflow-viewer/settings'; export const validate = validateSettings;"
    );
    assert.match(settingsNamed, /validateSettings/);
    assert.match(settingsNamed, /must be an object/);

    const bare = await bundleConsumer("import 'metaflow-viewer'; export const marker = 'bare-consumer';");
    assert.match(bare, /bare-consumer/);
    assert.doesNotMatch(bare, /川流Metaflow/);
    assert.ok(Buffer.byteLength(bare) < 500, `bare import bundle should remain small, received ${bare.length} bytes`);
});
