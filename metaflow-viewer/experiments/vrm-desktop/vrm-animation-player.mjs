/**
 * Authored VRMA playback for VRM0/VRM1 via @pixiv/three-vrm-animation.
 * Cross-fades clips; root-locks hip XZ to avoid foot skating on figurine scale.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
    VRMAnimationLoaderPlugin,
    createVRMAnimationClip
} from '@pixiv/three-vrm-animation';

const FADE = 0.45;

export const ANIM_CATALOG_URL = './animations/CATALOG.json';

export async function loadAnimationCatalog(url = ANIM_CATALOG_URL) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`animation catalog HTTP ${res.status}`);
    return res.json();
}

function rootLockHipXZ(clip) {
    for (const track of clip.tracks) {
        if (!(track instanceof THREE.VectorKeyframeTrack)) continue;
        if (!/\.position$/i.test(track.name)) continue;
        if (!/hips/i.test(track.name)) continue;
        const v = track.values;
        for (let i = 0; i < v.length; i += 3) {
            v[i] = 0;
            v[i + 2] = 0;
        }
    }
    return clip;
}

export class VRMAnimationPlayer {
    constructor() {
        this.vrm = null;
        this.mixer = null;
        this.catalog = null;
        this.clips = new Map(); // id -> THREE.AnimationClip
        this.actions = new Map();
        this.currentId = null;
        this.loader = new GLTFLoader();
        this.loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
        this._hipsHome = new THREE.Vector3();
        this.active = false;
    }

    async init(catalog) {
        this.catalog = catalog;
        return catalog;
    }

    async bindVrm(vrm) {
        this.disposeMixer();
        this.vrm = vrm;
        this.mixer = new THREE.AnimationMixer(vrm.scene);
        this.clips.clear();
        this.actions.clear();
        this.currentId = null;
        this.active = false;

        const hips = vrm.humanoid?.getNormalizedBoneNode('hips');
        if (hips) hips.getWorldPosition(this._hipsHome);

        if (!this.catalog) return;

        for (const entry of this.catalog.clips) {
            if (!entry.file) continue;
            const url = `./animations/${entry.file}`;
            try {
                const gltf = await this.loader.loadAsync(url);
                const vrmAnims = gltf.userData.vrmAnimations;
                if (!vrmAnims?.length) {
                    console.warn('[VRMA] no vrmAnimations in', entry.id);
                    continue;
                }
                let clip = createVRMAnimationClip(vrmAnims[0], vrm);
                clip = rootLockHipXZ(clip);
                clip.name = entry.id;
                this.clips.set(entry.id, clip);
            } catch (e) {
                console.warn('[VRMA] failed', entry.id, e);
            }
        }
    }

    listPlayable() {
        if (!this.catalog) return [];
        return this.catalog.clips.filter((c) => c.id === 'procedural' || this.clips.has(c.id));
    }

    /**
     * @param {string} id catalog id or 'procedural'
     * @returns {{ mode: 'authored'|'procedural', id: string }}
     */
    play(id, { fade = FADE } = {}) {
        if (!this.mixer || !this.vrm) return { mode: 'procedural', id: 'procedural' };
        if (id === 'procedural' || !this.clips.has(id)) {
            this.stopAuthored(fade);
            this.currentId = 'procedural';
            this.active = false;
            return { mode: 'procedural', id: 'procedural' };
        }

        const clip = this.clips.get(id);
        let action = this.actions.get(id);
        if (!action) {
            action = this.mixer.clipAction(clip);
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.clampWhenFinished = false;
            this.actions.set(id, action);
        }

        const prev = this.currentId && this.actions.get(this.currentId);
        if (prev && prev !== action && prev.isRunning()) {
            action.reset().setEffectiveWeight(1).fadeIn(fade).play();
            prev.fadeOut(fade);
        } else {
            action.reset().setEffectiveWeight(1).play();
        }
        this.currentId = id;
        this.active = true;
        return { mode: 'authored', id };
    }

    stopAuthored(fade = FADE) {
        for (const action of this.actions.values()) {
            if (action.isRunning()) action.fadeOut(fade);
        }
        this.active = false;
    }

    /** Call each frame before vrm.update when authored mode is active. */
    update(delta) {
        if (!this.mixer || !this.active) return;
        this.mixer.update(delta);
        // Soft re-home hips XZ if any residual root drift
        const hips = this.vrm?.humanoid?.getNormalizedBoneNode('hips');
        if (hips) {
            hips.position.x = 0;
            hips.position.z = 0;
        }
    }

    disposeMixer() {
        if (this.mixer) {
            this.mixer.stopAllAction();
            this.mixer.uncacheRoot(this.mixer.getRoot());
        }
        this.mixer = null;
        this.actions.clear();
        this.clips.clear();
        this.active = false;
        this.currentId = null;
    }

    diagnostics() {
        return {
            currentId: this.currentId,
            active: this.active,
            playable: this.listPlayable().map((c) => c.id),
            clipCount: this.clips.size
        };
    }
}
