import * as THREE from 'three';
import * as pc from 'playcanvas';
import { createVRMAnimationController, createAudioMouthController } from './vrm-animation.mjs';

/**
 * VRM to PlayCanvas adapter for desktop portrait experiment.
 * 
 * Integrates Three.js VRM rendering into PlayCanvas scene using a custom renderer approach.
 * The VRM character is rendered separately with Three.js WebGLRenderer to preserve
 * material compatibility, then composited into the PlayCanvas scene.
 * 
 * This maintains existing Gaussian splat rendering while adding VRM character support.
 */

/**
 * Create a VRM character entity that renders in the PlayCanvas scene.
 * 
 * @param {Object} options
 * @param {pc.Application} options.app - PlayCanvas application
 * @param {VRM} options.vrm - Three.js VRM instance
 * @param {HTMLCanvasElement} options.canvas - Main canvas element
 * @returns {Object} Entity adapter with PlayCanvas entity and controls
 */
export function createVRMEntity({ app, vrm, canvas }) {
    if (!app?.root) throw new TypeError('需要有效的 PlayCanvas 应用');
    if (!vrm?.scene) throw new TypeError('需要有效的 VRM 实例');
    if (!canvas) throw new TypeError('需要 canvas 元素');
    
    let disposed = false;
    
    // Create Three.js scene for VRM rendering
    const threeScene = new THREE.Scene();
    const threeCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    
    // Create WebGL renderer that shares context with PlayCanvas
    const threeRenderer = new THREE.WebGLRenderer({
        canvas: canvas,
        context: app.graphicsDevice.gl,
        alpha: true,
        premultipliedAlpha: true,
        antialias: false
    });
    threeRenderer.autoClear = false;
    threeRenderer.setSize(canvas.width, canvas.height);
    
    // Add VRM to Three.js scene
    threeScene.add(vrm.scene);
    
    // Add lighting for VRM
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(1, 1, 1).normalize();
    threeScene.add(directionalLight);
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    threeScene.add(ambientLight);
    
    // Create PlayCanvas entity for transform synchronization
    const entity = new pc.Entity('VRM Character');
    const transformNode = new pc.Entity('VRM Transform');
    entity.addChild(transformNode);
    
    // Create animation controller
    const animController = createVRMAnimationController(vrm);
    
    // Calculate bounds in VRM's local space
    const box = new THREE.Box3().setFromObject(vrm.scene);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    
    const bounds = {
        center: new pc.Vec3(center.x, center.y, center.z),
        halfExtents: new pc.Vec3(size.x / 2, size.y / 2, size.z / 2)
    };
    
    // Store last transform to detect changes
    let lastPosition = new THREE.Vector3();
    let lastRotation = new THREE.Quaternion();
    let lastScale = new THREE.Vector3(1, 1, 1);
    
    /**
     * Sync Three.js transform from PlayCanvas entity transform.
     */
    function syncTransform() {
        if (disposed) return;
        
        const worldTransform = transformNode.getWorldTransform();
        const pos = worldTransform.getTranslation();
        const rot = worldTransform.getRotation();
        const scl = worldTransform.getScale();
        
        // Update Three.js VRM scene transform
        const position = new THREE.Vector3(pos.x, pos.y, pos.z);
        const quaternion = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
        const scale = new THREE.Vector3(scl.x, scl.y, scl.z);
        
        vrm.scene.position.copy(position);
        vrm.scene.quaternion.copy(quaternion);
        vrm.scene.scale.copy(scale);
        
        lastPosition.copy(position);
        lastRotation.copy(quaternion);
        lastScale.copy(scale);
    }
    
    /**
     * Sync Three.js camera from PlayCanvas camera.
     */
    function syncCamera(pcCamera) {
        if (disposed || !pcCamera) return;
        
        const cam = pcCamera.camera;
        const camEntity = pcCamera;
        
        // Sync camera transform
        const pos = camEntity.getPosition();
        const rot = camEntity.getRotation();
        
        threeCamera.position.set(pos.x, pos.y, pos.z);
        threeCamera.quaternion.set(rot.x, rot.y, rot.z, rot.w);
        
        // Sync projection
        threeCamera.fov = cam.fov;
        threeCamera.aspect = cam.aspectRatio;
        threeCamera.near = cam.nearClip;
        threeCamera.far = cam.farClip;
        threeCamera.updateProjectionMatrix();
    }
    
    /**
     * Render VRM on top of PlayCanvas scene.
     * Must be called after PlayCanvas render but before present.
     */
    function render(pcCamera, deltaTime) {
        if (disposed) return;
        
        syncTransform();
        syncCamera(pcCamera);
        
        // Update animations
        animController.update(deltaTime);
        
        // Calculate look-at target (camera position in this case)
        const cameraPos = new THREE.Vector3(
            pcCamera.getPosition().x,
            pcCamera.getPosition().y,
            pcCamera.getPosition().z
        );
        animController.setLookAtTarget(cameraPos);
        
        // Render VRM with Three.js
        threeRenderer.render(threeScene, threeCamera);
    }
    
    /**
     * Handle canvas resize.
     */
    function resize(width, height) {
        if (disposed) return;
        threeRenderer.setSize(width, height, false);
    }
    
    /**
     * Clean up resources.
     */
    function dispose() {
        if (disposed) return;
        disposed = true;
        
        animController.dispose();
        
        // Clean up Three.js resources
        threeScene.remove(vrm.scene);
        threeRenderer.dispose();
        
        // Don't dispose VRM here - it's owned by the caller
    }
    
    return {
        entity,
        transformNode,
        bounds,
        render,
        resize,
        dispose,
        animController,
        get vrm() { return vrm; },
        get threeScene() { return threeScene; }
    };
}

/**
 * Audio playback controller with mouth animation integration.
 * Manages test audio clips for demonstrating mouth movement.
 */
export function createAudioController({ animController } = {}) {
    let audio = null;
    let mouthController = null;
    let currentClipUrl = null;
    let disposed = false;
    
    /**
     * Load and play an audio clip.
     * @param {string} url - Audio file URL (local or HTTPS)
     * @returns {Promise<void>}
     */
    async function play(url) {
        if (disposed) throw new Error('AudioController 已释放');
        
        stop();
        
        return new Promise((resolve, reject) => {
            audio = new Audio();
            audio.crossOrigin = 'anonymous';
            currentClipUrl = url;
            
            // Set up mouth animation if we have an animation controller
            if (animController) {
                mouthController = createAudioMouthController({
                    onMouthUpdate: (amount) => {
                        if (animController && !disposed) {
                            animController.setMouthOpen(amount);
                        }
                    }
                });
                
                audio.addEventListener('playing', () => {
                    if (mouthController && !disposed) {
                        mouthController.attachAudio(audio);
                    }
                });
            }
            
            audio.addEventListener('ended', () => {
                if (animController) {
                    animController.setMouthOpen(0);
                }
                if (mouthController) {
                    mouthController.detach();
                }
            });
            
            audio.addEventListener('error', (e) => {
                reject(new Error(`音频加载失败: ${audio.error?.message || '未知错误'}`));
            });
            
            audio.addEventListener('canplaythrough', () => {
                resolve();
            }, { once: true });
            
            audio.src = url;
            audio.load();
        });
    }
    
    /**
     * Start playing loaded audio.
     */
    function resume() {
        if (audio && !disposed) {
            audio.play().catch(err => {
                console.warn('Audio play failed:', err);
            });
        }
    }
    
    /**
     * Pause current audio.
     */
    function pause() {
        if (audio && !disposed) {
            audio.pause();
        }
    }
    
    /**
     * Stop and unload current audio.
     */
    function stop() {
        if (mouthController) {
            mouthController.dispose();
            mouthController = null;
        }
        
        if (audio) {
            audio.pause();
            audio.src = '';
            audio.load();
            audio = null;
        }
        
        if (animController) {
            animController.setMouthOpen(0);
        }
        
        currentClipUrl = null;
    }
    
    /**
     * Clean up all resources.
     */
    function dispose() {
        if (disposed) return;
        disposed = true;
        stop();
    }
    
    return {
        play,
        resume,
        pause,
        stop,
        dispose,
        get isPlaying() { return audio && !audio.paused && !audio.ended; },
        get currentClip() { return currentClipUrl; }
    };
}
