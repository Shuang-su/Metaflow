/**
 * Procedural diorama environments for the desktop figurine.
 * All geometry is authored here — no remote assets / Persona branding.
 *
 * Modes:
 *   room    — compact indoor studio (walls, window light, shelf, plant, cabinet)
 *   minimal — floor + soft backdrop only
 *
 * Parent under deskRoot so tilt/projection stays consistent with calibration.
 */

import * as THREE from 'three';

export const SCENE_MODES = [
    { id: 'room', label: '室内小景（推荐）' },
    { id: 'minimal', label: '极简地板' }
];

function makeCanvasTexture(draw, size = 256) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    draw(ctx, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

function woodFloorTexture() {
    return makeCanvasTexture((ctx, s) => {
        const g = ctx.createLinearGradient(0, 0, s, s);
        g.addColorStop(0, '#d4b896');
        g.addColorStop(0.45, '#c4a07a');
        g.addColorStop(1, '#a67c52');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 28; i++) {
            ctx.strokeStyle = `rgba(70,45,25,${0.04 + (i % 4) * 0.012})`;
            ctx.beginPath();
            ctx.moveTo(0, i * 10 + 3);
            ctx.lineTo(s, i * 10 - 12);
            ctx.stroke();
        }
        // Plank seams
        ctx.strokeStyle = 'rgba(50,30,15,0.12)';
        for (let x = 0; x < s; x += 42) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, s);
            ctx.stroke();
        }
    });
}

function plasterTexture(base = '#e8e0d4', accent = '#d4cbbd') {
    return makeCanvasTexture((ctx, s) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 120; i++) {
            ctx.fillStyle = accent;
            ctx.globalAlpha = 0.08 + Math.random() * 0.1;
            ctx.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 6, 2 + Math.random() * 4);
        }
        ctx.globalAlpha = 1;
    }, 128);
}

function boxMesh(w, h, d, material, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
}

/**
 * @param {THREE.Group} parent deskRoot
 * @param {'room'|'minimal'} mode
 * @param {{ detail?: 'full'|'standard'|'minimal' }} opts
 */
export function buildEnvironment(parent, mode = 'room', opts = {}) {
    clearEnvironment(parent);
    const root = new THREE.Group();
    root.name = 'EnvironmentRoot';
    parent.add(root);

    const detail = opts.detail || 'standard';
    const rich = detail === 'full';
    const sparse = detail === 'minimal';

    if (mode === 'minimal') {
        buildMinimal(root);
    } else {
        buildRoom(root, { rich, sparse });
    }
    return root;
}

export function clearEnvironment(parent) {
    const existing = parent.getObjectByName('EnvironmentRoot');
    if (!existing) return;
    existing.traverse((o) => {
        if (o.geometry) o.geometry.dispose?.();
        if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach((m) => disposeMat(m));
            else disposeMat(o.material);
        }
    });
    parent.remove(existing);
}

function disposeMat(m) {
    m.map?.dispose?.();
    m.dispose?.();
}

function buildMinimal(root) {
    const floorMap = woodFloorTexture();
    floorMap.repeat.set(2, 2);
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.4),
        new THREE.MeshStandardMaterial({
            map: floorMap,
            roughness: 0.88,
            metalness: 0.02,
            side: THREE.DoubleSide
        })
    );
    floor.name = 'EnvFloor';
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -0.06);
    floor.receiveShadow = true;
    root.add(floor);

    const backdrop = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, 0.45),
        new THREE.MeshStandardMaterial({
            color: 0x3a4554,
            roughness: 0.95,
            metalness: 0,
            side: THREE.DoubleSide
        })
    );
    backdrop.position.set(0, 0.2, -0.28);
    backdrop.receiveShadow = true;
    root.add(backdrop);

    const contact = softContactShadow();
    contact.position.set(0, 0.0012, -0.04);
    root.add(contact);
    root.userData.contactShadow = contact;
    root.userData.floor = floor;
}

function buildRoom(root, { rich, sparse }) {
    const floorMap = woodFloorTexture();
    floorMap.repeat.set(2.4, 2);
    const floorMat = new THREE.MeshStandardMaterial({
        map: floorMap,
        roughness: 0.86,
        metalness: 0.03
    });
    const wallMat = new THREE.MeshStandardMaterial({
        map: plasterTexture('#efe8dc', '#d9d0c2'),
        roughness: 0.92,
        metalness: 0
    });
    const wallCool = new THREE.MeshStandardMaterial({
        map: plasterTexture('#e4ebe8', '#c8d4d0'),
        roughness: 0.9,
        metalness: 0
    });
    const trimMat = new THREE.MeshStandardMaterial({
        color: 0x8b7355,
        roughness: 0.7,
        metalness: 0.05
    });
    const woodDark = new THREE.MeshStandardMaterial({
        color: 0x5c4030,
        roughness: 0.75,
        metalness: 0.04
    });
    const leafMat = new THREE.MeshStandardMaterial({
        color: 0x4a7c59,
        roughness: 0.7,
        metalness: 0
    });
    const potMat = new THREE.MeshStandardMaterial({
        color: 0xc4a484,
        roughness: 0.65,
        metalness: 0.08
    });

    // Sized so walls/props stay in the figurine camera frustum
    const W = 0.5;
    const D = 0.4;
    const H = 0.32;
    const floorY = 0;
    const zCenter = -0.04;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
    floor.name = 'EnvFloor';
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, floorY, zCenter);
    floor.receiveShadow = true;
    root.add(floor);

    // Back wall
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat);
    back.position.set(0, H / 2, zCenter - D / 2);
    back.receiveShadow = true;
    root.add(back);

    // Side walls
    const left = new THREE.Mesh(new THREE.PlaneGeometry(D, H), wallCool);
    left.rotation.y = Math.PI / 2;
    left.position.set(-W / 2, H / 2, zCenter);
    left.receiveShadow = true;
    root.add(left);

    const right = new THREE.Mesh(new THREE.PlaneGeometry(D, H), wallCool);
    right.rotation.y = -Math.PI / 2;
    right.position.set(W / 2, H / 2, zCenter);
    right.receiveShadow = true;
    root.add(right);

    // Ceiling strip (shallow) for enclosure cue
    if (!sparse) {
        const ceil = new THREE.Mesh(
            new THREE.PlaneGeometry(W, D * 0.85),
            new THREE.MeshStandardMaterial({ color: 0xf2ebe2, roughness: 0.95, side: THREE.DoubleSide })
        );
        ceil.rotation.x = Math.PI / 2;
        ceil.position.set(0, H - 0.01, zCenter + 0.02);
        root.add(ceil);
    }

    // Baseboard trim
    const baseH = 0.018;
    root.add(boxMesh(W - 0.01, baseH, 0.01, trimMat, 0, baseH / 2, zCenter - D / 2 + 0.006));
    root.add(boxMesh(0.01, baseH, D - 0.02, trimMat, -W / 2 + 0.006, baseH / 2, zCenter));
    root.add(boxMesh(0.01, baseH, D - 0.02, trimMat, W / 2 - 0.006, baseH / 2, zCenter));

    // Window on left wall — emissive pane as keylight cue
    const winW = 0.14;
    const winH = 0.16;
    const winFrame = boxMesh(0.01, winH + 0.02, winW + 0.02, trimMat, -W / 2 + 0.012, 0.2, zCenter - 0.02);
    root.add(winFrame);
    const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(winW, winH),
        new THREE.MeshStandardMaterial({
            color: 0xfff6e8,
            emissive: 0xffe2b8,
            emissiveIntensity: rich ? 0.85 : 0.55,
            roughness: 0.35,
            metalness: 0,
            side: THREE.DoubleSide
        })
    );
    pane.rotation.y = Math.PI / 2;
    pane.position.set(-W / 2 + 0.014, 0.2, zCenter - 0.02);
    root.add(pane);

    // Window light (local to environment)
    const windowLight = new THREE.PointLight(0xffe6c8, rich ? 0.55 : 0.35, 1.2, 2);
    windowLight.position.set(-W / 2 + 0.08, 0.22, zCenter - 0.02);
    windowLight.name = 'EnvWindowLight';
    root.add(windowLight);

    if (!sparse) {
        // Shelf on right — pulled into view
        const shelf = boxMesh(0.11, 0.012, 0.055, woodDark, 0.16, 0.2, zCenter - 0.06);
        root.add(shelf);
        root.add(boxMesh(0.032, 0.038, 0.024, potMat, 0.13, 0.226, zCenter - 0.055));
        root.add(boxMesh(0.026, 0.048, 0.02, woodDark, 0.18, 0.231, zCenter - 0.05));

        // Low cabinet left-rear (readable mass)
        root.add(boxMesh(0.11, 0.08, 0.07, woodDark, -0.15, 0.04, zCenter - 0.1));

        // Plant right-front (clear of silhouette)
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.03, 12), potMat);
        pot.position.set(0.14, 0.015, zCenter + 0.1);
        pot.castShadow = true;
        root.add(pot);
        const stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.004, 0.005, 0.07, 8),
            new THREE.MeshStandardMaterial({ color: 0x3d5c3a, roughness: 0.8 })
        );
        stem.position.set(0.14, 0.06, zCenter + 0.1);
        root.add(stem);
        for (const [dx, dy, zOff, r] of [
            [0.14, 0.1, 0.1, 0.03],
            [0.12, 0.11, 0.11, 0.024],
            [0.16, 0.105, 0.09, 0.022]
        ]) {
            const leaf = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), leafMat);
            leaf.position.set(dx, dy, zCenter + zOff);
            leaf.castShadow = true;
            root.add(leaf);
        }
    }

    if (rich) {
        // Picture frame on back wall
        const frame = boxMesh(0.08, 0.06, 0.008, trimMat, -0.06, 0.24, zCenter - D / 2 + 0.006);
        root.add(frame);
        const art = new THREE.Mesh(
            new THREE.PlaneGeometry(0.065, 0.045),
            new THREE.MeshStandardMaterial({ color: 0x7a9eb8, roughness: 0.85 })
        );
        art.position.set(-0.06, 0.24, zCenter - D / 2 + 0.011);
        root.add(art);

        // Rug under character zone
        const rug = new THREE.Mesh(
            new THREE.CircleGeometry(0.09, 28),
            new THREE.MeshStandardMaterial({ color: 0x8b5a4a, roughness: 0.95, metalness: 0 })
        );
        rug.rotation.x = -Math.PI / 2;
        rug.position.set(0, 0.001, zCenter + 0.02);
        rug.receiveShadow = true;
        root.add(rug);
    }

    const contact = softContactShadow();
    contact.position.set(0, 0.0015, zCenter + 0.02);
    root.add(contact);
    root.userData.contactShadow = contact;
    root.userData.floor = floor;
    root.userData.windowLight = windowLight;
}

function softContactShadow() {
    const shadowGeo = new THREE.CircleGeometry(0.055, 28);
    const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.32,
        depthWrite: false
    });
    const contact = new THREE.Mesh(shadowGeo, shadowMat);
    contact.name = 'EnvContactShadow';
    contact.rotation.x = -Math.PI / 2;
    contact.visible = true;
    return contact;
}

/** Background / fog palette per mode */
export function sceneAtmosphere(mode) {
    if (mode === 'room') {
        return {
            background: 0x1c2228,
            fogColor: 0x2a323c,
            fogNear: 1.8,
            fogFar: 4.5,
            ambient: 0xfff1e4,
            ambientIntensity: 0.38,
            hemiSky: 0xf0e6d8,
            hemiGround: 0x7a6248
        };
    }
    return {
        background: null, // caller keeps gradient texture
        fogColor: 0x1a222c,
        fogNear: 1.4,
        fogFar: 3.8,
        ambient: 0xfff4ea,
        ambientIntensity: 0.45,
        hemiSky: 0xdde7ff,
        hemiGround: 0x8a6a45
    };
}
