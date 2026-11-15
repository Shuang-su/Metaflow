/**
 * Safe rest-pose helpers for VRM0/VRM1.
 *
 * three-vrm setNormalizedPose expects rotation as QUATERNION [x,y,z,w]
 * relative to T-pose rest — NOT Euler triples.
 *
 * After a large pose change, springBoneManager.setInitState() must re-capture
 * rest tails from the new pose. reset() alone restores the OLD (T-pose) init
 * and leaves skirt/hair exploding.
 *
 * Order: setNormalizedPose → humanoid.update → updateMatrixWorld →
 *        setInitState → reset → settle updates.
 *
 * Natural idle (not A/T-pose): upper arms hang near torso (~80°+ from T-pose),
 * slight elbow bend, relaxed wrists, hands clear of skirt volume.
 */

export function quatFromEulerXYZ(x, y, z) {
    const cx = Math.cos(x / 2);
    const sx = Math.sin(x / 2);
    const cy = Math.cos(y / 2);
    const sy = Math.sin(y / 2);
    const cz = Math.cos(z / 2);
    const sz = Math.sin(z / 2);
    return [
        sx * cy * cz + cx * sy * sz,
        cx * sy * cz - sx * cy * sz,
        cx * cy * sz + sx * sy * cz,
        cx * cy * cz - sx * sy * sz
    ];
}

/** Natural hang fold from T-pose (radians). ~1.52 ≈ 87° — arms by torso, not A-pose. */
export const NATURAL_ARM_FOLD = 1.52;
export const NATURAL_ELBOW = 0.72;
export const NATURAL_WRIST = 0.22;

/**
 * Build a natural standing rest pose (relaxed hang, slight elbow, soft wrists).
 * VRM0 and VRM1 flip upper-arm Z sign in normalized space.
 */
export function buildRestPose(metaVersion) {
    const isVrm0 = metaVersion === '0';
    const fold = NATURAL_ARM_FOLD;
    const elbow = NATURAL_ELBOW;
    const wrist = NATURAL_WRIST;
    // Inward + slight forward so elbows read beside torso (not flat A-pose silhouette)
    const inY = isVrm0 ? 0.18 : -0.18;
    const fwd = 0.18;
    const armZLeft = isVrm0 ? fold : -fold;
    const armZRight = isVrm0 ? -fold : fold;
    // Soft shoulder drop
    const shoulderDrop = 0.12;
    return {
        leftShoulder: { rotation: quatFromEulerXYZ(0, 0, isVrm0 ? shoulderDrop : -shoulderDrop) },
        rightShoulder: { rotation: quatFromEulerXYZ(0, 0, isVrm0 ? -shoulderDrop : shoulderDrop) },
        leftUpperArm: { rotation: quatFromEulerXYZ(fwd, inY, armZLeft) },
        rightUpperArm: { rotation: quatFromEulerXYZ(fwd, -inY, armZRight) },
        leftLowerArm: { rotation: quatFromEulerXYZ(elbow, 0.06, isVrm0 ? 0.12 : -0.12) },
        rightLowerArm: { rotation: quatFromEulerXYZ(elbow, -0.06, isVrm0 ? -0.12 : 0.12) },
        leftHand: { rotation: quatFromEulerXYZ(0.05, 0, isVrm0 ? -wrist : wrist) },
        rightHand: { rotation: quatFromEulerXYZ(0.05, 0, isVrm0 ? wrist : -wrist) },
        // Soft neutral spine — weight shift layered in animator, not baked hard here
        spine: { rotation: quatFromEulerXYZ(0.02, 0, 0) },
        chest: { rotation: quatFromEulerXYZ(0.015, 0, 0) },
        hips: { rotation: quatFromEulerXYZ(0, 0.02, 0) },
        neck: { rotation: quatFromEulerXYZ(-0.02, 0, 0) },
        head: { rotation: quatFromEulerXYZ(0.03, -0.04, 0) }
    };
}

function rebindSpringsToCurrentPose(vrm) {
    const mgr = vrm?.springBoneManager;
    if (!mgr) return { rebound: false };

    vrm.scene.updateMatrixWorld(true);

    if (typeof mgr.setInitState === 'function') {
        mgr.setInitState();
    }
    if (typeof mgr.reset === 'function') {
        mgr.reset();
    }
    return { rebound: true, setInitState: typeof mgr.setInitState === 'function' };
}

const ARM_BONE_NAMES = [
    'leftShoulder', 'rightShoulder',
    'leftUpperArm', 'rightUpperArm',
    'leftLowerArm', 'rightLowerArm',
    'leftHand', 'rightHand'
];

/**
 * Apply rest pose, sync humanoid → raw, rebind springs.
 * @param {{ settleFrames?: number, updateSprings?: boolean }} options
 *   updateSprings=false: rebind only (freeze cloth/hair at posed rest) — use when
 *   springs will stay disabled so settle loops cannot spike hair/skirt.
 */
export function applyRestPoseAndSettle(vrm, metaVersion, settleFramesOrOpts = 120) {
    if (!vrm?.humanoid) {
        return { applied: false, reason: 'no-humanoid' };
    }

    const opts = typeof settleFramesOrOpts === 'number'
        ? { settleFrames: settleFramesOrOpts, updateSprings: true }
        : { settleFrames: 120, updateSprings: true, ...settleFramesOrOpts };

    const pose = buildRestPose(metaVersion);
    vrm.humanoid.setNormalizedPose(pose);
    vrm.humanoid.update();

    const left = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
    const sample = left?.quaternion
        ? [left.quaternion.x, left.quaternion.y, left.quaternion.z, left.quaternion.w]
        : null;

    const spring = rebindSpringsToCurrentPose(vrm);

    if (opts.updateSprings && vrm.springBoneManager) {
        const dt = 1 / 60;
        const frames = opts.settleFrames;
        for (let i = 0; i < frames; i++) {
            reapplyArmRestPose(vrm, metaVersion);
            vrm.humanoid.update();
            vrm.update(dt);
        }
        rebindSpringsToCurrentPose(vrm);
        for (let i = 0; i < 30; i++) {
            reapplyArmRestPose(vrm, metaVersion);
            vrm.humanoid.update();
            vrm.update(dt);
        }
    } else {
        for (let i = 0; i < 8; i++) {
            reapplyArmRestPose(vrm, metaVersion);
            vrm.humanoid.update();
        }
    }

    return {
        applied: true,
        metaVersion,
        settleFrames: opts.updateSprings ? opts.settleFrames : 0,
        springsRebound: spring.rebound,
        springsUpdated: !!opts.updateSprings,
        armFoldRad: NATURAL_ARM_FOLD,
        poseStyle: 'natural-relaxed',
        leftUpperArmQuat: sample
    };
}

export function softResetSprings(vrm, settleFrames = 45) {
    if (!vrm?.springBoneManager) {
        return { reset: false };
    }
    rebindSpringsToCurrentPose(vrm);
    const dt = 1 / 60;
    for (let i = 0; i < settleFrames; i++) {
        vrm.update(dt);
    }
    return { reset: true, settleFrames, rebound: true };
}

/** Re-apply arm/shoulder/hand rest every frame so idle/lookAt cannot lift arms into A-pose. */
export function reapplyArmRestPose(vrm, metaVersion) {
    if (!vrm?.humanoid) return;
    const pose = buildRestPose(metaVersion);
    for (const name of ARM_BONE_NAMES) {
        const state = pose[name];
        const node = vrm.humanoid.getNormalizedBoneNode(name);
        if (node && state?.rotation) {
            node.quaternion.fromArray(state.rotation);
        }
    }
}

/**
 * Per-model spring policy. Hair spikes / skirt flare → honest-disabled default.
 */
export function springsPolicyForModel(modelName, metaVersion) {
    const n = (modelName || '').toLowerCase();
    if (n.includes('constraint_twist') || n.includes('vrm1_constraint')) {
        return {
            defaultEnabled: false,
            reason: 'pixiv Constraint_Twist：idle/lookAt 后毛发易尖刺；默认关闭弹簧（可手动开启后点「重新稳定」）'
        };
    }
    if (metaVersion === '0' && n.includes('wenjing')) {
        return {
            defaultEnabled: false,
            reason: '文镜：自然站姿下裙摆弹簧仍易外翻；默认关闭弹簧以保持可读站姿（可手动开启）'
        };
    }
    return { defaultEnabled: true, reason: '' };
}
