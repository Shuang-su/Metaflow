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
 * Resolve where an animation should exit.
 *
 * @param {{
 *   firstExitMode?: 'orbit' | 'default',
 *   hasHandledFirstExit: boolean,
 *   animationPaused: boolean,
 *   previousMode: CameraMode,
 *   walkAllowed: boolean
 * }} options
 * @returns {{ mode: CameraMode, consumeFirstExit: boolean }}
 */
const resolveAnimationExitMode = (options) => {
    const { firstExitMode, hasHandledFirstExit, animationPaused, previousMode, walkAllowed } = options;

    if (firstExitMode === 'orbit' && !hasHandledFirstExit && !animationPaused) {
        return {
            mode: 'orbit',
            consumeFirstExit: true
        };
    }

    return {
        mode: previousMode === 'walk' && !walkAllowed ? 'fly' : previousMode,
        consumeFirstExit: false
    };
};

/**
 * @param {{
 *   hasExplicitAnimTrack: boolean,
 *   startMode: StartMode,
 *   isObjectExperience: boolean,
 *   hasExplicitStartPose: boolean,
 *   hasCollider: boolean,
 *   preferredCameraMode?: CameraMode,
 *   syntheticAnimation?: 'figure8'
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
        preferredCameraMode,
        syntheticAnimation
    } = options;

    /** @type {AnimationTrackKind} */
    let trackKind = 'none';

    if (hasExplicitAnimTrack && startMode === 'animTrack') {
        trackKind = 'explicit';
    } else if (syntheticAnimation === 'figure8' && hasExplicitStartPose) {
        trackKind = 'figure8';
    } else if (isObjectExperience) {
        trackKind = 'rotate';
    } else if (hasExplicitStartPose) {
        trackKind = 'figure8';
    }

    const hasAnimation = trackKind !== 'none';

    /** @type {CameraMode} */
    let initialCameraMode;

    if (preferredCameraMode === 'anim') {
        initialCameraMode = hasAnimation
            ? 'anim'
            : resolvePreferredCameraMode(undefined, isObjectExperience, hasCollider);
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
    resolvePreferredCameraMode,
    resolveAnimationExitMode
};

export { resolveAnimationPolicy };
export { resolvePreferredCameraMode };
export { resolveAnimationExitMode };
export default policyUtils;
