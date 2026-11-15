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

export function buildRestPose(metaVersion) {
    const isVrm0 = metaVersion === '0';
    const fold = 1.05; // ~60° toward torso — clearer rest than shallow A-pose
    const lower = 0.35;
    const armZLeft = isVrm0 ? fold : -fold;
    const armZRight = isVrm0 ? -fold : fold;
    return {
        leftUpperArm: { rotation: quatFromEulerXYZ(0, 0, armZLeft) },
        rightUpperArm: { rotation: quatFromEulerXYZ(0, 0, armZRight) },
        leftLowerArm: { rotation: quatFromEulerXYZ(lower, 0, 0) },
        rightLowerArm: { rotation: quatFromEulerXYZ(lower, 0, 0) }
    };
}

function rebindSpringsToCurrentPose(vrm) {
    const mgr = vrm?.springBoneManager;
    if (!mgr) return { rebound: false };

    vrm.scene.updateMatrixWorld(true);

    // Re-capture initial local rotations / tails from the posed skeleton
    if (typeof mgr.setInitState === 'function') {
        mgr.setInitState();
    }
    // Clear velocities to the new init
    if (typeof mgr.reset === 'function') {
        mgr.reset();
    }
    return { rebound: true, setInitState: typeof mgr.setInitState === 'function' };
}

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
        // Rebind after gravity settle so rest matches hanging cloth
        rebindSpringsToCurrentPose(vrm);
        for (let i = 0; i < 30; i++) {
            reapplyArmRestPose(vrm, metaVersion);
            vrm.humanoid.update();
            vrm.update(dt);
        }
    } else {
        // Still tick humanoid/expressions without spring integration
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
        armFoldRad: 1.05,
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

export function reapplyArmRestPose(vrm, metaVersion) {
    if (!vrm?.humanoid) return;
    const pose = buildRestPose(metaVersion);
    const bones = [
        ['leftUpperArm', pose.leftUpperArm],
        ['rightUpperArm', pose.rightUpperArm],
        ['leftLowerArm', pose.leftLowerArm],
        ['rightLowerArm', pose.rightLowerArm]
    ];
    for (const [name, state] of bones) {
        const node = vrm.humanoid.getNormalizedBoneNode(name);
        if (node && state?.rotation) {
            node.quaternion.fromArray(state.rotation);
        }
    }
}

/**
 * Per-model spring policy. Hair spikes on some VRM1 samples are honest-disabled.
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
        // Skirt springs still flare after A-pose + setInitState on this model;
        // honest conservative default — user can enable and resettle.
        return {
            defaultEnabled: false,
            reason: '文镜：A-pose 后裙摆弹簧仍易外翻；默认关闭弹簧以保持可读站姿（可手动开启）'
        };
    }
    return { defaultEnabled: true, reason: '' };
}
