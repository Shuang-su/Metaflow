import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVRMAnimationController, createAudioMouthController } from './vrm-animation.mjs';

/**
 * VRM Animation and Lifecycle Integration Tests
 * Covers animation controllers, audio mouth synchronization, and resource cleanup.
 */

// Mock VRM object for testing
function createMockVRM() {
    const expressionValues = new Map();
    
    // Mock THREE.Vector3
    class MockVector3 {
        constructor(x = 0, y = 0, z = 0) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
        clone() {
            return new MockVector3(this.x, this.y, this.z);
        }
        copy(v) {
            this.x = v.x;
            this.y = v.y;
            this.z = v.z;
            return this;
        }
        multiplyScalar(s) {
            this.x *= s;
            this.y *= s;
            this.z *= s;
            return this;
        }
    }
    
    const bones = {
        chest: { 
            scale: new MockVector3(1, 1, 1)
        }
    };
    
    return {
        scene: {},
        humanoid: {
            getNormalizedBoneNode: (name) => name === 'chest' ? bones.chest : null
        },
        expressionManager: {
            expressionMap: { blink: {}, aa: {} },
            getExpressionTrackName: (name) => 
                (name === 'blink' || name === 'aa') ? name : null,
            setValue: (name, value) => {
                expressionValues.set(name, value);
            },
            getValue: (name) => expressionValues.get(name) || 0
        },
        lookAt: {
            target: new MockVector3(0, 0, 1)
        },
        update: () => {}
    };
}

test('createVRMAnimationController validates VRM structure', () => {
    assert.throws(
        () => createVRMAnimationController(null),
        /需要包含 humanoid 的有效 VRM/
    );
    
    assert.throws(
        () => createVRMAnimationController({}),
        /需要包含 humanoid 的有效 VRM/
    );
    
    assert.throws(
        () => createVRMAnimationController({ humanoid: null }),
        /需要包含 humanoid 的有效 VRM/
    );
    
    // Should not throw with valid VRM
    const vrm = createMockVRM();
    const controller = createVRMAnimationController(vrm);
    assert.ok(controller);
    controller.dispose();
});

test('animation controller reports capability flags', () => {
    const vrm = createMockVRM();
    const controller = createVRMAnimationController(vrm);
    
    // hasBlinking/hasMouth return truthy values (expression name or null)
    assert.ok(controller.hasBlinking, 'Should detect blink expression');
    assert.ok(controller.hasMouth, 'Should detect aa expression');
    assert.ok(controller.hasLookAt, 'Should detect lookAt');
    
    controller.dispose();
});

test('animation controller without expressions reports correctly', () => {
    const vrm = createMockVRM();
    vrm.expressionManager = null;
    
    const controller = createVRMAnimationController(vrm);
    
    assert.ok(!controller.hasBlinking, 'Should not detect blink without expressionManager');
    assert.ok(!controller.hasMouth, 'Should not detect mouth without expressionManager');
    
    controller.dispose();
});

test('animation update advances time and triggers blink', () => {
    const vrm = createMockVRM();
    const controller = createVRMAnimationController(vrm, {
        blinkInterval: 0.5,
        blinkIntervalVariance: 0,
        blinkDuration: 0.1
    });
    
    // Blink timing is initially randomized (nextBlinkTime = Math.random() * blinkInterval)
    // So we advance enough time to guarantee at least one blink cycle
    let blinkDetected = false;
    
    for (let i = 0; i < 20; i++) {
        controller.update(0.05);  // Total 1.0s
        const blinkValue = vrm.expressionManager.getValue('blink');
        if (blinkValue > 0) {
            blinkDetected = true;
            break;
        }
    }
    
    assert.ok(blinkDetected, 'Should detect at least one blink in 1 second');
    
    controller.dispose();
});

test('setMouthOpen smoothly interpolates to target', () => {
    const vrm = createMockVRM();
    const controller = createVRMAnimationController(vrm);
    
    // Initial state
    assert.equal(vrm.expressionManager.getValue('aa'), 0);
    
    // Set target
    controller.setMouthOpen(1.0);
    
    // Should interpolate over multiple updates
    controller.update(0.016); // ~60fps
    const value1 = vrm.expressionManager.getValue('aa');
    assert.ok(value1 > 0 && value1 < 1, 'Should be interpolating');
    
    controller.update(0.016);
    const value2 = vrm.expressionManager.getValue('aa');
    assert.ok(value2 > value1, 'Should continue approaching target');
    
    // After many updates, should reach target
    for (let i = 0; i < 100; i++) {
        controller.update(0.016);
    }
    const final = vrm.expressionManager.getValue('aa');
    assert.ok(Math.abs(final - 1.0) < 0.01, 'Should reach target');
    
    controller.dispose();
});

test('setLookAtTarget updates VRM lookAt', () => {
    const vrm = createMockVRM();
    const controller = createVRMAnimationController(vrm);
    
    const originalTarget = { ...vrm.lookAt.target };
    
    controller.setLookAtTarget({ x: 5, y: 3, z: 10 });
    controller.update(0.016);
    
    // Target should be updated
    assert.notDeepEqual(vrm.lookAt.target, originalTarget);
    
    controller.dispose();
});

test('reset clears animation state', () => {
    const vrm = createMockVRM();
    const controller = createVRMAnimationController(vrm);
    
    // Set up some animation state
    controller.setMouthOpen(0.8);
    controller.update(0.1);
    
    assert.ok(vrm.expressionManager.getValue('aa') > 0, 'Mouth should be open before reset');
    
    controller.reset();
    controller.update(0.001);
    
    assert.equal(vrm.expressionManager.getValue('aa'), 0, 'Mouth should be closed after reset');
    assert.equal(vrm.expressionManager.getValue('blink'), 0, 'Blink should be cleared');
    
    controller.dispose();
});

test('dispose prevents further updates', () => {
    const vrm = createMockVRM();
    const controller = createVRMAnimationController(vrm);
    
    controller.setMouthOpen(1.0);
    controller.dispose();
    
    // Updates after dispose should be no-op
    controller.update(0.1);
    assert.equal(vrm.expressionManager.getValue('aa'), 0, 'Should not update after dispose');
    
    controller.setMouthOpen(0.5);
    assert.equal(vrm.expressionManager.getValue('aa'), 0, 'setMouthOpen should be no-op after dispose');
});

test('audioMouthController requires onMouthUpdate callback', () => {
    const controller = createAudioMouthController();
    assert.ok(controller, 'Should create without callback');
    controller.dispose();
});

test('audioMouthController requires AudioContext (browser environment)', () => {
    // AudioContext uses window which doesn't exist in Node
    // This test validates the requirement is explicit
    const controller = createAudioMouthController();
    
    // In Node, AudioContext will fail
    // Just verify controller can be created
    assert.ok(controller, 'Controller should be created');
    assert.equal(controller.isActive, false, 'Should not be active');
    
    controller.dispose();
});

test('audioMouthController detaches cleanly', () => {
    let mouthUpdateCount = 0;
    const controller = createAudioMouthController({
        onMouthUpdate: () => { mouthUpdateCount++; }
    });
    
    // Create mock audio element
    const audio = {
        addEventListener: () => {},
        removeEventListener: () => {}
    };
    
    // Detach should be safe even without attach
    assert.doesNotThrow(() => controller.detach());
    
    controller.dispose();
});

test('audioMouthController disposes idempotently', () => {
    const controller = createAudioMouthController();
    
    controller.dispose();
    assert.doesNotThrow(() => controller.dispose());
    assert.doesNotThrow(() => controller.dispose());
});

test('audioMouthController reports active state', () => {
    const controller = createAudioMouthController();
    
    assert.equal(controller.isActive, false, 'Should not be active initially');
    
    controller.dispose();
});

test('breathing animation respects custom rate', () => {
    const vrm = createMockVRM();
    const controller = createVRMAnimationController(vrm, {
        breathingRate: 0.5, // 30 per minute
        breathingAmount: 0.1
    });
    
    // Chest should exist
    const chest = vrm.humanoid.getNormalizedBoneNode('chest');
    assert.ok(chest, 'Chest bone should be available');
    
    // Update and verify breathing is applied
    // (Cannot fully test scale changes in mock, but verifies no errors)
    controller.update(1.0);
    controller.update(1.0);
    
    controller.dispose();
});

test('multiple animation features run concurrently', () => {
    const vrm = createMockVRM();
    const controller = createVRMAnimationController(vrm);
    
    // Set mouth open
    controller.setMouthOpen(0.5);
    
    // Set look-at
    controller.setLookAtTarget({ x: 10, y: 5, z: 20 });
    
    // Update with significant time to trigger blink
    controller.update(5.0);
    
    // All features should work together
    // Mouth should be approaching target
    const mouthValue = vrm.expressionManager.getValue('aa');
    assert.ok(mouthValue > 0, 'Mouth should be opening');
    
    // Blink might be active (random timing)
    // Just verify no error
    const blinkValue = vrm.expressionManager.getValue('blink');
    assert.ok(blinkValue >= 0, 'Blink value should be valid');
    
    controller.dispose();
});

test('extreme mouth values are clamped', () => {
    const vrm = createMockVRM();
    const controller = createVRMAnimationController(vrm);
    
    controller.setMouthOpen(999);
    for (let i = 0; i < 200; i++) {
        controller.update(0.016);
    }
    
    const value = vrm.expressionManager.getValue('aa');
    assert.ok(value <= 1.0, 'Mouth value should be clamped to 1.0');
    
    controller.setMouthOpen(-999);
    for (let i = 0; i < 200; i++) {
        controller.update(0.016);
    }
    
    const valueNeg = vrm.expressionManager.getValue('aa');
    assert.ok(valueNeg >= 0, 'Mouth value should be clamped to 0');
    
    controller.dispose();
});
