import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/guard-sog-metadata.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { installSogMetadataGuard } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
const metadata = () => ({ version: 2, count: 1, means: { files: ['a', 'b'] }, quats: { files: ['q'] }, scales: { files: ['s'] }, sh0: { files: ['c'] } });
function fixture(meta, error = null) {
    let wrapper, loads = 0, fetches = 0, alive = true;
    const asset = { id: 1, data: { decompress: true } };
    const original = { canParse: (ctx) => ctx.ext === 'json', load: (_url, cb) => { loads++; cb(null, 'resource'); } };
    const handler = {
        app: { graphicsDevice: {}, assets: { get: () => alive && asset } },
        parsers: [original], addParser: (parser) => wrapper = parser,
        fetch: (_url, _type, cb) => { fetches++; cb(error, meta); }
    };
    installSogMetadataGuard(handler);
    return { handler, asset, get wrapper() { return wrapper; }, get loads() { return loads; }, get fetches() { return fetches; }, destroy() { alive = false; } };
}
test('null JSON, missing textures and fetch errors settle the failed chunk exactly once', () => {
    for (const [meta, error] of [[null, null], [{}, null], [metadata(), '404'], [{ ...metadata(), means: { files: ['a'] } }, null]]) {
        const f = fixture(meta, error); let calls = 0;
        f.wrapper.load('meta.json', (err) => { calls++; assert.match(err, /Invalid SOG metadata/); }, f.asset);
        assert.equal(calls, 1); assert.equal(f.loads, 0);
    }
});
test('valid metadata delegates once, keeps asset options and never intercepts LOD manifests or bundles', () => {
    const f = fixture(metadata());
    f.wrapper.load('meta.json', (err, resource) => { assert.equal(err, null); assert.equal(resource, 'resource'); }, f.asset);
    assert.equal(f.loads, 1); assert.equal(f.fetches, 1); assert.equal(f.asset.data.decompress, true);
    for (const [ext, basename] of [['json', 'lod-meta.json'], ['sog', 'scene.sog'], ['ply', 'scene.ply']]) assert.equal(f.wrapper.canParse({ ext, basename }), false);
    assert.equal(f.wrapper.canParse({ ext: 'json', basename: 'meta.json' }), true);
});
test('embedded legacy metadata is supported and a removed asset cannot start texture loads', () => {
    const f = fixture(null); f.asset.data = { ...metadata(), version: undefined }; f.asset.data.means.shape = [1, 3];
    f.wrapper.load('meta.json', (error) => assert.equal(error, null), f.asset);
    assert.equal(f.fetches, 0); assert.equal(f.loads, 1);
    f.destroy(); f.wrapper.load('meta.json', (error, result) => { assert.equal(error, null); assert.equal(result, null); }, f.asset);
    assert.equal(f.loads, 1);
});
