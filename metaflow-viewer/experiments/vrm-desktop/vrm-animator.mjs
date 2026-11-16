/**
 * VRM Animation Controller
 * Procedural idle: breath, blink, weight shift, head sway.
 * When authored VRMA drives the body (`bodyDrive === 'authored'`), blink /
 * lookAt / mouth run, plus a light *additive* chest breath overlay so subtle
 * VRMA idles still read as alive (does not replace mixer tracks).
 * Arms owned by vrm-pose reapply in procedural mode only.
 */

import * as THREE from 'three';

export class VRMAnimator {
    constructor(vrm, camera, options = {}) {
        this.vrm = vrm;
        this.camera = camera;
        this.reducedMotion = !!options.reducedMotion;
        this.paused = !!options.paused;
        /** 'procedural' | 'authored' — authored = VRMA mixer owns body bones */
        this.bodyDrive = options.bodyDrive === 'authored' ? 'authored' : 'procedural';

        // Amplitudes tuned so a 15–30s capture shows clear but natural motion
        this.breathingPhase = 0;
        this.breathingRate = this.reducedMotion ? 0.12 : 0.38;
        this.breathingAmplitude = this.reducedMotion ? 0.02 : 0.085;

        this.weightPhase = Math.PI * 0.5;
        this.weightRate = this.reducedMotion ? 0.06 : 0.18;
        this.weightAmplitude = this.reducedMotion ? 0.006 : 0.028;

        this.headPhase = 0;
        this.headRate = this.reducedMotion ? 0.05 : 0.14;

        this.blinkTimer = 0;
        this.blinkInterval = this.reducedMotion ? 5.0 : 3.5;
        this.blinkDuration = 0.16;
        this.isBlinking = false;
        this.blinkPhase = 0;
        this.blinkCount = 0;

        this.audioContext = null;
        this.mouthAnimationActive = false;
        this.mouthPhase = 0;

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

    setBodyDrive(mode) {
        this.bodyDrive = mode === 'authored' ? 'authored' : 'procedural';
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

    /** Snapshot for QA — chest delta / blink count / paused flags. */
    getMotionDiagnostics() {
        const chest = this.vrm?.humanoid?.getNormalizedBoneNode('chest');
        const hips = this.vrm?.humanoid?.getNormalizedBoneNode('hips');
        const baseC = this._bases.chest || { x: 0 };
        const baseH = this._bases.hips || { z: 0 };
        return {
            paused: this.paused,
            reducedMotion: this.reducedMotion,
            bodyDrive: this.bodyDrive,
            blinkCount: this.blinkCount,
            isBlinking: this.isBlinking,
            chestDelta: chest ? chest.rotation.x - baseC.x : 0,
            hipsDelta: hips ? hips.rotation.z - baseH.z : 0,
            breathingPhase: this.breathingPhase,
            weightPhase: this.weightPhase
        };
    }

    update(deltaTime) {
        if (!this.vrm) return;
        if (this.paused) {
            if (this.mouthAnimationActive) this.updateMouth(deltaTime);
            return;
        }
        // Authored VRMA owns body — facial layers + light additive breath
        if (this.bodyDrive === 'authored') {
            this.updateAuthoredBreathOverlay(deltaTime);
            this.updateBlinking(deltaTime);
            this.updateLookAt();
            if (this.mouthAnimationActive) this.updateMouth(deltaTime);
            return;
        }
        if (this.reducedMotion) {
            // Still blink rarely + lookAt; skip body sway
            this.updateBlinking(deltaTime);
            this.updateLookAt();
            if (this.mouthAnimationActive) this.updateMouth(deltaTime);
            return;
        }

        this.updateBreathing(deltaTime);
        this.updateWeightShift(deltaTime);
        this.updateHeadSway(deltaTime);
        this.updateBlinking(deltaTime);
        this.updateLookAt();
        if (this.mouthAnimationActive) this.updateMouth(deltaTime);
    }

    updateBreathing(deltaTime) {
        this.breathingPhase += deltaTime * this.breathingRate * Math.PI * 2;
        const breathAmount = Math.sin(this.breathingPhase) * this.breathingAmplitude;
        const chest = this.vrm.humanoid?.getNormalizedBoneNode('chest');
        const base = this._bases.chest || { x: 0, y: 0, z: 0 };
        if (chest) chest.rotation.x = base.x + breathAmount;
        const spine = this.vrm.humanoid?.getNormalizedBoneNode('spine');
        const spineBase = this._bases.spine || { x: 0, y: 0, z: 0 };
        if (spine) spine.rotation.x = spineBase.x + breathAmount * 0.45;
    }

    /**
     * Additive breath on top of VRMA (mixer already wrote this frame).
     * Milder than procedural replace so authored idle stays primary.
     */
    updateAuthoredBreathOverlay(deltaTime) {
        if (this.reducedMotion) return;
        this.breathingPhase += deltaTime * this.breathingRate * Math.PI * 2;
        const breathAmount = Math.sin(this.breathingPhase) * 0.048;
        const chest = this.vrm.humanoid?.getNormalizedBoneNode('chest');
        if (chest) chest.rotation.x += breathAmount;
        const spine = this.vrm.humanoid?.getNormalizedBoneNode('spine');
        if (spine) spine.rotation.x += breathAmount * 0.4;
        const upperChest = this.vrm.humanoid?.getNormalizedBoneNode('upperChest');
        if (upperChest) upperChest.rotation.x += breathAmount * 0.55;
    }

    updateWeightShift(deltaTime) {
        this.weightPhase += deltaTime * this.weightRate * Math.PI * 2;
        const sway = Math.sin(this.weightPhase) * this.weightAmplitude;
        const hips = this.vrm.humanoid?.getNormalizedBoneNode('hips');
        const base = this._bases.hips || { x: 0, y: 0, z: 0 };
        if (hips) {
            hips.rotation.z = base.z + sway;
            hips.rotation.y = base.y + sway * 0.4;
        }
    }

    updateHeadSway(deltaTime) {
        this.headPhase += deltaTime * this.headRate * Math.PI * 2;
        const head = this.vrm.humanoid?.getNormalizedBoneNode('head');
        const neck = this.vrm.humanoid?.getNormalizedBoneNode('neck');
        const hb = this._bases.head || { x: 0, y: 0, z: 0 };
        const nb = this._bases.neck || { x: 0, y: 0, z: 0 };
        if (head) {
            head.rotation.y = hb.y + Math.sin(this.headPhase) * 0.055;
            head.rotation.x = hb.x + Math.sin(this.headPhase * 0.65) * 0.028;
        }
        if (neck) {
            neck.rotation.y = nb.y + Math.sin(this.headPhase) * 0.022;
        }
    }

    updateBlinking(deltaTime) {
        this.blinkTimer += deltaTime;
        if (!this.isBlinking) {
            if (this.blinkTimer >= this.blinkInterval) {
                this.isBlinking = true;
                this.blinkPhase = 0;
                this.blinkTimer = 0;
                // Natural ~3–6s random interval (not sub-2s twitch)
                this.blinkInterval = 3.0 + Math.random() * 3.0;
                this.blinkCount += 1;
            }
        } else {
            this.blinkPhase += deltaTime / this.blinkDuration;
            if (this.blinkPhase >= 1) {
                this.isBlinking = false;
                this.blinkPhase = 0;
                if (this.vrm.expressionManager) {
                    this.vrm.expressionManager.setValue('blink', 0);
                }
            } else {
                const t = this.blinkPhase;
                const curve = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                if (this.vrm.expressionManager) {
                    this.vrm.expressionManager.setValue('blink', Math.sin(curve * Math.PI));
                }
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
        this.vrm.expressionManager.setValue('aa', (Math.sin(this.mouthPhase) + 1) * 0.3);
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
                if (this.vrm.expressionManager) this.vrm.expressionManager.setValue('aa', 0);
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
