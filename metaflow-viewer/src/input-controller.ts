import {
    math,
    DualGestureSource,
    GamepadSource,
    InputFrame,
    KeyboardMouseSource,
    MultiTouchSource,
    PROJECTION_PERSPECTIVE,
    Vec3
} from 'playcanvas';
import type { CameraComponent } from 'playcanvas';

import { Picker } from './picker';
import type { Global } from './types';
import type { VoxelCollider } from './voxel-collider';

/* Vec initialisation to avoid recurrent memory allocation */
const tmpV1 = new Vec3();
const tmpV2 = new Vec3();
const tmpKeyMove = new Vec3();
const tmpPanMove = new Vec3();
const tmpWheelMove = new Vec3();
const tmpOrbitMove = new Vec3();
const mouseRotate = new Vec3();
const flyMove = new Vec3();
const pinchMove = new Vec3();
const orbitRotate = new Vec3();
const flyRotate = new Vec3();
const stickMove = new Vec3();
const stickRotate = new Vec3();

/* Gamepad constants */
const STICK_DEADZONE = 0.15;
const TAP_EPSILON = 15;

/**
 * Apply deadzone and non-linear response curve to a stick axis value.
 * Returns 0 inside deadzone, then smooth ramp from 0→1 with quadratic curve
 * for fine control at small deflections and full speed at large deflections.
 */
const applyStickCurve = (value: number): number => {
    const abs = Math.abs(value);
    if (abs < STICK_DEADZONE) return 0;
    // remap [deadzone..1] → [0..1] then apply quadratic curve
    const normalized = (abs - STICK_DEADZONE) / (1 - STICK_DEADZONE);
    const curved = normalized * normalized;
    return Math.sign(value) * curved;
};

/**
 * Converts screen space mouse deltas to world space pan vector.
 *
 * @param camera - The camera component.
 * @param dx - The mouse delta x value.
 * @param dy - The mouse delta y value.
 * @param dz - The world space zoom delta value.
 * @param out - The output vector to store the pan result.
 * @returns - The pan vector in world space.
 * @private
 */
const screenToWorld = (camera: CameraComponent, dx: number, dy: number, dz: number, out: Vec3) => {
    const { system, fov, aspectRatio, horizontalFov, projection, orthoHeight } = camera;
    const { width, height } = system.app.graphicsDevice.clientRect;

    // normalize deltas to device coord space
    out.set(
        -(dx / width) * 2,
        (dy / height) * 2,
        0
    );

    // calculate half size of the view frustum at the current distance
    const halfSize = tmpV2.set(0, 0, 0);
    if (projection === PROJECTION_PERSPECTIVE) {
        const halfSlice = dz * Math.tan(0.5 * fov * math.DEG_TO_RAD);
        if (horizontalFov) {
            halfSize.set(
                halfSlice,
                halfSlice / aspectRatio,
                0
            );
        } else {
            halfSize.set(
                halfSlice * aspectRatio,
                halfSlice,
                0
            );
        }
    } else {
        halfSize.set(
            orthoHeight * aspectRatio,
            orthoHeight,
            0
        );
    }

    // scale by device coord space
    out.mul(halfSize);

    return out;
};

const patchKeyboardMeta = (desktopInput: any) => {
    const origOnKeyDown = desktopInput._onKeyDown;
    desktopInput._onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Meta') {
            desktopInput._keyNow.fill(0);
        } else if (!event.metaKey) {
            origOnKeyDown(event);
        }
    };

    const origOnKeyUp = desktopInput._onKeyUp;
    desktopInput._onKeyUp = (event: KeyboardEvent) => {
        if (event.key === 'Meta') {
            desktopInput._keyNow.fill(0);
        } else if (!event.metaKey) {
            origOnKeyUp(event);
        }
    };
};

class InputController {
    private _state = {
        axis: new Vec3(),
        mouse: [0, 0, 0],
        shift: 0,
        ctrl: 0,
        jump: 0,
        touches: 0
    };

    private _desktopInput: KeyboardMouseSource = new KeyboardMouseSource();

    private _orbitInput = new MultiTouchSource();

    private _flyInput = new DualGestureSource();

    private _gamepadInput = new GamepadSource();

    private _walkJoystick = [0, 0];

    private _picker: Picker | null = null;

    private _lastPointerOffsetX = 0;

    private _lastPointerOffsetY = 0;

    private _mouseClickTracking = false;

    private _mouseClickDelta = 0;

    private _touchTapTracking = false;

    private _touchTapDelta = 0;

    private _touchStartX = 0;

    private _touchStartY = 0;

    private _tapJump = false;

    collider: VoxelCollider | null = null;

    global: Global;

    frame = new InputFrame({
        move: [0, 0, 0],
        rotate: [0, 0, 0]
    });

    joystick: {
        base: [number, number] | null,
        stick: [number, number] | null
    } = { base: null, stick: null };

    // this gets overridden by the viewer based on scene size
    moveSpeed: number = 4;

    orbitSpeed: number = 18;

    pinchSpeed: number = 0.4;

    wheelSpeed: number = 0.06;

    constructor(global: Global) {
        const { app, camera, events, state } = global;
        const canvas = app.graphicsDevice.canvas as HTMLCanvasElement;

        patchKeyboardMeta(this._desktopInput);

        this._desktopInput.attach(canvas);
        this._orbitInput.attach(canvas);
        this._flyInput.attach(canvas);

        // convert events to joystick state
        this._flyInput.on('joystick:position:left', ([bx, by, sx, sy]) => {
            if (bx < 0 || by < 0 || sx < 0 || sy < 0) {
                this.joystick.base = null;
                this.joystick.stick = null;
                return;
            }
            this.joystick.base = [bx, by];
            this.joystick.stick = [sx - bx, sy - by];
        });

        events.on('joystickInput', (value: { x: number; y: number }) => {
            this._walkJoystick[0] = value.x;
            this._walkJoystick[1] = value.y;
        });

        this.global = global;

        const updateCanvasCursor = () => {
            if (state.cameraMode === 'walk' && state.inputMode === 'desktop' && state.walkInputMode === 'mouseclick') {
                canvas.style.cursor = this._mouseClickTracking ? 'default' : 'pointer';
            } else {
                canvas.style.cursor = '';
            }
        };

        const setWalkLockedMode = (mode: 'gamepad' | 'touchclick' | 'keyboard' | 'mouseclick') => {
            state.walkInputMode = mode;
            state.walkInputLocked = true;
            state.gamingControls = mode === 'gamepad' || mode === 'keyboard';
            if (mode === 'mouseclick' || mode === 'touchclick') {
                events.fire('joystickInput', { x: 0, y: 0 });
            }
        };

        const activatePointerLock = () => {
            if (document.pointerLockElement === canvas) {
                return;
            }
            (this._desktopInput as any)._pointerLock = true;
            canvas.requestPointerLock?.();
        };

        const deactivatePointerLock = () => {
            (this._desktopInput as any)._pointerLock = false;
            if (document.pointerLockElement === canvas) {
                document.exitPointerLock();
            }
        };

        const shouldUsePointerLock = () => {
            return state.cameraMode === 'walk' &&
                state.inputMode === 'desktop' &&
                state.walkInputMode === 'keyboard' &&
                state.gamingControls;
        };

        const syncPointerLock = () => {
            if (shouldUsePointerLock()) {
                activatePointerLock();
            } else {
                deactivatePointerLock();
            }
            updateCanvasCursor();
        };

        // Generate input events
        ['wheel', 'pointerdown', 'contextmenu', 'keydown'].forEach((eventName) => {
            canvas.addEventListener(eventName, (event) => {
                events.fire('inputEvent', 'interrupt', event);
            });
        });

        canvas.addEventListener('pointermove', (event) => {
            events.fire('inputEvent', 'interact', event);
        });

        // Detect double taps manually because iOS doesn't send dblclick events
        const lastTap = { time: 0, x: 0, y: 0 };
        canvas.addEventListener('pointerdown', (event) => {
            this._lastPointerOffsetX = event.offsetX;
            this._lastPointerOffsetY = event.offsetY;

            if (state.cameraMode === 'walk' && state.walkInputMode === 'mouseclick' && event.pointerType !== 'touch' && event.button === 0) {
                this._mouseClickTracking = true;
                this._mouseClickDelta = 0;
                updateCanvasCursor();
            }

            if (state.cameraMode === 'walk' && event.pointerType === 'touch') {
                this._touchTapTracking = true;
                this._touchTapDelta = 0;
                this._touchStartX = event.clientX;
                this._touchStartY = event.clientY;
            }

            const now = Date.now();
            const delay = Math.max(0, now - lastTap.time);
            if (delay < 300 &&
                Math.abs(event.clientX - lastTap.x) < 8 &&
                Math.abs(event.clientY - lastTap.y) < 8) {
                events.fire('inputEvent', 'dblclick', event);
                lastTap.time = 0;
            } else {
                lastTap.time = now;
                lastTap.x = event.clientX;
                lastTap.y = event.clientY;
            }
        });

        canvas.addEventListener('pointermove', (event) => {
            if (this._mouseClickTracking && event.pointerType !== 'touch') {
                this._mouseClickDelta += Math.abs(event.movementX) + Math.abs(event.movementY);
                if (this._mouseClickDelta >= TAP_EPSILON) {
                    events.fire('walkCancel');
                }
            }

            if (this._touchTapTracking && event.pointerType === 'touch') {
                this._touchTapDelta = Math.max(
                    this._touchTapDelta,
                    Math.hypot(event.clientX - this._touchStartX, event.clientY - this._touchStartY)
                );
                if (this._touchTapDelta >= TAP_EPSILON) {
                    events.fire('walkCancel');
                }
            }
        });

        canvas.addEventListener('pointerup', () => {
            if (state.cameraMode === 'walk' && state.walkInputMode === 'mouseclick' && this._mouseClickTracking && this._mouseClickDelta < TAP_EPSILON) {
                const result = this._pickVoxel(this._lastPointerOffsetX, this._lastPointerOffsetY);
                if (result) {
                    events.fire('walkTo', result.position, result.normal);
                }
            }

            if (state.cameraMode === 'walk' && this._touchTapTracking && this._touchTapDelta < TAP_EPSILON) {
                if (state.walkInputMode === 'gamepad') {
                    this._tapJump = true;
                } else {
                    const result = this._pickVoxel(this._lastPointerOffsetX, this._lastPointerOffsetY);
                    if (result) {
                        events.fire('walkTo', result.position, result.normal);
                    }
                }
            }

            this._mouseClickTracking = false;
            this._touchTapTracking = false;
            this._mouseClickDelta = 0;
            this._touchTapDelta = 0;
            updateCanvasCursor();
        });

        canvas.addEventListener('pointercancel', () => {
            this._mouseClickTracking = false;
            this._touchTapTracking = false;
            this._mouseClickDelta = 0;
            this._touchTapDelta = 0;
            updateCanvasCursor();
        });

        // Calculate pick location on double click
        events.on('inputEvent', async (eventName, event) => {
            switch (eventName) {
                case 'dblclick': {
                    if (state.cameraMode === 'walk') {
                        break;
                    }
                    if (!this._picker) {
                        this._picker = new Picker(app, camera);
                    }
                    const result = await this._picker.pick(event.offsetX / canvas.clientWidth, event.offsetY / canvas.clientHeight);
                    if (result) {
                        events.fire('pick', result);
                    }
                    break;
                }
            }
        });

        // update input mode based on pointer event
        ['pointerdown', 'pointermove'].forEach((eventName) => {
            window.addEventListener(eventName, (event: PointerEvent) => {
                state.inputMode = event.pointerType === 'touch' ? 'touch' : 'desktop';
            });
        });

        // handle keyboard events
        window.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (state.cameraMode === 'walk' && state.inputMode === 'desktop' && state.walkInputMode === 'keyboard' && state.gamingControls) {
                    state.gamingControls = false;
                    state.walkInputMode = 'mouseclick';
                    state.walkInputLocked = true;
                    events.fire('walkCancel');
                } else if (state.cameraMode === 'walk') {
                    events.fire('inputEvent', 'exitWalk', event);
                } else {
                    events.fire('inputEvent', 'cancel', event);
                }
            } else if (!event.ctrlKey && !event.altKey && !event.metaKey) {
                if (state.cameraMode === 'walk' && !state.walkInputLocked) {
                    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
                        setWalkLockedMode('keyboard');
                    }
                }
                switch (event.key.toLowerCase()) {
                    case '1':
                        state.cameraMode = 'orbit';
                        break;
                    case '2':
                        state.cameraMode = 'fly';
                        break;
                    case '3':
                        events.fire('inputEvent', 'toggleWalk', event);
                        break;
                    case 'g':
                        if (state.cameraMode === 'walk') {
                            const walkGamingActive = state.walkInputMode === 'keyboard' || state.walkInputMode === 'gamepad';
                            if (walkGamingActive) {
                                setWalkLockedMode(state.inputMode === 'touch' ? 'touchclick' : 'mouseclick');
                                events.fire('walkCancel');
                            } else {
                                setWalkLockedMode(state.inputMode === 'touch' ? 'gamepad' : 'keyboard');
                            }
                        } else {
                            state.gamingControls = !state.gamingControls;
                        }
                        break;
                    case 'h':
                        events.fire('inputEvent', 'toggleHelp', event);
                        break;
                    case 'v':
                        if (state.hasVoxelOverlay) {
                            state.voxelOverlayEnabled = !state.voxelOverlayEnabled;
                        }
                        break;
                    default:
                        if (state.cameraMode !== 'walk') {
                            switch (event.key.toLowerCase()) {
                                case 'f':
                                    events.fire('inputEvent', 'frame', event);
                                    break;
                                case 'r':
                                    events.fire('inputEvent', 'reset', event);
                                    break;
                                case ' ':
                                    events.fire('inputEvent', 'playPause', event);
                                    break;
                            }
                        }
                        break;
                }
            }
        });

        events.on('cameraMode:changed', syncPointerLock);
        events.on('gamingControls:changed', syncPointerLock);
        events.on('walkInputMode:changed', syncPointerLock);
        events.on('inputMode:changed', syncPointerLock);

        document.addEventListener('pointerlockchange', () => {
            if (!document.pointerLockElement && state.cameraMode === 'walk' && state.inputMode === 'desktop' && state.walkInputMode === 'keyboard' && state.gamingControls) {
                (this._desktopInput as any)._pointerLock = false;
                state.gamingControls = false;
                state.walkInputMode = 'mouseclick';
                state.walkInputLocked = true;
                updateCanvasCursor();
            }
        });

        document.addEventListener('pointerlockerror', () => {
            (this._desktopInput as any)._pointerLock = false;
            if (state.cameraMode === 'walk' && state.inputMode === 'desktop' && state.walkInputMode === 'keyboard') {
                state.gamingControls = false;
                state.walkInputMode = 'mouseclick';
                state.walkInputLocked = true;
            }
            updateCanvasCursor();
        });
    }

    private _pickVoxel(offsetX: number, offsetY: number): { position: Vec3; normal: Vec3 } | null {
        if (!this.collider) {
            return null;
        }

        const { camera } = this.global;
        const cameraPos = camera.getPosition();

        camera.camera.screenToWorld(offsetX, offsetY, 1.0, tmpV1);
        tmpV1.sub(cameraPos).normalize();

        // PlayCanvas -> voxel space mapping: x and y are negated
        const hit = this.collider.queryRay(
            -cameraPos.x, -cameraPos.y, cameraPos.z,
            -tmpV1.x, -tmpV1.y, tmpV1.z,
            camera.camera.farClip
        );

        if (!hit) {
            return null;
        }

        const sn = this.collider.querySurfaceNormal(hit.x, hit.y, hit.z, -tmpV1.x, -tmpV1.y, tmpV1.z);
        return {
            position: new Vec3(-hit.x, -hit.y, hit.z),
            normal: new Vec3(-sn.nx, -sn.ny, sn.nz)
        };
    }

    /**
     * @param dt - delta time in seconds
     * @param state - the current state of the app
     * @param state.cameraMode - the current camera mode
     * @param distance - the distance to the camera target
     */
    update(dt: number, distance: number) {
        const { keyCode } = KeyboardMouseSource;

        const { key, button, mouse, wheel } = this._desktopInput.read();
        const { touch, pinch, count } = this._orbitInput.read();
        const { leftInput, rightInput } = this._flyInput.read();
        const { leftStick, rightStick } = this._gamepadInput.read();

        const { events, state } = this.global;
        const { camera } = this.global.camera;

        // update state
        this._state.axis.add(tmpV1.set(
            (key[keyCode.D] - key[keyCode.A]) + (key[keyCode.RIGHT] - key[keyCode.LEFT]),
            (key[keyCode.E] - key[keyCode.Q]),
            (key[keyCode.W] - key[keyCode.S]) + (key[keyCode.UP] - key[keyCode.DOWN])
        ));
        this._state.jump += key[keyCode.SPACE] + (this._tapJump ? 1 : 0);
        this._state.touches += count[0];
        for (let i = 0; i < button.length; i++) {
            this._state.mouse[i] += button[i];
        }
        this._state.shift += key[keyCode.SHIFT];
        this._state.ctrl += key[keyCode.CTRL];
        this._tapJump = false;

        if (state.cameraMode !== 'fly' && state.cameraMode !== 'walk' && this._state.axis.length() > 0) {
            events.fire('inputEvent', 'requestFirstPerson');
        }

        const isWalk = state.cameraMode === 'walk';

        if (isWalk && !state.walkInputLocked && (this._state.axis.x !== 0 || this._state.axis.z !== 0)) {
            state.walkInputMode = 'keyboard';
            state.walkInputLocked = true;
            state.gamingControls = true;
        }

        const orbit = +(state.cameraMode === 'orbit');
        const fly = +(state.cameraMode === 'fly' || state.cameraMode === 'walk');
        const double = +(this._state.touches > 1);
        const pan = this._state.mouse[2] || +(button[2] === -1) || double;

        const orbitFactor = fly ? camera.fov / 120 : 1;

        const { deltas } = this.frame;

        const walkMode = isWalk ? state.walkInputMode : 'none';
        const walkKeyboardMode = walkMode === 'keyboard';
        const walkGamepadMode = walkMode === 'gamepad';
        const walkJump = isWalk ? this._state.jump : 0;

        if (isWalk && walkKeyboardMode && (this._state.axis.x !== 0 || this._state.axis.z !== 0)) {
            events.fire('walkCancel');
        }

        if (isWalk && walkGamepadMode && (Math.abs(this._walkJoystick[0]) > 0.01 || Math.abs(this._walkJoystick[1]) > 0.01)) {
            events.fire('walkCancel');
        }

        // desktop move
        const v = tmpV1.set(0, isWalk ? walkJump : 0, 0);
        tmpKeyMove.set(this._state.axis.x, isWalk ? 0 : this._state.axis.y, this._state.axis.z).normalize();
        if (!isWalk || walkKeyboardMode) {
            v.add(tmpKeyMove.mulScalar(fly * this.moveSpeed * (this._state.shift ? 4 : this._state.ctrl ? 0.25 : 1) * dt));
        }
        if (!isWalk) {
            screenToWorld(camera, mouse[0], mouse[1], distance, tmpPanMove);
            v.add(tmpPanMove.mulScalar(pan));
            tmpWheelMove.set(0, 0, -wheel[0]);
            v.add(tmpWheelMove.mulScalar(this.wheelSpeed * dt));
        }
        // FIXME: need to flip z axis for orbit camera
        deltas.move.append([v.x, v.y, orbit ? -v.z : v.z]);

        // desktop rotate
        v.set(0, 0, 0);
        mouseRotate.set(mouse[0], mouse[1], 0);
        v.add(mouseRotate.mulScalar((1 - pan) * this.orbitSpeed * orbitFactor * dt));
        deltas.rotate.append([v.x, v.y, v.z]);

        // mobile move
        v.set(0, 0, 0);
        if (state.cameraMode === 'walk') {
            v.y = walkJump;
            if (walkGamepadMode) {
                flyMove.set(this._walkJoystick[0], 0, -this._walkJoystick[1]);
                v.add(flyMove.mulScalar(fly * this.moveSpeed * dt));
            }
        } else {
            screenToWorld(camera, touch[0], touch[1], distance, tmpOrbitMove);
            v.add(tmpOrbitMove.mulScalar(orbit * pan));
            flyMove.set(leftInput[0], 0, -leftInput[1]);
            v.add(flyMove.mulScalar(fly * this.moveSpeed * dt));
            pinchMove.set(0, 0, pinch[0]);
            v.add(pinchMove.mulScalar(orbit * double * this.pinchSpeed * dt));
        }
        deltas.move.append([v.x, v.y, v.z]);

        // mobile rotate
        v.set(0, 0, 0);
        if (state.cameraMode === 'walk') {
            orbitRotate.set(touch[0], touch[1], 0);
            v.add(orbitRotate.mulScalar(this.orbitSpeed * orbitFactor * dt));
        } else {
            orbitRotate.set(touch[0], touch[1], 0);
            v.add(orbitRotate.mulScalar(orbit * (1 - pan) * this.orbitSpeed * dt));
            flyRotate.set(rightInput[0], rightInput[1], 0);
            v.add(flyRotate.mulScalar(fly * this.orbitSpeed * orbitFactor * dt));
        }
        deltas.rotate.append([v.x, v.y, v.z]);

        // gamepad - detect single vs dual stick
        const gpLeftX = applyStickCurve(leftStick[0]);
        const gpLeftY = applyStickCurve(leftStick[1]);
        const gpRightX = applyStickCurve(rightStick[0]);
        const gpRightY = applyStickCurve(rightStick[1]);

        const hasLeft = gpLeftX !== 0 || gpLeftY !== 0;
        const hasRight = gpRightX !== 0 || gpRightY !== 0;

        // Single stick: whichever stick has input → movement
        // Dual sticks: left → movement, right → rotation
        const gpMoveX = hasLeft ? gpLeftX : gpRightX;
        const gpMoveY = hasLeft ? gpLeftY : gpRightY;
        const gpRotX = (hasLeft && hasRight) ? gpRightX : 0;
        const gpRotY = (hasLeft && hasRight) ? gpRightY : 0;

        // gamepad move
        v.set(0, 0, 0);
        if (gpMoveX !== 0 || gpMoveY !== 0) {
            if (state.cameraMode === 'walk') {
                // Walk mode uses explicit first-input lock and ignores hardware gamepad routing.
            } else {
                if (state.cameraMode !== 'fly') {
                    state.cameraMode = 'fly';
                }
                stickMove.set(gpMoveX, 0, -gpMoveY);
                v.add(stickMove.mulScalar(fly * this.moveSpeed * dt));
            }
        }
        deltas.move.append([v.x, v.y, v.z]);

        // gamepad rotate
        v.set(0, 0, 0);
        if (gpRotX !== 0 || gpRotY !== 0) {
            if (state.cameraMode === 'walk') {
                // Walk mode uses explicit first-input lock and ignores hardware gamepad routing.
            } else {
                if (state.cameraMode !== 'fly') {
                    state.cameraMode = 'fly';
                }
                stickRotate.set(gpRotX, gpRotY, 0);
                v.add(stickRotate.mulScalar(this.orbitSpeed * orbitFactor * dt));
            }
        }
        deltas.rotate.append([v.x, v.y, v.z]);

        // update touch joystick UI
        if (state.cameraMode === 'fly') {
            events.fire('touchJoystickUpdate', this.joystick.base, this.joystick.stick);
        }
    }
}

export { InputController };
