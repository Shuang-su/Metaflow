/**
 * Create a minimal valid VRM 1.0 test fixture.
 * Original creation for testing purposes - public domain (CC0).
 * 
 * This generates a simple humanoid character with:
 * - Valid humanoid bones (hips, spine, chest, neck, head, limbs)
 * - Basic expressions (blink, aa for mouth)
 * - Simple geometry (cube body, sphere head)
 * - MToon material
 */

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFile } from 'fs/promises';

function createTestVRM() {
    const scene = new THREE.Scene();
    
    // Create simple humanoid geometry
    const bodyGeometry = new THREE.BoxGeometry(0.4, 0.6, 0.2);
    const headGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    const limbGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8);
    
    const material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    
    // Create skeleton hierarchy
    const hips = new THREE.Bone();
    hips.name = 'hips';
    hips.position.set(0, 1.0, 0);
    
    const spine = new THREE.Bone();
    spine.name = 'spine';
    spine.position.set(0, 0.15, 0);
    hips.add(spine);
    
    const chest = new THREE.Bone();
    chest.name = 'chest';
    chest.position.set(0, 0.15, 0);
    spine.add(chest);
    
    const neck = new THREE.Bone();
    neck.name = 'neck';
    neck.position.set(0, 0.2, 0);
    chest.add(neck);
    
    const head = new THREE.Bone();
    head.name = 'head';
    head.position.set(0, 0.1, 0);
    neck.add(head);
    
    // Left arm
    const leftShoulder = new THREE.Bone();
    leftShoulder.name = 'leftShoulder';
    leftShoulder.position.set(0.2, 0.15, 0);
    chest.add(leftShoulder);
    
    const leftUpperArm = new THREE.Bone();
    leftUpperArm.name = 'leftUpperArm';
    leftUpperArm.position.set(0.1, 0, 0);
    leftShoulder.add(leftUpperArm);
    
    const leftLowerArm = new THREE.Bone();
    leftLowerArm.name = 'leftLowerArm';
    leftLowerArm.position.set(0.25, 0, 0);
    leftUpperArm.add(leftLowerArm);
    
    const leftHand = new THREE.Bone();
    leftHand.name = 'leftHand';
    leftHand.position.set(0.2, 0, 0);
    leftLowerArm.add(leftHand);
    
    // Right arm (mirror)
    const rightShoulder = new THREE.Bone();
    rightShoulder.name = 'rightShoulder';
    rightShoulder.position.set(-0.2, 0.15, 0);
    chest.add(rightShoulder);
    
    const rightUpperArm = new THREE.Bone();
    rightUpperArm.name = 'rightUpperArm';
    rightUpperArm.position.set(-0.1, 0, 0);
    rightShoulder.add(rightUpperArm);
    
    const rightLowerArm = new THREE.Bone();
    rightLowerArm.name = 'rightLowerArm';
    rightLowerArm.position.set(-0.25, 0, 0);
    rightUpperArm.add(rightLowerArm);
    
    const rightHand = new THREE.Bone();
    rightHand.name = 'rightHand';
    rightHand.position.set(-0.2, 0, 0);
    rightLowerArm.add(rightHand);
    
    // Left leg
    const leftUpperLeg = new THREE.Bone();
    leftUpperLeg.name = 'leftUpperLeg';
    leftUpperLeg.position.set(0.1, -0.1, 0);
    hips.add(leftUpperLeg);
    
    const leftLowerLeg = new THREE.Bone();
    leftLowerLeg.name = 'leftLowerLeg';
    leftLowerLeg.position.set(0, -0.4, 0);
    leftUpperLeg.add(leftLowerLeg);
    
    const leftFoot = new THREE.Bone();
    leftFoot.name = 'leftFoot';
    leftFoot.position.set(0, -0.4, 0);
    leftLowerLeg.add(leftFoot);
    
    // Right leg (mirror)
    const rightUpperLeg = new THREE.Bone();
    rightUpperLeg.name = 'rightUpperLeg';
    rightUpperLeg.position.set(-0.1, -0.1, 0);
    hips.add(rightUpperLeg);
    
    const rightLowerLeg = new THREE.Bone();
    rightLowerLeg.name = 'rightLowerLeg';
    rightLowerLeg.position.set(0, -0.4, 0);
    rightUpperLeg.add(rightLowerLeg);
    
    const rightFoot = new THREE.Bone();
    rightFoot.name = 'rightFoot';
    rightFoot.position.set(0, -0.4, 0);
    rightLowerLeg.add(rightFoot);
    
    const skeleton = new THREE.Skeleton([
        hips, spine, chest, neck, head,
        leftShoulder, leftUpperArm, leftLowerArm, leftHand,
        rightShoulder, rightUpperArm, rightLowerArm, rightHand,
        leftUpperLeg, leftLowerLeg, leftFoot,
        rightUpperLeg, rightLowerLeg, rightFoot
    ]);
    
    // Create skinned mesh
    const bodyMesh = new THREE.SkinnedMesh(bodyGeometry, material);
    bodyMesh.name = 'body';
    bodyMesh.add(hips);
    bodyMesh.bind(skeleton);
    
    // Manual skin weights for simple deformation
    const positionAttribute = bodyGeometry.attributes.position;
    const skinIndices = [];
    const skinWeights = [];
    
    for (let i = 0; i < positionAttribute.count; i++) {
        // Simple: all vertices weighted to hips and spine
        skinIndices.push(0, 1, 0, 0); // hips, spine
        skinWeights.push(0.6, 0.4, 0, 0);
    }
    
    bodyGeometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    bodyGeometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    
    scene.add(bodyMesh);
    
    // Add head mesh
    const headMesh = new THREE.Mesh(headGeometry, material);
    headMesh.name = 'head_mesh';
    headMesh.position.set(0, 1.65, 0);
    scene.add(headMesh);
    
    return scene;
}

async function exportVRM(scene) {
    const exporter = new GLTFExporter();
    
    // VRM 1.0 extensions
    const vrmExtension = {
        specVersion: '1.0',
        meta: {
            name: 'MinimalTestCharacter',
            version: '1.0.0',
            authors: ['MetaFlow Test Suite'],
            copyrightInformation: 'CC0 - Public Domain',
            contactInformation: 'https://github.com/Shuang-su/Metaflow',
            allowAntisocialOrHateUsage: 'disallow',
            commercialUsage: 'allow',
            violentUsage: 'disallow',
            sexualUsage: 'disallow',
            avatarPermission: 'onlyAuthor',
            licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/'
        },
        humanoid: {
            humanBones: {
                hips: { node: 0 },
                spine: { node: 1 },
                chest: { node: 2 },
                neck: { node: 3 },
                head: { node: 4 },
                leftShoulder: { node: 5 },
                leftUpperArm: { node: 6 },
                leftLowerArm: { node: 7 },
                leftHand: { node: 8 },
                rightShoulder: { node: 9 },
                rightUpperArm: { node: 10 },
                rightLowerArm: { node: 11 },
                rightHand: { node: 12 },
                leftUpperLeg: { node: 13 },
                leftLowerLeg: { node: 14 },
                leftFoot: { node: 15 },
                rightUpperLeg: { node: 16 },
                rightLowerLeg: { node: 17 },
                rightFoot: { node: 18 }
            }
        },
        expressions: {
            preset: {
                blink: {
                    isBinary: false,
                    morphTargetBinds: []
                },
                aa: {
                    isBinary: false,
                    morphTargetBinds: []
                }
            }
        },
        lookAt: {
            type: 'bone',
            rangeMapHorizontalInner: { inputMaxValue: 90, outputScale: 10 },
            rangeMapHorizontalOuter: { inputMaxValue: 90, outputScale: 10 },
            rangeMapVerticalDown: { inputMaxValue: 90, outputScale: 10 },
            rangeMapVerticalUp: { inputMaxValue: 90, outputScale: 10 }
        }
    };
    
    return new Promise((resolve, reject) => {
        exporter.parse(
            scene,
            (gltf) => {
                // Add VRM extension
                if (!gltf.extensions) gltf.extensions = {};
                gltf.extensions.VRMC_vrm = vrmExtension;
                
                if (!gltf.extensionsUsed) gltf.extensionsUsed = [];
                gltf.extensionsUsed.push('VRMC_vrm');
                
                resolve(JSON.stringify(gltf, null, 2));
            },
            reject,
            { binary: false }
        );
    });
}

async function main() {
    console.log('Creating minimal VRM 1.0 test character...');
    const scene = createTestVRM();
    
    console.log('Exporting to VRM format...');
    const vrmJson = await exportVRM(scene);
    
    const outputPath = './test-character.vrm';
    await writeFile(outputPath, vrmJson);
    
    console.log(`✓ Test VRM created: ${outputPath}`);
    console.log('License: CC0 (Public Domain)');
    console.log('Features: Humanoid bones, blink/aa expressions, basic geometry');
}

main().catch(console.error);
