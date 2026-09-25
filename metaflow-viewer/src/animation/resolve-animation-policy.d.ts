import type { CameraMode } from '../types';

type StartMode = 'default' | 'animTrack' | 'annotation';
type AnimationTrackKind = 'none' | 'explicit' | 'rotate' | 'figure8';

declare const policyUtils: {
    resolveAnimationPolicy(options: {
        hasExplicitAnimTrack: boolean;
        startMode: StartMode;
        isObjectExperience: boolean;
        hasExplicitStartPose: boolean;
        hasCollider: boolean;
        preferredCameraMode?: CameraMode;
        syntheticAnimation?: 'figure8';
    }): {
        trackKind: AnimationTrackKind;
        hasAnimation: boolean;
        initialCameraMode: CameraMode;
    };
    resolvePreferredCameraMode(
        preferred: CameraMode | undefined,
        isObjectExperience: boolean,
        hasCollider: boolean
    ): CameraMode;
    resolveAnimationExitMode(options: {
        firstExitMode?: 'orbit' | 'default';
        hasHandledFirstExit: boolean;
        animationPaused: boolean;
        previousMode: CameraMode;
        walkAllowed: boolean;
    }): {
        mode: CameraMode;
        consumeFirstExit: boolean;
    };
};

export const resolveAnimationPolicy: typeof policyUtils.resolveAnimationPolicy;
export const resolvePreferredCameraMode: typeof policyUtils.resolvePreferredCameraMode;
export const resolveAnimationExitMode: typeof policyUtils.resolveAnimationExitMode;
export default policyUtils;
