import {
    Vec3
} from 'playcanvas';

/**
 * Creates a figure-8 (lemniscate / infinity sign) camera animation track.
 *
 * @param {Vec3} position - Starting location of the camera.
 * @param {Vec3} target - Target point the camera looks at.
 * @param {number} fov - The camera field of view.
 * @param {number} [size=1] - Overall scale of the figure-8 path.
 * @param {number} [keys=24] - Number of keyframes in the animation.
 * @param {number} [duration=20] - Animation duration in seconds.
 * @returns {{
 *   name: string,
 *   duration: number,
 *   frameRate: number,
 *   loopMode: 'repeat',
 *   interpolation: 'spline',
 *   smoothness: number,
 *   keyframes: {
 *     times: number[],
 *     values: {
 *       position: number[],
 *       target: number[],
 *       fov: number[]
 *     }
 *   }
 * }}
 */
const createFigure8Track = (position, target, fov, size = 1, keys = 24, duration = 20) => {
    const times = new Array(keys).fill(0).map((_, i) => i / keys * duration);
    const positions = [];
    const targets = [];
    const fovs = new Array(keys).fill(fov);

    const amplitude = size * 0.5;

    const dx = position.x - target.x;
    const dz = position.z - target.z;
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);

    let rightX;
    let rightZ;
    let fwdX;
    let fwdZ;

    if (horizontalDist > 0.001) {
        fwdX = dx / horizontalDist;
        fwdZ = dz / horizontalDist;
        rightX = -fwdZ;
        rightZ = fwdX;
    } else {
        fwdX = 0;
        fwdZ = 1;
        rightX = 1;
        rightZ = 0;
    }

    for (let i = 0; i < keys; ++i) {
        const t = i / keys * Math.PI * 2;
        const offsetRight = amplitude * Math.sin(t);
        const offsetFwd = amplitude * Math.sin(2 * t) / 2;

        positions.push(position.x + rightX * offsetRight + fwdX * offsetFwd);
        positions.push(position.y);
        positions.push(position.z + rightZ * offsetRight + fwdZ * offsetFwd);

        targets.push(target.x);
        targets.push(target.y);
        targets.push(target.z);
    }

    return {
        name: 'figure8',
        duration,
        frameRate: 1,
        loopMode: 'repeat',
        interpolation: 'spline',
        smoothness: 1,
        keyframes: {
            times,
            values: {
                position: positions,
                target: targets,
                fov: fovs
            }
        }
    };
};

export { createFigure8Track };
export default createFigure8Track;
