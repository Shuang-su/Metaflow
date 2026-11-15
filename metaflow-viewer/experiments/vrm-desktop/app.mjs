/**
 * Standalone Three.js + @pixiv/three-vrm Desktop Portrait Viewer
 * VRM0/VRM1, off-axis projection, rest pose + spring reset, quality tiers.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { getProjection, tablePose } from './projection.mjs';
import { VRMAnimator } from './vrm-animator.mjs';
import { generateTestAudio } from './test-audio.mjs';
import {
    applyRestPoseAndSettle,
    reapplyArmRestPose,
    softResetSprings,
    springsPolicyForModel
} from './vrm-pose.mjs';
import {
    loadSettings,
    saveSettings,
    resetSettings,
    mToCm,
    degLabel,
    detectCapabilities,
    qualityProfile
} from './settings.mjs';

window.THREE = THREE;

function vrmDisplayName(vrm) {
    const meta = vrm?.meta;
    if (!meta) return 'Unknown';
    return meta.name || meta.title || meta.modelName || 'Unknown';
}

function vrmMetaVersion(vrm) {
    return vrm?.meta?.metaVersion ?? null;
}

class DesktopPortraitApp {
    constructor() {
        this.canvas = document.getElementById('main-canvas');
        this.statusEl = document.getElementById('status');
        this.loadBar = document.getElementById('loadBar');
        this.retryBtn = document.getElementById('retryLoad');

        this.scene = new THREE.Scene();
        this.scene.background = this.createGradientBackground();
        this.scene.fog = new THREE.Fog(0x1a222c, 1.4, 3.8);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance'
        });
        this.renderer.setPixelRatio(1);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        this.renderer.shadowMap.enabled = false;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 10);

        this.settings = loadSettings();
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
        this.springsEnabled = this.settings.springsEnabled !== false;
        this.userLockedWidth = false;
        this.caps = detectCapabilities();
        this.profile = qualityProfile(this.quality, window.devicePixelRatio || 1, this.caps.reducedMotion);

        this.lights = {};
        this.setupLighting();

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
        this.metaVersion = null;
        this.springsActive = true;
        this.springsFallbackNote = '';
        this.lastFrameTime = 0;
        this.loadError = null;
        this.lastModelUrl = './models/wenjing.vrm';

        this.setupControls();
        this.setupPanels();
        this.setupDevicePanel();
        this.setupCalibration();
        this.applyQuality(true);
        this.syncSlidersFromParams();
        this.setupResize();
        this.updateProjection();
        this.animate();
        this.loadDefaultModel();
    }

    createGradientBackground() {
        const canvas = document.createElement('canvas');
        canvas.width = 4;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const g = ctx.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0, '#1a222c');
        g.addColorStop(0.55, '#3a4554');
        g.addColorStop(1, '#c4a882');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 4, 256);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearFilter;
        return tex;
    }

    setupLighting() {
        this.lights.ambient = new THREE.AmbientLight(0xfff4ea, 0.45);
        this.scene.add(this.lights.ambient);

        this.lights.key = new THREE.DirectionalLight(0xfff0e0, 0.95);
        this.lights.key.position.set(0.35, 1.4, 1.8);
        this.lights.key.castShadow = true;
        this.lights.key.shadow.mapSize.set(512, 512);
        this.lights.key.shadow.camera.near = 0.1;
        this.lights.key.shadow.camera.far = 4;
        this.lights.key.shadow.camera.left = -0.4;
        this.lights.key.shadow.camera.right = 0.4;
        this.lights.key.shadow.camera.top = 0.4;
        this.lights.key.shadow.camera.bottom = -0.4;
        this.scene.add(this.lights.key);

        this.lights.fill = new THREE.DirectionalLight(0xb8c8e8, 0.32);
        this.lights.fill.position.set(-1.4, 0.7, 1.0);
        this.scene.add(this.lights.fill);

        this.lights.rim = new THREE.DirectionalLight(0xffd8b8, 0.22);
        this.lights.rim.position.set(0.2, 1.0, -1.5);
        this.scene.add(this.lights.rim);

        this.lights.hemi = new THREE.HemisphereLight(0xdde7ff, 0x8a6a45, 0.25);
        this.scene.add(this.lights.hemi);
    }

    applyQuality(initial = false) {
        this.profile = qualityProfile(
            this.quality,
            window.devicePixelRatio || 1,
            this.caps.reducedMotion
        );

        // Recreate renderer antialias requires new context — toggle soft flags instead
        this.renderer.setPixelRatio(this.profile.pixelRatio);
        this.renderer.toneMappingExposure = this.profile.toneExposure;
        this.renderer.shadowMap.enabled = this.profile.shadows;

        const full = this.profile.lights === 'full';
        const minimal = this.profile.lights === 'minimal';
        this.lights.ambient.intensity = minimal ? 0.7 : 0.45;
        this.lights.key.intensity = minimal ? 0.55 : full ? 1.05 : 0.95;
        this.lights.fill.visible = !minimal;
        this.lights.rim.visible = full;
        this.lights.hemi.visible = !minimal;
        this.lights.key.castShadow = this.profile.shadows;
        if (this.desk) this.desk.receiveShadow = this.profile.shadows;
        if (this.contactShadow) this.contactShadow.visible = this.profile.shadows;

        // Springs: quality may force off; user toggle can also disable
        const wantSprings = this.profile.springs && this.springsEnabled;
        this.springsActive = wantSprings;
        this.springsFallbackNote = wantSprings
            ? ''
            : (this.profile.springs
                ? '弹簧骨骼已手动关闭'
                : '省电档已关闭弹簧骨骼（避免毛发尖刺/掉帧）');

        const hint = document.getElementById('qualityHint');
        if (hint) {
            hint.textContent = `${this.profile.label} · DPR ${this.profile.pixelRatio.toFixed(2)} · ${this.springsFallbackNote || '弹簧开启'}`;
        }
        const springToggle = document.getElementById('springsEnabled');
        if (springToggle) springToggle.checked = this.springsEnabled;

        if (!initial) {
            const w = this.canvas.clientWidth;
            const h = this.canvas.clientHeight;
            if (w > 0 && h > 0) this.renderer.setSize(w, h, false);
            if (this.vrm) this.normalizeAndAnchor();
        }
    }

    createDesk() {
        const geometry = new THREE.PlaneGeometry(0.42, 0.32, 1, 1);
        // Subtle wood-ish tone variation (still a simple plane — not a photo texture)
        const deskCanvas = document.createElement('canvas');
        deskCanvas.width = 256;
        deskCanvas.height = 256;
        const dctx = deskCanvas.getContext('2d');
        const dg = dctx.createLinearGradient(0, 0, 256, 256);
        dg.addColorStop(0, '#c4a06e');
        dg.addColorStop(0.5, '#a67c52');
        dg.addColorStop(1, '#8b6914');
        dctx.fillStyle = dg;
        dctx.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 40; i++) {
            dctx.strokeStyle = `rgba(60,40,20,${0.03 + (i % 5) * 0.01})`;
            dctx.beginPath();
            dctx.moveTo(0, i * 6 + 2);
            dctx.lineTo(256, i * 6 - 8);
            dctx.stroke();
        }
        const deskMap = new THREE.CanvasTexture(deskCanvas);
        deskMap.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.MeshStandardMaterial({
            map: deskMap,
            color: 0xffffff,
            roughness: 0.86,
            metalness: 0.03,
            side: THREE.DoubleSide
        });
        this.desk = new THREE.Mesh(geometry, material);
        this.desk.name = 'Desk';
        this.desk.receiveShadow = true;
        this.desk.rotation.x = -Math.PI / 2;
        this.desk.position.set(0, 0, -0.08);
        this.deskRoot.add(this.desk);

        // Soft elliptical contact shadow (cheap, not a second light map)
        const shadowGeo = new THREE.CircleGeometry(0.06, 24);
        const shadowMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.28,
            depthWrite: false
        });
        this.contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
        this.contactShadow.rotation.x = -Math.PI / 2;
        this.contactShadow.position.set(0, 0.001, -0.04);
        this.contactShadow.visible = false;
        this.deskRoot.add(this.contactShadow);

        this.updateDeskPose();
    }

    updateDeskPose() {
        const fromHorizontal = Math.max(0, Math.min(90, 90 - this.params.tiltDegrees));
        const pose = tablePose({
            height: this.params.height,
            tiltDegrees: fromHorizontal
        });
        this.deskRoot.rotation.x = pose.rotationX * Math.PI / 180;
        this.deskRoot.position.set(pose.position.x, pose.position.y, pose.position.z);
        if (this.vrm) this.normalizeAndAnchor();
    }

    updateProjection() {
        const proj = getProjection(this.params);
        this.camera.position.set(proj.eye.x, proj.eye.y, proj.eye.z);

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

        this.camera.fov = proj.fov;
        this.camera.aspect = proj.aspect;
        this.camera.projectionMatrix.set(
            x, 0, a, 0,
            0, y, b, 0,
            0, 0, c, d,
            0, 0, -1, 0
        );
        this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
        this.updateDeskPose();
    }

    setLoadProgress(pct, label) {
        if (this.loadBar) {
            this.loadBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
            this.loadBar.parentElement?.classList.toggle('visible', pct > 0 && pct < 100);
        }
        if (label) this.setStatus(label, 'loading');
    }

    async loadVRM(url) {
        this.lastModelUrl = url;
        this.loadError = null;
        this._loadGeneration = (this._loadGeneration || 0) + 1;
        const gen = this._loadGeneration;
        if (this.retryBtn) this.retryBtn.hidden = true;
        window.diagnostics = { ready: false, loading: true, url, generation: gen };

        try {
            this.setLoadProgress(5, '正在加载 VRM 模型…');
            const loader = new GLTFLoader();
            loader.register((parser) => new VRMLoaderPlugin(parser));

            const gltf = await loader.loadAsync(
                url,
                (e) => {
                    if (e.total > 0) {
                        const pct = 5 + Math.floor((e.loaded / e.total) * 70);
                        this.setLoadProgress(pct, `加载中 ${(e.loaded / 1e6).toFixed(1)} / ${(e.total / 1e6).toFixed(1)} MB`);
                    }
                }
            );
            if (gen !== this._loadGeneration) return;
            this.setLoadProgress(80, '解析 VRM…');

            if (!gltf.userData.vrm) {
                throw new Error('不是有效的 VRM 文件');
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
            this.metaVersion = vrmMetaVersion(this.vrm);

            VRMUtils.rotateVRM0(this.vrm);
            this.rotatedVRM0 = this.metaVersion === '0';

            this.vrm.scene.traverse((obj) => {
                if (obj.isMesh || obj.isSkinnedMesh) {
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                }
            });

            this.personRoot.add(this.vrm.scene);
            this.setLoadProgress(88, '应用休息姿势并稳定弹簧…');

            // Scale/place with bone anchors BEFORE spring settle (world matrices matter)
            this.normalizeAndAnchor();

            const name = vrmDisplayName(this.vrm);
            const policy = springsPolicyForModel(name, this.metaVersion);
            // Restore user preference, then apply per-model honest default when needed
            this.springsEnabled = this.settings.springsEnabled !== false;
            if (policy.defaultEnabled === false) {
                this.springsEnabled = false;
            }
            const springToggle = document.getElementById('springsEnabled');
            if (springToggle) springToggle.checked = this.springsEnabled;
            this.springsActive = this.profile.springs && this.springsEnabled;
            this.springsFallbackNote = !this.springsActive
                ? (policy.reason || '弹簧骨骼已关闭')
                : (policy.reason || '');

            const poseResult = applyRestPoseAndSettle(this.vrm, this.metaVersion, {
                settleFrames: 150,
                updateSprings: this.springsActive
            });
            this.restPoseSet = poseResult.applied;
            console.log('[Pose]', poseResult, policy);

            this.normalizeAndAnchor();
            this.animator = new VRMAnimator(this.vrm, this.camera, {
                reducedMotion: this.caps.reducedMotion
            });

            this.setLoadProgress(100, '');
            const springShort = this.springsActive ? '弹簧开' : '弹簧关';
            this.setStatus(`VRM 加载成功: ${name}${this.metaVersion ? ` (VRM${this.metaVersion})` : ''} · ${springShort}`, 'success');
            const policyEl = document.getElementById('springsPolicyNote');
            if (policyEl) {
                policyEl.textContent = this.springsFallbackNote || '';
            }

            window.diagnostics = {
                ready: true,
                loading: false,
                generation: gen,
                modelType: 'vrm',
                modelName: name,
                metaVersion: this.metaVersion,
                rotatedVRM0: this.rotatedVRM0,
                restPose: this.restPoseSet,
                leftUpperArmQuat: poseResult.leftUpperArmQuat,
                springsActive: this.springsActive,
                springsFallbackNote: this.springsFallbackNote,
                springsPolicy: policy,
                quality: this.profile.id,
                vrmMeta: this.vrm.meta,
                hasExpressions: !!this.vrm.expressionManager,
                hasLookAt: !!this.vrm.lookAt,
                hasSpringBone: !!this.vrm.springBoneManager,
                sceneRotationY: this.vrm.scene.rotation.y
            };
        } catch (error) {
            console.error('VRM load error:', error);
            this.loadError = error;
            this.setLoadProgress(0, '');
            this.setStatus(`加载失败: ${error.message}`, 'error');
            if (this.retryBtn) this.retryBtn.hidden = false;
            window.diagnostics = { ready: false, loading: false, error: String(error.message || error), generation: gen };
        }
    }

    /**
     * Bone-based extents — SkinnedMesh geometry.boundingBox is bind-pose (T-pose)
     * and will mis-frame / float the character after A-pose.
     */
    computeHumanoidExtents() {
        const h = this.vrm?.humanoid;
        if (!h) return null;
        this.vrm.scene.updateMatrixWorld(true);
        const names = [
            'hips', 'spine', 'chest', 'neck', 'head',
            'leftUpperLeg', 'leftLowerLeg', 'leftFoot',
            'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
            'leftUpperArm', 'leftLowerArm', 'leftHand',
            'rightUpperArm', 'rightLowerArm', 'rightHand'
        ];
        const box = new THREE.Box3();
        const p = new THREE.Vector3();
        let any = false;
        for (const name of names) {
            const node = h.getNormalizedBoneNode(name) || h.getRawBoneNode(name);
            if (!node) continue;
            node.getWorldPosition(p);
            box.expandByPoint(p);
            any = true;
        }
        if (!any || box.isEmpty()) return null;

        const leftFoot = h.getNormalizedBoneNode('leftFoot') || h.getRawBoneNode('leftFoot');
        const rightFoot = h.getNormalizedBoneNode('rightFoot') || h.getRawBoneNode('rightFoot');
        const head = h.getNormalizedBoneNode('head') || h.getRawBoneNode('head');
        const footY = (() => {
            let y = Infinity;
            for (const f of [leftFoot, rightFoot]) {
                if (!f) continue;
                f.getWorldPosition(p);
                y = Math.min(y, p.y);
            }
            return Number.isFinite(y) ? y : box.min.y;
        })();
        const headY = head ? head.getWorldPosition(p).y : box.max.y;
        return { box, footY, headY, height: Math.max(1e-6, headY - footY) };
    }

    normalizeAndAnchor() {
        if (!this.vrm) return;

        const scene = this.vrm.scene;
        scene.position.set(0, 0, 0);
        scene.rotation.x = 0;
        scene.rotation.z = 0;
        scene.scale.set(1, 1, 1);
        this.personRoot.position.set(0, 0, 0);
        scene.updateMatrixWorld(true);

        let extents = this.computeHumanoidExtents();
        if (!extents) {
            const box = new THREE.Box3().setFromObject(scene);
            extents = {
                box,
                footY: box.min.y,
                headY: box.max.y,
                height: Math.max(1e-6, box.max.y - box.min.y)
            };
        }

        // Portrait figurine: fill most of physical screen height
        const targetHeight = Math.min(0.168, this.params.height * 0.92);
        const scale = targetHeight / extents.height;
        scene.scale.setScalar(scale);
        scene.updateMatrixWorld(true);

        extents = this.computeHumanoidExtents() || extents;
        const center = extents.box.getCenter(new THREE.Vector3());

        this.deskRoot.updateMatrixWorld(true);
        const contact = new THREE.Vector3(0, 0, -0.04);
        this.deskRoot.localToWorld(contact);

        this.personRoot.position.set(
            contact.x - center.x,
            contact.y - extents.footY,
            contact.z - center.z
        );
        this.personRoot.rotation.set(0, 0, 0);

        if (this.contactShadow) {
            this.contactShadow.position.set(0, 0.0015, -0.04);
            const width = extents.box.max.x - extents.box.min.x;
            const footprint = Math.max(0.035, Math.min(0.09, width * 0.5));
            this.contactShadow.scale.setScalar(footprint / 0.06);
        }
    }

    async loadDefaultModel() {
        await this.loadVRM('./models/wenjing.vrm');
    }

    async loadSampleModel() {
        await this.loadVRM('./models/minimal-avatar.vrm');
    }

    setupPanels() {
        const map = {
            basic: 'panel-basic',
            viewpoint: 'panel-viewpoint',
            calibrate: 'panel-calibrate',
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
                saveSettings({ ...this.snapshotSettings() });
            });
        }
    }

    setupDevicePanel() {
        const caps = this.caps;
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

        document.getElementById('applySuggestedQuality')?.addEventListener('click', () => {
            this.quality = caps.suggestedQuality;
            const q = document.getElementById('qualityPreset');
            if (q) q.value = this.quality;
            this.applyQuality();
            this.setStatus(`已应用建议画质：${this.quality}`, 'success');
        });
    }

    setupCalibration() {
        const steps = [
            { title: '① 确认模型正向', text: '文镜应正面朝向你。若背面朝外，点「重新加载文镜」。' },
            { title: '② 调支架倾角', text: '从 10–15° 开始，使桌面略向后倾、人物站立自然。' },
            { title: '③ 调眼睛深度 Z', text: '拉近/推远直到全身（头到脚）留有边距。' },
            { title: '④ 保存', text: '满意后点「保存本地设置」。画质可按设备能力面板建议覆盖。' }
        ];
        const box = document.getElementById('calibrateSteps');
        if (!box) return;
        let i = 0;
        const render = () => {
            box.innerHTML = `<strong>${steps[i].title}</strong><p>${steps[i].text}</p><p class="hint">步骤 ${i + 1}/${steps.length}</p>`;
        };
        render();
        document.getElementById('calibrateNext')?.addEventListener('click', () => {
            i = (i + 1) % steps.length;
            render();
        });
        document.getElementById('calibratePrev')?.addEventListener('click', () => {
            i = (i - 1 + steps.length) % steps.length;
            render();
        });
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
            springsEnabled: this.springsEnabled,
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
        const springToggle = document.getElementById('springsEnabled');
        if (springToggle) springToggle.checked = this.springsEnabled;
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
            this.setStatus(`画质已切换：${this.profile.id}`, 'success');
        });

        document.getElementById('springsEnabled')?.addEventListener('change', (e) => {
            this.springsEnabled = !!e.target.checked;
            this.applyQuality();
            if (this.vrm?.springBoneManager?.reset && this.springsActive) {
                this.vrm.springBoneManager.reset();
            }
            this.setStatus(this.springsActive ? '弹簧骨骼已开启并重置' : '弹簧骨骼已关闭', 'success');
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
            this.springsEnabled = this.settings.springsEnabled !== false;
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

        document.getElementById('loadDefaultModel')?.addEventListener('click', () => this.loadDefaultModel());
        document.getElementById('loadSampleModel')?.addEventListener('click', () => this.loadSampleModel());
        this.retryBtn?.addEventListener('click', () => this.loadVRM(this.lastModelUrl));

        document.getElementById('playTestAudio')?.addEventListener('click', async () => {
            if (!this.animator) {
                this.setStatus('请先加载 VRM 模型', 'error');
                return;
            }
            try {
                this.setStatus('正在播放测试音频…', 'loading');
                const audioBuffer = await generateTestAudio();
                await this.animator.playAudioWithMouth(audioBuffer);
                this.setStatus('音频播放完成', 'success');
            } catch (error) {
                this.setStatus(`音频播放失败: ${error.message}`, 'error');
            }
        });

        document.getElementById('resettleSprings')?.addEventListener('click', () => {
            if (!this.vrm) return;
            if (this.restPoseSet) {
                applyRestPoseAndSettle(this.vrm, this.metaVersion, {
                    settleFrames: 120,
                    updateSprings: this.springsActive
                });
            } else {
                softResetSprings(this.vrm, this.springsActive ? 60 : 5);
            }
            this.normalizeAndAnchor();
            this.setStatus(this.springsActive ? '已重新稳定姿势与弹簧' : '已重新应用休息姿势（弹簧关闭）', 'success');
        });
    }

    setupResize() {
        const applySize = () => {
            const width = this.canvas.clientWidth;
            const height = this.canvas.clientHeight;
            if (width <= 0 || height <= 0) return;
            this.renderer.setSize(width, height, false);
            if (!this.userLockedWidth) {
                this.params.width = this.params.height * (width / height);
            }
            this.syncSlidersFromParams();
            this.updateProjection();
            if (this.vrm) this.normalizeAndAnchor();
        };
        new ResizeObserver(applySize).observe(this.canvas);
        applySize();
    }

    setStatus(message, type = 'loading') {
        if (!this.statusEl) return;
        this.statusEl.textContent = message;
        this.statusEl.className = type;
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.lastFrameTime = performance.now();

        let delta = this.clock.getDelta();
        delta = Math.min(delta, 0.05);

        // Arms BEFORE vrm.update so humanoid.update copies normalized → raw for skinning
        if (this.restPoseSet && this.vrm) {
            reapplyArmRestPose(this.vrm, this.metaVersion);
        }
        if (this.animator) this.animator.update(delta);

        if (this.vrm) {
            if (this.springsActive) {
                this.vrm.update(delta);
            } else {
                const mgr = this.vrm.springBoneManager;
                if (mgr) {
                    this.vrm.springBoneManager = undefined;
                    this.vrm.update(delta);
                    this.vrm.springBoneManager = mgr;
                } else {
                    this.vrm.update(delta);
                }
            }
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
