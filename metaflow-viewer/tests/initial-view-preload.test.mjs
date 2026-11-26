import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/initial-view-preload.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { InitialViewGate, openingWork } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('a coarse resident placement does not satisfy a queued finer switch', () => {
    const inst = {
        filePlacements: [{ resource: {} }, null, null], pending: new Set(), needsLodUpdate: false,
        _fileRequests: new Map([[1, 1.45], [2, .6]]),
        octree: { files: ['coarse', 'selected', 'prefetch'].map(url => ({ url })), assetLoader: {} }
    };
    const world = { _octreeInstances: new Map([[0, inst]]) };
    assert.equal(openingWork(world).pending, 1);
    inst._fileRequests.delete(1);
    assert.equal(openingWork(world).pending, 0);
});

test('a view is revealed only after its new selection is stable across submitted frames', () => {
    const gate = new InitialViewGate();
    const sample = (frame, pending) => gate.sample({ frame, ready: true, pending, started: true });
    assert.equal(sample(3, 0), 'open-detail');
    assert.equal(sample(4, 0), 'wait');
    assert.equal(sample(5, 3), 'wait');
    assert.equal(sample(6, 0), 'wait');
    assert.equal(sample(6, 0), 'wait');
    assert.equal(sample(7, 0), 'reveal');
    assert.equal(sample(8, 0), 'wait');
});
