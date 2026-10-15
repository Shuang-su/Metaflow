import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Collision } from '../../metaflow-viewer/src/collision';
import { NativeDriver } from '../../mf79-viewer-trial/src/native-motion';
import { observeNativeQueries, type NativeQuery } from '../src/native-query-observer';

function floor(): Collision {
  return {
    voxelResolution: 0.08,
    queryRay(x, y, z, _dx, _dy, _dz, range) {
      const ground = x > 0.4 ? -0.32 : 0;
      return ground <= y && y - ground <= range ? { x, y: ground, z } : null;
    },
    queryCapsule: () => false, querySphere: () => false,
    querySurfaceNormal: () => ({ nx: 0, ny: 1, nz: 0 }), isFreeAt: () => true,
  };
}
test('observation preserves native query returns, receiver and push output; records detached results', () => {
  const c = floor(), observed: NativeQuery[] = [], hit = { x: 1, y: 2, z: 3 }, calls: unknown[] = [];
  c.queryRay = function (...args) { assert.equal(this, c); calls.push(args); return hit; };
  c.queryCapsule = function (...args) { assert.equal(this, c); calls.push(args.slice(0, 5));
    Object.assign(args[5], { x: 0.1, y: -0.2, z: 0.3 }); return true; };
  const wrapped = observeNativeQueries(c, q => observed.push(q)), out = { x: 0, y: 0, z: 0 };
  assert.equal(wrapped.queryRay(1, 2, 3, 0, -1, 0, 1), hit);
  assert.equal(wrapped.queryCapsule(1, 2, 3, 0.55, 0.2, out), true);
  assert.deepEqual(out, { x: 0.1, y: -0.2, z: 0.3 });
  hit.y = 99; out.x = 99;
  assert.equal(observed[0].kind === 'ray' && observed[0].hit?.y, 2);
  assert.equal(observed[1].kind === 'capsule' && observed[1].push?.x, 0.1);
  c.queryCapsule = () => false;
  assert.equal(wrapped.queryCapsule(1, 2, 3, 0.55, 0.2, out), false);
  assert.equal(observed[2].kind === 'capsule' && observed[2].push, null);
  assert.deepEqual(calls, [[1, 2, 3, 0, -1, 0, 1], [1, 2, 3, 0.55, 0.2]]);
});
test('query observation leaves every native frame unchanged across a downward ledge', () => {
  const plain = new NativeDriver(floor(), { x: 0, y: 1.5, z: 0 }), queries: NativeQuery[] = [],
    observed = new NativeDriver(observeNativeQueries(floor(), q => queries.push(q)), { x: 0, y: 1.5, z: 0 });
  let airborne = 0;
  for (let i = 0; i < 180; i++) {
    const expected = plain.step(1, 0), actual = observed.step(1, 0);
    assert.deepEqual(actual, expected); airborne += Number(!actual.grounded);
  }
  assert.ok(airborne > 0);
  assert.ok(queries.some(q => q.kind === 'ray' && q.hit?.y === -0.32));
});
