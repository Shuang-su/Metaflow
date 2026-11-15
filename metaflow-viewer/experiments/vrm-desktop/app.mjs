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
import {
    listDisplayPresets,
    readBrowserDisplayLayers,
    featureDetectWindowManagement,
    requestScreenDetails,
    observeScreenDetails,
    observeBasicDisplayChanges,
    screenProfileKey,
    loadScreenProfiles,
    loadActiveScreenKey,
    saveActiveScreenKey,
    upsertScreenProfile,
    setProfileCalibration,
    renameScreenProfile,
    suggestViewportPhysicalMeters,
    calibrateFromRuler,
    applyCustomExternal,
    capabilitiesVsLimitations,
    CREDIT_CARD_MM
} from './display-calibration.mjs';
import {
    featureDetectFullscreen,
    enterSceneFullscreen,
    exitSceneFullscreen,
    onFullscreenChange,
    isElementFullscreen,
    mapCanvasPhysicalFromScreen,
    readCanvasCssBounds,
    readMappingScreenCss,
    FS_WIZARD_STEPS
} from './fullscreen-calibration.mjs';

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
        this.sceneContainer = document.getElementById('canvas-container');
        this.statusEl = document.getElementById('status');
        this.loadBar = document.getElementById('loadBar');
        this.retryBtn = document.getElementById('retryLoad');
        this.fsModeBanner = document.getElementById('fsModeBanner');

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
        this.screenPhysical = this.settings.screenPhysical || null;
        this.projectionMode = this.screenPhysical ? (this.settings.projectionMode || 'calibrated') : 'preview';
        this.fsWizardStep = 0;
        this.fsWizardOpen = false;
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

        this.displayPresets = listDisplayPresets();
        this.pendingDisplaySuggest = null;
        this.screenDetails = null;
        this._unsubScreens = null;
        this.activeScreenKey = loadActiveScreenKey() || screenProfileKey(readBrowserDisplayLayers());

        this.setupControls();
        this.setupPanels();
        this.setupDevicePanel();
        this.setupCalibration();
        this.setupDisplayCalibration();
        this.setupFullscreenWizard();
        this.applyQuality(true);
        this.syncSlidersFromParams();
        this.setupResize();
        this.updateProjection();
        this.updateProjectionModeBanner();
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
        this.lights.ambient.intensity = minimal ? 0.7 : 0.42;
        this.lights.key.intensity = minimal ? 0.55 : full ? 1.05 : 0.95;
        this.lights.fill.visible = !minimal;
        this.lights.fill.intensity = minimal ? 0 : full ? 0.38 : 0.34;
        // Soft rim on balanced too — composition depth without waiting for "quality"
        this.lights.rim.visible = !minimal;
        this.lights.rim.intensity = full ? 0.28 : 0.16;
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
            opacity: 0.34,
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
        this.refreshCapabilityGrids();

        document.getElementById('applySuggestedQuality')?.addEventListener('click', () => {
            this.quality = this.caps.suggestedQuality;
            const q = document.getElementById('qualityPreset');
            if (q) q.value = this.quality;
            this.applyQuality();
            this.setStatus(`已应用建议画质：${this.quality}`, 'success');
        });

        document.getElementById('recognizeDisplays')?.addEventListener('click', () => {
            this.onRecognizeDisplays();
        });
        document.getElementById('renameScreenProfile')?.addEventListener('click', () => {
            const label = document.getElementById('screenProfileLabel')?.value || '';
            renameScreenProfile(this.activeScreenKey, label);
            this.setStatus('已更新本屏档案显示名（仅本地）', 'success');
            this.refreshScreenList();
        });
        document.getElementById('saveScreenProfile')?.addEventListener('click', () => {
            this.persistCurrentScreenCalibration();
            this.setStatus('已保存本屏校准档案（不覆盖其他屏）', 'success');
        });

        // Basic resize/DPR observers — refresh suggestions only, never overwrite saved
        this._unsubBasicDisplay = observeBasicDisplayChanges(() => {
            this.refreshDisplayLayers();
            this.refreshSuggestedNoteFromLayers();
        });
    }

    refreshCapabilityGrids() {
        const caps = this.caps;
        const disc = document.getElementById('deviceDisclaimer');
        if (disc) {
            disc.textContent =
                '浏览器无法可靠识别具体 Mac 机型或物理厘米；下列为能力提示。分辨率匹配≠已检测机型。';
        }
        const wm = featureDetectWindowManagement();
        const wmNote = document.getElementById('windowMgmtNote');
        if (wmNote) wmNote.textContent = wm.explanation;

        const grid = document.getElementById('deviceGrid');
        if (grid) {
            const rows = [
                ['形态提示', caps.formFactor],
                ['浏览器', caps.uaSummary],
                ['平台', caps.platform],
                ['WebGL2', caps.webgl2 ? '是' : '否'],
                ['逻辑核心', caps.cores ?? '未知'],
                ['内存提示', caps.deviceMemoryGiB != null ? `${caps.deviceMemoryGiB} GiB` : '未知'],
                ['减少动态', caps.reducedMotion ? '是' : '否'],
                ['建议画质', caps.suggestedQuality],
                ['Window Mgmt', wm.supported ? '可用（需点击授权）' : '不可用']
            ];
            grid.innerHTML = rows.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
        }

        const capsInfo = capabilitiesVsLimitations();
        const can = document.getElementById('capCanList');
        const cannot = document.getElementById('capCannotList');
        if (can) can.innerHTML = capsInfo.can.map((t) => `<li>${t}</li>`).join('');
        if (cannot) cannot.innerHTML = capsInfo.cannot.map((t) => `<li>${t}</li>`).join('');

        this.refreshDisplayLayers();
        this.refreshScreenList();
    }

    refreshDisplayLayers() {
        const layers = readBrowserDisplayLayers();
        const grid = document.getElementById('displayLayerGrid');
        if (!grid) return;
        const rows = [
            ['CSS 视口', `${layers.viewportCssPx.w}×${layers.viewportCssPx.h}`],
            ['screen 逻辑 px', `${layers.screenLogicalPx.w}×${layers.screenLogicalPx.h}`],
            ['avail 逻辑 px', `${layers.screenAvailLogicalPx.w}×${layers.screenAvailLogicalPx.h}`],
            ['DPR', String(layers.devicePixelRatio)],
            ['背板近似 px', `${layers.backingApproxPx.w}×${layers.backingApproxPx.h}`]
        ];
        grid.innerHTML = rows.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
    }

    refreshScreenList() {
        const el = document.getElementById('screenList');
        if (!el) return;
        const profiles = loadScreenProfiles();
        const known = this._lastScreens || [];
        if (!known.length) {
            const key = this.activeScreenKey;
            const p = profiles[key];
            el.innerHTML = `<p>当前档案 key：<code>${key}</code>${p?.userLabel ? ` · ${p.userLabel}` : ''}（粗粒度本地键，非硬件指纹）</p>`;
            const labelInput = document.getElementById('screenProfileLabel');
            if (labelInput && p?.userLabel) labelInput.value = p.userLabel;
            return;
        }
        el.innerHTML = known.map((s) => {
            const p = profiles[s.key];
            const name = p?.userLabel || s.label || (s.isInternal === true ? '内建屏' : s.isInternal === false ? '外接屏' : '显示器');
            const mark = s.key === this.activeScreenKey ? ' ✓' : '';
            return `<button type="button" class="secondary screen-pick" data-key="${s.key}">${name} ${s.width}×${s.height}${mark}</button>`;
        }).join('');
        el.querySelectorAll('.screen-pick').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.selectScreenProfile(btn.getAttribute('data-key'));
            });
        });
    }

    selectScreenProfile(key) {
        if (!key) return;
        this.activeScreenKey = key;
        saveActiveScreenKey(key);
        const profile = loadScreenProfiles()[key];
        const labelInput = document.getElementById('screenProfileLabel');
        if (labelInput) labelInput.value = profile?.userLabel || '';
        // Offer saved calibration as suggestion — do not auto-overwrite live params
        if (profile?.calibration?.screenPhysical) {
            this.pendingScreenPhysical = profile.calibration.screenPhysical;
            this.pendingDisplaySuggest = {
                widthM: profile.calibration.widthM,
                heightM: profile.calibration.heightM,
                labeled: `来自已保存全屏档案「${profile.userLabel || key}」——点「写入」或打开全屏校准第②步应用`
            };
            this.showPendingSuggest();
        } else if (profile?.calibration?.widthM && profile?.calibration?.heightM) {
            this.pendingDisplaySuggest = {
                widthM: profile.calibration.widthM,
                heightM: profile.calibration.heightM,
                labeled: `来自已保存档案「${profile.userLabel || key}」——点「写入当前投影宽高」才会应用`
            };
            this.showPendingSuggest();
        }
        this.refreshScreenList();
        this.setStatus('已选择显示器档案（未自动改写投影）', 'success');
    }

    async onRecognizeDisplays() {
        this.setStatus('正在请求显示器信息（需你授权）…', 'loading');
        const result = await requestScreenDetails();
        this.setStatus(result.message, result.ok ? 'success' : 'error');
        if (!result.ok) {
            this._lastScreens = [];
            this.refreshScreenList();
            this.refreshDisplayLayers();
            return;
        }
        this.screenDetails = result.details;
        this._lastScreens = result.screens;
        if (result.current) {
            this.activeScreenKey = result.current.key;
            saveActiveScreenKey(this.activeScreenKey);
            upsertScreenProfile(result.current.key, {
                label: result.current.label,
                isInternal: result.current.isInternal,
                width: result.current.width,
                height: result.current.height,
                devicePixelRatio: result.current.devicePixelRatio
            }, { overwriteCalibration: false });
        }
        for (const s of result.screens) {
            upsertScreenProfile(s.key, {
                label: s.label,
                isInternal: s.isInternal,
                width: s.width,
                height: s.height,
                devicePixelRatio: s.devicePixelRatio
            }, { overwriteCalibration: false });
        }
        this.refreshScreenList();
        this.refreshDisplayLayers();

        if (this._unsubScreens) this._unsubScreens();
        this._unsubScreens = observeScreenDetails(this.screenDetails, ({ screens, current }) => {
            this._lastScreens = screens;
            if (current) {
                const prevKey = this.activeScreenKey;
                this.activeScreenKey = current.key;
                saveActiveScreenKey(current.key);
                upsertScreenProfile(current.key, {
                    label: current.label,
                    isInternal: current.isInternal,
                    width: current.width,
                    height: current.height,
                    devicePixelRatio: current.devicePixelRatio
                }, { overwriteCalibration: false });
                // Refresh suggestion from saved profile if any; never overwrite live params
                if (current.key !== prevKey) {
                    const profile = loadScreenProfiles()[current.key];
                    if (profile?.calibration) {
                        this.pendingDisplaySuggest = {
                            widthM: profile.calibration.widthM,
                            heightM: profile.calibration.heightM,
                            labeled: '显示器已切换：已加载该屏档案建议（未自动写入）'
                        };
                        this.showPendingSuggest();
                        this.setStatus('检测到当前屏切换；建议已刷新，未覆盖你的当前滑杆值', 'success');
                    } else {
                        this.setStatus('检测到当前屏切换；该屏尚无保存校准', 'loading');
                    }
                }
            }
            this.refreshScreenList();
            this.refreshDisplayLayers();
        });
    }

    persistCurrentScreenCalibration() {
        const key = this.activeScreenKey || screenProfileKey(readBrowserDisplayLayers());
        this.activeScreenKey = key;
        saveActiveScreenKey(key);
        const label = document.getElementById('screenProfileLabel')?.value || '';
        setProfileCalibration(key, {
            widthM: this.params.width,
            heightM: this.params.height,
            tiltDeg: this.params.tiltDegrees,
            eyeX: this.params.eye.x,
            eyeY: this.params.eye.y,
            eyeZ: this.params.eye.z,
            quality: this.quality,
            screenPhysical: this.screenPhysical,
            projectionMode: this.projectionMode
        });
        if (label) renameScreenProfile(key, label);
        upsertScreenProfile(key, {
            layers: readBrowserDisplayLayers(),
            fullscreenCalibrated: this.projectionMode === 'calibrated'
        }, { overwriteCalibration: false });
    }

    setupCalibration() {
        const steps = [
            { title: '① 确认模型正向', text: '文镜应正面朝向你。若背面朝外，点「重新加载文镜」。' },
            { title: '② 选择显示预设或比例尺', text: '在下方手动选 MacBook / 外接预设，或用信用卡比例尺；不会自动当成已识别机型。' },
            { title: '③ 调支架倾角与眼睛 Z', text: '从 10–15° 开始；拉近/推远直到全身留有边距。' },
            { title: '④ 保存本屏档案', text: '「写入当前投影宽高」后，再到「显示器与能力」保存本屏校准；换屏不会静默覆盖。' }
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

    setupDisplayCalibration() {
        const sel = document.getElementById('displayPreset');
        if (sel) {
            sel.innerHTML = this.displayPresets.map((p) =>
                `<option value="${p.id}">${p.label}</option>`
            ).join('');
            sel.addEventListener('change', () => this.onDisplayPresetChange());
            this.onDisplayPresetChange();
        }

        document.getElementById('applyDisplayPreset')?.addEventListener('click', () => {
            this.buildDisplaySuggestionFromPreset();
        });
        document.getElementById('commitSuggestedDisplay')?.addEventListener('click', () => {
            this.commitPendingDisplaySuggest();
        });

        const ruler = document.getElementById('rulerWidthPx');
        const rulerVal = document.getElementById('rulerWidthPxValue');
        const card = document.getElementById('rulerCard');
        const syncRuler = () => {
            const px = Number(ruler?.value || 120);
            if (rulerVal) rulerVal.textContent = `${px} px`;
            if (card) card.style.width = `${px}px`;
        };
        ruler?.addEventListener('input', syncRuler);
        syncRuler();

        document.getElementById('applyRulerCalibration')?.addEventListener('click', () => {
            const px = Number(document.getElementById('rulerWidthPx')?.value || 0);
            const result = calibrateFromRuler(px, CREDIT_CARD_MM.width);
            if (!result) {
                this.setStatus('比例尺无效', 'error');
                return;
            }
            const suggest = suggestViewportPhysicalMeters(result.screenWidthM, result.screenHeightM);
            this.pendingDisplaySuggest = {
                widthM: suggest.widthM,
                heightM: suggest.heightM,
                labeled: `${result.labeled}；整屏约 ${result.widthCm.toFixed(1)}×${result.heightCm.toFixed(1)} cm。${suggest.labeled}`
            };
            this.showPendingSuggest();
            this.setStatus('已由比例尺生成建议（未自动写入）', 'success');
        });
    }

    onDisplayPresetChange() {
        const id = document.getElementById('displayPreset')?.value;
        const preset = this.displayPresets.find((p) => p.id === id);
        const hint = document.getElementById('displayPresetHint');
        const custom = document.getElementById('customExternalFields');
        if (hint && preset) {
            hint.textContent = `${preset.physicalLabel} · ${preset.source}`;
        }
        if (custom) {
            custom.classList.toggle('visible', id === 'ext-custom');
        }
    }

    buildDisplaySuggestionFromPreset() {
        const id = document.getElementById('displayPreset')?.value;
        const preset = this.displayPresets.find((p) => p.id === id);
        if (!preset) return;

        let screenW;
        let screenH;
        let labeled;

        if (id === 'ext-custom') {
            const diagonalIn = Number(document.getElementById('customDiagonalIn')?.value);
            const widthCm = Number(document.getElementById('customWidthCm')?.value);
            const heightCm = Number(document.getElementById('customHeightCm')?.value);
            const aspect = Number(document.getElementById('customAspect')?.value) || 16 / 9;
            const custom = applyCustomExternal({ diagonalIn, widthCm, heightCm, aspect });
            if (!custom) {
                this.setStatus('请填写对角或宽高 cm', 'error');
                return;
            }
            screenW = custom.widthM;
            screenH = custom.heightM;
            labeled = `自定义外接：${custom.source}`;
        } else if (preset.physical) {
            screenW = preset.physical.widthM;
            screenH = preset.physical.heightM;
            labeled = `${preset.label} — ${preset.physicalLabel}`;
        } else {
            this.setStatus('该预设无可用尺寸', 'error');
            return;
        }

        const suggest = suggestViewportPhysicalMeters(screenW, screenH);
        this.pendingDisplaySuggest = {
            widthM: suggest.widthM,
            heightM: suggest.heightM,
            labeled: `${labeled}。${suggest.labeled}`
        };
        this.showPendingSuggest();
        this.setStatus('已生成显示建议（未自动写入已保存值）', 'success');
    }

    showPendingSuggest() {
        const note = document.getElementById('displaySuggestNote');
        if (!note || !this.pendingDisplaySuggest) return;
        const s = this.pendingDisplaySuggest;
        note.textContent =
            `建议视口投影：宽 ${mToCm(s.widthM)} × 高 ${mToCm(s.heightM)}。${s.labeled}`;
    }

    refreshSuggestedNoteFromLayers() {
        // Keep note text current if we have a pending suggest; do not change params
        if (this.pendingDisplaySuggest) this.showPendingSuggest();
    }

    commitPendingDisplaySuggest() {
        if (!this.pendingDisplaySuggest) {
            this.setStatus('没有待写入的建议', 'error');
            return;
        }
        this.userLockedWidth = true;
        this.params.width = this.pendingDisplaySuggest.widthM;
        this.params.height = this.pendingDisplaySuggest.heightM;
        this.syncSlidersFromParams();
        this.updateProjection();
        if (this.vrm) this.normalizeAndAnchor();
        this.setStatus('已写入建议投影宽高（可再保存本屏档案）', 'success');
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
            screenPhysical: this.screenPhysical,
            projectionMode: this.projectionMode,
            panelCollapsed: this.settings.panelCollapsed
        };
    }

    setupFullscreenWizard() {
        const feat = featureDetectFullscreen(this.sceneContainer);
        const sideHint = document.getElementById('fsSidebarHint');
        if (sideHint) {
            sideHint.textContent = feat.supported
                ? '主流程：场景全屏校准（设置栏不进入全屏）。全屏≠知道物理厘米。外接屏请先拖到目标显示器。'
                : feat.explanation;
        }

        const open = () => this.openFullscreenWizard();
        document.getElementById('startFullscreenCalib')?.addEventListener('click', open);
        document.getElementById('fsCalibrateOpen')?.addEventListener('click', open);
        document.getElementById('fsWizardPrev')?.addEventListener('click', () => this.fsWizardNavigate(-1));
        document.getElementById('fsWizardNext')?.addEventListener('click', () => this.fsWizardNavigate(1));
        document.getElementById('fsWizardCollapse')?.addEventListener('click', () => this.collapseFullscreenWizard());
        document.getElementById('fsWizardExitFs')?.addEventListener('click', async () => {
            await exitSceneFullscreen();
            this.updateProjectionModeBanner();
        });

        this._unsubFs = onFullscreenChange(() => {
            const fs = isElementFullscreen(this.sceneContainer);
            if (!fs) {
                // Leaving fullscreen → preview mode messaging (keep physical map if saved)
                if (this.projectionMode === 'calibrated' && this.screenPhysical) {
                    this.setStatus('已退出全屏：预览模式（按画布 CSS 映射物理比例，非整屏）', 'loading');
                } else {
                    this.setStatus('已退出全屏：预览模式 · 尚未完成全屏物理校准', 'loading');
                }
                this.applyPhysicalMappingToParams();
            } else {
                this.setStatus('场景全屏中：请完成物理尺寸确认（像素≠厘米）', 'success');
                this.applyPhysicalMappingToParams();
            }
            this.updateProjectionModeBanner();
            // Force layout sync after FS transition
            requestAnimationFrame(() => this.syncRendererToCanvas());
        });
    }

    openFullscreenWizard() {
        this.fsWizardOpen = true;
        this.fsWizardStep = 0;
        const wiz = document.getElementById('fsWizard');
        if (wiz) wiz.hidden = false;
        this.renderFsWizardStep();
        this.setStatus('已打开全屏校准向导（需你点击进入全屏）', 'loading');
    }

    collapseFullscreenWizard() {
        this.fsWizardOpen = false;
        const wiz = document.getElementById('fsWizard');
        if (wiz) wiz.hidden = true;
        const fab = document.getElementById('fsCalibrateOpen');
        if (fab) fab.hidden = false;
    }

    async fsWizardNavigate(delta) {
        const step = FS_WIZARD_STEPS[this.fsWizardStep];
        if (delta > 0) {
            const ok = await this.fsWizardAdvanceGate(step);
            if (!ok) return;
        }
        this.fsWizardStep = Math.max(0, Math.min(FS_WIZARD_STEPS.length - 1, this.fsWizardStep + delta));
        if (delta > 0 && step.id === 'save') {
            this.finishFullscreenCalibration();
            return;
        }
        this.renderFsWizardStep();
    }

    async fsWizardAdvanceGate(step) {
        if (step.id === 'fullscreen') {
            if (!isElementFullscreen(this.sceneContainer)) {
                const res = await enterSceneFullscreen(this.sceneContainer);
                this.setStatus(res.message || (res.ok ? '已全屏' : '全屏失败'), res.ok ? 'success' : 'error');
                if (!res.ok) {
                    // Allow continuing in large-window fallback with clear warning
                    const warn = document.getElementById('fsWizardWarn');
                    if (warn) {
                        warn.textContent =
                            '未能进入全屏。可继续在当前窗口校准，但存在边框/窗口尺寸歧义；外接屏请先拖到目标显示器。';
                    }
                    return true; // still allow wizard with fallback messaging
                }
                await new Promise((r) => setTimeout(r, 100));
                this.syncRendererToCanvas();
            }
            return true;
        }
        if (step.id === 'display') {
            const applied = this.applyFsWizardPhysicalFromFields();
            if (!applied) {
                this.setStatus('请选择预设、填写物理尺寸或使用比例尺', 'error');
                return false;
            }
            return true;
        }
        if (step.id === 'tilt' || step.id === 'eye') {
            this.readFsWizardViewParams();
            return true;
        }
        return true;
    }

    renderFsWizardStep() {
        const step = FS_WIZARD_STEPS[this.fsWizardStep];
        const title = document.getElementById('fsWizardTitle');
        const body = document.getElementById('fsWizardBody');
        const fields = document.getElementById('fsWizardFields');
        const next = document.getElementById('fsWizardNext');
        const prev = document.getElementById('fsWizardPrev');
        if (title) title.textContent = step.title;
        if (body) body.textContent = step.body;
        if (prev) prev.disabled = this.fsWizardStep === 0;
        if (next) next.textContent = step.id === 'save' ? '保存并完成' : '下一步';

        if (!fields) return;
        if (step.id === 'fullscreen') {
            const feat = featureDetectFullscreen(this.sceneContainer);
            fields.innerHTML = `
                <button type="button" id="fsEnterBtn">进入场景全屏</button>
                <p class="warn">${feat.explanation}</p>
                <p class="hint">外接显示器：先把浏览器窗口拖到目标屏，再点全屏，然后在下一步选择/保存该屏档案。</p>`;
            document.getElementById('fsEnterBtn')?.addEventListener('click', async () => {
                const res = await enterSceneFullscreen(this.sceneContainer);
                this.setStatus(res.message || '', res.ok ? 'success' : 'error');
                this.syncRendererToCanvas();
                this.updateProjectionModeBanner();
            });
        } else if (step.id === 'display') {
            const opts = this.displayPresets.map((p) =>
                `<option value="${p.id}">${p.label}</option>`
            ).join('');
            fields.innerHTML = `
                <label>显示预设</label>
                <select id="fsPreset">${opts}</select>
                <p class="hint" id="fsPresetHint"></p>
                <div id="fsCustomBox" class="custom-fields">
                    <label>对角英寸</label>
                    <input type="number" id="fsDiag" step="0.1" min="10" max="50">
                    <label>宽 cm</label>
                    <input type="number" id="fsWcm" step="0.1">
                    <label>高 cm</label>
                    <input type="number" id="fsHcm" step="0.1">
                </div>
                <div class="fs-mini-ruler">
                    <p class="hint">信用卡宽 85.6 mm — 调至与实体卡同宽（CSS px，不乘 DPR）</p>
                    <div class="ruler-card" id="fsRulerCard">卡</div>
                    <input type="range" id="fsRulerPx" min="40" max="320" value="120">
                    <div class="value-display" id="fsRulerPxVal">120 px</div>
                    <button type="button" class="secondary" id="fsUseRuler">用比例尺推算整屏</button>
                </div>
                <p class="hint" id="fsPhysNote"></p>`;
            const syncPreset = () => {
                const id = document.getElementById('fsPreset')?.value;
                const p = this.displayPresets.find((x) => x.id === id);
                const hint = document.getElementById('fsPresetHint');
                if (hint && p) hint.textContent = `${p.physicalLabel} · ${p.source}`;
                document.getElementById('fsCustomBox')?.classList.toggle('visible', id === 'ext-custom');
            };
            document.getElementById('fsPreset')?.addEventListener('change', syncPreset);
            syncPreset();
            const ruler = document.getElementById('fsRulerPx');
            const card = document.getElementById('fsRulerCard');
            const val = document.getElementById('fsRulerPxVal');
            const syncR = () => {
                const px = Number(ruler?.value || 120);
                if (val) val.textContent = `${px} px`;
                if (card) card.style.width = `${px}px`;
            };
            ruler?.addEventListener('input', syncR);
            syncR();
            document.getElementById('fsUseRuler')?.addEventListener('click', () => {
                const px = Number(document.getElementById('fsRulerPx')?.value || 0);
                const screenCss = readMappingScreenCss(this.sceneContainer);
                const result = calibrateFromRuler(px, CREDIT_CARD_MM.width, {
                    viewportCssPx: readCanvasCssBounds(this.canvas),
                    screenLogicalPx: screenCss,
                    devicePixelRatio: window.devicePixelRatio || 1,
                    backingApproxPx: { w: 0, h: 0 },
                    screenAvailLogicalPx: screenCss
                });
                if (!result) return;
                this.pendingScreenPhysical = {
                    widthM: result.screenWidthM,
                    heightM: result.screenHeightM,
                    source: 'credit-card-ruler-css-px',
                    labeled: result.labeled
                };
                const note = document.getElementById('fsPhysNote');
                if (note) {
                    note.textContent =
                        `整屏约 ${result.widthCm.toFixed(1)}×${result.heightCm.toFixed(1)} cm（由 CSS px 推算，未乘 DPR）`;
                }
            });
        } else if (step.id === 'tilt') {
            fields.innerHTML = `
                <label>支架倾角（相对竖直）</label>
                <input type="range" id="fsTilt" min="0" max="90" step="1" value="${this.params.tiltDegrees}">
                <div class="value-display" id="fsTiltVal">${degLabel(this.params.tiltDegrees)}</div>`;
            const el = document.getElementById('fsTilt');
            const val = document.getElementById('fsTiltVal');
            el?.addEventListener('input', () => {
                const n = Number(el.value);
                if (val) val.textContent = degLabel(n);
                this.params.tiltDegrees = n;
                this.updateProjection();
            });
        } else if (step.id === 'eye') {
            fields.innerHTML = `
                <label>眼睛 X</label>
                <input type="range" id="fsEyeX" min="-0.3" max="0.3" step="0.01" value="${this.params.eye.x}">
                <div class="value-display" id="fsEyeXVal">${mToCm(this.params.eye.x)}</div>
                <label>眼睛 Y</label>
                <input type="range" id="fsEyeY" min="-0.4" max="0.4" step="0.01" value="${this.params.eye.y}">
                <div class="value-display" id="fsEyeYVal">${mToCm(this.params.eye.y)}</div>
                <label>眼睛 Z</label>
                <input type="range" id="fsEyeZ" min="0.2" max="1.5" step="0.01" value="${this.params.eye.z}">
                <div class="value-display" id="fsEyeZVal">${mToCm(this.params.eye.z)}</div>`;
            const bind = (id, valId, apply, fmt) => {
                const el = document.getElementById(id);
                const val = document.getElementById(valId);
                el?.addEventListener('input', () => {
                    const n = Number(el.value);
                    if (val) val.textContent = fmt(n);
                    apply(n);
                    this.updateProjection();
                });
            };
            bind('fsEyeX', 'fsEyeXVal', (n) => { this.params.eye.x = n; }, mToCm);
            bind('fsEyeY', 'fsEyeYVal', (n) => { this.params.eye.y = n; }, mToCm);
            bind('fsEyeZ', 'fsEyeZVal', (n) => { this.params.eye.z = n; }, mToCm);
        } else if (step.id === 'save') {
            fields.innerHTML = `
                <p>将保存：整屏物理尺寸 + 倾角/视点到本屏档案。退出全屏后为预览映射。</p>
                <label>档案显示名</label>
                <input type="text" id="fsSaveLabel" maxlength="64" placeholder="例如：MacBook / 书房外接"
                    value="${document.getElementById('screenProfileLabel')?.value || ''}">`;
        }
    }

    applyFsWizardPhysicalFromFields() {
        if (this.pendingScreenPhysical?.widthM) {
            this.screenPhysical = { ...this.pendingScreenPhysical };
            this.applyPhysicalMappingToParams();
            return true;
        }
        const id = document.getElementById('fsPreset')?.value;
        const preset = this.displayPresets.find((p) => p.id === id);
        if (!preset) return false;
        let widthM;
        let heightM;
        let source;
        let labeled;
        if (id === 'ext-custom') {
            const custom = applyCustomExternal({
                diagonalIn: Number(document.getElementById('fsDiag')?.value),
                widthCm: Number(document.getElementById('fsWcm')?.value),
                heightCm: Number(document.getElementById('fsHcm')?.value),
                aspect: 16 / 9
            });
            if (!custom) return false;
            widthM = custom.widthM;
            heightM = custom.heightM;
            source = custom.source;
            labeled = '自定义外接物理尺寸';
        } else if (preset.physical) {
            widthM = preset.physical.widthM;
            heightM = preset.physical.heightM;
            source = preset.source;
            labeled = preset.physicalLabel;
        } else {
            return false;
        }
        this.screenPhysical = { widthM, heightM, source, labeled };
        this.pendingScreenPhysical = this.screenPhysical;
        this.applyPhysicalMappingToParams();
        const note = document.getElementById('fsPhysNote');
        if (note) note.textContent = `整屏物理：${mToCm(widthM)} × ${mToCm(heightM)}（${labeled}）`;
        return true;
    }

    readFsWizardViewParams() {
        const tilt = document.getElementById('fsTilt');
        if (tilt) this.params.tiltDegrees = Number(tilt.value);
        const x = document.getElementById('fsEyeX');
        const y = document.getElementById('fsEyeY');
        const z = document.getElementById('fsEyeZ');
        if (x) this.params.eye.x = Number(x.value);
        if (y) this.params.eye.y = Number(y.value);
        if (z) this.params.eye.z = Number(z.value);
        this.syncSlidersFromParams();
        this.updateProjection();
    }

    finishFullscreenCalibration() {
        this.readFsWizardViewParams();
        if (!this.screenPhysical) this.applyFsWizardPhysicalFromFields();
        if (!this.screenPhysical) {
            this.setStatus('缺少整屏物理尺寸，无法完成校准', 'error');
            return;
        }
        this.projectionMode = 'calibrated';
        this.userLockedWidth = true;
        this.applyPhysicalMappingToParams();
        const label = document.getElementById('fsSaveLabel')?.value || '';
        if (label) {
            const input = document.getElementById('screenProfileLabel');
            if (input) input.value = label;
        }
        this.persistCurrentScreenCalibration();
        this.settings = saveSettings(this.snapshotSettings());
        this.collapseFullscreenWizard();
        this.updateProjectionModeBanner();
        this.setStatus('全屏校准已保存。可退出全屏进入预览映射，或保持全屏观看。', 'success');
    }

    applyPhysicalMappingToParams() {
        if (!this.screenPhysical) return;
        const canvasCss = readCanvasCssBounds(this.canvas);
        const screenCss = readMappingScreenCss(this.sceneContainer);
        const mapped = mapCanvasPhysicalFromScreen(this.screenPhysical, canvasCss, screenCss);
        if (!mapped) return;
        this.params.width = mapped.widthM;
        this.params.height = mapped.heightM;
        this.userLockedWidth = true;
        this.syncSlidersFromParams();
        this.updateProjection();
        if (this.vrm) this.normalizeAndAnchor();
    }

    updateProjectionModeBanner() {
        const el = this.fsModeBanner;
        if (!el) return;
        const fs = isElementFullscreen(this.sceneContainer);
        if (fs && this.projectionMode === 'calibrated' && this.screenPhysical) {
            el.className = 'fs-banner calibrated';
            el.textContent =
                `全屏校准投影 · 整屏约 ${mToCm(this.screenPhysical.widthM)}×${mToCm(this.screenPhysical.heightM)}（用户确认，非 OS 实测）`;
        } else if (this.projectionMode === 'calibrated' && this.screenPhysical) {
            el.className = 'fs-banner';
            el.textContent =
                '预览模式 · 已保存全屏物理档案；当前按画布 CSS 比例映射（非整屏）。像素≠物理厘米。';
        } else {
            el.className = 'fs-banner';
            el.textContent = '预览模式 · 尚未完成全屏物理校准（像素≠物理厘米）';
        }
    }

    syncRendererToCanvas() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        if (width <= 0 || height <= 0) return;
        this.renderer.setSize(width, height, false);
        if (this.screenPhysical) {
            this.applyPhysicalMappingToParams();
        } else if (!this.userLockedWidth) {
            this.params.width = this.params.height * (width / height);
            this.syncSlidersFromParams();
            this.updateProjection();
        } else {
            this.updateProjection();
        }
        if (this.vrm) this.normalizeAndAnchor();
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
            this.screenPhysical = null;
            this.projectionMode = 'preview';
            this.userLockedWidth = false;
            this.applyQuality();
            this.syncSlidersFromParams();
            this.setupPanels();
            this.updateProjection();
            this.updateProjectionModeBanner();
            if (this.vrm) this.normalizeAndAnchor();
            this.setStatus('已重置为默认设置（预览模式）', 'success');
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
        const applySize = () => this.syncRendererToCanvas();
        new ResizeObserver(applySize).observe(this.canvas);
        if (this.sceneContainer) {
            new ResizeObserver(applySize).observe(this.sceneContainer);
        }
        window.addEventListener('orientationchange', () => {
            setTimeout(applySize, 200);
        });
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
