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
    teleportTarget
} from './xr/locomotion';
import { XrSpatialMenu } from './xr/menu';
import type { MenuAction } from './xr/menu';
import { loadPreferences, savePreferences } from './xr/preferences';

/** Navigation changes the rig only. The browser remains the sole owner of the head pose. */
class XrVrNavigation extends Script {
    static scriptName = 'xrVrNavigation';
    global: Global;
    menu: XrSpatialMenu;
    preferences = loadPreferences();
    movementSpeed = 1.5;
    rotateSpeed = 90;
    readonly inputSources = new Set<XrInputSource>();
    readonly validSources = new Set<XrInputSource>();
    private readonly gestures = new Map<XrInputSource, 'menu' | 'teleport' | 'free'>();
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
    private readonly validColor = new Color(0.45, 0.95, 0.8);
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
        });
    }

    configure(global: Global): void {
        this.global = global;
        this.menu = new XrSpatialMenu(global, (action) => this.onMenuAction(action));
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
        this.blockUntilNeutral = true;
        for (const source of this.app.xr.input.inputSources) this.addSource(source);
        if (!vr) this.menu.show();
    }

    endSession(): void {
        this.initialized = false;
        this.needsPlacement = false;
        this.suspend();
        for (const source of [...this.inputSources]) this.removeSource(source);
        this.menu?.hide();
    }

    private suspend(): void {
        this.gestures.clear();
        this.validSources.clear();
        this.buttonHeld.clear();
        this.snapHeld.clear();
        this.menu?.cancel();
        this.blockUntilNeutral = true;
        this.lastFrame = 0;
        for (const marker of this.markers.values()) marker.enabled = false;
        for (const source of this.inputSources) {
            if (hasStick(source) && source.gamepad.buttons[0]?.pressed) this.selectNeedsRelease.add(source);
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
        this.controllerDisconnected = false;
        if (hasStick(source) && source.gamepad.buttons[0]?.pressed) this.selectNeedsRelease.add(source);
        const menuButton = (source.gamepad?.buttons.length ?? 0) > 5 ? 5 : 4;
        if (source.gamepad?.buttons[menuButton]?.pressed) this.buttonHeld.add(source);
        const start = (event: XRInputSourceEvent) => {
            if (!this.initialized || this.selectNeedsRelease.has(source) || !this.validPose(source, event.frame))
                return;
            // An open panel consumes selections even when the user misses a button.
            if (this.menu.begin(source)) this.gestures.set(source, 'menu');
            else if (this.sessionVR && (this.preferences.locomotion === 'comfort' || !hasStick(source))) {
                this.gestures.set(
                    source,
                    !hasStick(source) && this.global.collisionStatus === 'unavailable' ? 'free' : 'teleport'
                );
            }
        };
        const select = (event: XRInputSourceEvent) => {
            if (!this.validPose(source, event.frame)) return;
            const gesture = this.gestures.get(source);
            if (gesture === 'menu') this.menu.select(source);
            else if (gesture === 'teleport' && !this.menu.open) this.teleport(source);
            this.gestures.delete(source);
        };
        // selectend can be a cancellation. Only a real select commits an action.
        const end = () => {
            this.selectNeedsRelease.delete(source);
            this.gestures.delete(source);
            this.menu.release(source);
        };
        source.on('selectstart', start);
        source.on('select', select);
        source.on('selectend', end);
        this.handlers.set(source, { start, select, end });
        this.blockUntilNeutral = true;
    }

    private removeSource(source: XrInputSource): void {
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
        this.menu?.release(source);
        this.markers.get(source)?.destroy();
        this.markers.delete(source);
        this.blockUntilNeutral = true;
        if (this.initialized && hasStick(source) && this.inputSources.size === 0) {
            this.controllerDisconnected = true;
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
            if (this.validPose(source, frame)) this.validSources.add(source);
            else {
                if (this.validSources.has(source)) this.blockUntilNeutral = true;
                if (hasStick(source) && source.gamepad.buttons[0]?.pressed) this.selectNeedsRelease.add(source);
                this.validSources.delete(source);
                this.gestures.delete(source);
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
        this.heightOffset = this.preferences.posture === 'seated' ? 1.65 - trackedHeight : 0;
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
        const camera = this.global.camera;
        rotateAroundHead(this.entity, camera, this.spawnYaw - headYaw(camera));
        // Reset horizontal position and floor without overriding the current physical head height.
        const target = new Vec3(
            this.spawnEye.x,
            this.spawnFloor + this.effectiveHeight() + FOOT_CLEARANCE,
            this.spawnEye.z
        );
        placeHead(this.entity, camera, target);
        this.floor = target.y - this.effectiveHeight() - FOOT_CLEARANCE;
        this.global.collision?.prepareForWorldPosition?.(target.x, target.z);
        this.calibrateFloor();
        this.menu.show();
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
        this.gestures.clear();
        this.blockUntilNeutral = true;
        this.actionStatus = null;
        if (action === 'resume') this.menu.close();
        else if (action === 'exit') this.global.events.fire('endXR');
        else if (action === 'collision' && this.global.state.hasCollisionOverlay)
            this.global.state.collisionOverlayEnabled = !this.global.state.collisionOverlayEnabled;
        else if (action === 'reset' && this.sessionVR) this.reset();
        else if ((action === 'posture' || action === 'calibrate') && this.sessionVR) {
            const posture =
                action === 'posture'
                    ? this.preferences.posture === 'standing'
                        ? 'seated'
                        : 'standing'
                    : this.preferences.posture;
            const trackedHeight = this.global.camera.getLocalPosition().y;
            const nextOffset = posture === 'seated' ? 1.65 - trackedHeight : 0;
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
                    this.preferences.posture = posture;
                }
            }
            this.menu.show();
        } else if (action === 'locomotion' && this.sessionVR) {
            this.preferences.locomotion = this.preferences.locomotion === 'continuous' ? 'comfort' : 'continuous';
        }
        savePreferences(this.preferences);
    }

    private teleport(source: XrInputSource): void {
        const camera = this.global.camera;
        const target = teleportTarget(
            this.global.collision,
            source.getOrigin(),
            source.getDirection(),
            camera.getPosition(),
            this.effectiveHeight()
        );
        if (!target) return;
        this.needsFloorCalibration = false;
        this.floor = target.y;
        target.y += this.effectiveHeight() + FOOT_CLEARANCE;
        placeHead(this.entity, camera, target);
        this.blockUntilNeutral = true;
        confirmSelection(source);
    }

    update(dt: number): void {
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
            if (!source.gamepad?.buttons[0]?.pressed) this.selectNeedsRelease.delete(source);
            const buttonIndex = (source.gamepad?.buttons.length ?? 0) > 5 ? 5 : 4;
            const down = this.validSources.has(source) && !!source.gamepad?.buttons[buttonIndex]?.pressed;
            if (down && !this.buttonHeld.has(source)) {
                this.menu.toggle();
                this.gestures.clear();
                this.blockUntilNeutral = true;
            }
            if (down) this.buttonHeld.add(source);
            else this.buttonHeld.delete(source);
            this.updateMarker(source);
        }
        this.menu.update(
            this.preferences,
            this.controllerDisconnected ? 'input-disconnected' : (this.actionStatus ?? status),
            this.inputSources,
            this.validSources,
            this.trackingLimited
        );
        if (this.menu.open || !this.sessionVR) {
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
        const left = sources.find((source) => source.handedness === 'left');
        const right = sources.find((source) => source.handedness === 'right');
        const movement = left ?? (sources.length === 1 ? sources[0] : undefined);
        const single = sources.length === 1 ? sources[0] : undefined;
        const singleIntent = single
            ? singleStickIntent(single.gamepad.axes, !!single.gamepad.buttons[1]?.pressed)
            : undefined;
        const turning = left && right ? right : single;
        const delta = Math.min(Math.max(dt, 0), 0.05);
        if (turning) {
            const x = singleIntent ? singleIntent.turn : readStick(turning.gamepad.axes)[0];
            if (this.preferences.locomotion === 'continuous')
                rotateAroundHead(this.entity, camera, -x * this.rotateSpeed * delta);
            else if (Math.abs(x) > 0.6 && !this.snapHeld.has(turning)) {
                rotateAroundHead(this.entity, camera, -Math.sign(x) * 30);
                this.snapHeld.add(turning);
            } else if (Math.abs(x) < 0.2) this.snapHeld.delete(turning);
        }
        if (
            movement &&
            (this.preferences.locomotion === 'continuous' || !collision) &&
            collisionStatus !== 'loading' &&
            !(collision && this.needsFloorCalibration)
        ) {
            const [x, y] = singleIntent ? singleIntent.move : readStick(movement.gamepad.axes);
            if (x || y) {
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
        let freeMoved = false;
        for (const [source, gesture] of this.gestures) {
            if (
                gesture === 'free' &&
                this.validSources.has(source) &&
                !collision &&
                collisionStatus === 'unavailable' &&
                !freeMoved
            ) {
                const f = horizontalForward(source.getDirection(), this.forward);
                this.entity.translate(f.x * delta * 0.6, 0, f.z * delta * 0.6);
                freeMoved = true;
            }
            if (gesture === 'teleport' && this.validSources.has(source)) this.drawTeleportPreview(source);
        }
        if (collision && this.preferences.locomotion === 'comfort') {
            const pointer = right ?? sources[0];
            if (pointer && !this.gestures.has(pointer) && !this.menu.isPointedAt(pointer))
                this.drawTeleportPreview(pointer);
        }
    }

    private drawTeleportPreview(source: XrInputSource): void {
        const target = teleportTarget(
            this.global.collision,
            source.getOrigin(),
            source.getDirection(),
            this.global.camera.getPosition(),
            this.effectiveHeight()
        );
        const end = target ?? source.getDirection().clone().mulScalar(3).add(source.getOrigin());
        this.app.drawLine(source.getOrigin(), end, target ? this.validColor : this.invalidColor);
        if (target) {
            for (let i = 0; i < 24; i++) {
                const a = (i * Math.PI) / 12,
                    b = ((i + 1) * Math.PI) / 12;
                this.app.drawLine(
                    new Vec3(target.x + Math.cos(a) * 0.18, target.y + 0.03, target.z + Math.sin(a) * 0.18),
                    new Vec3(target.x + Math.cos(b) * 0.18, target.y + 0.03, target.z + Math.sin(b) * 0.18),
                    this.validColor
                );
            }
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
