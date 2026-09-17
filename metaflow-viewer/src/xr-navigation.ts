import { StandardMaterial, Color, Entity, Script, Vec3 } from 'playcanvas';
import type { XrInputSource } from 'playcanvas';

import type { Global } from './types';
import { confirmSelection } from './xr/feedback';
import {
    FOOT_CLEARANCE,
    bodyFits,
    findEntryFloor,
    headYaw,
    hasStick,
    horizontalForward,
    moveOnGround,
    placeHead,
    readStick,
    rotateAroundHead,
    singleStickIntent,
    standableFloor
} from './xr/locomotion';
import { XrSpatialMenu } from './xr/menu';
import type { MenuAction } from './xr/menu';
import { PalmIntent, palmFacing } from './xr/palm';
import { loadPreferences, savePreferences } from './xr/preferences';
import { observationTarget, stepToTarget, SceneTargetQuery, XrScenePicker } from './xr/scene-target';
import { traceTeleport, TeleportTrace } from './xr/teleport';
import { TeleportHint } from './xr/teleport-hint';

/** Navigation changes the rig only. The browser remains the sole owner of the head pose. */
class XrVrNavigation extends Script {
    static scriptName = 'xrVrNavigation';
    global: Global;
    menu: XrSpatialMenu;
    preferences = loadPreferences();
    get movementSpeed(): number {
        return this.preferences.movementSpeed ?? 1.5;
    }
    get rotateSpeed(): number {
        return this.preferences.rotateSpeed ?? 90;
    }
    readonly inputSources = new Set<XrInputSource>();
    readonly validSources = new Set<XrInputSource>();
    private readonly gestures = new Map<XrInputSource, 'menu' | 'teleport' | 'free' | 'scene'>();
    private readonly handlers = new Map<
        XrInputSource,
        { start: (event: XRInputSourceEvent) => void; select: (event: XRInputSourceEvent) => void; end: () => void }
    >();
    private readonly markers = new Map<XrInputSource, Entity>();
    private readonly buttonHeld = new Set<XrInputSource>();
    private readonly selectNeedsRelease = new Set<XrInputSource>();
    private readonly snapHeld = new Set<XrInputSource>();
    private readonly forward = new Vec3(0, 0, -1);
    private readonly spawnEye = new Vec3();
    private readonly entryEye = new Vec3();
    private spawnYaw = 0;
    private spawnFloor = 0;
    private entryYaw = 0;
    private floor = 0;
    private needsFloorCalibration = false;
    private heightOffset = 0;
    private needsPlacement = false;
    private initialized = false;
    private blockUntilNeutral = true;
    private lastFrame = 0;
    private sessionVR = false;
    private trackingLimited = false;
    private actionStatus: string | null = null;
    private controllerDisconnected = false;
    private recoveryOpen = false;
    private recoveryNeutral = false;
    private readonly palms = new Map<XrInputSource, PalmIntent>();
    private readonly sceneQuery = new SceneTargetQuery();
    private scenePicker?: XrScenePicker;
    private sceneTarget: Vec3 | null = null;
    private sceneHit: Vec3 | null = null;
    private sceneSource: XrInputSource | null = null;
    private sceneEpoch = 0;
    private pendingSceneTeleport: XrInputSource | null = null;
    private nextScenePreview = 0;
    private referenceSpace: XRReferenceSpace | null = null;
    readonly diagnostics = { inputLosses: 0, sceneQueries: 0, queryMs: 0, rejectedTargets: 0, selectEvents: 0 };
    readonly capabilities = new Map<XrInputSource, { ray: boolean; joints: boolean; selects: number }>();
    private readonly onReferenceReset = () => {
        this.suspend();
        this.needsFloorCalibration = this.global.collisionStatus !== 'unavailable';
        this.actionStatus = 'calibration-needed';
        this.menu.show();
    };
    private readonly validColor = new Color(0.45, 0.95, 0.8);
    private hint?: TeleportHint;
    private readonly previewTrace = new TeleportTrace();
    private readonly commitTrace = new TeleportTrace();
    private previewSource: XrInputSource | null = null;
    private nextPreviewAt = 0;
    private readonly ringPoints = Array.from({ length: 25 }, () => new Vec3());
    private readonly crossPoints = Array.from({ length: 4 }, () => new Vec3());
    private readonly pendingColor = new Color(1, 0.75, 0.3);
    private readonly invalidColor = new Color(0.95, 0.4, 0.3);

    initialize(): void {
        this.app.xr.input.on('add', this.addSource, this);
        this.app.xr.input.on('remove', this.removeSource, this);
        this.app.xr.on('update', this.onFrame, this);
        this.app.xr.on('visibility:change', this.suspend, this);
        this.once('destroy', () => {
            this.endSession();
            this.app.xr.input.off('add', this.addSource, this);
            this.app.xr.input.off('remove', this.removeSource, this);
            this.app.xr.off('update', this.onFrame, this);
            this.app.xr.off('visibility:change', this.suspend, this);
            this.menu?.destroy();
            this.hint?.destroy();
            // Finish the outstanding readback before disposing its render target.
            this.sceneQuery.query(performance.now(), true, async () => null).finally(() => this.scenePicker?.destroy());
        });
    }

    configure(global: Global): void {
        this.global = global;
        this.menu = new XrSpatialMenu(global, (action) => this.onMenuAction(action));
        this.hint = new TeleportHint(global);
    }

    startSession(position: Vec3, yaw: number, vr: boolean): void {
        this.entryEye.copy(position);
        this.entryYaw = yaw;
        this.sessionVR = vr;
        this.needsPlacement = vr;
        this.initialized = !vr;
        this.heightOffset = 0;
        this.actionStatus = null;
        this.controllerDisconnected = false;
        this.recoveryOpen = false;
        this.blockUntilNeutral = true;
        this.referenceSpace = this.app.xr._referenceSpace;
        this.referenceSpace?.addEventListener('reset', this.onReferenceReset);
        for (const source of this.app.xr.input.inputSources) this.addSource(source);
        if (!vr) this.menu.show();
    }

    endSession(): void {
        this.referenceSpace?.removeEventListener('reset', this.onReferenceReset);
        this.referenceSpace = null;
        this.initialized = false;
        this.needsPlacement = false;
        this.suspend();
        for (const source of [...this.inputSources]) this.removeSource(source);
        this.menu?.hide();
    }

    private invalidatePreview(): void {
        this.previewSource = null;
        this.hint?.hide();
    }

    private suspend(): void {
        this.cancelScene();
        this.palms.clear();
        this.menu?.setPalm(null);
        this.invalidatePreview();
        this.gestures.clear();
        this.validSources.clear();
        this.buttonHeld.clear();
        this.snapHeld.clear();
        this.menu?.cancel();
        this.blockUntilNeutral = true;
        this.lastFrame = 0;
        for (const marker of this.markers.values()) marker.enabled = false;
        for (const source of this.inputSources) {
            if (source.selecting || source.gamepad?.buttons[0]?.pressed) this.selectNeedsRelease.add(source);
            const menuButton = (source.gamepad?.buttons.length ?? 0) > 5 ? 5 : 4;
            if (source.gamepad?.buttons[menuButton]?.pressed) this.buttonHeld.add(source);
            this.updateMarker(source);
        }
    }

    private validPose(source: XrInputSource, frame?: XRFrame): boolean {
        if (
            !frame ||
            this.app.xr.visibilityState !== 'visible' ||
            !this.lastFrame ||
            performance.now() - this.lastFrame > 250
        )
            return false;
        try {
            // PlayCanvas 2.21.3 exposes no public reference-space getter. Keep this access here.
            // Input-event frames cannot call getViewerPose; use the recent animation pose above.
            return !!frame.getPose(source.inputSource.targetRaySpace, this.app.xr._referenceSpace);
        } catch {
            return false;
        }
    }

    private addSource(source: XrInputSource): void {
        if (this.handlers.has(source)) return;
        this.inputSources.add(source);
        this.capabilities.set(source, { ray: false, joints: false, selects: 0 });
        this.controllerDisconnected = false;
        if (this.recoveryOpen && hasStick(source)) this.recoveryNeutral = false;
        if (source.selecting || source.gamepad?.buttons[0]?.pressed) this.selectNeedsRelease.add(source);
        const menuButton = (source.gamepad?.buttons.length ?? 0) > 5 ? 5 : 4;
        if (source.gamepad?.buttons[menuButton]?.pressed) this.buttonHeld.add(source);
        const start = (event: XRInputSourceEvent) => {
            if (
                !this.initialized ||
                this.selectNeedsRelease.has(source) ||
                !this.validPose(source, event.frame) ||
                !this.selectable(source)
            )
                return;
            if (
                [...this.validSources].some(
                    (other) =>
                        other !== source && hasStick(other) && readStick(other.gamepad.axes).some((axis) => axis !== 0)
                )
            )
                return;
            if (!this.menu.ownership.claim(source, 'direct')) return;
            if (this.recoveryOpen && !this.menu.isPointedAt(source)) {
                this.menu.close();
                this.recoveryOpen = false;
                this.menu.ownership.claim(source, 'direct');
            }
            this.cancelScene();
            if (this.menu.begin(source)) this.gestures.set(source, 'menu');
            else if (this.sessionVR) {
                const hand = !hasStick(source);
                const handMode = this.preferences.handMovement ?? 'teleport';
                if (hand && handMode === 'forward') this.gestures.set(source, 'free');
                else if (this.global.collisionStatus === 'unavailable') {
                    this.gestures.set(source, 'scene');
                    const continuous = hand ? handMode === 'target' : this.preferences.locomotion === 'continuous';
                    if (continuous) this.queryScene(source, true, false);
                } else if (hand || this.preferences.locomotion === 'comfort') this.gestures.set(source, 'teleport');
            }
        };
        const select = (event: XRInputSourceEvent) => {
            if (!this.validPose(source, event.frame)) return;
            this.diagnostics.selectEvents++;
            const capability = this.capabilities.get(source);
            if (capability) capability.selects++;
            const gesture = this.gestures.get(source);
            if (gesture === 'menu') this.menu.select(source);
            else if (gesture === 'teleport' && !this.menu.open && !this.menu.isPointedAt(source)) this.teleport(source);
            else if (gesture === 'scene' && !this.menu.open && !this.menu.isPointedAt(source)) {
                const comfort = hasStick(source)
                    ? this.preferences.locomotion === 'comfort'
                    : this.preferences.handMovement === 'teleport';
                if (comfort) this.queryScene(source, true, true);
            }
            this.gestures.delete(source);
        };
        // selectend can cancel, while select alone commits. Pending continuous targets require a held gesture.
        const end = () => {
            this.selectNeedsRelease.delete(source);
            this.gestures.delete(source);
            this.sceneTarget = null;
            this.menu.release(source);
        };
        source.on('selectstart', start);
        source.on('select', select);
        source.on('selectend', end);
        this.handlers.set(source, { start, select, end });
        this.blockUntilNeutral = true;
    }

    private removeSource(source: XrInputSource): void {
        if (source === this.previewSource) this.invalidatePreview();
        if (
            source === this.sceneSource &&
            !(source === this.pendingSceneTeleport && source.inputSource?.targetRayMode === 'transient-pointer')
        )
            this.cancelScene();
        this.palms.delete(source);
        this.capabilities.delete(source);
        if (source.inputSource?.targetRayMode !== 'transient-pointer') this.diagnostics.inputLosses++;
        const handlers = this.handlers.get(source);
        if (handlers) {
            source.off('selectstart', handlers.start);
            source.off('select', handlers.select);
            source.off('selectend', handlers.end);
        }
        this.handlers.delete(source);
        this.gestures.delete(source);
        this.inputSources.delete(source);
        this.validSources.delete(source);
        this.buttonHeld.delete(source);
        this.selectNeedsRelease.delete(source);
        this.snapHeld.delete(source);
        this.menu?.inputLost?.(source);
        this.menu?.release(source);
        this.markers.get(source)?.destroy();
        this.markers.delete(source);
        this.blockUntilNeutral = true;
        if (this.initialized && hasStick(source) && ![...this.inputSources].some(hasStick)) {
            this.controllerDisconnected = true;
            this.recoveryOpen = !this.menu?.open;
            this.recoveryNeutral = false;
            this.menu?.show();
        }
    }

    private onFrame(frame: XRFrame): void {
        if (!this.global || this.app.xr.visibilityState !== 'visible') return;
        const pose = frame.getViewerPose(this.app.xr._referenceSpace);
        this.trackingLimited = !pose || pose.emulatedPosition;
        const now = performance.now();
        // The engine skips update events entirely when a viewer pose is unavailable.
        // Detect the gap before overwriting lastFrame so resumed input must rearm.
        if (!pose || (this.lastFrame > 0 && now - this.lastFrame > 250)) this.suspend();
        if (!pose) return;
        this.lastFrame = now;
        for (const source of this.inputSources) {
            const capability = this.capabilities.get(source);
            if (capability) {
                capability.joints =
                    !!source.hand?.tracking &&
                    ['wrist', 'index-finger-metacarpal', 'pinky-finger-metacarpal'].every((id) => {
                        const space = source.inputSource.hand?.get(id as XRHandJoint);
                        return !!space && !!frame.getJointPose(space, this.app.xr._referenceSpace);
                    });
            }
            if (this.validPose(source, frame)) this.validSources.add(source);
            else {
                if (this.validSources.has(source)) {
                    this.blockUntilNeutral = true;
                    this.diagnostics.inputLosses++;
                }
                if (source.selecting || source.gamepad?.buttons[0]?.pressed) this.selectNeedsRelease.add(source);
                if (source === this.previewSource) this.invalidatePreview();
                if (
                    source === this.sceneSource &&
                    !(source === this.pendingSceneTeleport && source.inputSource?.targetRayMode === 'transient-pointer')
                )
                    this.cancelScene();
                this.palms.delete(source);
                if (capability) capability.ray = capability.joints = false;
                this.validSources.delete(source);
                this.gestures.delete(source);
                this.menu.inputLost?.(source);
                this.menu.release(source);
            }
        }
        if (this.needsPlacement) this.placeInitial();
    }

    private effectiveHeight(): number {
        return Math.max(0.5, Math.min(2.4, this.global.camera.getLocalPosition().y + this.heightOffset));
    }

    private placeInitial(): void {
        const { camera, collision } = this.global;
        const trackedHeight = camera.getLocalPosition().y;
        this.heightOffset = this.preferences.seatedBoost ? 1.65 - trackedHeight : 0;
        const height = this.effectiveHeight();
        collision?.prepareForWorldPosition?.(this.entryEye.x, this.entryEye.z);
        const target = collision ? findEntryFloor(collision, this.entryEye, height) : null;
        this.floor = target?.y ?? this.entryEye.y - height - FOOT_CLEARANCE;
        this.needsFloorCalibration = !target && this.global.collisionStatus !== 'unavailable';
        rotateAroundHead(this.entity, camera, this.entryYaw - headYaw(camera));
        placeHead(
            this.entity,
            camera,
            new Vec3(target?.x ?? this.entryEye.x, this.floor + height + FOOT_CLEARANCE, target?.z ?? this.entryEye.z)
        );
        this.spawnFloor = this.floor;
        this.spawnEye.copy(camera.getPosition());
        this.spawnYaw = headYaw(camera);
        this.needsPlacement = false;
        this.initialized = true;
        this.menu.show();
    }

    private reset(): void {
        const { camera, collision, collisionStatus } = this.global;
        const height = this.effectiveHeight();
        const floor = collision
            ? standableFloor(collision, this.spawnEye.x, this.spawnFloor + 0.25, this.spawnEye.z, height, 0.5)
            : collisionStatus === 'unavailable'
              ? this.spawnFloor
              : null;
        if (floor === null) {
            this.actionStatus = 'reset-blocked';
            this.menu.show();
            return;
        }
        const target = new Vec3(this.spawnEye.x, floor + height + FOOT_CLEARANCE, this.spawnEye.z);
        rotateAroundHead(this.entity, camera, this.spawnYaw - headYaw(camera));
        placeHead(this.entity, camera, target);
        this.floor = floor;
        this.needsFloorCalibration = false;
    }

    private calibrateFloor(nextOffset = this.heightOffset): void {
        const { camera, collision } = this.global;
        if (!collision) {
            if (this.global.collisionStatus !== 'unavailable') {
                this.actionStatus = 'collision-loading';
                return;
            }
            this.entity.translate(0, nextOffset - this.heightOffset, 0);
            this.heightOffset = nextOffset;
            return;
        }
        const p = camera.getPosition();
        const height = Math.max(0.5, Math.min(2.4, camera.getLocalPosition().y + nextOffset));
        const target = findEntryFloor(collision, p, height);
        if (!target) {
            this.actionStatus = 'calibration-needed';
            return;
        }
        this.needsFloorCalibration = false;
        this.heightOffset = nextOffset;
        this.floor = target.y;
        target.y += height + FOOT_CLEARANCE;
        placeHead(this.entity, camera, target);
    }

    private onMenuAction(action: MenuAction): void {
        this.cancelScene();
        this.invalidatePreview();
        const fromWheel = this.menu.wheelOpen;
        this.gestures.clear();
        this.blockUntilNeutral = true;
        this.actionStatus = null;
        if (action === 'resume') this.menu.close();
        else if (action === 'exit') this.global.events.fire('endXR');
        else if (action === 'collision' && this.global.state.hasCollisionOverlay)
            this.global.state.collisionOverlayEnabled = !this.global.state.collisionOverlayEnabled;
        else if (action === 'reset' && this.sessionVR) this.reset();
        else if ((action === 'boost' || action === 'calibrate') && this.sessionVR) {
            const boost = action === 'boost' ? !this.preferences.seatedBoost : this.preferences.seatedBoost;
            const trackedHeight = this.global.camera.getLocalPosition().y;
            const nextOffset = boost ? 1.65 - trackedHeight : 0;
            if (action === 'calibrate') this.calibrateFloor(nextOffset);
            else {
                const { collision, camera, collisionStatus } = this.global;
                const p = camera.getPosition();
                const height = Math.max(0.5, Math.min(2.4, trackedHeight + nextOffset));
                if (
                    (!collision && collisionStatus !== 'unavailable') ||
                    (collision && !bodyFits(collision, p.x, this.floor, p.z, height))
                ) {
                    this.actionStatus = 'posture-blocked';
                } else {
                    this.entity.translate(0, nextOffset - this.heightOffset, 0);
                    this.heightOffset = nextOffset;
                    this.preferences.seatedBoost = boost;
                }
            }
        } else if (action === 'locomotion' && this.sessionVR) {
            this.preferences.locomotion = this.preferences.locomotion === 'continuous' ? 'comfort' : 'continuous';
        }
        if (action === 'movement-speed') {
            const values = [0.75, 1.5, 2.25];
            this.preferences.movementSpeed = values[(values.indexOf(this.movementSpeed) + 1) % values.length];
        } else if (action === 'turn-speed') {
            const values = [45, 90, 120];
            this.preferences.rotateSpeed = values[(values.indexOf(this.rotateSpeed) + 1) % values.length];
        } else if (action === 'trajectory')
            this.preferences.trajectory = this.preferences.trajectory === 'straight' ? 'arc' : 'straight';
        if (fromWheel && !this.actionStatus && ['resume', 'locomotion', 'reset'].includes(action)) this.menu.close();
        if (action === 'confirmation')
            this.preferences.confirmation = this.preferences.confirmation === 'dwell' ? 'direct' : 'dwell';
        if (action === 'dwell-duration') {
            const values = [800, 1000, 1500];
            this.preferences.dwellDuration =
                values[(values.indexOf(this.preferences.dwellDuration) + 1) % values.length];
        }
        if (action === 'main-hand')
            this.preferences.mainHand = this.preferences.mainHand === 'right' ? 'left' : 'right';
        if (action === 'hand-movement') {
            const values = ['teleport', 'target', 'forward'] as const;
            this.preferences.handMovement = values[(values.indexOf(this.preferences.handMovement) + 1) % values.length];
        }
        if (action === 'turn-left' || action === 'turn-right')
            rotateAroundHead(this.entity, this.global.camera, action === 'turn-left' ? 30 : -30);
        savePreferences(this.preferences);
    }

    private teleport(source: XrInputSource): void {
        const camera = this.global.camera;
        const trace = traceTeleport(
            this.global.collision,
            source.getOrigin(),
            source.getDirection(),
            camera.getPosition(),
            this.effectiveHeight(),
            hasStick(source) && this.preferences.trajectory !== 'straight',
            this.commitTrace
        );
        if (!trace.valid) {
            this.invalidatePreview();
            return;
        }
        const target = trace.target;
        this.invalidatePreview();
        this.needsFloorCalibration = false;
        this.floor = target.y;
        target.y += this.effectiveHeight() + FOOT_CLEARANCE;
        placeHead(this.entity, camera, target);
        this.blockUntilNeutral = true;
        confirmSelection(source);
    }

    private selectable(source: XrInputSource): boolean {
        if (hasStick(source) || source.inputSource?.targetRayMode === 'transient-pointer') return true;
        const hands = [...this.validSources].filter((input) => !!input.hand);
        return hands.length < 2 || source.handedness === this.preferences.mainHand;
    }

    private cancelScene(): void {
        this.sceneQuery.invalidate();
        this.sceneEpoch++;
        this.sceneTarget = this.sceneHit = null;
        this.sceneSource = null;
        this.pendingSceneTeleport = null;
    }

    private async queryScene(source: XrInputSource, commit: boolean, teleport: boolean): Promise<void> {
        if (this.global.collisionStatus !== 'unavailable') return;
        const epoch = this.sceneEpoch;
        this.sceneSource = source;
        if (teleport) this.pendingSceneTeleport = source;
        const origin = source.getOrigin().clone(),
            direction = source.getDirection().clone();
        try {
            const started = performance.now();
            const hit = await this.sceneQuery.query(started, commit, async () => {
                if (epoch !== this.sceneEpoch || this.menu.open) return null;
                this.scenePicker ??= new XrScenePicker(this.global);
                this.diagnostics.sceneQueries++;
                return this.scenePicker.pick(origin, direction);
            });
            this.diagnostics.queryMs = performance.now() - started;
            if (
                epoch !== this.sceneEpoch ||
                !this.initialized ||
                this.menu.open ||
                (!this.validSources.has(source) &&
                    !(
                        teleport &&
                        source === this.pendingSceneTeleport &&
                        source.inputSource?.targetRayMode === 'transient-pointer'
                    )) ||
                this.global.collisionStatus !== 'unavailable'
            )
                return;
            const target = observationTarget(this.global.camera.getPosition(), hit);
            this.sceneHit = target ? hit : null;
            if (!target) {
                this.diagnostics.rejectedTargets++;
                return;
            }
            if (teleport) {
                placeHead(this.entity, this.global.camera, target);
                this.cancelScene();
                this.blockUntilNeutral = true;
                confirmSelection(source);
            } else if (commit && this.gestures.get(source) === 'scene') this.sceneTarget = target;
        } catch {
            if (epoch === this.sceneEpoch) {
                this.sceneHit = this.sceneTarget = null;
                this.actionStatus = 'scene-pick-failed';
            }
        }
    }

    private updateHands(): Set<XrInputSource> {
        const usable = new Set([...this.validSources].filter((source) => this.selectable(source)));
        const hands = [...this.validSources].filter((source) => !!source.hand);
        let palm: Vec3 | null = null,
            palmSource: XrInputSource | null = null;
        for (const source of this.inputSources) {
            const capability = this.capabilities.get(source);
            if (capability) {
                capability.ray = this.validSources.has(source);
            }
            if (!source.hand) continue;
            let intent = this.palms.get(source);
            if (!intent) {
                intent = new PalmIntent();
                this.palms.set(source, intent);
            }
            const pose =
                this.validSources.has(source) &&
                capability?.joints &&
                hands.length > 1 &&
                source.handedness !== this.preferences.mainHand
                    ? palmFacing(source, this.global.camera.getPosition())
                    : null;
            if (intent.update(performance.now(), pose?.angle ?? null) && pose) {
                palm = pose.position;
                palmSource = source;
            }
        }
        this.menu.setPalm(palm, palmSource);
        return usable;
    }

    update(dt: number): void {
        this.hint?.hide();
        if (!this.global || !this.app.xr.active || !this.initialized) return;
        if (this.app.xr.visibilityState !== 'visible' || performance.now() - this.lastFrame > 100) {
            this.suspend();
            this.menu.hide();
            return;
        }
        const { camera, collision, collisionStatus } = this.global;
        collision?.prepareForWorldPosition?.(camera.getPosition().x, camera.getPosition().z);
        const status = !this.sessionVR
            ? 'ar-status'
            : collisionStatus === 'loading'
              ? 'collision-loading'
              : collision
                ? this.needsFloorCalibration
                    ? 'calibration-needed'
                    : collision.isReadyAt?.(camera.getPosition().x, camera.getPosition().z) === false
                      ? 'collision-loading'
                      : 'grounded'
                : 'free-roam';
        for (const source of this.inputSources) {
            if (!source.selecting && !source.gamepad?.buttons[0]?.pressed) this.selectNeedsRelease.delete(source);
            const buttonIndex = (source.gamepad?.buttons.length ?? 0) > 5 ? 5 : 4;
            const down = this.validSources.has(source) && !!source.gamepad?.buttons[buttonIndex]?.pressed;
            if (down && !this.buttonHeld.has(source) && (this.menu.canToggle?.(source) ?? true)) {
                this.invalidatePreview();
                this.cancelScene();
                this.menu.toggle(this.sessionVR ? source : undefined);
                this.gestures.clear();
                this.blockUntilNeutral = true;
            }
            if (down) this.buttonHeld.add(source);
            else this.buttonHeld.delete(source);
            this.updateMarker(source);
        }
        const usable = this.updateHands();
        if (this.recoveryOpen) {
            const controllers = [...usable].filter(hasStick);
            const neutral = controllers.every(
                (source) =>
                    readStick(source.gamepad.axes).every((axis) => axis === 0) &&
                    !source.gamepad.buttons.some((button) => button.pressed)
            );
            if (controllers.length > 0 && neutral) this.recoveryNeutral = true;
            else if (
                this.recoveryNeutral &&
                controllers.some((source) => readStick(source.gamepad.axes).some((axis) => axis !== 0))
            ) {
                this.menu.close();
                this.recoveryOpen = false;
                this.blockUntilNeutral = false;
            }
        }
        this.menu.update(
            this.preferences,
            this.controllerDisconnected ? 'input-disconnected' : (this.actionStatus ?? status),
            this.inputSources,
            usable,
            this.trackingLimited
        );
        if (this.menu.open || !this.sessionVR) {
            if (this.sceneSource) this.cancelScene();
            this.invalidatePreview();
            this.blockUntilNeutral = true;
            return;
        }
        const sources = [...this.validSources].filter(hasStick);
        if (this.blockUntilNeutral) {
            if (sources.every((source) => readStick(source.gamepad.axes).every((axis) => Math.abs(axis) < 0.01))) {
                this.blockUntilNeutral = false;
            }
            return;
        }
        const stickActive = sources.some((source) => readStick(source.gamepad.axes).some((axis) => Math.abs(axis) > 0));
        if (!stickActive && this.menu.ownership.kind === 'stick') this.menu.ownership.clear();
        const stickOwner = sources.find((source) => readStick(source.gamepad.axes).some((axis) => Math.abs(axis) > 0));
        const stickAllowed =
            !stickActive ||
            this.menu.ownership.kind === 'stick' ||
            (stickOwner && this.menu.ownership.claim(stickOwner, 'stick'));
        if (stickActive && stickAllowed) this.cancelScene();
        const left = sources.find((source) => source.handedness === 'left');
        const right = sources.find((source) => source.handedness === 'right');
        const movement = left ?? (sources.length === 1 ? sources[0] : undefined);
        const single = sources.length === 1 ? sources[0] : undefined;
        const singleIntent = single
            ? singleStickIntent(single.gamepad.axes, !!single.gamepad.buttons[1]?.pressed)
            : undefined;
        const turning = left && right ? right : single;
        const delta = Math.min(Math.max(dt, 0), 0.05);
        if (turning && stickAllowed) {
            const x = singleIntent ? singleIntent.turn : readStick(turning.gamepad.axes)[0];
            if (this.preferences.locomotion === 'continuous') {
                if (x) this.invalidatePreview();
                rotateAroundHead(this.entity, camera, -x * this.rotateSpeed * delta);
            } else if (Math.abs(x) > 0.6 && !this.snapHeld.has(turning)) {
                this.invalidatePreview();
                rotateAroundHead(this.entity, camera, -Math.sign(x) * 30);
                this.snapHeld.add(turning);
            } else if (Math.abs(x) < 0.2) this.snapHeld.delete(turning);
        }
        if (
            movement &&
            stickAllowed &&
            (this.preferences.locomotion === 'continuous' || !collision) &&
            collisionStatus !== 'loading' &&
            !(collision && this.needsFloorCalibration)
        ) {
            const [x, y] = singleIntent ? singleIntent.move : readStick(movement.gamepad.axes);
            if (x || y) {
                this.invalidatePreview();
                const f = horizontalForward(camera.forward, this.forward);
                const speed = this.movementSpeed * delta;
                const dx = (-f.z * x - f.x * y) * speed;
                const dz = (f.x * x - f.z * y) * speed;
                if (collision) {
                    const before = camera.getPosition().clone();
                    const next = moveOnGround(collision, before, this.floor, this.effectiveHeight(), dx, dz);
                    this.entity.translate(next.x - before.x, next.y - this.floor, next.z - before.z);
                    this.floor = next.y;
                } else this.entity.translate(dx, 0, dz);
            }
        }
        for (const [source, gesture] of this.gestures) {
            if (!this.validSources.has(source)) continue;
            if (gesture === 'free' && collisionStatus !== 'loading' && !(collision && this.needsFloorCalibration)) {
                const f = horizontalForward(camera.forward, this.forward);
                const dx = f.x * delta * 0.75,
                    dz = f.z * delta * 0.75;
                if (collision) {
                    const before = camera.getPosition().clone();
                    const next = moveOnGround(collision, before, this.floor, this.effectiveHeight(), dx, dz);
                    this.entity.translate(next.x - before.x, next.y - this.floor, next.z - before.z);
                    this.floor = next.y;
                } else if (collisionStatus === 'unavailable') this.entity.translate(dx, 0, dz);
            }
            if (gesture === 'scene' && this.sceneTarget && collisionStatus === 'unavailable') {
                const step = stepToTarget(
                    camera.getPosition(),
                    this.sceneTarget,
                    hasStick(source) ? this.movementSpeed : 0.75,
                    delta
                );
                this.entity.translate(step);
            }
            if (gesture === 'teleport' && !this.menu.isPointedAt(source)) this.drawTeleportPreview(source);
        }
        if (collisionStatus === 'unavailable') {
            const pointer =
                this.sceneSource ??
                [...usable].find((source) => source.handedness === this.preferences.mainHand) ??
                [...usable][0];
            if (pointer && !this.menu.isPointedAt(pointer) && this.menu.ownership.kind !== 'stick') {
                if (!this.sceneQuery.busy && performance.now() >= this.nextScenePreview && !this.sceneTarget) {
                    this.nextScenePreview = performance.now() + 100;
                    this.queryScene(pointer, false, false);
                }
                if (this.sceneHit) {
                    this.app.drawLine(pointer.getOrigin(), this.sceneHit, this.validColor);
                    const right = camera.right.clone().mulScalar(0.08),
                        up = camera.up.clone().mulScalar(0.08);
                    this.app.drawLine(
                        this.sceneHit.clone().sub(right),
                        this.sceneHit.clone().add(right),
                        this.validColor
                    );
                    this.app.drawLine(this.sceneHit.clone().sub(up), this.sceneHit.clone().add(up), this.validColor);
                    this.hint?.show('observe', this.sceneHit);
                }
            }
        } else if (this.sceneSource) this.cancelScene();
        if (collision && this.preferences.locomotion === 'comfort') {
            const pointer = right ?? sources[0];
            if (pointer && !this.gestures.has(pointer)) {
                if (this.menu.isPointedAt(pointer)) this.invalidatePreview();
                else this.drawTeleportPreview(pointer);
            }
        }
    }

    private drawTeleportPreview(source: XrInputSource): void {
        if (!this.global.collision) {
            this.invalidatePreview();
            return;
        }
        const now = performance.now();
        if (now >= this.nextPreviewAt) {
            traceTeleport(
                this.global.collision,
                source.getOrigin(),
                source.getDirection(),
                this.global.camera.getPosition(),
                this.effectiveHeight(),
                hasStick(source) && this.preferences.trajectory !== 'straight',
                this.previewTrace
            );
            this.previewSource = source;
            this.nextPreviewAt = now + 1000 / 30;
        }
        if (this.previewSource !== source) return;
        const trace = this.previewTrace;
        const color = trace.valid
            ? this.validColor
            : trace.reason === 'loading'
              ? this.pendingColor
              : this.invalidColor;
        for (let i = 1; i < trace.count; i++) this.app.drawLine(trace.points[i - 1], trace.points[i], color);
        const end = trace.valid ? trace.target : trace.points[trace.count - 1];
        this.hint?.show(trace.reason, end);
        if (trace.valid) {
            for (let i = 0; i <= 24; i++) {
                const angle = (i * Math.PI) / 12;
                this.ringPoints[i].set(end.x + Math.cos(angle) * 0.18, end.y + 0.03, end.z + Math.sin(angle) * 0.18);
                if (i) this.app.drawLine(this.ringPoints[i - 1], this.ringPoints[i], color);
            }
        } else if (trace.hasHit || trace.reason === 'loading') {
            const right = this.global.camera.right,
                up = this.global.camera.up;
            for (let i = 0; i < 4; i++) {
                const x = i % 2 ? 0.06 : -0.06,
                    y = i === 0 || i === 3 ? -0.06 : 0.06;
                this.crossPoints[i].set(
                    end.x + right.x * x + up.x * y,
                    end.y + right.y * x + up.y * y,
                    end.z + right.z * x + up.z * y
                );
            }
            this.app.drawLine(this.crossPoints[0], this.crossPoints[1], color);
            this.app.drawLine(this.crossPoints[2], this.crossPoints[3], color);
        }
    }

    private updateMarker(source: XrInputSource): void {
        // Retain the engine's profile models; a small tracked marker covers unavailable assets.
        const controllers = this.entity.script?.get('xrControllers') as unknown as {
            controllers?: Map<XrInputSource, { entity: Entity }>;
        };
        const model = controllers?.controllers?.get(source)?.entity;
        const valid = this.validSources.has(source);
        if (model) model.enabled = valid;
        let marker = this.markers.get(source);
        if (!marker && valid && !model) {
            marker = new Entity('XR tracked input fallback');
            const material = new StandardMaterial();
            material.useLighting = false;
            material.emissive = this.validColor.clone();
            material.update();
            marker.addComponent('render', { type: 'sphere', material });
            marker.setLocalScale(0.018, 0.018, 0.018);
            marker.once('destroy', () => material.destroy());
            this.app.root.addChild(marker);
            this.markers.set(source, marker);
        }
        if (marker) {
            marker.enabled = valid && !model;
            if (valid) marker.setPosition(source.grip ? source.getPosition() : source.getOrigin());
        }
    }
}

export { XrVrNavigation };
