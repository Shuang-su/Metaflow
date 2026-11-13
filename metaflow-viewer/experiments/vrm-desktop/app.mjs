/**
 * Standalone Three.js + @pixiv/three-vrm Desktop Portrait Viewer
 * Pure Three.js implementation with off-axis projection calibration
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { getProjection, tablePose } from './projection.mjs';
import { VRMAnimator } from './vrm-animator.mjs';
import { generateTestAudio } from './test-audio.mjs';

// Expose THREE to window for diagnostics
window.THREE = THREE;

class DesktopPortraitApp {
    constructor() {
        this.canvas = document.getElementById('main-canvas');
        this.statusEl = document.getElementById('status');
        
        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a);
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        
        // Camera (will be updated with off-axis projection)
        this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 10);
        // Position set by updateProjection based on eye parameter
        
        // Lighting
        this.setupLighting();
        
        // Screen parameters (initialize before desk)
        // Calibrated for desktop/tablet viewing with controls on right
        this.params = {
            width: 0.30,      // 30cm screen width
            height: 0.20,     // 20cm screen height  
            tiltDegrees: 15,  // Slight tilt
            eye: { x: -0.05, y: 0.08, z: 0.45 }  // Eye slightly left and closer for better framing
        };
        
        // Desk plane
        this.deskRoot = new THREE.Group();
        this.deskRoot.name = 'DeskRoot';
        this.scene.add(this.deskRoot);
        this.createDesk();
        
        // VRM model container
        this.personRoot = new THREE.Group();
        this.personRoot.name = 'PersonRoot';
        this.scene.add(this.personRoot);
        
        // State
        this.vrm = null;
        this.animator = null;
        this.clock = new THREE.Clock();
        
        // Setup UI
        this.setupControls();
        this.setupResize();
        
        // Initial projection update
        this.updateProjection();
        
        // Start render loop
        this.animate();
        
        // Load default model
        this.loadDefaultModel();
    }
    
    setupLighting() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);
        
        // Key light (from upper front)
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
        keyLight.position.set(1, 2, 3);
        this.scene.add(keyLight);
        
        // Fill light (from side)
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-2, 1, 1);
        this.scene.add(fillLight);
        
        // Rim light (from behind)
        const rimLight = new THREE.DirectionalLight(0xffffff, 0.2);
        rimLight.position.set(0, 1, -2);
        this.scene.add(rimLight);
    }
    
    createDesk() {
        // Desk plane geometry
        const geometry = new THREE.PlaneGeometry(2, 2, 20, 20);
        
        // Wood-like material with procedural variation
        const material = new THREE.MeshStandardMaterial({
            color: 0xc19a6b,
            roughness: 0.8,
            metalness: 0.1,
            side: THREE.DoubleSide
        });
        
        const desk = new THREE.Mesh(geometry, material);
        desk.name = 'Desk';
        desk.receiveShadow = true;
        
        // Rotate to horizontal
        desk.rotation.x = -Math.PI / 2;
        
        this.deskRoot.add(desk);
        this.updateDeskPose();
    }
    
    updateDeskPose() {
        const pose = tablePose({
            height: this.params.height,
            tiltDegrees: this.params.tiltDegrees
        });
        
        // Apply rotation and position
        this.deskRoot.rotation.x = pose.rotationX * Math.PI / 180;
        this.deskRoot.position.set(
            pose.position.x,
            pose.position.y,
            pose.position.z
        );
    }
    
    updateProjection() {
        const proj = getProjection(this.params);
        
        // Set camera position from eye parameters
        this.camera.position.set(proj.eye.x, proj.eye.y, proj.eye.z);
        
        // Update camera FOV and aspect
        this.camera.fov = proj.fov;
        this.camera.aspect = proj.aspect;
        
        // Build off-axis projection matrix
        const near = this.camera.near;
        const far = this.camera.far;
        const fov = proj.fov * Math.PI / 180;
        const top = near * Math.tan(fov / 2);
        const bottom = -top;
        const right = top * proj.aspect;
        const left = -right;
        
        // Apply offset (shift frustum based on eye position relative to screen center)
        const offsetX = proj.offset.x * (right - left) / 2;
        const offsetY = proj.offset.y * (top - bottom) / 2;
        
        // Manual projection matrix (off-axis frustum)
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
        
        // Update desk pose
        this.updateDeskPose();
    }
    
    async loadVRM(url) {
        try {
            console.log(`[VRM] Loading from: ${url}`);
            this.setStatus('正在加载 VRM 模型...', 'loading');
            
            const loader = new GLTFLoader();
            loader.register((parser) => new VRMLoaderPlugin(parser));
            
            console.log('[VRM] Starting loadAsync...');
            const gltf = await loader.loadAsync(url);
            console.log('[VRM] GLTF loaded');
            
            if (!gltf.userData.vrm) {
                throw new Error('Not a valid VRM file');
            }
            
            // Clear old model
            if (this.vrm) {
                this.personRoot.remove(this.vrm.scene);
                VRMUtils.deepDispose(this.vrm.scene);
                if (this.animator) {
                    this.animator.dispose();
                }
            }
            
            this.vrm = gltf.userData.vrm;
            console.log('[VRM] VRM object extracted:', !!this.vrm);
            this.personRoot.add(this.vrm.scene);
            
            // Normalize and anchor to desk
            console.log('[VRM] Normalizing and anchoring...');
            this.normalizeAndAnchor();
            
            // Setup animator
            console.log('[VRM] Setting up animator...');
            this.animator = new VRMAnimator(this.vrm, this.camera);
            
            console.log('[VRM] Load complete!');
            this.setStatus(`VRM 加载成功: ${this.vrm.meta?.name || 'Unknown'}`, 'success');
            
            // Expose for diagnostics
            window.diagnostics = {
                ready: true,
                modelType: 'vrm',
                vrmMeta: this.vrm.meta,
                hasExpressions: !!this.vrm.expressionManager,
                hasLookAt: !!this.vrm.lookAt,
                hasSpringBone: !!this.vrm.springBoneManager
            };
            
        } catch (error) {
            console.error('VRM load error:', error);
            this.setStatus(`加载失败: ${error.message}`, 'error');
            throw error;
        }
    }
    
    normalizeAndAnchor() {
        if (!this.vrm) return;
        
        const scene = this.vrm.scene;
        
        // Compute bounding box
        const box = new THREE.Box3().setFromObject(scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        console.log('[Normalize] Original size:', size.toArray());
        console.log('[Normalize] Original center:', center.toArray());
        
        // Target: fit character within screen height with desk visible at bottom
        // Leave ~3cm for desk visibility, use remaining height for character
        const availableHeight = this.params.height * 0.85; // 85% of screen for character
        const targetHeight = availableHeight;
        const scale = targetHeight / size.y;
        scene.scale.setScalar(scale);
        
        console.log('[Normalize] Scale factor:', scale, 'target height:', targetHeight);
        
        // Recompute after scaling
        box.setFromObject(scene);
        size.copy(box.getSize(new THREE.Vector3()));
        center.copy(box.getCenter(new THREE.Vector3()));
        const bottom = box.min.y;
        const top = box.max.y;
        const characterHeight = top - bottom;
        
        console.log('[Normalize] Scaled size:', size.toArray());
        console.log('[Normalize] Character height:', characterHeight, 'bottom:', bottom, 'top:', top);
        
        // Anchor lowest point (feet) to y=0 in person root local space
        scene.position.set(-center.x, -bottom, -center.z);
        
        // Recompute box after positioning
        box.setFromObject(scene);
        const newBottom = box.min.y;
        const newTop = box.max.y;
        console.log('[Normalize] After scene reposition - bottom:', newBottom, 'top:', newTop);
        
        // Position person root so feet are on desk surface
        // Desk is at bottom of screen (-height/2)
        // Feet should be slightly above desk surface
        const deskY = -this.params.height / 2;
        this.personRoot.position.y = deskY + 0.002; // 2mm above desk
        
        console.log('[Normalize] VRM scene position:', scene.position.toArray());
        console.log('[Normalize] Person root position:', this.personRoot.position.toArray());
        console.log('[Normalize] Expected world feet Y:', this.personRoot.position.y + newBottom);
    }
    
    async loadDefaultModel() {
        try {
            // Load minimal CC0 VRM (will create next)
            await this.loadVRM('./models/minimal-avatar.vrm');
        } catch (error) {
            console.error('Default model load failed:', error);
            this.setStatus('默认模型加载失败，请手动选择 VRM 文件', 'error');
        }
    }
    
    setupControls() {
        // Screen width
        const widthSlider = document.getElementById('screenWidth');
        const widthValue = document.getElementById('screenWidthValue');
        widthSlider.addEventListener('input', (e) => {
            this.params.width = parseFloat(e.target.value);
            widthValue.textContent = `${this.params.width.toFixed(2)} m`;
            this.updateProjection();
        });
        
        // Screen height
        const heightSlider = document.getElementById('screenHeight');
        const heightValue = document.getElementById('screenHeightValue');
        heightSlider.addEventListener('input', (e) => {
            this.params.height = parseFloat(e.target.value);
            heightValue.textContent = `${this.params.height.toFixed(2)} m`;
            this.updateProjection();
            if (this.vrm) this.normalizeAndAnchor();
        });
        
        // Tilt
        const tiltSlider = document.getElementById('tiltDegrees');
        const tiltValue = document.getElementById('tiltDegreesValue');
        tiltSlider.addEventListener('input', (e) => {
            this.params.tiltDegrees = parseFloat(e.target.value);
            tiltValue.textContent = `${this.params.tiltDegrees.toFixed(0)}°`;
            this.updateProjection();
        });
        
        // Eye X
        const eyeXSlider = document.getElementById('eyeX');
        const eyeXValue = document.getElementById('eyeXValue');
        eyeXSlider.addEventListener('input', (e) => {
            this.params.eye.x = parseFloat(e.target.value);
            eyeXValue.textContent = `${this.params.eye.x.toFixed(2)} m`;
            this.updateProjection();
        });
        
        // Eye Y
        const eyeYSlider = document.getElementById('eyeY');
        const eyeYValue = document.getElementById('eyeYValue');
        eyeYSlider.addEventListener('input', (e) => {
            this.params.eye.y = parseFloat(e.target.value);
            eyeYValue.textContent = `${this.params.eye.y.toFixed(2)} m`;
            this.updateProjection();
        });
        
        // Eye Z
        const eyeZSlider = document.getElementById('eyeZ');
        const eyeZValue = document.getElementById('eyeZValue');
        eyeZSlider.addEventListener('input', (e) => {
            this.params.eye.z = parseFloat(e.target.value);
            eyeZValue.textContent = `${this.params.eye.z.toFixed(2)} m`;
            this.updateProjection();
        });
        
        // VRM file input
        document.getElementById('vrmFile').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                const url = URL.createObjectURL(file);
                try {
                    await this.loadVRM(url);
                } finally {
                    URL.revokeObjectURL(url);
                }
            }
        });
        
        // Load default button
        document.getElementById('loadDefaultModel').addEventListener('click', () => {
            this.loadDefaultModel();
        });
        
        // Test audio button
        document.getElementById('playTestAudio').addEventListener('click', async () => {
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
        const resizeObserver = new ResizeObserver(() => {
            const width = this.canvas.clientWidth;
            const height = this.canvas.clientHeight;
            this.renderer.setSize(width, height, false);
            this.updateProjection();
        });
        resizeObserver.observe(this.canvas);
    }
    
    setStatus(message, type = 'loading') {
        this.statusEl.textContent = message;
        this.statusEl.className = type;
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        const delta = this.clock.getDelta();
        
        // Update VRM
        if (this.vrm) {
            this.vrm.update(delta);
        }
        
        // Update animations
        if (this.animator) {
            this.animator.update(delta);
        }
        
        // Render
        this.renderer.render(this.scene, this.camera);
    }
}

// Initialize app when DOM is ready
let app;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        app = new DesktopPortraitApp();
        window.app = app; // Expose for diagnostics
    });
} else {
    app = new DesktopPortraitApp();
    window.app = app;
}

export { DesktopPortraitApp };
