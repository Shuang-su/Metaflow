import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/streaming-progress.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { OpeningBytes, observeOpeningBytes, openingFraction } = await import(
    'data:text/javascript;base64,' + Buffer.from(js).toString('base64')
);

test('the selected high precision cut contributes its full byte size before a request starts', () => {
    const m = new OpeningBytes([
        { url: 'coarse', size: 1e6 },
        { url: 'detail', size: 9e6 },
        { url: 'other', size: 5e6 }
    ]);
    m.select(['coarse', 'detail']);
    m.complete('coarse');
    m.complete('other');
    assert.equal(m.snapshot(0).fraction, 0.1);
    m.progress('detail', 4e6, 9e6);
    m.resource('detail', 'texture', 3e6, 3e6);
    assert.equal(m.snapshot(1000).bytes, 5e6);
    assert.equal(m.snapshot(1000).rate, 3e6);
    m.select(['detail']);
    assert.equal(m.snapshot(1100).total, 10e6);
    m.progress('detail', 9e6, 9e6);
    assert.ok(openingFraction(m.snapshot(1200)) < 1);
    m.complete('detail');
    assert.equal(openingFraction(m.snapshot(1300)), 1);
});
test('retry, cancellation and a cache hit contribute once to useful bytes and separately to network speed', () => {
    const m = new OpeningBytes([
        { url: 'a', size: 1000 },
        { url: 'b', size: 1000 }
    ]);
    m.select(['a', 'b']);
    m.snapshot(0);
    m.progress('a', 650, 1000);
    m.resource('a', 'tex', 650, 650);
    m.start('a');
    m.progress('a', 200, -1);
    assert.equal(m.snapshot(1000).bytes, 200);
    m.select(['b']);
    m.complete('b');
    m.resource('b', 'cached', 1000, 0);
    const s = m.snapshot(1500);
    assert.equal(s.bytes, 1000);
    assert.equal(s.total, 1000);
    assert.equal(s.rate, 650 / 1.5);
});
test('legacy packages estimate an undocumented cut using measured bytes per point', () => {
    const m = new OpeningBytes([
        { url: 'a', points: 10 },
        { url: 'b', points: 90 }
    ]);
    m.select(['a', 'b']);
    m.progress('a', 5, NaN);
    assert.equal(m.snapshot(0).total, 0);
    m.progress('a', 10, 10);
    m.complete('a');
    const s = m.snapshot(500);
    assert.equal(s.estimated, true);
    assert.equal(s.total, 100);
    assert.equal(s.fraction, 0.1);
});
const emitter = (extras) => {
    const events = new Map();
    return {
        ...extras,
        on(n, f) {
            if (!events.has(n)) events.set(n, new Set());
            events.get(n).add(f);
        },
        off(n, f) {
            events.get(n)?.delete(f);
        },
        fire(n, ...args) {
            for (const f of events.get(n) ?? []) f(...args);
        },
        events
    };
};
test('observation scopes wakeups to the active resource and removes all subscriptions', () => {
    const chunk = emitter({ file: { url: '/a.sog' } }),
        other = emitter({ file: { url: '/outside.sog' } });
    const registry = emitter({ list: () => [chunk, other] });
    let wakes = 0;
    const obs = observeOpeningBytes(registry, [{ url: '/a.sog', size: 100 }], 'https://viewer.test/', () => wakes++);
    obs.sample(['/a.sog'], 0);
    other.fire('load');
    assert.equal(wakes, 0);
    chunk.fire('progress', 52, 100);
    assert.equal(obs.sample(['/a.sog'], 500).bytes, 52);
    chunk.fire('load');
    assert.equal(wakes, 1);
    obs.stop();
    obs.stop();
    for (const obj of [chunk, other, registry]) assert.ok([...obj.events.values()].every((s) => !s.size));
});
