import { Color, Script, Vec2, Vec3 } from 'playcanvas';
import type { XrInputSource, Entity } from 'playcanvas';

/**
 * Custom VR navigation with smooth rotation and adaptive stick detection.
 *
 * - Dual sticks: left = movement, right = smooth rotation
 * - Single stick: defaults to movement
 *
 * Attach to the parent entity of the camera entity used for the XR session.
 */
class XrVrNavigation extends Script {
    static scriptName = 'xrVrNavigation';

    enableTeleport = true;
    enableMove = true;

    movementSpeed = 1.5;

    /** Smooth rotation speed in degrees per second */
    rotateSpeed = 90;

    movementThreshold = 0.1;

    /** Deadzone threshold for smooth rotation */
    rotateThreshold = 0.15;

    maxTeleportDistance = 10;
    teleportIndicatorRadius = 0.2;
    teleportIndicatorSegments = 16;

    validTeleportColor = new Color(0, 1, 0);
    invalidTeleportColor = new Color(1, 0, 0);
    controllerRayColor = new Color(1, 1, 1);

    inputSources = new Set<XrInputSource>();
    activePointers = new Map<XrInputSource, boolean>();
    inputHandlers = new Map<XrInputSource, { handleSelectStart: () => void; handleSelectEnd: () => void }>();

    // Pre-allocated objects
    private tmpVec2A = new Vec2();
    private tmpVec2B = new Vec2();
    private tmpVec3A = new Vec3();
    private tmpVec3B = new Vec3();

    private validColor = new Color();
    private invalidColor = new Color();
    private rayColor = new Color();

    cameraEntity: Entity | null = null;

    initialize() {
        if (!this.app.xr) {
            console.error('XrVrNavigation: XR not available');
            return;
        }

        this.validColor.copy(this.validTeleportColor);
        this.invalidColor.copy(this.invalidTeleportColor);
        this.rayColor.copy(this.controllerRayColor);

        // Find camera entity in children
        const cameraComponent = this.entity.findComponent('camera');
        this.cameraEntity = cameraComponent ? cameraComponent.entity : null;

        if (!this.cameraEntity) {
            const foundByName = this.entity.findByName('camera') as Entity | null;
            this.cameraEntity = foundByName;

            if (!this.cameraEntity) {
                for (const child of this.entity.children) {
                    const childEntity = child as Entity;
                    if (childEntity.camera) {
                        this.cameraEntity = childEntity;
                        break;
                    }
                }
            }
        }

        this.app.xr.input.on('add', (inputSource: XrInputSource) => {
            const handleSelectStart = () => {
                this.activePointers.set(inputSource, true);
            };
            const handleSelectEnd = () => {
                this.activePointers.set(inputSource, false);
                this.tryTeleport(inputSource);
            };

            inputSource.on('selectstart', handleSelectStart);
            inputSource.on('selectend', handleSelectEnd);
            this.inputHandlers.set(inputSource, { handleSelectStart, handleSelectEnd });
            this.inputSources.add(inputSource);
        });

        this.app.xr.input.on('remove', (inputSource: XrInputSource) => {
            const handlers = this.inputHandlers.get(inputSource);
            if (handlers) {
                inputSource.off('selectstart', handlers.handleSelectStart);
                inputSource.off('selectend', handlers.handleSelectEnd);
                this.inputHandlers.delete(inputSource);
            }
            this.activePointers.delete(inputSource);
            this.inputSources.delete(inputSource);
        });
    }

    /**
     * Read thumbstick axes from a gamepad, trying axes[2]/[3] first,
     * falling back to axes[0]/[1] for devices like PICO.
     */
    private readStick(gamepad: Gamepad): Vec2 {
        const axes = gamepad.axes;
        let x = 0;
        let y = 0;

        if (axes.length >= 4) {
            x = axes[2];
            y = axes[3];
        }

        // Fallback: if axes[2]/[3] are zero but [0]/[1] have data
        if (Math.abs(x) < 0.01 && Math.abs(y) < 0.01 && axes.length >= 2) {
            x = axes[0];
            y = axes[1];
        }

        this.tmpVec2A.set(x, y);
        return this.tmpVec2A;
    }

    update(dt: number) {
        if (this.enableMove) {
            this.handleLocomotion(dt);
        }
        if (this.enableTeleport) {
            this.handleTeleportation();
        }
        this.renderControllerRays();
    }

    private handleLocomotion(dt: number) {
        if (!this.cameraEntity) return;

        // Collect controllers with gamepads
        let leftSource: XrInputSource | null = null;
        let rightSource: XrInputSource | null = null;
        let singleSource: XrInputSource | null = null;

        for (const inputSource of this.inputSources) {
            if (!inputSource.gamepad) continue;

            if (inputSource.handedness === 'left') {
                leftSource = inputSource;
            } else if (inputSource.handedness === 'right') {
                rightSource = inputSource;
            } else {
                // 'none' handedness — treat as a single generic controller
                singleSource = inputSource;
            }
        }

        const hasDualSticks = leftSource !== null && rightSource !== null;

        if (hasDualSticks) {
            // Dual stick mode: left = movement, right = smooth rotation
            this.applyMovement(leftSource!, dt);
            this.applySmoothRotation(rightSource!, dt);
        } else {
            // Single stick mode: whichever stick is available = movement
            const moveSource = leftSource ?? rightSource ?? singleSource;
            if (moveSource) {
                this.applyMovement(moveSource, dt);
            }
        }
    }

    private applyMovement(inputSource: XrInputSource, dt: number) {
        if (!this.cameraEntity || !inputSource.gamepad) return;

        const stick = this.readStick(inputSource.gamepad);

        if (stick.length() > this.movementThreshold) {
            // Normalize and apply camera-relative movement
            this.tmpVec2A.normalize();

            const forward = this.cameraEntity.forward;
            this.tmpVec2B.x = forward.x;
            this.tmpVec2B.y = forward.z;
            this.tmpVec2B.normalize();

            const rad = Math.atan2(this.tmpVec2B.x, this.tmpVec2B.y) - Math.PI / 2;

            const sx = this.tmpVec2A.x;
            const sy = this.tmpVec2A.y;
            const t = sx * Math.sin(rad) - sy * Math.cos(rad);
            this.tmpVec2A.y = sy * Math.sin(rad) + sx * Math.cos(rad);
            this.tmpVec2A.x = t;

            this.tmpVec2A.mulScalar(this.movementSpeed * dt);
            this.entity.translate(this.tmpVec2A.x, 0, this.tmpVec2A.y);
        }
    }

    private applySmoothRotation(inputSource: XrInputSource, dt: number) {
        if (!this.cameraEntity || !inputSource.gamepad) return;

        const axes = inputSource.gamepad.axes;
        let rotateX = 0;

        // Read horizontal axis for yaw rotation
        if (axes.length >= 4) {
            rotateX = axes[2];
        }
        if (Math.abs(rotateX) < 0.01 && axes.length >= 2) {
            rotateX = axes[0];
        }

        if (Math.abs(rotateX) > this.rotateThreshold) {
            // Smooth rotation: angle proportional to stick deflection and dt
            const angle = -rotateX * this.rotateSpeed * dt;

            // Rotate around camera position (not entity origin)
            this.tmpVec3A.copy(this.cameraEntity.getLocalPosition());
            this.entity.translateLocal(this.tmpVec3A);
            this.entity.rotateLocal(0, angle, 0);
            this.entity.translateLocal(this.tmpVec3A.mulScalar(-1));
        }
    }

    // --- Teleportation (same as original XrNavigation) ---

    private findPlaneIntersection(origin: Vec3, direction: Vec3): Vec3 | null {
        if (Math.abs(direction.y) < 0.00001) return null;
        const t = -origin.y / direction.y;
        if (t < 0) return null;
        return new Vec3(origin.x + direction.x * t, 0, origin.z + direction.z * t);
    }

    private tryTeleport(inputSource: XrInputSource) {
        if (!this.enableTeleport) return;

        const origin = inputSource.getOrigin();
        const direction = inputSource.getDirection();
        if (!origin || !direction) return;

        const hitPoint = this.findPlaneIntersection(origin, direction);
        if (hitPoint && this.isValidTeleportDistance(hitPoint)) {
            if (this.cameraEntity) {
                const cameraLocalPos = this.cameraEntity.getLocalPosition();
                hitPoint.x -= cameraLocalPos.x;
                hitPoint.z -= cameraLocalPos.z;
            }
            const cameraY = this.entity.getPosition().y;
            hitPoint.y = cameraY;
            this.entity.setPosition(hitPoint);
        }
    }

    private handleTeleportation() {
        for (const inputSource of this.inputSources) {
            if (!this.activePointers.get(inputSource)) continue;

            const start = inputSource.getOrigin();
            const direction = inputSource.getDirection();
            if (!start || !direction) continue;

            const hitPoint = this.findPlaneIntersection(start, direction);

            if (hitPoint && this.isValidTeleportDistance(hitPoint)) {
                this.app.drawLine(start, hitPoint, this.validColor);
                this.drawTeleportIndicator(hitPoint);
            } else {
                this.tmpVec3B.copy(direction).mulScalar(this.maxTeleportDistance).add(start);
                this.app.drawLine(start, this.tmpVec3B, this.invalidColor);
            }
        }
    }

    private renderControllerRays() {
        if (!this.enableMove) return;
        for (const inputSource of this.inputSources) {
            if (this.activePointers.get(inputSource)) continue;
            const start = inputSource.getOrigin();
            if (!start) continue;
            this.tmpVec3B.copy(inputSource.getDirection()).mulScalar(2).add(start);
            this.app.drawLine(start, this.tmpVec3B, this.rayColor);
        }
    }

    private isValidTeleportDistance(hitPoint: Vec3) {
        return hitPoint.distance(this.entity.getPosition()) <= this.maxTeleportDistance;
    }

    private drawTeleportIndicator(point: Vec3) {
        const segments = this.teleportIndicatorSegments;
        const radius = this.teleportIndicatorRadius;

        for (let i = 0; i < segments; i++) {
            const angle1 = (i / segments) * Math.PI * 2;
            const angle2 = ((i + 1) / segments) * Math.PI * 2;

            this.tmpVec3A.set(point.x + Math.cos(angle1) * radius, 0.01, point.z + Math.sin(angle1) * radius);
            this.tmpVec3B.set(point.x + Math.cos(angle2) * radius, 0.01, point.z + Math.sin(angle2) * radius);
            this.app.drawLine(this.tmpVec3A, this.tmpVec3B, this.validColor);
        }
    }
}

export { XrVrNavigation };
