import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/streaming-progress.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022
} });
const { InitialLodProgress, observeInitialLodProgress } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('in-flight byte progress advances before any chunk completes without an early denominator spike', () => {
    const p = new InitialLodProgress(); p.start('a'); p.start('b');
    p.received('a', 500, 1000); assert.equal(p.percentage(), 0);
    p.frame(14); assert.equal(p.percentage(), 3);
    p.received('a', 750, 1000); assert.equal(p.percentage(), 5);
    p.received('b', 500, 1000); assert.equal(p.percentage(), 8);
    p.complete('a'); p.frame(13); assert.equal(p.percentage(), 10);
    p.complete('b'); p.frame(12); assert.equal(p.percentage(), 14);
});

test('unknown totals and invalid readings do not invent progress; bytes alone do not reach 100', () => {
    const p = new InitialLodProgress(); p.start('a'); p.frame(1);
    for (const total of [0, NaN, Infinity, -10]) { p.received('a', 500, total); assert.equal(p.percentage(), 0); }
    p.received('a', 1000, 1000); assert.equal(p.percentage(), 99);
    p.complete('a'); p.frame(0); assert.equal(p.percentage(), 99);
});

test('retries, dynamic scheduling and cancellation never count a failed request as complete', () => {
    const p = new InitialLodProgress(); p.start('a'); p.frame(2); p.received('a', 500, 1000);
    assert.equal(p.percentage(), 25);
    p.start('a'); p.received('a', 100, 1000); p.frame(3); assert.equal(p.percentage(), 25);
    p.remove('a'); p.frame(0); assert.equal(p.percentage(), 25);
    p.start('b'); p.complete('b'); p.complete('b'); p.frame(2);
    assert.equal(p.percentage(), 33); // One completion, never two.
});

const emitter = (extras = {}) => {
    const listeners = new Map();
    return { ...extras, listeners,
        on(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
        off(name, fn) { listeners.get(name)?.delete(fn); },
        fire(name, ...args) { for (const fn of [...listeners.get(name) ?? []]) fn(...args); }
    };
};
test('observation is scoped to the octree, works without UI, and releases every listener on repeated stop', () => {
    const a = emitter({ file: { url: '/scene/0/meta.json' }, loaded: false });
    const other = emitter({ file: { url: '/other/0/meta.json' }, loaded: false });
    const registry = emitter({ list: () => [a, other] }), values = [];
    const p = observeInitialLodProgress(registry, ['/scene/0/meta.json'], 'https://viewer.test/', n => values.push(n));
    p.frame(2); a.fire('progress', 200, 1000); a.fire('progress', 400, 1000);
    assert.deepEqual(values, [0, 10, 20]);
    other.fire('load'); assert.equal(values.at(-1), 20);
    registry.fire('load:start', a); a.fire('progress', 100, 1000); assert.equal(values.at(-1), 20);
    a.fire('load'); p.frame(1); assert.equal(values.at(-1), 50);
    registry.fire('remove', a); const before = values.length; a.fire('progress', 1000, 1000);
    assert.equal(values.length, before);
    p.stop(); p.stop(); p.frame(0); assert.equal(values.length, before);
    for (const object of [a, other, registry]) assert.ok([...object.listeners.values()].every(set => set.size === 0));
});
