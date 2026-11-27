import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const text = await readFile(new URL('../src/opening-cut.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { targetCut, installTargetRequests, measuredLink } = await import(
    'data:text/javascript;base64,' + Buffer.from(js).toString('base64')
);
test('calculated cut prioritizes near detail, retains distant coarse cover and restores native scheduling', () => {
    let last;
    const loaded = new Set();
    const tree = {
        parentIndex: [-1, -1, 0, 0],
        childStart: [2, 0, 0, 0],
        childCount: [2, 0, 0, 0],
        nodeLevel: [0, 0, 0, 0],
        nodes: [0, 1, 2, 3].map((fileIndex) => ({ lods: [{ fileIndex }] })),
        files: [],
        pollFileResource: (i) => loaded.has(i),
        submitRequests(o, r) {
            last = [...r.keys()];
        }
    };
    const inst = {
        treeRefined: [1, 0, 0, 0],
        treeStamp: 1,
        nodeInfos: [0, 100, 1, 2].map((worldDistanceSq) => ({ worldDistanceSq })),
        octree: tree
    };
    const native = new Map([
            [0, 2],
            [1, 2]
        ]),
        original = tree.submitRequests;
    assert.deepEqual([...targetCut(inst).keys()], [2, 3, 1]);
    const stop = installTargetRequests(
        tree,
        () => 5e6,
        4e6,
        false,
        (s) => assert.equal(s, 'target')
    );
    tree.submitRequests(inst, native);
    assert.deepEqual(last, [2, 3, 1]);
    [2, 3, 1].forEach((i) => loaded.add(i));
    tree.submitRequests(inst, native);
    assert.deepEqual(last, []);
    assert.equal(inst.needsLodUpdate, true);
    stop();
    assert.equal(tree.submitRequests, original);
    const restore = installTargetRequests(
        tree,
        () => 0,
        0,
        false,
        (s) => assert.equal(s, 'native')
    );
    tree.submitRequests(
        inst,
        new Map([
            [0, 2],
            [1, 2]
        ])
    );
    assert.deepEqual(last, [0, 1]);
    restore();
});
test('measured throughput excludes warm cache and counts overlapping transfers in wall clock time', () => {
    const row = (start, end, size) => ({
        startTime: start,
        responseStart: start,
        responseEnd: end,
        encodedBodySize: size,
        transferSize: size
    });
    assert.equal(
        measuredLink([row(10, 110, 10000), row(60, 210, 10000), { ...row(30, 200, 1e7), transferSize: 0 }], 0),
        100000
    );
});
