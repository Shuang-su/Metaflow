/**
 * Procedural diorama environments sized to the off-axis figurine framing.
 *
 * Room mode is a shallow CORNER set behind the character so window / shelf /
 * plant read in the default full-body camera — not a huge empty wall with an
 * off-screen prop cube.
 *
 * Units are metres in the same world as the ~0.12m-tall figurine.
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

export function buildEnvironment(parent, mode = 'room', opts = {}) {
    clearEnvironment(parent);
    const root = new THREE.Group();
    root.name = 'EnvironmentRoot';
    parent.add(root);

    const detail = opts.detail || 'standard';
    const rich = detail === 'full';
    const sparse = detail === 'minimal';

    if (mode === 'minimal') buildMinimal(root);
    else buildRoomCorner(root, { rich, sparse });
    return root;
}

export function clearEnvironment(parent) {
    const existing = parent.getObjectByName('EnvironmentRoot');
    if (!existing) return;
    existing.traverse((o) => {
        if (o.geometry) o.geometry.dispose?.();
        if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach(disposeMat);
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
        new THREE.PlaneGeometry(0.42, 0.34),
        new THREE.MeshStandardMaterial({
            map: floorMap,
            roughness: 0.88,
            metalness: 0.02,
            side: THREE.DoubleSide
        })
    );
    floor.name = 'EnvFloor';
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -0.05);
    floor.receiveShadow = true;
    root.add(floor);

    const backdrop = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, 0.38),
        new THREE.MeshStandardMaterial({ color: 0x3a4554, roughness: 0.95, metalness: 0, side: THREE.DoubleSide })
    );
    backdrop.position.set(0, 0.18, -0.24);
    backdrop.receiveShadow = true;
    root.add(backdrop);

    const contact = softContactShadow();
    contact.position.set(0, 0.0012, -0.04);
    root.add(contact);
    root.userData.contactShadow = contact;
    root.userData.floor = floor;
}

/**
 * Shallow room corner sized to ~0.12m figurine full-body framing.
 * Character stands near origin; back wall + left wall meet in a readable corner
 * behind/left of subject; window on BACK wall (face-on); shelf+plant on right rear.
 */
function buildRoomCorner(root, { rich, sparse }) {
    const floorMap = woodFloorTexture();
    floorMap.repeat.set(2, 1.6);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.86, metalness: 0.03 });
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
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.7, metalness: 0.05 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x5c4030, roughness: 0.75, metalness: 0.04 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4a7c59, roughness: 0.7, metalness: 0 });
    const potMat = new THREE.MeshStandardMaterial({ color: 0xc4a484, roughness: 0.65, metalness: 0.08 });

    // Compact footprint — props stay inside typical off-axis portrait frustum
    const W = 0.34;
    const D = 0.28;
    const H = 0.22;
    const zBack = -0.16;
    const zFront = zBack + D;
    const zMid = (zBack + zFront) / 2;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
    floor.name = 'EnvFloor';
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, zMid);
    floor.receiveShadow = true;
    root.add(floor);

    // Back wall (face-on to camera) — primary readable surface
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat);
    back.position.set(0, H / 2, zBack);
    back.receiveShadow = true;
    root.add(back);

    // Left wall — creates corner line with back wall
    const left = new THREE.Mesh(new THREE.PlaneGeometry(D, H), wallCool);
    left.rotation.y = Math.PI / 2;
    left.position.set(-W / 2, H / 2, zMid);
    left.receiveShadow = true;
    root.add(left);

    // Short right return (not full wall) so camera isn't boxed by blank plane
    const right = new THREE.Mesh(new THREE.PlaneGeometry(D * 0.55, H), wallCool);
    right.rotation.y = -Math.PI / 2;
    right.position.set(W / 2, H / 2, zBack + D * 0.28);
    right.receiveShadow = true;
    root.add(right);

    // Baseboards (corner readable)
    const baseH = 0.012;
    root.add(boxMesh(W - 0.004, baseH, 0.006, trimMat, 0, baseH / 2, zBack + 0.004));
    root.add(boxMesh(0.006, baseH, D - 0.01, trimMat, -W / 2 + 0.004, baseH / 2, zMid));

    // WINDOW on BACK wall (face-on) — left of center so not hidden by character
    const winW = 0.07;
    const winH = 0.08;
    const winX = -0.09;
    const winY = 0.145;
    root.add(boxMesh(winW + 0.012, winH + 0.012, 0.006, trimMat, winX, winY, zBack + 0.004));
    const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(winW, winH),
        new THREE.MeshStandardMaterial({
            color: 0xfff6e8,
            emissive: 0xffe2b8,
            emissiveIntensity: rich ? 0.7 : 0.45,
            roughness: 0.4,
            metalness: 0,
            side: THREE.DoubleSide
        })
    );
    pane.name = 'EnvWindowPane';
    pane.position.set(winX, winY, zBack + 0.008);
    root.add(pane);

    // Soft mullion
    root.add(boxMesh(0.004, winH, 0.004, trimMat, winX, winY, zBack + 0.009));
    root.add(boxMesh(winW, 0.004, 0.004, trimMat, winX, winY, zBack + 0.009));

    const windowLight = new THREE.PointLight(0xffe6c8, rich ? 0.4 : 0.28, 0.9, 2);
    windowLight.position.set(winX, winY, zBack + 0.04);
    windowLight.name = 'EnvWindowLight';
    root.add(windowLight);

    if (!sparse) {
        // Small shelf on back wall — RIGHT of character (readable)
        const shelfX = 0.1;
        const shelfY = 0.13;
        root.add(boxMesh(0.07, 0.008, 0.028, woodDark, shelfX, shelfY, zBack + 0.02));
        root.add(boxMesh(0.018, 0.022, 0.014, potMat, shelfX - 0.018, shelfY + 0.015, zBack + 0.022));
        root.add(boxMesh(0.014, 0.028, 0.012, woodDark, shelfX + 0.02, shelfY + 0.018, zBack + 0.02));

        // Compact cabinet LEFT rear corner (small — not a giant cut-off cube)
        root.add(boxMesh(0.055, 0.045, 0.04, woodDark, -0.11, 0.022, zBack + 0.04));

        // Plant RIGHT rear, behind/beside character hip — visible leaf mass
        const plantX = 0.095;
        const plantZ = zBack + 0.07;
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.018, 10), potMat);
        pot.position.set(plantX, 0.009, plantZ);
        pot.castShadow = true;
        pot.name = 'EnvPlantPot';
        root.add(pot);
        const stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0025, 0.003, 0.04, 6),
            new THREE.MeshStandardMaterial({ color: 0x3d5c3a, roughness: 0.8 })
        );
        stem.position.set(plantX, 0.035, plantZ);
        root.add(stem);
        for (const [dx, dy, dz, r] of [
            [0, 0.055, 0, 0.018],
            [-0.012, 0.062, 0.006, 0.014],
            [0.012, 0.06, -0.005, 0.013]
        ]) {
            const leaf = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), leafMat);
            leaf.position.set(plantX + dx, dy, plantZ + dz);
            leaf.castShadow = true;
            leaf.name = 'EnvPlantLeaf';
            root.add(leaf);
        }
    }

    if (rich) {
        const art = new THREE.Mesh(
            new THREE.PlaneGeometry(0.04, 0.03),
            new THREE.MeshStandardMaterial({ color: 0x7a9eb8, roughness: 0.85 })
        );
        art.position.set(0.02, 0.175, zBack + 0.006);
        root.add(art);
        root.add(boxMesh(0.048, 0.036, 0.005, trimMat, 0.02, 0.175, zBack + 0.003));
    }

    const contact = softContactShadow();
    contact.position.set(0, 0.0014, -0.03);
    root.add(contact);
    root.userData.contactShadow = contact;
    root.userData.floor = floor;
    root.userData.windowLight = windowLight;
    root.userData.propMarkers = {
        window: { x: winX, y: winY, z: zBack + 0.008 },
        shelf: { x: 0.1, y: 0.13, z: zBack + 0.02 },
        plant: { x: 0.095, y: 0.055, z: zBack + 0.07 }
    };
}

function softContactShadow() {
    const shadowGeo = new THREE.CircleGeometry(0.048, 28);
    const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.22,
        depthWrite: false
    });
    const contact = new THREE.Mesh(shadowGeo, shadowMat);
    contact.name = 'EnvContactShadow';
    contact.rotation.x = -Math.PI / 2;
    contact.visible = true;
    return contact;
}

export function sceneAtmosphere(mode) {
    if (mode === 'room') {
        return {
            background: 0x1c2228,
            fogColor: 0x2a323c,
            fogNear: 2.0,
            fogFar: 5.0,
            ambient: 0xfff1e4,
            ambientIntensity: 0.4,
            hemiSky: 0xf0e6d8,
            hemiGround: 0x7a6248
        };
    }
    return {
        background: null,
        fogColor: 0x1a222c,
        fogNear: 1.4,
        fogFar: 3.8,
        ambient: 0xfff4ea,
        ambientIntensity: 0.45,
        hemiSky: 0xdde7ff,
        hemiGround: 0x8a6a45
    };
}
