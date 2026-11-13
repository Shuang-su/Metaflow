import assert from 'node:assert/strict';
import test from 'node:test';

import { clampEye, getProjection, screenPointNdc, tablePose } from './projection.mjs';

const base = { width: 0.262, height: 0.196, eye: { x: 0, y: 0, z: 0.6 } };
const near = (actual, expected, message = '') => {
    assert.ok(Math.abs(actual - expected) <= 1e-12, `${message}: ${actual} != ${expected}`);
};

// Reconstruct the standard perspective camera matrix used by the renderer.
// The module's screenPointNdc instead intersects a ray with the physical screen.
function cameraNdc(point, { fov, aspect, offset, eye }) {
    const focalY = 1 / Math.tan(fov * Math.PI / 360);
    const viewX = point.x - eye.x;
    const viewY = point.y - eye.y;
    const viewZ = point.z - eye.z;
    return {
        x: (viewX * focalY / aspect + offset.x * viewZ) / -viewZ,
        y: (viewY * focalY + offset.y * viewZ) / -viewZ
    };
}

test('returns physical camera FOV in degrees and signed principal-point offsets', () => {
    const eye = Object.freeze({ x: 0.06, y: -0.04, z: 0.5 });
    const projection = getProjection({ width: 0.3, height: 0.2, eye });
    near(projection.fov, 22.61986494804043, 'vertical FOV');
    near(projection.aspect, 1.5, 'aspect');
    near(projection.offset.x, -0.4, 'horizontal offset');
    near(projection.offset.y, 0.4, 'vertical offset');
    assert.deepEqual(projection.eye, eye);
    assert.notEqual(projection.eye, eye, 'the returned eye must not alias the caller');
});

test('screen corners and centre stay fixed for lateral, vertical and distance changes', () => {
    const eyes = [
        { x: 0, y: 0, z: 0.6 },
        { x: 0.14, y: 0.08, z: 0.42 },
        { x: -0.19, y: 0.21, z: 0.8 },
        { x: 0.05, y: -0.3, z: 0.55 },
        { x: -0.3, y: 0.4, z: 0.2 },
        { x: 0.3, y: -0.4, z: 1.5 }
    ];
    for (const eye of eyes) {
        const options = { ...base, eye };
        const projection = getProjection(options);
        for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
            const point = { x: u * base.width / 2, y: v * base.height / 2, z: 0 };
            for (const result of [screenPointNdc(point, options), cameraNdc(point, projection)]) {
                near(result.x, u, 'screen X');
                near(result.y, v, 'screen Y');
            }
        }
    }
});

test('camera projection agrees with ray intersections at multiple scene depths', () => {
    const options = { ...base, eye: { x: 0.16, y: -0.23, z: 0.7 } };
    const projection = getProjection(options);
    for (const point of [
        { x: 0, y: 0, z: -0.3 },
        { x: -0.08, y: 0.12, z: -0.07 },
        { x: 0.05, y: -0.06, z: 0.09 },
        { x: -0.1, y: 0.09, z: 0.2 }
    ]) {
        const ray = screenPointNdc(point, options);
        const camera = cameraNdc(point, projection);
        near(camera.x, ray.x, 'scene X');
        near(camera.y, ray.y, 'scene Y');
    }
});

test('front and rear objects move in opposite directions as the observer moves', () => {
    const options = { ...base, eye: { x: 0.1, y: 0.08, z: 0.6 } };
    const behind = screenPointNdc({ x: 0, y: 0, z: -0.1 }, options);
    const inFront = screenPointNdc({ x: 0, y: 0, z: 0.1 }, options);
    assert.ok(behind.x > 0 && behind.y > 0, 'rear layer follows the eye displacement');
    assert.ok(inFront.x < 0 && inFront.y < 0, 'front layer moves against the eye displacement');
    const opposite = screenPointNdc({ x: 0, y: 0, z: -0.1 }, {
        ...base, eye: { x: -0.1, y: -0.08, z: 0.6 }
    });
    near(opposite.x, -behind.x);
    near(opposite.y, -behind.y);
});

test('resize recalculates the physical window without changing its centre', () => {
    const eye = { x: 0.08, y: -0.1, z: 0.6 };
    for (const [width, height] of [[0.262, 0.196], [0.196, 0.262], [0.08, 0.04], [0.8, 1]]) {
        const options = { width, height, eye };
        const projection = getProjection(options);
        near(projection.aspect, width / height);
        const corner = cameraNdc({ x: width / 2, y: height / 2, z: 0 }, projection);
        near(corner.x, 1);
        near(corner.y, 1);
        const centre = screenPointNdc({ x: 0, y: 0, z: 0 }, options);
        near(centre.x, 0);
        near(centre.y, 0);
    }
});

test('finite tracking outliers are clamped without changing their input', () => {
    const input = Object.freeze({ x: 4, y: -5, z: -2 });
    assert.deepEqual(clampEye(input), { x: 0.3, y: -0.4, z: 0.2 });
    assert.deepEqual(clampEye({ x: -4, y: 5, z: 8 }), { x: -0.3, y: 0.4, z: 1.5 });
    assert.deepEqual(getProjection({ ...base, eye: input }).eye, { x: 0.3, y: -0.4, z: 0.2 });
    assert.deepEqual(input, { x: 4, y: -5, z: -2 });
});

test('table root stays at the screen bottom for every tilt', () => {
    for (const tiltDegrees of [0, 15, 45, 65, 75, 90]) {
        const pose = tablePose({ height: base.height, tiltDegrees });
        assert.deepEqual(pose.position, { x: 0, y: -base.height / 2, z: 0 });
        near(pose.rotationX + tiltDegrees, 90);
        near(Math.hypot(pose.up.x, pose.up.y, pose.up.z), 1, 'unit up');
    }
    const flat = tablePose({ height: base.height, tiltDegrees: 0 });
    near(flat.up.y, 0);
    near(flat.up.z, 1);
    const upright = tablePose({ height: base.height, tiltDegrees: 90 });
    near(upright.up.y, 1);
    near(upright.up.z, 0);
});

test('rotated feet and shadow points remain in the gravity-aligned tabletop', () => {
    for (const tiltDegrees of [0, 25, 65, 90]) {
        const { rotationX, position, up } = tablePose({ height: base.height, tiltDegrees });
        const theta = rotationX * Math.PI / 180;
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        // Transform two feet and two shadow corners, all at local ground Y = 0.
        for (const local of [{ x: -0.025, z: -0.1 }, { x: 0.025, z: -0.1 },
            { x: -0.06, z: -0.14 }, { x: 0.06, z: -0.06 }]) {
            const world = { x: local.x, y: position.y - s * local.z, z: c * local.z };
            const distance = up.x * (world.x - position.x) +
                up.y * (world.y - position.y) + up.z * (world.z - position.z);
            near(distance, 0, 'foot/shadow distance from tabletop');
        }
        // A unit-length upright model remains aligned with the table's normal.
        near(c, up.y, 'model up Y');
        near(s, up.z, 'model up Z');
    }
});

test('invalid numeric values never produce a camera or a table pose', () => {
    for (const invalid of [NaN, Infinity, -Infinity, '0.2', null, undefined]) {
        assert.throws(() => getProjection({ ...base, width: invalid }), TypeError);
        assert.throws(() => getProjection({ ...base, height: invalid }), TypeError);
        assert.throws(() => tablePose({ height: base.height, tiltDegrees: invalid }), TypeError);
        assert.throws(() => tablePose({ height: invalid, tiltDegrees: 65 }), TypeError);
        for (const axis of ['x', 'y', 'z']) {
            const eye = { ...base.eye, [axis]: invalid };
            assert.throws(() => clampEye(eye), TypeError);
            assert.throws(() => getProjection({ ...base, eye }), TypeError);
            assert.throws(() => screenPointNdc({ x: 0, y: 0, z: 0 }, { ...base, eye }), TypeError);
        }
    }
});

test('invalid dimensions and tilt angles are rejected instead of silently rescaling', () => {
    for (const width of [-1, 0, 0.079, 0.801]) {
        assert.throws(() => getProjection({ ...base, width }), RangeError);
    }
    for (const height of [-1, 0, 0.039, 1.001]) {
        assert.throws(() => getProjection({ ...base, height }), RangeError);
        assert.throws(() => tablePose({ height, tiltDegrees: 65 }), RangeError);
    }
    for (const tiltDegrees of [-0.001, 90.001]) {
        assert.throws(() => tablePose({ height: base.height, tiltDegrees }), RangeError);
    }
});

test('reference projection rejects invalid points and singular or backward rays', () => {
    for (const invalid of [NaN, Infinity, -Infinity, '0', null, undefined]) {
        for (const axis of ['x', 'y', 'z']) {
            assert.throws(() => screenPointNdc({ x: 0, y: 0, z: 0, [axis]: invalid }, base), TypeError);
        }
    }
    for (const z of [base.eye.z, base.eye.z + 0.1]) {
        assert.throws(() => screenPointNdc({ x: 0, y: 0, z }, base), RangeError);
    }
    assert.throws(() => screenPointNdc({ x: Number.MAX_VALUE, y: 0, z: 0.59 }, base), RangeError);
});

test('missing geometry records fail explicitly', () => {
    for (const invalid of [null, undefined, false, 1, 'geometry']) {
        assert.throws(() => getProjection(invalid), TypeError);
        assert.throws(() => tablePose(invalid), TypeError);
        assert.throws(() => clampEye(invalid), TypeError);
        assert.throws(() => screenPointNdc(invalid, base), TypeError);
    }
    assert.throws(() => getProjection({}), TypeError);
    assert.throws(() => tablePose({}), TypeError);
    assert.throws(() => clampEye({}), TypeError);
});
