/**
 * VRM Animation Controller
 * Handles idle breathing, blinking, lookAt gaze, and audio-reactive mouth
 */

import * as THREE from 'three';

export class VRMAnimator {
    constructor(vrm, camera, options = {}) {
        this.vrm = vrm;
        this.camera = camera;
        this.reducedMotion = !!options.reducedMotion;

        // Animation state
        this.breathingPhase = 0;
        this.breathingRate = this.reducedMotion ? 0.12 : 0.3;
        this.breathingAmplitude = this.reducedMotion ? 0.02 : 0.05;

        this.blinkTimer = 0;
        this.blinkInterval = this.reducedMotion ? 5.0 : 3.0;
        this.blinkDuration = 0.15;
        this.isBlinking = false;
        this.blinkPhase = 0;

        this.audioContext = null;
        this.mouthAnimationActive = false;
        this.mouthPhase = 0;

        if (this.vrm.lookAt) {
            this.lookAtTarget = new THREE.Object3D();
            this.lookAtTarget.position.copy(camera.position);
            this.vrm.lookAt.target = this.lookAtTarget;
        }
    }

    update(deltaTime) {
        if (!this.vrm) return;

        this.updateBreathing(deltaTime);
        this.updateBlinking(deltaTime);
        this.updateLookAt();

        if (this.mouthAnimationActive) {
            this.updateMouth(deltaTime);
        }
    }
    
    updateBreathing(deltaTime) {
        this.breathingPhase += deltaTime * this.breathingRate * Math.PI * 2;
        
        // Subtle chest rise via rotation only — never scale bones (breaks skirts/cloth)
        const breathAmount = Math.sin(this.breathingPhase) * this.breathingAmplitude;
        if (this.vrm.humanoid) {
            const chest = this.vrm.humanoid.getNormalizedBoneNode('chest');
            if (chest) {
                chest.rotation.x = breathAmount * 0.15;
            }
        }
    }
    
    updateBlinking(deltaTime) {
        this.blinkTimer += deltaTime;
        
        if (!this.isBlinking) {
            // Random trigger when timer exceeds interval
            if (this.blinkTimer >= this.blinkInterval) {
                this.isBlinking = true;
                this.blinkPhase = 0;
                this.blinkTimer = 0;
                // Randomize next interval (2-5 seconds)
                this.blinkInterval = 2 + Math.random() * 3;
            }
        } else {
            // Animate blink
            this.blinkPhase += deltaTime / this.blinkDuration;
            
            if (this.blinkPhase >= 1) {
                this.isBlinking = false;
                this.blinkPhase = 0;
            }
            
            // Smooth blink curve (ease in-out)
            const t = this.blinkPhase;
            const curve = t < 0.5 
                ? 2 * t * t 
                : 1 - Math.pow(-2 * t + 2, 2) / 2;
            
            // Apply to blink expression
            if (this.vrm.expressionManager) {
                const blinkValue = Math.sin(curve * Math.PI);
                this.vrm.expressionManager.setValue('blink', blinkValue);
            }
        }
    }
    
    updateLookAt() {
        if (this.vrm.lookAt && this.lookAtTarget) {
            // Point target at camera position
            this.lookAtTarget.position.copy(this.camera.position);
        }
    }
    
    updateMouth(deltaTime) {
        if (!this.vrm.expressionManager) return;
        
        // Oscillate mouth during speech (simple placeholder)
        this.mouthPhase += deltaTime * 8; // 8 Hz oscillation
        const mouthValue = (Math.sin(this.mouthPhase) + 1) * 0.3; // 0 to 0.6
        
        this.vrm.expressionManager.setValue('aa', mouthValue);
    }
    
    async playAudioWithMouth(audioBuffer) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Decode if needed
        let buffer = audioBuffer;
        if (audioBuffer instanceof ArrayBuffer) {
            buffer = await this.audioContext.decodeAudioData(audioBuffer);
        }
        
        // Play audio
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        
        // Start mouth animation
        this.mouthAnimationActive = true;
        this.mouthPhase = 0;
        
        // Stop mouth animation when audio ends
        return new Promise((resolve) => {
            source.onended = () => {
                this.mouthAnimationActive = false;
                if (this.vrm.expressionManager) {
                    this.vrm.expressionManager.setValue('aa', 0);
                }
                resolve();
            };
            
            source.start(0);
        });
    }
    
    dispose() {
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
}
