import test from 'node:test';
import assert from 'node:assert/strict';

import {
    resolveAnimationExitMode,
    resolveAnimationPolicy
} from '../src/animation/resolve-animation-policy.js';

test('non-object scene with explicit start pose gets synthetic figure-8 and starts in animation', () => {
    const result = resolveAnimationPolicy({
        hasExplicitAnimTrack: false,
        startMode: 'default',
        isObjectExperience: false,
        hasExplicitStartPose: true,
        hasCollider: false,
        preferredCameraMode: undefined
    });

    assert.deepEqual(result, {
        trackKind: 'figure8',
        hasAnimation: true,
        initialCameraMode: 'anim'
    });
});

test('explicit animTrack still wins and starts in animation', () => {
    const result = resolveAnimationPolicy({
        hasExplicitAnimTrack: true,
        startMode: 'animTrack',
        isObjectExperience: false,
        hasExplicitStartPose: true,
        hasCollider: false,
        preferredCameraMode: undefined
    });

    assert.deepEqual(result, {
        trackKind: 'explicit',
        hasAnimation: true,
        initialCameraMode: 'anim'
    });
});

test('synthetic figure-8 wins over object rotate when explicitly requested', () => {
    const result = resolveAnimationPolicy({
        hasExplicitAnimTrack: false,
        startMode: 'default',
        isObjectExperience: true,
        hasExplicitStartPose: true,
        hasCollider: false,
        preferredCameraMode: undefined,
        syntheticAnimation: 'figure8'
    });

    assert.deepEqual(result, {
        trackKind: 'figure8',
        hasAnimation: true,
        initialCameraMode: 'anim'
    });
});

test('object experience keeps rotate auto-track and does not auto-enter animation', () => {
    const result = resolveAnimationPolicy({
        hasExplicitAnimTrack: false,
        startMode: 'default',
        isObjectExperience: true,
        hasExplicitStartPose: false,
        hasCollider: false,
        preferredCameraMode: undefined
    });

    assert.deepEqual(result, {
        trackKind: 'rotate',
        hasAnimation: true,
        initialCameraMode: 'orbit'
    });
});

test('legacy scene without explicit start pose keeps old non-animated behavior', () => {
    const result = resolveAnimationPolicy({
        hasExplicitAnimTrack: false,
        startMode: 'default',
        isObjectExperience: false,
        hasExplicitStartPose: false,
        hasCollider: false,
        preferredCameraMode: undefined
    });

    assert.deepEqual(result, {
        trackKind: 'none',
        hasAnimation: false,
        initialCameraMode: 'fly'
    });
});

test('configured resources use orbit only for the first active animation exit', () => {
    const firstExit = resolveAnimationExitMode({
        firstExitMode: 'orbit',
        hasHandledFirstExit: false,
        animationPaused: false,
        previousMode: 'fly',
        walkAllowed: false
    });
    assert.deepEqual(firstExit, {
        mode: 'orbit',
        consumeFirstExit: true
    });

    const replayExit = resolveAnimationExitMode({
        firstExitMode: 'orbit',
        hasHandledFirstExit: true,
        animationPaused: false,
        previousMode: 'fly',
        walkAllowed: false
    });
    assert.deepEqual(replayExit, {
        mode: 'fly',
        consumeFirstExit: false
    });
});

test('paused noanim state does not consume the first animation exit', () => {
    const exit = resolveAnimationExitMode({
        firstExitMode: 'orbit',
        hasHandledFirstExit: false,
        animationPaused: true,
        previousMode: 'fly',
        walkAllowed: false
    });

    assert.deepEqual(exit, {
        mode: 'fly',
        consumeFirstExit: false
    });
});

test('replayed walk animation falls back to fly when walk is no longer ready', () => {
    const exit = resolveAnimationExitMode({
        firstExitMode: 'orbit',
        hasHandledFirstExit: true,
        animationPaused: false,
        previousMode: 'walk',
        walkAllowed: false
    });

    assert.deepEqual(exit, {
        mode: 'fly',
        consumeFirstExit: false
    });
});
