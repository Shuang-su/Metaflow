/**
 * Standalone Three.js + @pixiv/three-vrm Desktop Portrait Viewer
 * Pure Three.js with off-axis projection. Supports VRM0 (rotateVRM0) and VRM1.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { getProjection, tablePose } from './projection.mjs';
import { VRMAnimator } from './vrm-animator.mjs';
import { generateTestAudio } from './test-audio.mjs';
import {
    loadSettings,
    saveSettings,
    resetSettings,
    mToCm,
    degLabel,
    detectCapabilities,
    qualityToPixelRatio
} from './settings.mjs';

window.THREE = THREE;

function vrmDisplayName(vrm) {
    const meta = vrm?.meta;
    if (!meta) return 'Unknown';
    // VRM1 uses name; VRM0 uses title
    return meta.name || meta.title || meta.modelName || 'Unknown';
}

function vrmMetaVersion(vrm) {
    return vrm?.meta?.metaVersion ?? null;
}

class DesktopPortraitApp {
    constructor() {
        this.canvas = document.getElementById('main-canvas');
        this.statusEl = document.getElementById('status');

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x2a241c);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false
        });
        this.renderer.setPixelRatio(1);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;

        this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 10);

        this.setupLighting();

        this.settings = loadSettings();
        // Physical screen params; width may follow canvas aspect unless user locks via slider
        // tiltDegrees = stand lean from vertical (0=upright). Converted for tablePose.
        this.params = {
            width: this.settings.widthM,
            height: this.settings.heightM,
            tiltDegrees: this.settings.tiltDeg,
            eye: {
                x: this.settings.eyeX,
                y: this.settings.eyeY,
                z: this.settings.eyeZ
            }
        };
        this.quality = this.settings.quality || 'balanced';
        this.userLockedWidth = false;

        // Desk visual (tilted with stand). Character stays world-upright as sibling.
        this.deskRoot = new THREE.Group();
        this.deskRoot.name = 'DeskRoot';
        this.scene.add(this.deskRoot);
        this.createDesk();

        this.personRoot = new THREE.Group();
        this.personRoot.name = 'PersonRoot';
        this.scene.add(this.personRoot);

        this.vrm = null;
        this.animator = null;
        this.clock = new THREE.Clock();
        this.restPoseSet = false;
        this.rotatedVRM0 = false;

        this.setupControls();
        this.setupPanels();
        this.setupDevicePanel();
        this.applyQuality();
        this.syncSlidersFromParams();
        this.setupResize();
        this.updateProjection();
        this.animate();
        this.loadDefaultModel();
    }

    applyQuality() {
        const dpr = qualityToPixelRatio(this.quality, window.devicePixelRatio || 1);
        this.renderer.setPixelRatio(dpr);
        const hint = document.getElementById('qualityHint');
        if (hint) {
            hint.textContent = `当前像素比 ${dpr.toFixed(2)}（设备 DPR ${Number(window.devicePixelRatio || 1).toFixed(2)}）。网页无法变成系统透明桌宠。`;
        }
    }

    setupPanels() {
        const map = {
            basic: 'panel-basic',
            viewpoint: 'panel-viewpoint',
            advanced: 'panel-advanced',
            device: 'panel-device'
        };
        for (const [key, id] of Object.entries(map)) {
            const el = document.getElementById(id);
            if (!el) continue;
            el.open = !this.settings.panelCollapsed?.[key];
            el.addEventListener('toggle', () => {
                this.settings.panelCollapsed = {
                    ...this.settings.panelCollapsed,
                    [key]: !el.open
                };
                saveSettings({ ...this.settings, ...this.snapshotSettings() });
            });
        }
    }

    setupDevicePanel() {
        const caps = detectCapabilities();
        const grid = document.getElementById('deviceGrid');
        const disc = document.getElementById('deviceDisclaimer');
        if (disc) disc.textContent = caps.disclaimer;
        if (!grid) return;
        const rows = [
            ['形态提示', caps.formFactor],
            ['浏览器', caps.uaSummary],
            ['平台', caps.platform],
            ['屏幕 CSS px', caps.screenCssPx],
            ['DPR', String(caps.devicePixelRatio)],
            ['WebGL2', caps.webgl2 ? '是' : '否'],
            ['逻辑核心', caps.cores ?? '未知'],
            ['内存提示', caps.deviceMemoryGiB != null ? `${caps.deviceMemoryGiB} GiB` : '未知'],
            ['减少动态', caps.reducedMotion ? '是' : '否'],
            ['建议画质', caps.suggestedQuality]
        ];
        grid.innerHTML = rows.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
    }

    snapshotSettings() {
        return {
            widthM: this.params.width,
            heightM: this.params.height,
            tiltDeg: this.params.tiltDegrees,
            eyeX: this.params.eye.x,
            eyeY: this.params.eye.y,
            eyeZ: this.params.eye.z,
            quality: this.quality,
            panelCollapsed: this.settings.panelCollapsed
        };
    }

    syncSlidersFromParams() {
        const set = (id, valueId, value, format) => {
            const el = document.getElementById(id);
            const val = document.getElementById(valueId);
            if (el) el.value = String(value);
            if (val) val.textContent = format(value);
        };
        set('screenWidth', 'screenWidthValue', this.params.width, mToCm);
        set('screenHeight', 'screenHeightValue', this.params.height, mToCm);
        set('tiltDegrees', 'tiltDegreesValue', this.params.tiltDegrees, degLabel);
        set('eyeX', 'eyeXValue', this.params.eye.x, mToCm);
        set('eyeY', 'eyeYValue', this.params.eye.y, mToCm);
        set('eyeZ', 'eyeZValue', this.params.eye.z, mToCm);
        const q = document.getElementById('qualityPreset');
        if (q) q.value = this.quality;
    }

    setupLighting() {
        this.scene.add(new THREE.AmbientLight(0xfff5eb, 0.55));

        const keyLight = new THREE.DirectionalLight(0xfff0e0, 0.95);
        keyLight.position.set(0.4, 1.6, 2.2);
        this.scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.35);
        fillLight.position.set(-1.5, 0.8, 1.2);
        this.scene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(0xffe0c0, 0.25);
        rimLight.position.set(0.2, 1.2, -1.8);
        this.scene.add(rimLight);
    }

    createDesk() {
        const geometry = new THREE.PlaneGeometry(0.45, 0.35, 1, 1);
        const material = new THREE.MeshStandardMaterial({
            color: 0xb8956a,
            roughness: 0.85,
            metalness: 0.05,
            side: THREE.DoubleSide
        });
        const desk = new THREE.Mesh(geometry, material);
        desk.name = 'Desk';
        desk.receiveShadow = true;
        desk.rotation.x = -Math.PI / 2;
        // Desk surface local y=0; extend behind screen
        desk.position.set(0, 0, -0.12);
        this.deskRoot.add(desk);
        this.updateDeskPose();
    }

    updateDeskPose() {
        // UI tiltDegrees = lean from vertical (0 upright … 90 flat).
        // tablePose expects angle-from-horizontal (90 = vertical screen).
        const fromHorizontal = Math.max(0, Math.min(90, 90 - this.params.tiltDegrees));
        const pose = tablePose({
            height: this.params.height,
            tiltDegrees: fromHorizontal
        });
        this.deskRoot.rotation.x = pose.rotationX * Math.PI / 180;
        this.deskRoot.position.set(
            pose.position.x,
            pose.position.y,
            pose.position.z
        );
        // Re-anchor figurine after desk pose changes
        if (this.vrm) {
            this.normalizeAndAnchor();
        }
    }

    updateProjection() {
        const proj = getProjection(this.params);
        this.camera.position.set(proj.eye.x, proj.eye.y, proj.eye.z);
        this.camera.fov = proj.fov;
        this.camera.aspect = proj.aspect;

        const near = this.camera.near;
        const far = this.camera.far;
        const fov = proj.fov * Math.PI / 180;
        const top = near * Math.tan(fov / 2);
        const bottom = -top;
        const right = top * proj.aspect;
        const left = -right;

        const offsetX = proj.offset.x * (right - left) / 2;
        const offsetY = proj.offset.y * (top - bottom) / 2;

        const x = 2 * near / (right - left);
        const y = 2 * near / (top - bottom);
        const a = (right + left + offsetX) / (right - left);
        const b = (top + bottom + offsetY) / (top - bottom);
        const c = -(far + near) / (far - near);
        const d = -2 * far * near / (far - near);

        this.camera.projectionMatrix.set(
            x, 0, a, 0,
            0, y, b, 0,
            0, 0, c, d,
            0, 0, -1, 0
        );
        this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
        this.updateDeskPose();
    }

    async loadVRM(url) {
        try {
            console.log(`[VRM] Loading from: ${url}`);
            this.setStatus('正在加载 VRM 模型...', 'loading');

            const loader = new GLTFLoader();
            loader.register((parser) => new VRMLoaderPlugin(parser));

            const gltf = await loader.loadAsync(url);
            if (!gltf.userData.vrm) {
                throw new Error('Not a valid VRM file');
            }

            if (this.vrm) {
                this.personRoot.remove(this.vrm.scene);
                VRMUtils.deepDispose(this.vrm.scene);
                if (this.animator) {
                    this.animator.dispose();
                    this.animator = null;
                }
            }

            this.vrm = gltf.userData.vrm;
            this.restPoseSet = false;
            this.rotatedVRM0 = false;
            this.leftArmNode = null;
            this.rightArmNode = null;

            // VRM0 faces -Z in glTF; rotate once so model faces the camera (+Z viewer)
            VRMUtils.rotateVRM0(this.vrm);
            this.rotatedVRM0 = vrmMetaVersion(this.vrm) === '0';
            console.log('[VRM] metaVersion=', vrmMetaVersion(this.vrm), 'rotatedVRM0=', this.rotatedVRM0);

            this.personRoot.add(this.vrm.scene);

            // Soften T-pose only when arms look extended; do not raise natural poses
            this.applyRestPoseIfNeeded();

            this.normalizeAndAnchor();

            this.animator = new VRMAnimator(this.vrm, this.camera);

            // Settle spring bones after orientation/pose
            if (this.vrm.springBoneManager) {
                for (let i = 0; i < 90; i++) {
                    this.vrm.update(1 / 30);
                }
            }

            const name = vrmDisplayName(this.vrm);
            const ver = vrmMetaVersion(this.vrm);
            this.setStatus(`VRM 加载成功: ${name}${ver ? ` (VRM${ver})` : ''}`, 'success');

            window.diagnostics = {
                ready: true,
                modelType: 'vrm',
                modelName: name,
                metaVersion: ver,
                rotatedVRM0: this.rotatedVRM0,
                vrmMeta: this.vrm.meta,
                hasExpressions: !!this.vrm.expressionManager,
                hasLookAt: !!this.vrm.lookAt,
                hasSpringBone: !!this.vrm.springBoneManager,
                sceneRotationY: this.vrm.scene.rotation.y
            };
        } catch (error) {
            console.error('VRM load error:', error);
            this.setStatus(`加载失败: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Soft A-pose for VRM1 T-pose samples only.
     * VRM0 (Wenjing) keeps bind pose — forced arm overrides broke skirt/spring meshes.
     */
    applyRestPoseIfNeeded() {
        if (!this.vrm?.humanoid) return;
        this.restPoseSet = false;
        this.leftArmNode = null;
        this.rightArmNode = null;

        if (vrmMetaVersion(this.vrm) === '0') {
            console.log('[Pose] VRM0 bind pose kept (no arm override)');
            return;
        }

        const left = this.vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
        const right = this.vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
        if (!left || !right) return;

        left.rotation.set(0, 0, -Math.PI * 0.35);
        right.rotation.set(0, 0, Math.PI * 0.35);
        this.vrm.humanoid.update();

        this.restPoseSet = true;
        this.leftArmNode = left;
        this.rightArmNode = right;
        this.leftArmQuat = left.quaternion.clone();
        this.rightArmQuat = right.quaternion.clone();
        console.log('[Pose] VRM1 soft A-pose');
    }

    /** World AABB from skinned/static meshes (more reliable than setFromObject for VRM). */
    computeMeshWorldBox(root) {
        const box = new THREE.Box3();
        root.updateMatrixWorld(true);
        root.traverse((obj) => {
            if (!(obj.isMesh || obj.isSkinnedMesh) || !obj.geometry) return;
            if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
            if (!obj.geometry.boundingBox) return;
            const b = obj.geometry.boundingBox.clone();
            b.applyMatrix4(obj.matrixWorld);
            box.union(b);
        });
        return box;
    }

    normalizeAndAnchor() {
        if (!this.vrm) return;

        const scene = this.vrm.scene;
        // Keep model local origin clean — place via personRoot only (SkinnedMesh-safe)
        scene.position.set(0, 0, 0);
        scene.rotation.x = 0;
        scene.rotation.z = 0;
        // preserve Y rotation from rotateVRM0
        scene.scale.set(1, 1, 1);
        scene.updateMatrixWorld(true);

        let box = this.computeMeshWorldBox(scene);
        if (box.isEmpty()) {
            box = new THREE.Box3().setFromObject(scene);
        }
        const size = box.getSize(new THREE.Vector3());

        // Figurine scale with head/feet margins inside the physical screen
        const targetHeight = Math.min(0.11, this.params.height * 0.52);
        const scale = targetHeight / Math.max(size.y, 1e-6);
        scene.scale.setScalar(scale);
        scene.updateMatrixWorld(true);

        box = this.computeMeshWorldBox(scene);
        if (box.isEmpty()) {
            box = new THREE.Box3().setFromObject(scene);
        }

        this.deskRoot.updateMatrixWorld(true);
        const contact = new THREE.Vector3(0, 0, -0.04);
        this.deskRoot.localToWorld(contact);

        // personRoot moves the whole VRM so mesh feet sit on desk contact
        const center = box.getCenter(new THREE.Vector3());
        this.personRoot.position.set(
            contact.x - center.x,
            contact.y - box.min.y,
            contact.z - center.z
        );
        this.personRoot.rotation.set(0, 0, 0);

        console.log('[Normalize] targetHeight=', targetHeight, 'scale=', scale,
            'feetY=', contact.y, 'headY=', contact.y + (box.max.y - box.min.y));
    }

    async loadDefaultModel() {
        try {
            await this.loadVRM('./models/wenjing.vrm');
        } catch (error) {
            console.error('Default model load failed:', error);
            this.setStatus('文镜加载失败，请尝试示例模型或手动选择 VRM', 'error');
        }
    }

    async loadSampleModel() {
        try {
            await this.loadVRM('./models/minimal-avatar.vrm');
        } catch (error) {
            console.error('Sample model load failed:', error);
            this.setStatus('示例模型加载失败', 'error');
        }
    }

    setupControls() {
        const bindSlider = (id, valueId, format, apply) => {
            const el = document.getElementById(id);
            const val = document.getElementById(valueId);
            if (!el) return;
            el.addEventListener('input', (e) => {
                const n = parseFloat(e.target.value);
                if (val) val.textContent = format(n);
                apply(n);
            });
        };

        bindSlider('screenWidth', 'screenWidthValue', mToCm, (n) => {
            this.userLockedWidth = true;
            this.params.width = n;
            this.updateProjection();
        });
        bindSlider('screenHeight', 'screenHeightValue', mToCm, (n) => {
            this.params.height = n;
            this.updateProjection();
            if (this.vrm) this.normalizeAndAnchor();
        });
        bindSlider('tiltDegrees', 'tiltDegreesValue', degLabel, (n) => {
            this.params.tiltDegrees = n;
            this.updateProjection();
        });
        bindSlider('eyeX', 'eyeXValue', mToCm, (n) => {
            this.params.eye.x = n;
            this.updateProjection();
        });
        bindSlider('eyeY', 'eyeYValue', mToCm, (n) => {
            this.params.eye.y = n;
            this.updateProjection();
        });
        bindSlider('eyeZ', 'eyeZValue', mToCm, (n) => {
            this.params.eye.z = n;
            this.updateProjection();
        });

        document.getElementById('qualityPreset')?.addEventListener('change', (e) => {
            this.quality = e.target.value;
            this.applyQuality();
            const w = this.canvas.clientWidth;
            const h = this.canvas.clientHeight;
            if (w > 0 && h > 0) this.renderer.setSize(w, h, false);
        });

        document.getElementById('saveSettings')?.addEventListener('click', () => {
            this.settings = saveSettings(this.snapshotSettings());
            this.setStatus('本地设置已保存', 'success');
        });
        document.getElementById('resetSettings')?.addEventListener('click', () => {
            this.settings = resetSettings();
            this.params.width = this.settings.widthM;
            this.params.height = this.settings.heightM;
            this.params.tiltDegrees = this.settings.tiltDeg;
            this.params.eye = {
                x: this.settings.eyeX,
                y: this.settings.eyeY,
                z: this.settings.eyeZ
            };
            this.quality = this.settings.quality;
            this.userLockedWidth = false;
            this.applyQuality();
            this.syncSlidersFromParams();
            this.setupPanels();
            this.updateProjection();
            if (this.vrm) this.normalizeAndAnchor();
            this.setStatus('已重置为默认设置', 'success');
        });

        document.getElementById('vrmFile')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            try {
                await this.loadVRM(url);
            } finally {
                URL.revokeObjectURL(url);
            }
        });

        document.getElementById('loadDefaultModel')?.addEventListener('click', () => {
            this.loadDefaultModel();
        });
        document.getElementById('loadSampleModel')?.addEventListener('click', () => {
            this.loadSampleModel();
        });

        document.getElementById('playTestAudio')?.addEventListener('click', async () => {
            if (!this.animator) {
                this.setStatus('请先加载 VRM 模型', 'error');
                return;
            }
            try {
                this.setStatus('正在播放测试音频...', 'loading');
                const audioBuffer = await generateTestAudio();
                await this.animator.playAudioWithMouth(audioBuffer);
                this.setStatus('音频播放完成', 'success');
            } catch (error) {
                console.error('Audio playback error:', error);
                this.setStatus(`音频播放失败: ${error.message}`, 'error');
            }
        });
    }

    setupResize() {
        const applySize = () => {
            const width = this.canvas.clientWidth;
            const height = this.canvas.clientHeight;
            if (width <= 0 || height <= 0) return;
            this.renderer.setSize(width, height, false);
            if (!this.userLockedWidth) {
                const aspectRatio = width / height;
                this.params.width = this.params.height * aspectRatio;
            }
            this.syncSlidersFromParams();
            this.updateProjection();
            if (this.vrm) this.normalizeAndAnchor();
        };

        new ResizeObserver(applySize).observe(this.canvas);
        applySize();
    }

    setStatus(message, type = 'loading') {
        this.statusEl.textContent = message;
        this.statusEl.className = type;
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const delta = this.clock.getDelta();

        if (this.vrm) {
            this.vrm.update(delta);
        }
        if (this.animator) {
            this.animator.update(delta);
        }

        // Re-apply only when we folded a detected T-pose
        if (this.restPoseSet && this.leftArmNode && this.rightArmNode) {
            this.leftArmNode.quaternion.copy(this.leftArmQuat);
            this.rightArmNode.quaternion.copy(this.rightArmQuat);
        }

        this.renderer.render(this.scene, this.camera);
    }
}

let app;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        app = new DesktopPortraitApp();
        window.app = app;
    });
} else {
    app = new DesktopPortraitApp();
    window.app = app;
}

export { DesktopPortraitApp };
