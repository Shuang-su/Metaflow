import { test } from "node:test";
import assert from "node:assert/strict";
import { CooperativeWork } from "../src/scheduler";
function harness() {
  let now = 0;
  const callbacks: (() => void)[] = [];
  const errors: unknown[] = [];
  const work = new CooperativeWork(
    (e) => errors.push(e),
    () => now,
    (f) => {
      callbacks.push(f);
      return callbacks.length as any;
    },
  );
  return {
    work,
    errors,
    advance: (ms: number) => (now += ms),
    flush: () => {
      while (callbacks.length) callbacks.shift()!();
    },
    tick: () => callbacks.shift()?.(),
  };
}
for (const seconds of [5, 15, 30])
  test(`query survives ${seconds} seconds with candidate progress retained`, () => {
    const h = harness(),
      visited: number[] = [];
    let done = false;
    h.work.replace(
      (function* () {
        for (let i = 0; i < seconds * 100; i++) {
          visited.push(i);
          h.advance(10);
          yield;
        }
        done = true;
      })(),
    );
    h.flush();
    assert.ok(done);
    assert.equal(visited.length, seconds * 100);
    assert.equal(new Set(visited).size, visited.length);
    assert.equal(h.errors.length, 0);
  });
test("more than 100 replacements, pause and cancel cannot revive obsolete work", () => {
  const h = harness(),
    results: number[] = [];
  for (let request = 0; request < 120; request++) {
    h.work.replace(
      (function* () {
        h.advance(20);
        yield;
        results.push(request);
      })(),
    );
    h.tick();
  }
  h.work.setPaused(true);
  h.flush();
  assert.deepEqual(results, []);
  h.work.replace(undefined);
  h.work.setPaused(false);
  h.flush();
  assert.deepEqual(results, []);
  h.work.replace(
    (function* () {
      results.push(120);
    })(),
  );
  h.flush();
  assert.deepEqual(results, [120]);
});
