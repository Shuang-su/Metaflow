/**
 * Safe rest-pose helpers for VRM0/VRM1.
 *
 * Natural idle: arms hang beside hips with visible elbow/wrist/hand clearance
 * outside the skirt silhouette — not A/T-pose, not buried behind torso.
 *
 * three-vrm setNormalizedPose expects QUATERNION [x,y,z,w] relative to T-pose.
 * After pose change: setInitState → reset before spring settle.
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

/**
 * Fold from T-pose (~72°). Leaves A-pose, short of vertical glue so hands
 * sit beside hips with a readable outer silhouette gap.
 */
export const NATURAL_ARM_FOLD = 1.26;
export const NATURAL_ELBOW = 0.58;
export const NATURAL_WRIST = 0.2;
/** Lateral open (away from midline) so hands clear skirt volume. */
export const NATURAL_ARM_OUT = 0.28;
/** Slight forward so elbows/wrists aren't behind the torso plane. */
export const NATURAL_ARM_FWD = 0.14;

export function buildRestPose(metaVersion) {
    const isVrm0 = metaVersion === '0';
    const fold = NATURAL_ARM_FOLD;
    const elbow = NATURAL_ELBOW;
    const wrist = NATURAL_WRIST;
    const out = NATURAL_ARM_OUT;
    const fwd = NATURAL_ARM_FWD;
    const outYLeft = isVrm0 ? -out : out;
    const outYRight = isVrm0 ? out : -out;
    const armZLeft = isVrm0 ? fold : -fold;
    const armZRight = isVrm0 ? -fold : fold;
    const shoulderDrop = 0.1;
    return {
        leftShoulder: { rotation: quatFromEulerXYZ(0, 0, isVrm0 ? shoulderDrop : -shoulderDrop) },
        rightShoulder: { rotation: quatFromEulerXYZ(0, 0, isVrm0 ? -shoulderDrop : shoulderDrop) },
        leftUpperArm: { rotation: quatFromEulerXYZ(fwd, outYLeft, armZLeft) },
        rightUpperArm: { rotation: quatFromEulerXYZ(fwd, outYRight, armZRight) },
        leftLowerArm: { rotation: quatFromEulerXYZ(elbow, outYLeft * 0.25, isVrm0 ? 0.1 : -0.1) },
        rightLowerArm: { rotation: quatFromEulerXYZ(elbow, outYRight * 0.25, isVrm0 ? -0.1 : 0.1) },
        leftHand: { rotation: quatFromEulerXYZ(0.08, 0, isVrm0 ? -wrist : wrist) },
        rightHand: { rotation: quatFromEulerXYZ(0.08, 0, isVrm0 ? wrist : -wrist) },
        spine: { rotation: quatFromEulerXYZ(0.02, 0, 0) },
        chest: { rotation: quatFromEulerXYZ(0.015, 0, 0) },
        hips: { rotation: quatFromEulerXYZ(0, 0.015, 0) },
        neck: { rotation: quatFromEulerXYZ(-0.02, 0, 0) },
        head: { rotation: quatFromEulerXYZ(0.03, -0.03, 0) }
    };
}

function rebindSpringsToCurrentPose(vrm) {
    const mgr = vrm?.springBoneManager;
    if (!mgr) return { rebound: false };
    vrm.scene.updateMatrixWorld(true);
    if (typeof mgr.setInitState === 'function') mgr.setInitState();
    if (typeof mgr.reset === 'function') mgr.reset();
    return { rebound: true, setInitState: typeof mgr.setInitState === 'function' };
}

const ARM_BONE_NAMES = [
    'leftShoulder', 'rightShoulder',
    'leftUpperArm', 'rightUpperArm',
    'leftLowerArm', 'rightLowerArm',
    'leftHand', 'rightHand'
];

/** World-space hand/hip metrics (figurine metres). Needs globalThis.THREE. */
export function measureArmSilhouette(vrm) {
    if (!vrm?.humanoid) return null;
    vrm.scene.updateMatrixWorld(true);
    const THREE = globalThis.THREE;
    const tmp = THREE?.Vector3 ? new THREE.Vector3() : null;
    const wp = (name) => {
        const n = vrm.humanoid.getNormalizedBoneNode(name) || vrm.humanoid.getRawBoneNode(name);
        if (!n) return null;
        if (tmp) {
            n.getWorldPosition(tmp);
            return { x: tmp.x, y: tmp.y, z: tmp.z };
        }
        n.updateWorldMatrix?.(true, false);
        const e = n.matrixWorld?.elements;
        return e ? { x: e[12], y: e[13], z: e[14] } : null;
    };
    const leftHand = wp('leftHand');
    const rightHand = wp('rightHand');
    const leftLower = wp('leftLowerArm');
    const rightLower = wp('rightLowerArm');
    const hips = wp('hips');
    if (!leftHand || !rightHand || !hips) return null;
    const leftLat = Math.abs(leftHand.x - hips.x);
    const rightLat = Math.abs(rightHand.x - hips.x);
    return {
        leftHand,
        rightHand,
        leftLower,
        rightLower,
        hips,
        leftLat,
        rightLat,
        handsBesideHips: leftLat > 0.012 && rightLat > 0.012
    };
}

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
        for (let i = 0; i < opts.settleFrames; i++) {
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
        poseStyle: 'natural-relaxed-beside',
        leftUpperArmQuat: sample,
        silhouette: measureArmSilhouette(vrm)
    };
}

export function softResetSprings(vrm, settleFrames = 45) {
    if (!vrm?.springBoneManager) return { reset: false };
    rebindSpringsToCurrentPose(vrm);
    const dt = 1 / 60;
    for (let i = 0; i < settleFrames; i++) vrm.update(dt);
    return { reset: true, settleFrames, rebound: true };
}

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
