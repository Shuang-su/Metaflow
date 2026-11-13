/**
 * VRM Animation Controller
 * Handles idle breathing, blinking, lookAt gaze, and audio-reactive mouth
 */

import * as THREE from 'three';

export class VRMAnimator {
    constructor(vrm, camera) {
        this.vrm = vrm;
        this.camera = camera;
        
        // Animation state
        this.breathingPhase = 0;
        this.breathingRate = 0.3; // Hz
        this.breathingAmplitude = 0.05; // Subtle chest expansion
        
        this.blinkTimer = 0;
        this.blinkInterval = 3.0; // Average seconds between blinks
        this.blinkDuration = 0.15; // Seconds
        this.isBlinking = false;
        this.blinkPhase = 0;
        
        // Audio playback
        this.audioContext = null;
        this.mouthAnimationActive = false;
        this.mouthPhase = 0;
        
        // Setup lookAt target
        if (this.vrm.lookAt) {
            this.lookAtTarget = new THREE.Object3D();
            this.lookAtTarget.position.copy(camera.position);
            this.vrm.lookAt.target = this.lookAtTarget;
        }
    }
    
    update(deltaTime) {
        if (!this.vrm) return;
        
        // Update breathing
        this.updateBreathing(deltaTime);
        
        // Update blinking
        this.updateBlinking(deltaTime);
        
        // Update lookAt to camera
        this.updateLookAt();
        
        // Update mouth animation (if audio playing)
        if (this.mouthAnimationActive) {
            this.updateMouth(deltaTime);
        }
    }
    
    updateBreathing(deltaTime) {
        this.breathingPhase += deltaTime * this.breathingRate * Math.PI * 2;
        
        // Sinusoidal breathing
        const breathAmount = Math.sin(this.breathingPhase) * this.breathingAmplitude;
        
        // Apply subtle scale to chest/spine bones if humanoid is available
        if (this.vrm.humanoid) {
            const spine = this.vrm.humanoid.getNormalizedBoneNode('spine');
            const chest = this.vrm.humanoid.getNormalizedBoneNode('chest');
            
            if (spine) {
                spine.scale.setScalar(1 + breathAmount);
            }
            if (chest) {
                chest.scale.setScalar(1 + breathAmount * 0.5);
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
