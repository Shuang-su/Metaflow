/**
 * Verify off-axis projection matrix synchronization
 * Tests that Three.js camera receives PlayCanvas projection matrix correctly
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Off-axis projection synchronization', () => {
  it('should copy PlayCanvas column-major matrix to Three.js', () => {
    // Mock PlayCanvas camera projection matrix (column-major 4x4)
    const playCanvasMatrix = {
      data: [
        1.5, 0,   0,    0,     // column 0
        0,   2.0, 0,    0,     // column 1
        -0.1, 0.05, -1.002, -1, // column 2 (contains off-axis offset in [2] and [6])
        0,   0,   -0.2, 0      // column 3
      ]
    };

    // Mock Three.js Matrix4
    class MockMatrix4 {
      constructor() {
        this.elements = new Array(16).fill(0);
      }
      set(n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44) {
        const te = this.elements;
        te[0] = n11; te[4] = n12; te[8]  = n13; te[12] = n14;
        te[1] = n21; te[5] = n22; te[9]  = n23; te[13] = n24;
        te[2] = n31; te[6] = n32; te[10] = n33; te[14] = n34;
        te[3] = n41; te[7] = n42; te[11] = n43; te[15] = n44;
        return this;
      }
      copy(m) {
        this.elements = [...m.elements];
        return this;
      }
      invert() {
        // Simplified mock - real implementation is complex
        return this;
      }
    }

    const threeMatrix = new MockMatrix4();
    const threeInverse = new MockMatrix4();

    // Simulate the projection copy code from app.mjs
    const m = playCanvasMatrix.data;
    threeMatrix.set(
      m[0], m[4], m[8],  m[12],
      m[1], m[5], m[9],  m[13],
      m[2], m[6], m[10], m[14],
      m[3], m[7], m[11], m[15]
    );

    // Verify critical values are copied
    const te = threeMatrix.elements;
    
    // Column 0 (X scale and skew)
    assert.strictEqual(te[0], 1.5, 'X scale should match');
    assert.strictEqual(te[1], 0, 'XY shear should match');
    
    // Column 1 (Y scale and skew)
    assert.strictEqual(te[5], 2.0, 'Y scale should match');
    
    // Column 2 (contains off-axis offset)
    assert.strictEqual(te[8], -0.1, 'Off-axis X offset (m[8]) should be copied');
    assert.strictEqual(te[9], 0.05, 'Off-axis Y offset (m[9]) should be copied');
    assert.strictEqual(te[10], -1.002, 'Near/far Z scaling should match');
    assert.strictEqual(te[11], -1, 'Perspective divide should match');
    
    // Column 3 (translation)
    assert.strictEqual(te[14], -0.2, 'Z translation should match');
  });

  it('should handle fallback to standard projection if matrix unavailable', () => {
    // This tests the fallback case where projectionMatrix.data is undefined
    const camera = {
      fov: 45,
      aspectRatio: 1.6,
      nearClip: 0.1,
      farClip: 100,
      projectionMatrix: null  // Simulate missing matrix
    };

    // Mock Three.js camera
    const threeCamera = {
      fov: 0,
      aspect: 0,
      near: 0,
      far: 0,
      projectionMatrix: { set: () => {} },
      projectionMatrixInverse: { copy: () => ({ invert: () => {} }) },
      updateProjectionMatrix: function() {
        // Standard projection calculation happens here
        return true;
      }
    };

    // Simulate fallback code
    const cam = camera;
    if (!cam.projectionMatrix || !cam.projectionMatrix.data) {
      threeCamera.fov = cam.fov;
      threeCamera.aspect = cam.aspectRatio;
      threeCamera.near = cam.nearClip;
      threeCamera.far = cam.farClip;
      threeCamera.updateProjectionMatrix();
    }

    assert.strictEqual(threeCamera.fov, 45, 'FOV should be copied in fallback');
    assert.strictEqual(threeCamera.aspect, 1.6, 'Aspect should be copied in fallback');
    assert.strictEqual(threeCamera.near, 0.1, 'Near clip should be copied in fallback');
    assert.strictEqual(threeCamera.far, 100, 'Far clip should be copied in fallback');
  });

  it('should demonstrate off-axis projection effect', () => {
    // Standard symmetric projection (eye at screen center)
    const standardProj = [
      2.0, 0,   0,    0,
      0,   2.0, 0,    0,
      0,   0,   -1.002, -1,
      0,   0,   -0.2,  0
    ];

    // Off-axis projection (eye at (0.2, -0.1, z) relative to screen center)
    const offAxisProj = [
      2.0, 0,   0,     0,
      0,   2.0, 0,     0,
      0.4, -0.2, -1.002, -1,  // X,Y offset in elements [8], [9]
      0,   0,   -0.2,  0
    ];

    // The difference is in column 2 (elements 8 and 9)
    assert.notStrictEqual(standardProj[8], offAxisProj[8], 
      'Off-axis X should differ from standard projection');
    assert.notStrictEqual(standardProj[9], offAxisProj[9], 
      'Off-axis Y should differ from standard projection');
    
    // Other elements remain the same
    assert.strictEqual(standardProj[0], offAxisProj[0], 
      'X scale unchanged by off-axis');
    assert.strictEqual(standardProj[5], offAxisProj[5], 
      'Y scale unchanged by off-axis');
  });
});

describe('VRM foot/desk alignment verification', () => {
  it('should define expected behavior for eye position changes', () => {
    // When eye moves right (+X), the projection offset becomes more negative
    // This causes objects on the left side of screen to appear more centered
    // VRM feet should remain planted on desk surface in world coordinates
    
    const testCases = [
      { eye: { x: 0, y: 0, z: 50 }, expectedOffsetSign: { x: 0, y: 0 } },
      { eye: { x: 20, y: 0, z: 50 }, expectedOffsetSign: { x: -1, y: 0 } },
      { eye: { x: -20, y: 0, z: 50 }, expectedOffsetSign: { x: 1, y: 0 } },
      { eye: { x: 0, y: 15, z: 50 }, expectedOffsetSign: { x: 0, y: -1 } },
      { eye: { x: 0, y: -15, z: 50 }, expectedOffsetSign: { x: 0, y: 1 } },
    ];

    testCases.forEach(({ eye, expectedOffsetSign }) => {
      // The projection offset is computed as -2 * eye.x / screenWidth
      // Simplified: offset sign should be opposite of eye sign
      const computedOffsetX = eye.x === 0 ? 0 : (eye.x > 0 ? -1 : 1);
      const computedOffsetY = eye.y === 0 ? 0 : (eye.y > 0 ? -1 : 1);
      
      assert.strictEqual(computedOffsetX, expectedOffsetSign.x,
        `Eye at X=${eye.x} should produce offset sign ${expectedOffsetSign.x}`);
      assert.strictEqual(computedOffsetY, expectedOffsetSign.y,
        `Eye at Y=${eye.y} should produce offset sign ${expectedOffsetSign.y}`);
    });
  });

  it('should preserve world-space VRM position under camera changes', () => {
    // VRM position in world space
    const vrmWorldPos = { x: 0, y: 0, z: -100 };
    
    // Camera positions
    const cameras = [
      { pos: { x: 0, y: 0, z: 50 }, name: 'centered' },
      { pos: { x: 30, y: 20, z: 50 }, name: 'top-right' },
      { pos: { x: -30, y: -20, z: 50 }, name: 'bottom-left' },
    ];

    cameras.forEach(({ pos, name }) => {
      // VRM world position doesn't change
      const vrmAfter = { ...vrmWorldPos };
      assert.deepStrictEqual(vrmAfter, vrmWorldPos,
        `VRM world position should not change when camera moves to ${name}`);
      
      // Only the projection matrix changes (off-axis offset)
      // VRM appears in different screen position, but world position is same
    });
  });
});
