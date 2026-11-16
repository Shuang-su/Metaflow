/**
 * Authored VRMA playback for VRM0/VRM1 via @pixiv/three-vrm-animation.
 * Cross-fades clips; root-locks hip XZ to avoid foot skating on figurine scale.
 * Default: auto-cycle all bundled licensed standing idles
 * (ChatVRM + ACCAD Female1 standing set + Quaternius UAL Standard CC0).
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
    VRMAnimationLoaderPlugin,
    createVRMAnimationClip
} from '@pixiv/three-vrm-animation';
import { applyAuthoredArmClearance } from './vrm-pose.mjs';

const FADE = 0.45;
/** Longer crossfade for playlist switches — avoids hard cuts / A-pose pops. */
const PLAYLIST_FADE = 0.9;
/**
 * Amplify authored idle deltas (relative to first key) so figurine-scale
 * full-body framing still reads breath/sway. Caps keep sway natural.
 */
const TORSO_AMP = 2.35;
const TORSO_BONES = /hips|spine|chest|upperChest|neck|head/i;
// Do NOT amplify arm tracks — relative amp on ChatVRM arm keys produced
// discontinuous raised-hand poses (~9–12s). Skirt clearance is additive bias.

/** Bundled licensed auto-cycle only — never Persona/BOOTH extractables/local/Pro Quaternius. */
export const AUTO_PLAYLIST_IDS = [
    'chatvrm-idle',
    'accad-wait',
    'accad-sway',
    'accad-stand',
    'accad-sway-t2',
    'accad-swing',
    'accad-swing-t2',
    'accad-look',
    'accad-conversation',
    'accad-urban',
    'quat-idle',
    'quat-talk',
    'quat-fold'
];
const DWELL_MIN = 12;
const DWELL_MAX = 25;

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

/**
 * Amplify quaternion *deltas from the first key* (not absolute euler).
 * Absolute amplify crushed rest pose into the sway caps and left motion tiny.
 */
function amplifyRelativeQuaternions(clip, boneRegex, amp, eulerCap) {
    const q = new THREE.Quaternion();
    const qRest = new THREE.Quaternion();
    const qDelta = new THREE.Quaternion();
    const qOut = new THREE.Quaternion();
    const e = new THREE.Euler(0, 0, 0, 'XYZ');
    for (const track of clip.tracks) {
        if (!(track instanceof THREE.QuaternionKeyframeTrack)) continue;
        if (!boneRegex.test(track.name)) continue;
        const v = track.values;
        if (v.length < 4) continue;
        qRest.set(v[0], v[1], v[2], v[3]).normalize();
        const restInv = qRest.clone().invert();
        for (let i = 0; i < v.length; i += 4) {
            q.set(v[i], v[i + 1], v[i + 2], v[i + 3]).normalize();
            qDelta.copy(restInv).multiply(q);
            e.setFromQuaternion(qDelta, 'XYZ');
            e.x = THREE.MathUtils.clamp(e.x * amp, -eulerCap.x, eulerCap.x);
            e.y = THREE.MathUtils.clamp(e.y * amp, -eulerCap.y, eulerCap.y);
            e.z = THREE.MathUtils.clamp(e.z * amp, -eulerCap.z, eulerCap.z);
            qOut.setFromEuler(e);
            q.copy(qRest).multiply(qOut);
            v[i] = q.x;
            v[i + 1] = q.y;
            v[i + 2] = q.z;
            v[i + 3] = q.w;
        }
    }
    return clip;
}

function amplifyAuthoredIdle(clip) {
    amplifyRelativeQuaternions(clip, TORSO_BONES, TORSO_AMP, { x: 0.12, y: 0.14, z: 0.09 });
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
        this.metaVersion = null;

        /** Default ON — cycle every bundled licensed standing idle. */
        this.autoCycle = true;
        this._dwellElapsed = 0;
        this._dwellTarget = 16;
        /** After manual pick of a playlist clip: finish this dwell, then continue auto. */
        this._finishManualThenResume = false;
        /** QA-only dwell override (seconds); null = production 12–25s policy. */
        this._qaDwellSec = null;
        /** Optional (id) => void — app syncs <select> / status. */
        this.onClipChange = null;
        this._transitionCount = 0;
        this._history = [];
    }

    async init(catalog) {
        this.catalog = catalog;
        return catalog;
    }

    playlistIds() {
        const fromCat = this.catalog?.autoPlaylist;
        const wanted = Array.isArray(fromCat) && fromCat.length
            ? fromCat.filter((id) => AUTO_PLAYLIST_IDS.includes(id))
            : [...AUTO_PLAYLIST_IDS];
        return wanted.filter((id) => this.clips.has(id));
    }

    async bindVrm(vrm, metaVersion = null) {
        this.disposeMixer();
        this.vrm = vrm;
        this.metaVersion = metaVersion;
        this.mixer = new THREE.AnimationMixer(vrm.scene);
        this.clips.clear();
        this.actions.clear();
        this.currentId = null;
        this.active = false;
        this._dwellElapsed = 0;
        this._transitionCount = 0;
        this._history = [];

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
                clip = amplifyAuthoredIdle(clip);
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

    setAutoCycle(enabled) {
        this.autoCycle = !!enabled;
        if (this.autoCycle) {
            this._finishManualThenResume = false;
            const ids = this.playlistIds();
            if (ids.length && !ids.includes(this.currentId)) {
                this.play(ids[0], { fade: PLAYLIST_FADE, fromAuto: true });
            } else {
                this._resetDwell();
            }
        }
    }

    /**
     * QA helper: shorten dwell so multi-clip auto-cycle is observable quickly.
     * Pass null to restore production 12–25s policy.
     */
    setQaDwellSec(sec) {
        this._qaDwellSec = typeof sec === 'number' && sec > 0 ? sec : null;
        this._resetDwell();
    }

    /**
     * @param {string} id catalog id or 'procedural'
     * @returns {{ mode: 'authored'|'procedural', id: string }}
     */
    play(id, { fade = FADE, fromAuto = false, manual = false } = {}) {
        if (!this.mixer || !this.vrm) return { mode: 'procedural', id: 'procedural' };
        if (id === 'procedural' || !this.clips.has(id)) {
            this.stopAuthored(fade);
            this.currentId = 'procedural';
            this.active = false;
            this._finishManualThenResume = false;
            this._notify(id);
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

        const prevId = this.currentId;
        const prev = prevId && this.actions.get(prevId);
        const useFade = fromAuto || (prev && prev !== action) ? Math.max(fade, PLAYLIST_FADE * 0.85) : fade;

        if (prev && prev !== action && prev.isRunning()) {
            action.reset().setEffectiveWeight(1).fadeIn(useFade).play();
            prev.fadeOut(useFade);
        } else {
            action.reset().setEffectiveWeight(1).play();
        }
        this.currentId = id;
        this.active = true;

        if (manual) {
            // Manual override: finish this clip's natural dwell, then resume auto if enabled.
            this._finishManualThenResume = this.autoCycle && this.playlistIds().includes(id);
        } else if (fromAuto) {
            this._finishManualThenResume = false;
            if (prevId && prevId !== id) {
                this._transitionCount += 1;
                this._history.push({ t: performance.now(), from: prevId, to: id });
                if (this._history.length > 12) this._history.shift();
            }
        }

        this._resetDwell();
        this._notify(id);
        return { mode: 'authored', id };
    }

    /** Manual UI selection — overrides auto until this dwell completes (then auto continues). */
    playManual(id) {
        return this.play(id, { fade: PLAYLIST_FADE, manual: true });
    }

    stopAuthored(fade = FADE) {
        for (const action of this.actions.values()) {
            if (action.isRunning()) action.fadeOut(fade);
        }
        this.active = false;
    }

    _notify(id) {
        try {
            this.onClipChange?.(id);
        } catch (e) {
            console.warn('[VRMA] onClipChange', e);
        }
    }

    _resetDwell() {
        if (this._qaDwellSec != null) {
            this._dwellTarget = this._qaDwellSec;
            this._dwellElapsed = 0;
            return;
        }
        const clip = this.clips.get(this.currentId);
        const dur = Math.max(0.5, clip?.duration || 4);
        // At least one full loop; prefer 12–25s natural idle variation
        let loops = Math.max(1, Math.ceil(DWELL_MIN / dur));
        let target = dur * loops;
        // Slight variation so switches do not feel metronomic
        target += (Math.random() * 5 - 1.5);
        if (dur > DWELL_MAX) {
            // Still finish one full loop even if longer than 25s
            target = dur;
        } else {
            target = THREE.MathUtils.clamp(target, DWELL_MIN, DWELL_MAX);
        }
        this._dwellTarget = target;
        this._dwellElapsed = 0;
    }

    _advancePlaylist() {
        const ids = this.playlistIds();
        if (ids.length < 2) return;
        const idx = Math.max(0, ids.indexOf(this.currentId));
        const next = ids[(idx + 1) % ids.length];
        if (next === this.currentId) return;
        this.play(next, { fade: PLAYLIST_FADE, fromAuto: true });
    }

    /**
     * Call each frame BEFORE vrm.update when authored mode is active.
     * Order: mixer → arm clearance bias → hip XZ lock → (caller) vrm.update.
     */
    update(delta) {
        if (!this.mixer || !this.active) return;
        this.mixer.update(delta);

        // Stop fully faded-out actions to avoid weight pile-up
        for (const [id, action] of this.actions) {
            if (id === this.currentId) continue;
            if (action.isRunning() && action.getEffectiveWeight() < 0.01) {
                action.stop();
            }
        }

        // Soft re-home hips XZ if any residual root drift
        const hips = this.vrm?.humanoid?.getNormalizedBoneNode('hips');
        if (hips) {
            hips.position.x = 0;
            hips.position.z = 0;
        }
        // Skirt clearance for Wenjing / similar VRM0 — additive, keeps torso authored
        applyAuthoredArmClearance(this.vrm, this.metaVersion);

        // Auto playlist dwell
        const inPlaylist = this.playlistIds().includes(this.currentId);
        if (this.autoCycle && inPlaylist) {
            this._dwellElapsed += delta;
            if (this._dwellElapsed >= this._dwellTarget) {
                // Manual pick: this dwell finishing clears the hold and advances
                this._finishManualThenResume = false;
                this._advancePlaylist();
            }
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
        const action = this.currentId ? this.actions.get(this.currentId) : null;
        const clip = this.currentId ? this.clips.get(this.currentId) : null;
        return {
            currentId: this.currentId,
            active: this.active,
            playable: this.listPlayable().map((c) => c.id),
            clipCount: this.clips.size,
            autoCycle: this.autoCycle,
            playlist: this.playlistIds(),
            dwellElapsed: this._dwellElapsed,
            dwellTarget: this._dwellTarget,
            finishManualThenResume: this._finishManualThenResume,
            qaDwellSec: this._qaDwellSec,
            transitionCount: this._transitionCount,
            history: this._history.slice(),
            clipDuration: clip?.duration ?? null,
            actionTime: action?.time ?? null
        };
    }
}
