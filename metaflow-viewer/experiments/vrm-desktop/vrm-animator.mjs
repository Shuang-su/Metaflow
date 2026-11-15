/**
 * VRM Animation Controller
 * Natural idle: breathing, blink, lookAt, subtle weight shift / head sway.
 * Arms are owned by vrm-pose reapply — this module must not lift them.
 */

import * as THREE from 'three';

export class VRMAnimator {
    constructor(vrm, camera, options = {}) {
        this.vrm = vrm;
        this.camera = camera;
        this.reducedMotion = !!options.reducedMotion;
        this.paused = !!options.paused;

        this.breathingPhase = Math.random() * Math.PI * 2;
        this.breathingRate = this.reducedMotion ? 0.1 : 0.28;
        this.breathingAmplitude = this.reducedMotion ? 0.015 : 0.04;

        this.weightPhase = Math.random() * Math.PI * 2;
        this.weightRate = this.reducedMotion ? 0.05 : 0.11;
        this.weightAmplitude = this.reducedMotion ? 0.004 : 0.012;

        this.headPhase = Math.random() * Math.PI * 2;
        this.headRate = this.reducedMotion ? 0.04 : 0.09;

        this.blinkTimer = 0;
        this.blinkInterval = this.reducedMotion ? 5.5 : 2.8 + Math.random() * 1.5;
        this.blinkDuration = 0.15;
        this.isBlinking = false;
        this.blinkPhase = 0;

        this.audioContext = null;
        this.mouthAnimationActive = false;
        this.mouthPhase = 0;

        // Rest bases for bones we modulate (set after pose apply)
        this._bases = {};
        this.captureRestBases();

        if (this.vrm.lookAt) {
            this.lookAtTarget = new THREE.Object3D();
            this.lookAtTarget.position.copy(camera.position);
            this.vrm.lookAt.target = this.lookAtTarget;
        }
    }

    setPaused(paused) {
        this.paused = !!paused;
        if (this.paused && this.vrm?.expressionManager) {
            this.vrm.expressionManager.setValue('blink', 0);
        }
    }

    captureRestBases() {
        if (!this.vrm?.humanoid) return;
        this._bases = {};
        for (const name of ['hips', 'spine', 'chest', 'neck', 'head']) {
            const node = this.vrm.humanoid.getNormalizedBoneNode(name);
            if (node) {
                this._bases[name] = {
                    x: node.rotation.x,
                    y: node.rotation.y,
                    z: node.rotation.z
                };
            }
        }
    }

    update(deltaTime) {
        if (!this.vrm) return;
        if (this.paused || this.reducedMotion) {
            // Still allow lookAt when reduced (static gaze), skip motion loops
            if (!this.paused) this.updateLookAt();
            if (this.mouthAnimationActive) this.updateMouth(deltaTime);
            return;
        }

        this.updateBreathing(deltaTime);
        this.updateWeightShift(deltaTime);
        this.updateHeadSway(deltaTime);
        this.updateBlinking(deltaTime);
        this.updateLookAt();

        if (this.mouthAnimationActive) {
            this.updateMouth(deltaTime);
        }
    }

    updateBreathing(deltaTime) {
        this.breathingPhase += deltaTime * this.breathingRate * Math.PI * 2;
        const breathAmount = Math.sin(this.breathingPhase) * this.breathingAmplitude;
        const chest = this.vrm.humanoid?.getNormalizedBoneNode('chest');
        const base = this._bases.chest || { x: 0, y: 0, z: 0 };
        if (chest) {
            chest.rotation.x = base.x + breathAmount * 0.55;
        }
        const spine = this.vrm.humanoid?.getNormalizedBoneNode('spine');
        const spineBase = this._bases.spine || { x: 0, y: 0, z: 0 };
        if (spine) {
            spine.rotation.x = spineBase.x + breathAmount * 0.2;
        }
    }

    updateWeightShift(deltaTime) {
        this.weightPhase += deltaTime * this.weightRate * Math.PI * 2;
        const sway = Math.sin(this.weightPhase) * this.weightAmplitude;
        const hips = this.vrm.humanoid?.getNormalizedBoneNode('hips');
        const base = this._bases.hips || { x: 0, y: 0, z: 0 };
        if (hips) {
            hips.rotation.z = base.z + sway;
            hips.rotation.y = base.y + sway * 0.35;
        }
    }

    updateHeadSway(deltaTime) {
        this.headPhase += deltaTime * this.headRate * Math.PI * 2;
        const head = this.vrm.humanoid?.getNormalizedBoneNode('head');
        const neck = this.vrm.humanoid?.getNormalizedBoneNode('neck');
        const hb = this._bases.head || { x: 0, y: 0, z: 0 };
        const nb = this._bases.neck || { x: 0, y: 0, z: 0 };
        if (head) {
            head.rotation.y = hb.y + Math.sin(this.headPhase) * 0.035;
            head.rotation.x = hb.x + Math.sin(this.headPhase * 0.7) * 0.015;
        }
        if (neck) {
            neck.rotation.y = nb.y + Math.sin(this.headPhase) * 0.012;
        }
    }

    updateBlinking(deltaTime) {
        this.blinkTimer += deltaTime;

        if (!this.isBlinking) {
            if (this.blinkTimer >= this.blinkInterval) {
                this.isBlinking = true;
                this.blinkPhase = 0;
                this.blinkTimer = 0;
                this.blinkInterval = 2.2 + Math.random() * 3.2;
            }
        } else {
            this.blinkPhase += deltaTime / this.blinkDuration;

            if (this.blinkPhase >= 1) {
                this.isBlinking = false;
                this.blinkPhase = 0;
            }

            const t = this.blinkPhase;
            const curve = t < 0.5
                ? 2 * t * t
                : 1 - Math.pow(-2 * t + 2, 2) / 2;

            if (this.vrm.expressionManager) {
                const blinkValue = Math.sin(curve * Math.PI);
                this.vrm.expressionManager.setValue('blink', blinkValue);
            }
        }
    }

    updateLookAt() {
        if (this.vrm.lookAt && this.lookAtTarget) {
            this.lookAtTarget.position.copy(this.camera.position);
        }
    }

    updateMouth(deltaTime) {
        if (!this.vrm.expressionManager) return;
        this.mouthPhase += deltaTime * 8;
        const mouthValue = (Math.sin(this.mouthPhase) + 1) * 0.3;
        this.vrm.expressionManager.setValue('aa', mouthValue);
    }

    async playAudioWithMouth(audioBuffer) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        let buffer = audioBuffer;
        if (audioBuffer instanceof ArrayBuffer) {
            buffer = await this.audioContext.decodeAudioData(audioBuffer);
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);

        this.mouthAnimationActive = true;
        this.mouthPhase = 0;

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
