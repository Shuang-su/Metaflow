import type { Vec3 } from 'playcanvas';

import type { AnimTrack } from '../settings';

declare const createFigure8Track: (
    position: Vec3,
    target: Vec3,
    fov: number,
    size?: number,
    keys?: number,
    duration?: number
) => AnimTrack;

export { createFigure8Track };
export default createFigure8Track;
