import * as THREE from 'three';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRMExpressionMorphTargetBind } from '@pixiv/three-vrm';
import { screenFrustum, inspectVrm } from './geometry.mjs';
import { readModel } from './model-source.mjs';

const clamp = THREE.MathUtils.clamp;
const REST_ARM = 1.12;
const number = (value, fallback, min, max) => clamp(Number.isFinite(Number(value)) ? Number(value) : fallback, min, max);

function initialPose(vrm) {
  const get = (name) => vrm.humanoid.getNormalizedBoneNode(name);
  // rotateVRM0 turns the scene, but its normalized bone-local axes still differ
  // from VRM1 by a half-turn about Y: local X/Z rotation signs are opposite.
  const axis = vrm.meta?.metaVersion === '0' ? -1 : 1;
  if (get('leftUpperArm')) get('leftUpperArm').rotation.z = -REST_ARM * axis;
  if (get('rightUpperArm')) get('rightUpperArm').rotation.z = REST_ARM * axis;
  if (get('leftLowerArm')) get('leftLowerArm').rotation.y = -.12;
  if (get('rightLowerArm')) get('rightLowerArm').rotation.y = .12;
  vrm.update(0);
}

function bindMissingVroidExpressions(vrm) {
  if (vrm.meta?.metaVersion !== '0' || !vrm.expressionManager) return [];
  const targets = {
    neutral: 'Fcl_ALL_Neutral', happy: 'Fcl_ALL_Joy', angry: 'Fcl_ALL_Angry', sad: 'Fcl_ALL_Sorrow', relaxed: 'Fcl_ALL_Fun',
    blink: 'Fcl_EYE_Close', blinkLeft: 'Fcl_EYE_Close_L', blinkRight: 'Fcl_EYE_Close_R',
    aa: 'Fcl_MTH_A', ih: 'Fcl_MTH_I', ou: 'Fcl_MTH_U', ee: 'Fcl_MTH_E', oh: 'Fcl_MTH_O',
  };
  const repaired = [];
  for (const [name, target] of Object.entries(targets)) {
    const expression = vrm.expressionManager.getExpression(name);
    if (!expression || expression.binds.length) continue;
    // Repair only an EMPTY existing slot and an exact, explicitly named
    // VRoid target. Never infer from a mesh name or replace authored binds.
    const seen = new Set(); let primitives = 0;
    vrm.scene.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.morphTargetInfluences || seen.has(mesh.morphTargetInfluences)) return;
      const index = mesh.morphTargetDictionary?.[target];
      if (!Number.isInteger(index) || !mesh.geometry.morphAttributes.position?.[index]) return;
      expression.addBind(new VRMExpressionMorphTargetBind({ primitives: [mesh], index, weight: 1 }));
      seen.add(mesh.morphTargetInfluences); primitives++;
    });
    if (primitives) repaired.push({ expression: name, target, primitives });
  }
  return repaired;
}

// Bounds are measured once in the initial pose, before any display scaling.
// Re-measuring an animated pose would make the avatar resize as it waves.
function fitReferenceAvatar(calibration, bounds, height) {
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = height / size.y;
  calibration.scale.setScalar(scale);
  calibration.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
}

// Perspective fitting is only used by the neutral asset inspector. The
// calibrated tabletop view always retains its physical off-axis projection.
function inspectionCameraFit(bounds, aspect, yaw, pitch, zoom) {
  const height = .17;
  const size = bounds?.getSize(new THREE.Vector3()) || new THREE.Vector3(.08, .17, .04);
  const half = size.multiplyScalar(height / size.y / 2);
  const target = new THREE.Vector3(0, height / 2, 0);
  const direction = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const up = new THREE.Vector3().crossVectors(direction, right);
  const tanVertical = Math.tan(THREE.MathUtils.degToRad(32) / 2), tanHorizontal = tanVertical * aspect;
  let distance = 0;
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const corner = new THREE.Vector3(half.x * x, half.y * y, half.z * z), depth = corner.dot(direction);
    distance = Math.max(distance, depth + Math.abs(corner.dot(right)) / tanHorizontal, depth + Math.abs(corner.dot(up)) / tanVertical);
  }
  distance = Math.max(.12, distance * 1.2 / zoom);
  return { target, position: target.clone().addScaledVector(direction, distance), distance, height };
}

function captureSpringDimensions(vrm) {
  const manager = vrm.springBoneManager;
  if (!manager) return null;
  const joints = [...manager.joints].map((joint) => Object.freeze({
    joint,
    hitRadius: joint.settings.hitRadius,
    stiffness: joint.settings.stiffness,
    gravityPower: joint.settings.gravityPower,
    gravityDir: Object.freeze(joint.settings.gravityDir.toArray()),
  }));
  const colliders = manager.colliders.filter((collider) => Number.isFinite(collider.shape.radius)).map((collider) => Object.freeze({
    shape: collider.shape, radius: collider.shape.radius,
  }));
  return Object.freeze({ joints: Object.freeze(joints), colliders: Object.freeze(colliders) });
}

function applySpringDimensions(profile, scale, rotation) {
  if (!profile) return;
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('Invalid uniform avatar scale');
  for (const original of profile.joints) {
    const settings = original.joint.settings;
    // three-vrm 3.5.5 adds both forces to a WORLD-space tail position. These
    // are length contributions, while dragForce is dimensionless.
    settings.hitRadius = original.hitRadius * scale;
    settings.stiffness = original.stiffness * scale;
    settings.gravityPower = original.gravityPower * scale;
    settings.gravityDir.fromArray(original.gravityDir).applyQuaternion(rotation);
  }
  for (const original of profile.colliders) original.shape.radius = original.radius * scale;
  // Collider offsets and capsule tail endpoints are already transformed by
  // colliderMatrix. Scaling those again would apply the display scale twice.
}

function disposeSceneResources(roots, extras = []) {
  const geometries = new Set(), materials = new Set(), skeletons = new Set();
  const textures = new Set(), images = new Set();
  const collectImage = (image) => {
    if (Array.isArray(image)) { image.forEach(collectImage); return; }
    if (image && typeof image.close === 'function') images.add(image);
  };
  const collectTexture = (value) => {
    if (Array.isArray(value)) { value.forEach(collectTexture); return; }
    if (value?.isTexture) { textures.add(value); collectImage(value.source?.data); collectImage(value.image); }
    else collectImage(value);
  };
  for (const root of new Set(roots.filter(Boolean))) {
    root.removeFromParent();
    root.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.skeleton) skeletons.add(object.skeleton);
      for (const material of [].concat(object.material || [])) materials.add(material);
    });
  }
  for (const material of materials) {
    for (const value of Object.values(material)) collectTexture(value);
    for (const uniform of Object.values(material.uniforms || {})) collectTexture(uniform?.value);
  }
  extras.forEach(collectTexture);
  geometries.forEach((geometry) => geometry.dispose());
  skeletons.forEach((skeleton) => skeleton.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
  for (const image of images) { try { image.close(); } catch {} }
}

function disposeGltf(gltf) {
  const meta = gltf.userData?.vrm?.meta || gltf.userData?.vrmMeta || {};
  disposeSceneResources(gltf.scenes || [gltf.scene], [meta.thumbnailImage, meta.texture]);
}

function woodTexture(wood) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  let seed = 1987;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const walnut = wood === 'walnut';
  const colors = walnut ? ['#75543c', '#6a4935', '#805d43', '#70503a'] : ['#b99163', '#c29b6e', '#b68e60', '#c5a075'];
  for (let plank = 0; plank < 4; plank++) {
    const x = plank * 128;
    ctx.fillStyle = colors[plank]; ctx.fillRect(x, 0, 128, 512);
    const sheen = ctx.createLinearGradient(x, 0, x + 128, 0);
    sheen.addColorStop(0, 'rgba(25,17,10,.035)'); sheen.addColorStop(.48, 'rgba(255,238,200,.04)'); sheen.addColorStop(1, 'rgba(25,17,10,.065)');
    ctx.fillStyle = sheen; ctx.fillRect(x, 0, 128, 512);
    for (let strand = 0; strand < 270; strand++) {
      const origin = x + random() * 128, phase = random() * Math.PI * 2;
      ctx.strokeStyle = random() > .25 ? `rgba(52,31,17,${.025 + random() * .075})` : `rgba(255,237,201,${.035 + random() * .07})`;
      ctx.lineWidth = .25 + random() * .55; ctx.beginPath();
      for (let y = 0; y <= 512; y += 8) {
        const bend = Math.sin(y / 512 * Math.PI * 2 + phase) * (1.2 + Math.sin(origin * .04));
        const xx = origin + bend + Math.sin(y / 512 * Math.PI * 4 + phase) * .45;
        if (!y) ctx.moveTo(xx, y); else ctx.lineTo(xx, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = walnut ? 'rgba(24,16,12,.17)' : 'rgba(80,53,27,.13)'; ctx.fillRect(x, 0, .65, 512);
    ctx.fillStyle = 'rgba(255,238,211,.1)'; ctx.fillRect(x + 1, 0, .5, 512);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function contactTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(25,30,24,.63)');
  gradient.addColorStop(.28, 'rgba(25,30,24,.38)');
  gradient.addColorStop(.63, 'rgba(25,30,24,.11)');
  gradient.addColorStop(1, 'rgba(25,30,24,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Physical coordinate contract: the visible screen is z=0, +x right, +y up,
 * +z towards the observer. All distances are metres. Positive floorOffset
 * means the screen's bottom edge is above the level desk; positive avatarDepth
 * moves the feet away from the observer into the room. No CSS perspective or
 * lookAt is applied to the display camera.
 */
export function createTabletopRenderer({ canvas, getSettings, onLoad = () => {}, onAvatar = () => {}, onMetrics = () => {} }) {
  if (!canvas || typeof getSettings !== 'function') throw new TypeError('A canvas and getSettings() are required.');
  // Let a genuine WebGL construction failure reach the app's visible fallback.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xdce1d8);
  const camera = new THREE.PerspectiveCamera(30, 1, .008, 4);
  const desk = new THREE.Group(); desk.name = 'Level tabletop'; scene.add(desk);
  const avatarMount = new THREE.Group(); avatarMount.name = 'Anchored avatar'; desk.add(avatarMount);
  const gazeTarget = new THREE.Object3D(); scene.add(gazeTarget);
  const eventAbort = new AbortController();
  const state = {
    disposed: false, paused: false, graphicsLost: false, raf: 0, lastTime: performance.now(), time: 0,
    width: .262, height: .1965, pixels: { width: 1, height: 1 }, eye: { x: 0, y: .025, z: .55 },
    mode: 'manual', inspect: false, settings: null, layoutKey: '', fitKey: '',
    vrm: null, gltf: null, calibration: null, bounds: null, springProfile: null, springKey: '', expressionRepairs: [], avatarHeight: .16, name: '', credit: '',
    loadGeneration: 0, loadAbort: null, loading: false, waveUntil: 0, speaking: false,
    blinkStart: -1, nextBlink: 2.8, metricsTime: 0, metricsFrames: 0, fps: 0, roomDepth: .24,
  };
  const emit = (callback, data) => { try { callback(data); } catch (error) { console.error('Tabletop callback failed', error); } };
  const settings = () => {
    const value = getSettings() || {};
    return {
      width: number(value.width, .262, .05, 1.2), tilt: number(value.tilt, 65, 20, 90),
      eye: { x: number(value.eye?.x, 0, -.4, .4), y: number(value.eye?.y, .025, -.45, .5), z: number(value.eye?.z, .55, .18, 1.8) },
      mode: ['manual', 'camera', 'auto'].includes(value.mode) ? value.mode : 'manual',
      avatarHeight: value.avatarHeight == null ? null : number(value.avatarHeight, .16, .04, .45),
      floorOffset: number(value.floorOffset, .008, -.06, .4), avatarDepth: number(value.avatarDepth, .04, -.04, .6),
      roomDepth: number(value.roomDepth, .24, .08, 1), gaze: value.gaze !== false, animate: value.animate !== false,
      light: number(value.light, 1, .25, 2.5), wood: value.wood === 'walnut' ? 'walnut' : 'oak', grid: value.grid === true,
      inspect: value.inspect === true, inspectYaw: number(value.inspectYaw, 0, -Math.PI, Math.PI),
      inspectPitch: number(value.inspectPitch, .08, 0, .65), inspectZoom: number(value.inspectZoom, 1, .5, 1.8),
    };
  };

  // All light positions and targets share the level desk's gravity frame.
  const hemisphere = new THREE.HemisphereLight(0xfff9ed, 0x7d8d77, 1.45);
  hemisphere.position.set(0, 100, 0); desk.add(hemisphere);
  const key = new THREE.DirectionalLight(0xfff1db, 2.35);
  key.position.set(-.32, .55, .35); key.target.position.set(0, .08, -.08);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -.45, right: .45, top: .6, bottom: -.4, near: .025, far: 2 });
  key.shadow.bias = -.00012; key.shadow.normalBias = .0003; key.shadow.radius = 3;
  desk.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xdce8df, .42);
  fill.position.set(.4, .22, .12); fill.target.position.set(0, .08, -.1); desk.add(fill, fill.target);

  const woods = { oak: woodTexture('oak'), walnut: woodTexture('walnut') };
  const floorMaterial = new THREE.MeshStandardMaterial({ map: woods.oak, roughness: .83, metalness: 0 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), floorMaterial);
  floor.name = 'Physical level floor'; floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; desk.add(floor);
  const wallMaterial = (color) => new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wallMaterial(0xcbd3c7));
  back.name = 'Back wall'; back.receiveShadow = true; desk.add(back);
  const sides = [0xe0e5dc, 0xd5ded2].map((color, i) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const mesh = new THREE.Mesh(geometry, wallMaterial(color));
    mesh.name = i ? 'Right wall' : 'Left wall'; mesh.receiveShadow = true; desk.add(mesh); return mesh;
  });

  // The four opaque strips live in the SCREEN plane. An avatar in front of z=0
  // really wins the depth test over this inner frame; a CSS overlay would not.
  const frame = new THREE.Group(); frame.name = 'Screen plane inner frame'; scene.add(frame);
  const frameMaterial = new THREE.MeshBasicMaterial({ color: 0x17221b });
  const frameBars = Array.from({ length: 4 }, () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), frameMaterial);
    mesh.position.z = .0001; frame.add(mesh); return mesh;
  });

  const radial = contactTexture();
  const makeContact = (opacity) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: radial, transparent: true, opacity, depthWrite: false, toneMapped: false }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.y = .00035; mesh.renderOrder = 1; desk.add(mesh); return mesh;
  };
  const contacts = [makeContact(.62), makeContact(.62)];
  const bodyContact = makeContact(.25);
  contacts.forEach((mesh) => { mesh.visible = false; }); bodyContact.visible = false;

  const grid = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x667b65, transparent: true, opacity: .27, depthWrite: false }));
  grid.position.y = .0006; grid.visible = false; desk.add(grid);

  const propMaterial = (color, roughness = .75) => new THREE.MeshStandardMaterial({ color, roughness });
  function mesh(parent, geometry, material, position = [0, 0, 0]) {
    const object = new THREE.Mesh(geometry, material); object.position.set(...position); object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
  }
  const flowers = new THREE.Group(); flowers.name = 'Small flower reference'; desk.add(flowers);
  mesh(flowers, new THREE.CylinderGeometry(.011, .008, .019, 28), propMaterial(0xeee8da), [0, .0095, 0]);
  mesh(flowers, new THREE.CylinderGeometry(.0102, .0102, .0008, 24), propMaterial(0x514533), [0, .019, 0]);
  const leafMaterial = propMaterial(0x617c52), petalMaterial = propMaterial(0xf4ead0), centerMaterial = propMaterial(0xd6b56a);
  const smallSphere = new THREE.SphereGeometry(1, 12, 8);
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * .006, z = (i % 2) * .004, y = .043 + (i === 1 ? .009 : 0);
    mesh(flowers, new THREE.CylinderGeometry(.0005, .0007, y - .019, 6), leafMaterial, [x, (y + .019) / 2, z]);
    for (let p = 0; p < 5; p++) {
      const a = p * Math.PI * 2 / 5;
      mesh(flowers, smallSphere, petalMaterial, [x + Math.cos(a) * .0042, y + Math.sin(a) * .0042, z]).scale.set(.0034, .0034, .0016);
    }
    mesh(flowers, smallSphere, centerMaterial, [x, y, z + .0018]).scale.setScalar(.002);
    const leaf = mesh(flowers, smallSphere, leafMaterial, [x + .0035, y - .013, z]); leaf.scale.set(.005, .0014, .0025); leaf.rotation.z = .6;
  }
  const clockGroup = new THREE.Group(); clockGroup.name = 'Real local time'; desk.add(clockGroup);
  mesh(clockGroup, new THREE.BoxGeometry(.042, .026, .012), propMaterial(0x344b3d), [0, .013, 0]);
  const clockCanvas = document.createElement('canvas'); clockCanvas.width = 384; clockCanvas.height = 192;
  const clockTexture = new THREE.CanvasTexture(clockCanvas); clockTexture.colorSpace = THREE.SRGBColorSpace;
  mesh(clockGroup, new THREE.PlaneGeometry(.037, .020), new THREE.MeshBasicMaterial({ map: clockTexture, toneMapped: false }), [0, .013, .0061]);
  let lastClock = '';
  function updateClock() {
    const text = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    if (text === lastClock) return; lastClock = text;
    const ctx = clockCanvas.getContext('2d'); ctx.fillStyle = '#26382d'; ctx.fillRect(0, 0, 384, 192);
    ctx.fillStyle = '#e2e8d3'; ctx.font = '500 111px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 192, 101);
    clockTexture.needsUpdate = true;
  }

  function fitAvatar(current) {
    if (!state.bounds || !state.calibration) return;
    const size = state.bounds.getSize(new THREE.Vector3());
    const desired = current.inspect ? .17 : current.avatarHeight ?? clamp(Math.min(state.height * .78, state.width * .58 * size.y / size.x), .05, .36);
    const fitKey = `${desired}`;
    if (fitKey === state.fitKey) return;
    state.fitKey = fitKey; state.avatarHeight = desired;
    fitReferenceAvatar(state.calibration, state.bounds, desired);
    const propScale = clamp(desired / .17, .58, 1.12);
    flowers.scale.setScalar(propScale); clockGroup.scale.setScalar(propScale);
  }

  const springRotation = new THREE.Quaternion();
  function syncSpringDimensions(forceReset = false) {
    if (!state.springProfile || !state.calibration || !state.vrm) return;
    desk.getWorldQuaternion(springRotation);
    const scale = state.calibration.scale.x;
    const key = [scale, springRotation.x, springRotation.y, springRotation.z, springRotation.w].join('|');
    if (!forceReset && state.springKey === key) return;
    applySpringDimensions(state.springProfile, scale, springRotation);
    state.calibration.updateWorldMatrix(true, true);
    state.vrm.springBoneManager.reset();
    state.springKey = key;
  }

  function layout(current) {
    state.width = current.width; state.height = current.width * state.pixels.height / state.pixels.width;
    const layoutKey = [state.width, state.height, current.tilt, current.floorOffset, current.avatarDepth, current.roomDepth, current.wood, current.inspect].join('|');
    const layoutChanged = layoutKey !== state.layoutKey;
    if (layoutChanged) {
      state.layoutKey = layoutKey;
      if (state.inspect !== current.inspect) state.fitKey = '';
      back.visible = frame.visible = flowers.visible = clockGroup.visible = !current.inspect;
      sides.forEach((side) => { side.visible = !current.inspect; });
      if (current.inspect) {
        desk.rotation.set(0, 0, 0); desk.position.set(0, 0, 0); avatarMount.position.set(0, 0, 0);
        floor.scale.set(.9, .9, 1); floor.position.set(0, -.0002, 0);
        floorMaterial.map = null; floorMaterial.color.setHex(0xe3e8df); floorMaterial.needsUpdate = true;
        scene.background.setHex(0xe8ede5); state.roomDepth = 0;
        hemisphere.color.setHex(0xffffff); hemisphere.groundColor.setHex(0x9eaa98);
        key.color.setHex(0xffffff); fill.color.setHex(0xffffff);
        key.target.position.set(0, .085, 0); fill.target.position.set(0, .085, 0);
        Object.assign(key.shadow.camera, { left: -.25, right: .25, top: .25, bottom: -.25 }); key.shadow.camera.updateProjectionMatrix();
      } else {
      const beta = THREE.MathUtils.degToRad(90 - current.tilt), c = Math.cos(beta), s = Math.sin(beta);
      desk.rotation.x = beta;
      desk.position.set(0, -state.height / 2 - current.floorOffset * c, -current.floorOffset * s);
      const border = clamp(state.width * .012, .0023, .0043);
      const innerWidth = state.width - border * 2;
      const roomHeight = Math.max(.03, (state.height - border) * c + current.floorOffset);
      // Side-wall front edges meet the tilted glass exactly, not an arbitrary
      // vertical rectangle. Keep a minimum depth behind its top edge.
      const frontTop = -(state.height - border) * s;
      const frontFloor = current.floorOffset * Math.tan(beta);
      const depth = Math.max(current.roomDepth, -frontTop + .055, current.avatarDepth + .06);
      state.roomDepth = depth;
      const floorDepth = Math.max(.04, depth + frontFloor);
      floor.scale.set(innerWidth, floorDepth, 1); floor.position.set(0, -.0002, (frontFloor - depth) / 2);
      woods.oak.repeat.set(innerWidth / .28, floorDepth / .65); woods.walnut.repeat.copy(woods.oak.repeat);
      floorMaterial.map = woods[current.wood]; floorMaterial.color.setHex(0xffffff); floorMaterial.needsUpdate = true;
      scene.background.setHex(0xdce1d8);
      hemisphere.color.setHex(0xfff9ed); hemisphere.groundColor.setHex(0x7d8d77);
      key.color.setHex(0xfff1db); fill.color.setHex(0xdce8df);
      key.target.position.set(0, .08, -.08); fill.target.position.set(0, .08, -.1);
      back.scale.set(innerWidth, roomHeight, 1); back.position.set(0, roomHeight / 2, -depth);
      sides.forEach((side, i) => {
        const x = (i ? 1 : -1) * innerWidth / 2;
        side.geometry.attributes.position.array.set([x, 0, frontFloor, x, roomHeight, frontTop, x, roomHeight, -depth, x, 0, -depth]);
        side.geometry.attributes.position.needsUpdate = true; side.geometry.computeVertexNormals(); side.geometry.computeBoundingSphere();
      });
      frameBars[0].scale.set(border, state.height, 1); frameBars[0].position.set(-state.width / 2 + border / 2, 0, .0001);
      frameBars[1].scale.set(border, state.height, 1); frameBars[1].position.set(state.width / 2 - border / 2, 0, .0001);
      frameBars[2].scale.set(innerWidth, border, 1); frameBars[2].position.set(0, state.height / 2 - border / 2, .0001);
      frameBars[3].scale.set(innerWidth, border, 1); frameBars[3].position.set(0, -state.height / 2 + border / 2, .0001);
      avatarMount.position.set(0, 0, -current.avatarDepth);
      flowers.position.set(-innerWidth * .34, 0, -Math.max(.025, current.avatarDepth + .018));
      clockGroup.position.set(innerWidth * .34, 0, -Math.max(.025, current.avatarDepth + .015));
      const gridPoints = [], step = .02;
      for (let x = Math.ceil(-innerWidth / 2 / step) * step; x <= innerWidth / 2; x += step) gridPoints.push(x, 0, -depth, x, 0, frontFloor);
      for (let z = Math.ceil(-depth / step) * step; z <= frontFloor; z += step) gridPoints.push(-innerWidth / 2, 0, z, innerWidth / 2, 0, z);
      grid.geometry.dispose(); grid.geometry = new THREE.BufferGeometry(); grid.geometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
      const extent = Math.max(.25, state.width * 1.3, roomHeight * 1.1);
      Object.assign(key.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent }); key.shadow.camera.updateProjectionMatrix();
      }
    }
    fitAvatar(current);
    syncSpringDimensions(layoutChanged);
    grid.visible = current.grid && !current.inspect;
    hemisphere.intensity = 1.45 * current.light; key.intensity = 2.35 * current.light; fill.intensity = .42 * current.light;
  }

  function updateProjection(current, dt = 0, snap = false) {
    if (current.inspect) {
      state.inspect = true; state.mode = current.mode;
      camera.fov = 32; camera.aspect = state.pixels.width / state.pixels.height; camera.near = .004; camera.far = 3;
      const fit = inspectionCameraFit(state.bounds, camera.aspect, current.inspectYaw, current.inspectPitch, current.inspectZoom);
      camera.far = Math.max(3, fit.distance + 2);
      camera.position.copy(fit.position); camera.up.set(0, 1, 0); camera.lookAt(fit.target); camera.updateProjectionMatrix();
      gazeTarget.position.copy(camera.position);
      return;
    }
    const leavingInspection = state.inspect; state.inspect = false;
    camera.near = .008; camera.far = 4;
    const eye = { ...current.eye };
    if (current.mode === 'auto') { eye.x += Math.sin(state.time * .4) * .045; eye.y += Math.cos(state.time * .31) * .013; }
    // Tracking already filters its measurements. A second camera filter causes
    // visible lag between the real viewer and the virtual room.
    const direct = snap || leavingInspection || current.mode === 'camera' || state.mode !== current.mode;
    for (const axis of ['x', 'y', 'z']) state.eye[axis] = direct ? eye[axis] : THREE.MathUtils.damp(state.eye[axis], eye[axis], 18, dt);
    state.mode = current.mode;
    const frustum = screenFrustum(state.width, state.height, state.eye, camera.near);
    camera.position.set(state.eye.x, state.eye.y, state.eye.z); camera.quaternion.identity();
    camera.projectionMatrix.makePerspective(frustum.left, frustum.right, frustum.top, frustum.bottom, camera.near, camera.far);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    gazeTarget.position.copy(camera.position);
  }

  const localEye = new THREE.Vector3(), footPoint = new THREE.Vector3();
  const bone = (name) => state.vrm?.humanoid?.getNormalizedBoneNode(name);
  function animateAvatar(dt, current) {
    const vrm = state.vrm; if (!vrm) return;
    const active = current.animate, waving = state.waveUntil > state.time;
    const axis = vrm.meta?.metaVersion === '0' ? -1 : 1;
    if (bone('spine')) bone('spine').rotation.z = active ? Math.sin(state.time * 1.2) * .009 * axis : 0;
    if (bone('chest')) bone('chest').rotation.x = active ? Math.sin(state.time * 1.8) * .006 * axis : 0;
    const arm = bone('leftUpperArm'), forearm = bone('leftLowerArm'), hand = bone('leftHand');
    if (arm) { arm.rotation.z = THREE.MathUtils.damp(arm.rotation.z, (waving ? .7 : -REST_ARM) * axis, 10, dt); arm.rotation.x = THREE.MathUtils.damp(arm.rotation.x, waving ? -.25 * axis : 0, 10, dt); }
    if (forearm) { forearm.rotation.z = THREE.MathUtils.damp(forearm.rotation.z, waving ? 1.15 * axis : 0, 10, dt); forearm.rotation.y = waving ? Math.sin(state.time * 10) * .23 : -.12; }
    if (hand) hand.rotation.x = waving ? Math.sin(state.time * 12) * .35 * axis : 0;
    if (active && state.time > state.nextBlink) { state.blinkStart = state.time; state.nextBlink = state.time + 2.8 + Math.random() * 3; }
    const blink = (state.time - state.blinkStart) / .16;
    vrm.expressionManager?.setValue('blink', active && state.blinkStart >= 0 && blink >= 0 && blink < 1 ? Math.sin(blink * Math.PI) : 0);
    vrm.expressionManager?.setValue('aa', state.speaking ? Math.max(0, Math.sin(state.time * 18) * .45 + Math.sin(state.time * 6) * .15 + .17) : 0);
    vrm.expressionManager?.setValue('happy', waving ? .12 : 0);
    scene.updateMatrixWorld(true);
    const head = bone('head');
    if (head) {
      head.parent.worldToLocal(localEye.copy(camera.position)); localEye.sub(head.position);
      localEye.x *= axis; localEye.z *= axis;
      const yaw = current.gaze ? clamp(Math.atan2(localEye.x, localEye.z), -.4, .4) * .55 : 0;
      const pitch = current.gaze ? clamp(-Math.atan2(localEye.y, Math.hypot(localEye.x, localEye.z)), -.2, .2) * .35 * axis : 0;
      head.rotation.y = THREE.MathUtils.damp(head.rotation.y, yaw, 5, dt); head.rotation.x = THREE.MathUtils.damp(head.rotation.x, pitch, 5, dt);
    }
    if (vrm.lookAt) { vrm.lookAt.autoUpdate = current.gaze; if (!current.gaze) { vrm.lookAt.yaw = 0; vrm.lookAt.pitch = 0; } }
    vrm.update(Math.min(dt, .05));
    scene.updateMatrixWorld(true);
    let cx = 0, cz = 0;
    for (let i = 0; i < 2; i++) {
      const foot = vrm.humanoid.getRawBoneNode(i ? 'rightFoot' : 'leftFoot');
      if (foot) desk.worldToLocal(foot.getWorldPosition(footPoint));
      else footPoint.set((i ? -1 : 1) * state.avatarHeight * .055, 0, -current.avatarDepth);
      contacts[i].visible = true;
      contacts[i].position.set(footPoint.x, .00035, footPoint.z + state.avatarHeight * .018);
      contacts[i].scale.set(state.avatarHeight * .12, state.avatarHeight * .19, 1);
      cx += contacts[i].position.x / 2; cz += contacts[i].position.z / 2;
    }
    bodyContact.visible = true; bodyContact.position.set(cx, .00028, cz);
    bodyContact.scale.set(state.avatarHeight * .39, state.avatarHeight * .28, 1);
  }

  function releaseCurrent() {
    state.calibration?.removeFromParent();
    if (state.gltf) disposeGltf(state.gltf);
    else if (state.vrm) disposeSceneResources([state.vrm.scene], [state.vrm.meta?.thumbnailImage, state.vrm.meta?.texture]);
    state.vrm = state.gltf = state.bounds = state.calibration = state.springProfile = null; state.fitKey = state.springKey = '';
    state.expressionRepairs = [];
    contacts.forEach((mesh) => { mesh.visible = false; }); bodyContact.visible = false;
  }

  function clearAvatar() {
    if (state.disposed) return;
    ++state.loadGeneration; state.loadAbort?.abort(); state.loadAbort = null;
    state.loading = false; state.speaking = false; state.waveUntil = 0;
    releaseCurrent(); state.name = ''; state.credit = '';
    // The app owns empty-state UI. Removing a model must not emit ready.
  }

  async function loadAvatar(source, label, credit) {
    if (state.disposed || state.graphicsLost) return false;
    const generation = ++state.loadGeneration; state.loadAbort?.abort();
    const controller = new AbortController(); state.loadAbort = controller;
    const signal = controller.signal;
    let pendingGltf = null, timedOut = false, errorReported = false;
    const current = () => generation === state.loadGeneration && !state.disposed;
    const report = (data) => { if (current()) emit(onLoad, data); };
    state.loading = true;
    report({ phase: 'fetching', loaded: 0, total: 0, message: `正在载入 ${label || 'VRM 角色'}` });
    const timeout = setTimeout(() => {
      if (!current()) return;
      timedOut = true; controller.abort(); state.loading = false; errorReported = true;
      report({ phase: 'error', loaded: 0, total: 0, message: '角色载入超时，请重新选择角色。' });
    }, 60000);
    try {
      const buffer = await readModel(source, signal, (loaded, total, message) => report({ phase: 'fetching', loaded, total, message: message || `载入角色 · ${(loaded / 1048576).toFixed(1)} MB` }));
      if (signal.aborted || !current()) return false;
      const data = inspectVrm(buffer);
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((url) => { if (url.startsWith('blob:') || url.startsWith('data:')) return url; throw new Error('模型包含外部资源，请使用完整的单文件 VRM。'); });
      const loader = new GLTFLoader(manager);
      loader.register(() => ({ name: 'MetaFlowResourceOwner', afterRoot: (gltf) => { pendingGltf = gltf; } }));
      loader.register((parser) => new VRMLoaderPlugin(parser));
      report({ phase: 'parsing', loaded: buffer.byteLength, total: buffer.byteLength, message: '正在准备真实 VRM 材质、骨骼和表情' });
      const gltf = await new Promise((resolve, reject) => loader.parse(buffer, '', resolve, reject));
      if (signal.aborted || !current()) return false;
      const vrm = gltf.userData.vrm;
      if (!vrm) throw new Error('没有找到可驱动的 VRM 角色。');
      const expressionRepairs = bindMissingVroidExpressions(vrm);
      VRMUtils.rotateVRM0(vrm);
      vrm.scene.traverse((object) => { if (object.isMesh) { object.frustumCulled = false; object.castShadow = true; object.receiveShadow = true; } });
      initialPose(vrm); vrm.scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(vrm.scene, true), size = bounds.getSize(new THREE.Vector3());
      if (![size.x, size.y, size.z].every(Number.isFinite) || size.y < .01 || size.y > 100 || size.x <= 0) throw new Error('模型尺寸异常，无法进行桌面校准。');
      releaseCurrent(); state.speaking = false;
      state.vrm = vrm; state.gltf = gltf; pendingGltf = null; state.bounds = bounds;
      state.expressionRepairs = expressionRepairs;
      state.springProfile = captureSpringDimensions(vrm);
      state.calibration = new THREE.Group(); state.calibration.add(vrm.scene); avatarMount.add(state.calibration);
      if (vrm.lookAt) vrm.lookAt.target = gazeTarget;
      const meta = data.extensions.VRMC_vrm?.meta || data.extensions.VRM?.meta || {};
      state.name = String(label || meta.name || meta.title || '我的 VRM').slice(0, 100);
      state.credit = String(credit || meta.authors?.join('、') || meta.author || '本地导入').slice(0, 180);
      state.waveUntil = 0; state.blinkStart = -1; state.nextBlink = state.time + 2.3;
      layout(settings()); vrm.update(0); scene.updateMatrixWorld(true);
      state.loading = false;
      emit(onAvatar, { name: state.name, credit: state.credit, meta });
      report({ phase: 'ready', loaded: buffer.byteLength, total: buffer.byteLength, message: '角色已就绪' });
      return true;
    } catch (error) {
      if (current() && (!signal.aborted || timedOut) && !errorReported) report({ phase: 'error', loaded: 0, total: 0, message: error.message || '角色载入失败，请重试。' });
      return false;
    } finally {
      clearTimeout(timeout); if (pendingGltf) disposeGltf(pendingGltf);
      if (current()) { state.loading = false; if (state.loadAbort === controller) state.loadAbort = null; }
    }
  }

  function resize() {
    if (state.disposed) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    state.pixels.width = Math.round(rect.width); state.pixels.height = Math.round(rect.height);
    renderer.setSize(state.pixels.width, state.pixels.height, false);
    const current = settings(); state.settings = current; layout(current); updateProjection(current, 0, true);
  }

  function frameLoop(ms) {
    if (state.disposed || state.paused || state.graphicsLost) return;
    state.raf = requestAnimationFrame(frameLoop);
    const elapsed = Math.max((ms - state.lastTime) / 1000, 0);
    const dt = Math.min(elapsed, .05); state.lastTime = ms; state.time += dt;
    const current = settings(); state.settings = current;
    layout(current); updateProjection(current, dt); animateAvatar(dt, current); updateClock();
    renderer.render(scene, camera);
    state.metricsTime += elapsed; state.metricsFrames++;
    if (state.metricsTime >= 1) {
      state.fps = state.metricsFrames / state.metricsTime;
      emit(onMetrics, { fps: state.fps, triangles: renderer.info.render.triangles, calls: renderer.info.render.calls });
      state.metricsTime = state.metricsFrames = 0;
    }
  }

  function pause(value) {
    if (state.disposed || (!value && state.graphicsLost)) return;
    const next = !!value; if (next === state.paused) return;
    state.paused = next; cancelAnimationFrame(state.raf); state.metricsTime = state.metricsFrames = 0;
    if (!next) { state.lastTime = performance.now(); state.raf = requestAnimationFrame(frameLoop); }
  }

  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  observer?.observe(canvas);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); state.graphicsLost = true;
    ++state.loadGeneration; state.loadAbort?.abort(); state.loadAbort = null;
    state.loading = false; state.speaking = false; pause(true);
    emit(onLoad, { phase: 'error', code: 'graphics-context-lost', loaded: 0, total: 0, message: '三维图形上下文已中断，请刷新页面重新载入。' });
  }, { signal: eventAbort.signal });

  function dispose() {
    if (state.disposed) return;
    state.disposed = true; ++state.loadGeneration; state.loadAbort?.abort(); state.speaking = false;
    cancelAnimationFrame(state.raf); observer?.disconnect(); eventAbort.abort();
    releaseCurrent(); disposeSceneResources([scene], [woods.oak, woods.walnut]);
    key.shadow.dispose(); renderer.dispose();
  }

  function diagnostics() {
    return {
      ready: !!state.vrm, model: state.name, mode: state.mode, eye: { ...state.eye },
      inspect: state.inspect, cameraPosition: camera.position.toArray(),
      screen: { width: state.width, height: state.height, pixels: { ...state.pixels } },
      avatarHeight: state.avatarHeight, floorOffset: state.settings?.floorOffset ?? .008,
      avatarDepth: state.settings?.avatarDepth ?? .04, roomDepth: state.roomDepth,
      referenceBounds: state.bounds ? { min: state.bounds.min.toArray(), max: state.bounds.max.toArray() } : null,
      expressions: state.vrm?.expressionManager?.expressions?.map((expression) => expression.expressionName) || [],
      runtimeExpressionBindings: state.expressionRepairs.map((repair) => ({ ...repair })),
      fps: state.fps, triangles: renderer.info.render.triangles, calls: renderer.info.render.calls,
      loading: state.loading, modelCount: avatarMount.children.length, speaking: state.speaking,
      paused: state.paused, graphicsLost: state.graphicsLost, disposed: state.disposed,
    };
  }

  resize(); updateClock(); state.raf = requestAnimationFrame(frameLoop);
  return {
    loadAvatar, clearAvatar,
    wave() { if (!state.vrm || state.disposed || state.graphicsLost) return false; state.waveUntil = state.time + 2.8; return true; },
    setSpeaking(value) { state.speaking = !!value && !state.disposed && !state.graphicsLost; if (!state.speaking) for (const expression of ['aa', 'ih', 'ou', 'ee', 'oh']) state.vrm?.expressionManager?.setValue(expression, 0); },
    resize, pause, dispose, diagnostics,
  };
}
