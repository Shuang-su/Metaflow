/**
 * Generate a minimal valid VRM 1.0 model for testing
 * CC0 / Public Domain - simple geometric humanoid with expressions
 */

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import fs from 'fs';

function createMinimalHumanoid() {
    const root = new THREE.Group();
    root.name = 'MinimalAvatar';
    
    // Materials
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffdbac });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x4a3728 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
    
    // Hips (root bone)
    const hips = new THREE.Bone();
    hips.name = 'Hips';
    hips.position.set(0, 1.0, 0);
    root.add(hips);
    
    // Spine
    const spine = new THREE.Bone();
    spine.name = 'Spine';
    spine.position.set(0, 0.1, 0);
    hips.add(spine);
    
    // Chest
    const chest = new THREE.Bone();
    chest.name = 'Chest';
    chest.position.set(0, 0.15, 0);
    spine.add(chest);
    
    // Neck
    const neck = new THREE.Bone();
    neck.name = 'Neck';
    neck.position.set(0, 0.15, 0);
    chest.add(neck);
    
    // Head
    const head = new THREE.Bone();
    head.name = 'Head';
    head.position.set(0, 0.1, 0);
    neck.add(head);
    
    // Left leg
    const leftUpperLeg = new THREE.Bone();
    leftUpperLeg.name = 'LeftUpperLeg';
    leftUpperLeg.position.set(0.1, 0, 0);
    hips.add(leftUpperLeg);
    
    const leftLowerLeg = new THREE.Bone();
    leftLowerLeg.name = 'LeftLowerLeg';
    leftLowerLeg.position.set(0, -0.4, 0);
    leftUpperLeg.add(leftLowerLeg);
    
    const leftFoot = new THREE.Bone();
    leftFoot.name = 'LeftFoot';
    leftFoot.position.set(0, -0.4, 0);
    leftLowerLeg.add(leftFoot);
    
    // Right leg
    const rightUpperLeg = new THREE.Bone();
    rightUpperLeg.name = 'RightUpperLeg';
    rightUpperLeg.position.set(-0.1, 0, 0);
    hips.add(rightUpperLeg);
    
    const rightLowerLeg = new THREE.Bone();
    rightLowerLeg.name = 'RightLowerLeg';
    rightLowerLeg.position.set(0, -0.4, 0);
    rightUpperLeg.add(rightLowerLeg);
    
    const rightFoot = new THREE.Bone();
    rightFoot.name = 'RightFoot';
    rightFoot.position.set(0, -0.4, 0);
    rightLowerLeg.add(rightFoot);
    
    // Left arm
    const leftUpperArm = new THREE.Bone();
    leftUpperArm.name = 'LeftUpperArm';
    leftUpperArm.position.set(0.15, 0.1, 0);
    leftUpperArm.rotation.z = Math.PI / 6;
    chest.add(leftUpperArm);
    
    const leftLowerArm = new THREE.Bone();
    leftLowerArm.name = 'LeftLowerArm';
    leftLowerArm.position.set(0, -0.25, 0);
    leftUpperArm.add(leftLowerArm);
    
    const leftHand = new THREE.Bone();
    leftHand.name = 'LeftHand';
    leftHand.position.set(0, -0.2, 0);
    leftLowerArm.add(leftHand);
    
    // Right arm
    const rightUpperArm = new THREE.Bone();
    rightUpperArm.name = 'RightUpperArm';
    rightUpperArm.position.set(-0.15, 0.1, 0);
    rightUpperArm.rotation.z = -Math.PI / 6;
    chest.add(rightUpperArm);
    
    const rightLowerArm = new THREE.Bone();
    rightLowerArm.name = 'RightLowerArm';
    rightLowerArm.position.set(0, -0.25, 0);
    rightUpperArm.add(rightLowerArm);
    
    const rightHand = new THREE.Bone();
    rightHand.name = 'RightHand';
    rightHand.position.set(0, -0.2, 0);
    rightLowerArm.add(rightHand);
    
    // Eyes (for lookAt)
    const leftEye = new THREE.Bone();
    leftEye.name = 'LeftEye';
    leftEye.position.set(0.04, 0.15, 0.08);
    head.add(leftEye);
    
    const rightEye = new THREE.Bone();
    rightEye.name = 'RightEye';
    rightEye.position.set(-0.04, 0.15, 0.08);
    head.add(rightEye);
    
    // Create skeleton
    const bones = [
        hips, spine, chest, neck, head,
        leftUpperLeg, leftLowerLeg, leftFoot,
        rightUpperLeg, rightLowerLeg, rightFoot,
        leftUpperArm, leftLowerArm, leftHand,
        rightUpperArm, rightLowerArm, rightHand,
        leftEye, rightEye
    ];
    
    const skeleton = new THREE.Skeleton(bones);
    
    // Create body geometry
    const bodyGeo = new THREE.CapsuleGeometry(0.15, 0.6, 8, 16);
    const bodyMesh = new THREE.SkinnedMesh(bodyGeo, skinMat);
    bodyMesh.name = 'Body';
    bodyMesh.add(hips);
    bodyMesh.bind(skeleton);
    root.add(bodyMesh);
    
    // Create head geometry with morph targets for expressions
    const headGeo = new THREE.SphereGeometry(0.12, 16, 16);
    
    // Blink morph (close eyes)
    const blinkGeo = headGeo.clone();
    const blinkPos = blinkGeo.attributes.position;
    for (let i = 0; i < blinkPos.count; i++) {
        const y = blinkPos.getY(i);
        if (y > 0.05 && y < 0.08) { // Eye area
            blinkPos.setY(i, y * 0.5); // Squash vertically
        }
    }
    
    // Mouth open morph (aa)
    const mouthGeo = headGeo.clone();
    const mouthPos = mouthGeo.attributes.position;
    for (let i = 0; i < mouthPos.count; i++) {
        const y = mouthPos.getY(i);
        const z = mouthPos.getZ(i);
        if (y < -0.03 && y > -0.08 && z > 0.08) { // Mouth area
            mouthPos.setY(i, y * 1.5); // Open mouth
        }
    }
    
    headGeo.morphAttributes.position = [
        blinkGeo.attributes.position,
        mouthGeo.attributes.position
    ];
    
    const headMesh = new THREE.SkinnedMesh(headGeo, skinMat);
    headMesh.name = 'Head';
    headMesh.morphTargetInfluences = [0, 0];
    headMesh.morphTargetDictionary = { blink: 0, aa: 1 };
    headMesh.add(hips);
    headMesh.bind(skeleton);
    root.add(headMesh);
    
    // Add simple hair
    const hairGeo = new THREE.SphereGeometry(0.13, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const hairMesh = new THREE.Mesh(hairGeo, hairMat);
    hairMesh.position.set(0, 0.15, 0);
    head.add(hairMesh);
    
    // Add eyes
    const eyeGeo = new THREE.SphereGeometry(0.02, 8, 8);
    const leftEyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
    leftEyeMesh.position.copy(leftEye.position);
    head.add(leftEyeMesh);
    
    const rightEyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
    rightEyeMesh.position.copy(rightEye.position);
    head.add(rightEyeMesh);
    
    return { root, bones, headMesh };
}

async function exportVRM() {
    const { root, bones, headMesh } = createMinimalHumanoid();
    
    const exporter = new GLTFExporter();
    
    const gltf = await new Promise((resolve, reject) => {
        exporter.parse(
            root,
            (result) => resolve(result),
            (error) => reject(error),
            {
                binary: true,
                animations: [],
                includeCustomExtensions: true
            }
        );
    });
    
    // Add VRM 1.0 extension manually
    const json = JSON.parse(new TextDecoder().decode(gltf));
    
    json.extensions = json.extensions || {};
    json.extensions.VRMC_vrm = {
        specVersion: '1.0',
        meta: {
            name: 'Minimal Avatar',
            version: '1.0',
            authors: ['Metaflow Experiments'],
            licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
            avatarPermission: 'onlyAuthor'
        },
        humanoid: {
            humanBones: {
                hips: { node: findNodeIndex(json, 'Hips') },
                spine: { node: findNodeIndex(json, 'Spine') },
                chest: { node: findNodeIndex(json, 'Chest') },
                neck: { node: findNodeIndex(json, 'Neck') },
                head: { node: findNodeIndex(json, 'Head') },
                leftUpperLeg: { node: findNodeIndex(json, 'LeftUpperLeg') },
                leftLowerLeg: { node: findNodeIndex(json, 'LeftLowerLeg') },
                leftFoot: { node: findNodeIndex(json, 'LeftFoot') },
                rightUpperLeg: { node: findNodeIndex(json, 'RightUpperLeg') },
                rightLowerLeg: { node: findNodeIndex(json, 'RightLowerLeg') },
                rightFoot: { node: findNodeIndex(json, 'RightFoot') },
                leftUpperArm: { node: findNodeIndex(json, 'LeftUpperArm') },
                leftLowerArm: { node: findNodeIndex(json, 'LeftLowerArm') },
                leftHand: { node: findNodeIndex(json, 'LeftHand') },
                rightUpperArm: { node: findNodeIndex(json, 'RightUpperArm') },
                rightLowerArm: { node: findNodeIndex(json, 'RightLowerArm') },
                rightHand: { node: findNodeIndex(json, 'RightHand') },
                leftEye: { node: findNodeIndex(json, 'LeftEye') },
                rightEye: { node: findNodeIndex(json, 'RightEye') }
            }
        },
        expressions: {
            preset: {
                blink: {
                    morphTargetBinds: [
                        { node: findNodeIndex(json, 'Head'), index: 0, weight: 1.0 }
                    ]
                },
                aa: {
                    morphTargetBinds: [
                        { node: findNodeIndex(json, 'Head'), index: 1, weight: 1.0 }
                    ]
                }
            }
        },
        lookAt: {
            type: 'bone',
            offsetFromHeadBone: [0, 0.06, 0.08],
            rangeMapHorizontalInner: { inputMaxValue: 90, outputScale: 1 },
            rangeMapHorizontalOuter: { inputMaxValue: 90, outputScale: 1 },
            rangeMapVerticalDown: { inputMaxValue: 90, outputScale: 1 },
            rangeMapVerticalUp: { inputMaxValue: 90, outputScale: 1 }
        }
    };
    
    json.extensionsUsed = json.extensionsUsed || [];
    json.extensionsUsed.push('VRMC_vrm');
    
    // Write to file
    const buffer = new TextEncoder().encode(JSON.stringify(json));
    fs.writeFileSync('./models/minimal-avatar.vrm', buffer);
    
    console.log('Generated minimal-avatar.vrm');
}

function findNodeIndex(gltf, name) {
    return gltf.nodes.findIndex(node => node.name === name);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    exportVRM().catch(console.error);
}

export { createMinimalHumanoid, exportVRM };
