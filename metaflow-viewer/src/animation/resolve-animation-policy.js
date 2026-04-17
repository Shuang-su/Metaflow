/**
 * @typedef {'orbit' | 'anim' | 'fly' | 'walk'} CameraMode
 * @typedef {'default' | 'animTrack' | 'annotation'} StartMode
 * @typedef {'none' | 'explicit' | 'rotate' | 'figure8'} AnimationTrackKind
 */

/**
 * @param {CameraMode | undefined} preferred
 * @param {boolean} isObjectExperience
 * @param {boolean} hasCollider
 * @returns {CameraMode}
 */
const resolvePreferredCameraMode = (preferred, isObjectExperience, hasCollider) => {
    switch (preferred) {
        case 'orbit':
            return 'orbit';
        case 'fly':
            return 'fly';
        case 'walk':
            return hasCollider ? 'walk' : 'fly';
        default:
            return isObjectExperience ? 'orbit' : 'fly';
    }
};

/**
 * @param {{
 *   hasExplicitAnimTrack: boolean,
 *   startMode: StartMode,
 *   isObjectExperience: boolean,
 *   hasExplicitStartPose: boolean,
 *   hasCollider: boolean,
 *   preferredCameraMode?: CameraMode
 * }} options
 * @returns {{
 *   trackKind: AnimationTrackKind,
 *   hasAnimation: boolean,
 *   initialCameraMode: CameraMode
 * }}
 */
const resolveAnimationPolicy = (options) => {
    const {
        hasExplicitAnimTrack,
        startMode,
        isObjectExperience,
        hasExplicitStartPose,
        hasCollider,
        preferredCameraMode
    } = options;

    /** @type {AnimationTrackKind} */
    let trackKind = 'none';

    if (hasExplicitAnimTrack && startMode === 'animTrack') {
        trackKind = 'explicit';
    } else if (isObjectExperience) {
        trackKind = 'rotate';
    } else if (hasExplicitStartPose) {
        trackKind = 'figure8';
    }

    const hasAnimation = trackKind !== 'none';

    /** @type {CameraMode} */
    let initialCameraMode;

    if (preferredCameraMode === 'anim') {
        initialCameraMode = hasAnimation ?
            'anim' :
            resolvePreferredCameraMode(undefined, isObjectExperience, hasCollider);
    } else if (trackKind === 'explicit' || trackKind === 'figure8') {
        initialCameraMode = 'anim';
    } else {
        initialCameraMode = resolvePreferredCameraMode(preferredCameraMode, isObjectExperience, hasCollider);
    }

    return {
        trackKind,
        hasAnimation,
        initialCameraMode
    };
};

const policyUtils = {
    resolveAnimationPolicy,
    resolvePreferredCameraMode
};

export { resolveAnimationPolicy };
export { resolvePreferredCameraMode };
export default policyUtils;
