/**
 * Geometry for a physical screen window, independent of the rendering engine.
 * Positions and screen dimensions are in metres. Angles returned here are degrees.
 * Screen axes: +X right, +Y up, +Z toward the observer; the screen is at Z = 0.
 */

const WIDTH_RANGE = [0.08, 0.8];
const HEIGHT_RANGE = [0.04, 1];
const EYE_RANGES = {
    x: [-0.3, 0.3],
    y: [-0.4, 0.4],
    z: [0.2, 1.5]
};

function finiteNumber(value, name) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number`);
    }
    return value;
}

function inRange(value, name, [min, max]) {
    finiteNumber(value, name);
    if (value < min || value > max) {
        throw new RangeError(`${name} must be between ${min} and ${max}`);
    }
    return value;
}

function objectValue(value, name) {
    if (value === null || typeof value !== 'object') {
        throw new TypeError(`${name} must be an object`);
    }
    return value;
}

function dimensions(options) {
    objectValue(options, 'options');
    return {
        width: inRange(options.width, 'width', WIDTH_RANGE),
        height: inRange(options.height, 'height', HEIGHT_RANGE)
    };
}

/** Limit finite tracking estimates to the experiment's calibrated viewing range. */
export function clampEye(eye) {
    objectValue(eye, 'eye');
    const result = {};
    for (const axis of ['x', 'y', 'z']) {
        const value = finiteNumber(eye[axis], `eye.${axis}`);
        const [min, max] = EYE_RANGES[axis];
        result[axis] = Math.max(min, Math.min(max, value));
    }
    return result;
}

/**
 * Parameters for a camera at `eye`, looking parallel to the screen along -Z.
 * Set horizontalFov=false, use a manual aspect ratio, and assign offset through
 * the camera's projectionOffset setter. Looking at the screen centre would break
 * the physical-window projection.
 */
export function getProjection(options) {
    const { width, height } = dimensions(options);
    const eye = clampEye(options.eye);
    return {
        fov: 2 * Math.atan(height / (2 * eye.z)) * 180 / Math.PI,
        aspect: width / height,
        offset: {
            x: -2 * eye.x / width,
            y: -2 * eye.y / height
        },
        eye
    };
}

/**
 * A tabletop rooted at the screen's lower edge. Its local +Y is real-world up
 * and local -Z extends behind the screen. Attach the model feet and contact
 * shadow to this same root so tilting the screen does not separate them.
 */
export function tablePose(options) {
    objectValue(options, 'options');
    const height = inRange(options.height, 'height', HEIGHT_RANGE);
    const tiltDegrees = inRange(options.tiltDegrees, 'tiltDegrees', [0, 90]);
    const radians = tiltDegrees * Math.PI / 180;
    return {
        rotationX: 90 - tiltDegrees,
        position: { x: 0, y: -height / 2, z: 0 },
        up: { x: 0, y: Math.sin(radians), z: Math.cos(radians) }
    };
}

/**
 * Independent reference projection: intersect the eye-to-point ray with the
 * physical screen, then convert metres to NDC. This deliberately does not use
 * the FOV/offset returned by getProjection, so it can verify a renderer matrix.
 * Points at or behind the eye plane have no forward view through this screen.
 */
export function screenPointNdc(point, options) {
    const { width, height } = dimensions(options);
    const eye = clampEye(options.eye);
    objectValue(point, 'point');
    const x = finiteNumber(point.x, 'point.x');
    const y = finiteNumber(point.y, 'point.y');
    const z = finiteNumber(point.z, 'point.z');
    const depth = eye.z - z;
    if (depth <= 0) {
        throw new RangeError('point must be in front of the eye plane (point.z < eye.z)');
    }
    const t = eye.z / depth;
    const ndc = {
        x: 2 * (eye.x + t * (x - eye.x)) / width,
        y: 2 * (eye.y + t * (y - eye.y)) / height
    };
    if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y)) {
        throw new RangeError('point projection exceeds the finite numeric range');
    }
    return ndc;
}
