import {
    math,
    GamepadSource,
    InputFrame,
    KeyboardMouseSource,
    MultiTouchSource,
    PROJECTION_PERSPECTIVE,
    Vec3
} from 'playcanvas';
import type { CameraComponent } from 'playcanvas';

import { Picker } from './picker';
import type { FlyInputMode, Global, WalkInputMode } from './types';
import type { VoxelCollider } from './voxel-collider';

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
const flyTouchPan = new Vec3();

const STICK_DEADZONE = 0.15;
const TAP_EPSILON = 15;

const applyStickCurve = (value: number): number => {
    const abs = Math.abs(value);
    if (abs < STICK_DEADZONE) return 0;
    const normalized = (abs - STICK_DEADZONE) / (1 - STICK_DEADZONE);
    const curved = normalized * normalized;
    return Math.sign(value) * curved;
};

const screenToWorld = (camera: CameraComponent, dx: number, dy: number, dz: number, out: Vec3) => {
    const { system, fov, aspectRatio, horizontalFov, projection, orthoHeight } = camera;
    const { width, height } = system.app.graphicsDevice.clientRect;

    out.set(
        -(dx / width) * 2,
        (dy / height) * 2,
        0
    );

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

    private _gamepadInput = new GamepadSource();

    private _touchJoystick = [0, 0];

    private _pinchVelocity = 0;

    private _panVelocity: [number, number] = [0, 0];

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

    private _jumpButtonPressed = 0;

    private _touchGesturePrimed = false;

    collider: VoxelCollider | null = null;

    global: Global;

    frame = new InputFrame({
        move: [0, 0, 0],
        rotate: [0, 0, 0]
    });

    moveSpeed = 4;

    orbitSpeed = 18;

    pinchSpeed = 0.4;

    wheelSpeed = 0.06;

    pinchVelocitySensitivity = 0.006;

    panVelocitySensitivity = 0.005;

    constructor(global: Global) {
        const { app, camera, events, state } = global;
        const canvas = app.graphicsDevice.canvas as HTMLCanvasElement;

        patchKeyboardMeta(this._desktopInput);

        this._desktopInput.attach(canvas);
        this._orbitInput.attach(canvas);

        this.global = global;

        const setWalkInputMode = (mode: WalkInputMode, locked = false) => {
            state.walkInputMode = mode;
            state.walkInputLocked = locked && mode !== 'none';
        };

        const setFlyInputMode = (mode: FlyInputMode, locked = false) => {
            state.flyInputMode = mode;
            state.flyInputLocked = locked && mode !== 'none';
        };

        const resetJoystickInput = () => {
            this._touchJoystick[0] = 0;
            this._touchJoystick[1] = 0;
            events.fire('joystickInput', { x: 0, y: 0 });
            events.fire('joystickSession:reset');
        };

        const resetTouchState = () => {
            this._pinchVelocity = 0;
            this._panVelocity[0] = 0;
            this._panVelocity[1] = 0;
            this._tapJump = false;
            this._jumpButtonPressed = 0;
            this._touchGesturePrimed = false;
            this._touchTapTracking = false;
            this._touchTapDelta = 0;
            this._mouseClickTracking = false;
            this._mouseClickDelta = 0;
        };

        const syncGamingControls = () => {
            let active = false;

            if (state.cameraMode === 'fly') {
                active = state.flyInputMode === 'gamepad';
            } else if (state.cameraMode === 'walk') {
                active = state.inputMode === 'touch'
                    ? state.walkInputMode === 'gamepad'
                    : state.walkInputMode === 'keyboard';
            }

            state.gamingControls = active;
        };

        const updateCanvasCursor = () => {
            if (
                state.cameraMode === 'walk' &&
                state.inputMode === 'desktop' &&
                (state.walkInputMode === 'mouseclick' || state.walkInputMode === 'none')
            ) {
                canvas.style.cursor = this._mouseClickTracking ? 'default' : 'pointer';
            } else {
                canvas.style.cursor = '';
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

        const syncPointerLock = () => {
            if (
                state.cameraMode === 'walk' &&
                state.inputMode === 'desktop' &&
                state.walkInputMode === 'keyboard'
            ) {
                activatePointerLock();
            } else {
                deactivatePointerLock();
            }
            updateCanvasCursor();
        };

        const resetFirstPersonModes = () => {
            resetJoystickInput();
            resetTouchState();

            if (state.cameraMode === 'walk') {
                setWalkInputMode('none', false);
            } else {
                setWalkInputMode('none', false);
            }

            if (state.cameraMode === 'fly' && state.inputMode === 'touch') {
                setFlyInputMode('none', false);
            } else {
                setFlyInputMode('none', false);
            }

            syncGamingControls();
            updateCanvasCursor();
        };

        events.on('joystickInput', (value: { x: number; y: number }) => {
            this._touchJoystick[0] = value.x;
            this._touchJoystick[1] = value.y;
        });

        events.on('jumpButton:changed', (pressed: boolean) => {
            this._jumpButtonPressed = 0;
            if (pressed) {
                this._tapJump = true;
            }
        });

        ['wheel', 'pointerdown', 'contextmenu', 'keydown'].forEach((eventName) => {
            canvas.addEventListener(eventName, (event) => {
                events.fire('inputEvent', 'interrupt', event);
            });
        });

        canvas.addEventListener('pointermove', (event) => {
            events.fire('inputEvent', 'interact', event);
        });

        const lastTap = { time: 0, x: 0, y: 0 };
        canvas.addEventListener('pointerdown', (event) => {
            this._lastPointerOffsetX = event.offsetX;
            this._lastPointerOffsetY = event.offsetY;

            if (
                state.cameraMode === 'walk' &&
                event.pointerType !== 'touch' &&
                event.button === 0
            ) {
                if (state.walkInputMode === 'none' && !state.walkInputLocked) {
                    setWalkInputMode('mouseclick', false);
                }
                if (state.walkInputMode === 'mouseclick') {
                    this._mouseClickTracking = true;
                    this._mouseClickDelta = 0;
                    updateCanvasCursor();
                }
            }

            if (state.cameraMode === 'walk' && event.pointerType === 'touch') {
                if (state.walkInputMode === 'none' && !state.walkInputLocked) {
                    setWalkInputMode('touchclick', false);
                }
                if (state.walkInputMode === 'touchclick' || state.walkInputMode === 'gamepad') {
                    this._touchTapTracking = true;
                    this._touchTapDelta = 0;
                    this._touchStartX = event.clientX;
                    this._touchStartY = event.clientY;
                }
            }

            if (state.cameraMode === 'fly' && event.pointerType === 'touch') {
                this._touchGesturePrimed = !state.flyInputLocked || state.flyInputMode === 'gesture' || state.flyInputMode === 'none';
            }

            const now = Date.now();
            const delay = Math.max(0, now - lastTap.time);
            if (
                delay < 300 &&
                Math.abs(event.clientX - lastTap.x) < 8 &&
                Math.abs(event.clientY - lastTap.y) < 8
            ) {
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

        const endPointerTracking = () => {
            this._mouseClickTracking = false;
            this._touchTapTracking = false;
            this._mouseClickDelta = 0;
            this._touchTapDelta = 0;
            if (state.cameraMode === 'fly' && state.inputMode === 'touch' && state.flyInputMode === 'none') {
                this._touchGesturePrimed = false;
            }
            updateCanvasCursor();
        };

        canvas.addEventListener('pointerup', () => {
            if (
                state.cameraMode === 'walk' &&
                state.walkInputMode === 'mouseclick' &&
                this._mouseClickTracking &&
                this._mouseClickDelta < TAP_EPSILON
            ) {
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

            endPointerTracking();
        });

        canvas.addEventListener('pointercancel', endPointerTracking);

        events.on('inputEvent', async (eventName, event) => {
            if (eventName !== 'dblclick' || state.cameraMode === 'walk') {
                return;
            }

            if (!this._picker) {
                this._picker = new Picker(app, camera);
            }
            const result = await this._picker.pick(event.offsetX / canvas.clientWidth, event.offsetY / canvas.clientHeight);
            if (result) {
                events.fire('pick', result);
            }
        });

        ['pointerdown', 'pointermove'].forEach((eventName) => {
            window.addEventListener(eventName, (event: PointerEvent) => {
                state.inputMode = event.pointerType === 'touch' ? 'touch' : 'desktop';
            });
        });

        window.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (
                    state.cameraMode === 'walk' &&
                    state.inputMode === 'desktop' &&
                    state.walkInputMode === 'keyboard'
                ) {
                    setWalkInputMode('mouseclick', false);
                    events.fire('walkCancel');
                } else {
                    if (state.cameraMode === 'walk') {
                        events.fire('inputEvent', 'exitWalk', event);
                    } else {
                        events.fire('inputEvent', 'cancel', event);
                    }
                }
                return;
            }

            if (event.ctrlKey || event.altKey || event.metaKey) {
                return;
            }

            if (
                state.cameraMode === 'walk' &&
                state.walkInputMode === 'none' &&
                !state.walkInputLocked &&
                ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)
            ) {
                setWalkInputMode('keyboard', false);
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
                        setWalkInputMode(
                            state.inputMode === 'touch'
                                ? (state.walkInputMode === 'gamepad' ? 'touchclick' : 'gamepad')
                                : (state.walkInputMode === 'keyboard' ? 'mouseclick' : 'keyboard'),
                            true
                        );
                        if (state.walkInputMode !== 'gamepad' && state.walkInputMode !== 'keyboard') {
                            events.fire('walkCancel');
                        }
                    } else if (state.cameraMode === 'fly' && state.inputMode === 'touch') {
                        setFlyInputMode(state.flyInputMode === 'gamepad' ? 'gesture' : 'gamepad', true);
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
        });

        events.on('cameraMode:changed', () => {
            resetFirstPersonModes();
            this._jumpButtonPressed = 0;
            syncPointerLock();
        });

        events.on('inputMode:changed', () => {
            resetFirstPersonModes();
            this._jumpButtonPressed = 0;
            syncPointerLock();
        });

        events.on('walkInputMode:changed', (value: WalkInputMode, prev: WalkInputMode) => {
            if (prev === 'gamepad' && value !== 'gamepad') {
                resetJoystickInput();
            }
            if (value !== 'gamepad') {
                this._touchJoystick[0] = 0;
                this._touchJoystick[1] = 0;
            }
            syncGamingControls();
            syncPointerLock();
        });

        events.on('flyInputMode:changed', (value: FlyInputMode, prev: FlyInputMode) => {
            if (prev === 'gamepad' && value !== 'gamepad') {
                resetJoystickInput();
            }
            if (value !== 'gamepad') {
                this._touchJoystick[0] = 0;
                this._touchJoystick[1] = 0;
            }
            if (value !== 'gesture') {
                this._pinchVelocity = 0;
                this._panVelocity[0] = 0;
                this._panVelocity[1] = 0;
            }
            syncGamingControls();
        });

        document.addEventListener('pointerlockchange', () => {
            if (
                !document.pointerLockElement &&
                state.cameraMode === 'walk' &&
                state.inputMode === 'desktop' &&
                state.walkInputMode === 'keyboard'
            ) {
                (this._desktopInput as any)._pointerLock = false;
                setWalkInputMode('mouseclick', false);
                updateCanvasCursor();
            }
        });

        document.addEventListener('pointerlockerror', () => {
            (this._desktopInput as any)._pointerLock = false;
            if (
                state.cameraMode === 'walk' &&
                state.inputMode === 'desktop' &&
                state.walkInputMode === 'keyboard'
            ) {
                setWalkInputMode('mouseclick', false);
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

    update(dt: number, distance: number) {
        const { keyCode } = KeyboardMouseSource;

        const { key, button, mouse, wheel } = this._desktopInput.read();
        const { touch, pinch, count } = this._orbitInput.read();
        const { leftStick, rightStick } = this._gamepadInput.read();

        const { events, state } = this.global;
        const { camera } = this.global.camera;

        this._state.axis.add(tmpV1.set(
            (key[keyCode.D] - key[keyCode.A]) + (key[keyCode.RIGHT] - key[keyCode.LEFT]),
            (key[keyCode.E] - key[keyCode.Q]),
            (key[keyCode.W] - key[keyCode.S]) + (key[keyCode.UP] - key[keyCode.DOWN])
        ));
        this._state.jump += key[keyCode.SPACE] + (this._tapJump ? 1 : 0) + this._jumpButtonPressed;
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
        const isFly = state.cameraMode === 'fly';
        const isFirstPerson = isWalk || isFly;

        if (
            isWalk &&
            state.walkInputMode === 'none' &&
            (this._state.axis.x !== 0 || this._state.axis.z !== 0)
        ) {
            state.walkInputMode = 'keyboard';
            state.walkInputLocked = false;
        }

        const touchMoved = Math.abs(touch[0]) + Math.abs(touch[1]) > 0.01 || Math.abs(pinch[0]) > 0.01;
        if (isFly && state.inputMode === 'touch' && state.flyInputMode === 'none' && this._touchGesturePrimed && touchMoved) {
            state.flyInputMode = 'gesture';
            state.flyInputLocked = false;
        }

        if (isWalk && state.walkInputMode === 'keyboard' && (this._state.axis.x !== 0 || this._state.axis.z !== 0)) {
            events.fire('walkCancel');
        }

        if (isWalk && state.walkInputMode === 'gamepad' && (Math.abs(this._touchJoystick[0]) > 0.01 || Math.abs(this._touchJoystick[1]) > 0.01)) {
            events.fire('walkCancel');
        }

        if (isFly && state.inputMode === 'touch' && state.flyInputMode === 'gesture' && this._state.touches > 1) {
            this._pinchVelocity -= pinch[0] * this.pinchVelocitySensitivity;
            this._pinchVelocity = math.clamp(this._pinchVelocity, -1, 1);
            this._panVelocity[0] += touch[0] * this.panVelocitySensitivity;
            this._panVelocity[0] = math.clamp(this._panVelocity[0], -1, 1);
            this._panVelocity[1] += touch[1] * this.panVelocitySensitivity;
            this._panVelocity[1] = math.clamp(this._panVelocity[1], -1, 1);
        } else if (isFly && state.inputMode === 'touch' && this._state.touches <= 1) {
            this._pinchVelocity = 0;
            this._panVelocity[0] = 0;
            this._panVelocity[1] = 0;
        }

        const orbit = +(state.cameraMode === 'orbit');
        const fly = +isFirstPerson;
        const double = +(this._state.touches > 1);
        const pan = this._state.mouse[2] || +(button[2] === -1) || double;
        const orbitFactor = fly ? camera.fov / 120 : 1;
        const { deltas } = this.frame;

        const walkMode = isWalk ? state.walkInputMode : 'none';
        const walkJump = isWalk ? this._state.jump : 0;

        let shiftMul = this._state.shift ? 4 : 1;
        if (isWalk) {
            shiftMul = this._state.shift ? 2 : 1;
        }
        const ctrlMul = this._state.ctrl ? (isWalk ? 0.5 : 0.25) : 1;

        const move = tmpV1.set(0, isWalk ? walkJump : 0, 0);
        tmpKeyMove.set(this._state.axis.x, isWalk ? 0 : this._state.axis.y, this._state.axis.z).normalize();
        if (!isWalk || walkMode === 'keyboard') {
            move.add(tmpKeyMove.mulScalar(fly * this.moveSpeed * shiftMul * ctrlMul * dt));
        }
        if (!isWalk) {
            screenToWorld(camera, mouse[0], mouse[1], distance, tmpPanMove);
            move.add(tmpPanMove.mulScalar(pan));
            tmpWheelMove.set(0, 0, -wheel[0]);
            move.add(tmpWheelMove.mulScalar(this.wheelSpeed * dt));
        }
        deltas.move.append([move.x, move.y, orbit ? -move.z : move.z]);

        const desktopRotate = tmpV1.set(0, 0, 0);
        mouseRotate.set(mouse[0], mouse[1], 0);
        desktopRotate.add(mouseRotate.mulScalar((1 - pan) * this.orbitSpeed * orbitFactor * dt));
        deltas.rotate.append([desktopRotate.x, desktopRotate.y, desktopRotate.z]);

        const mobileMove = tmpV1.set(0, 0, 0);
        if (isWalk) {
            mobileMove.y = walkJump;
            if (walkMode === 'gamepad') {
                flyMove.set(this._touchJoystick[0], 0, -this._touchJoystick[1]);
                mobileMove.add(flyMove.mulScalar(fly * this.moveSpeed * dt));
            }
        } else if (isFly) {
            if (state.flyInputMode === 'gamepad') {
                flyMove.set(this._touchJoystick[0], 0, -this._touchJoystick[1]);
                mobileMove.add(flyMove.mulScalar(this.moveSpeed * dt));
            } else if (state.flyInputMode === 'gesture') {
                flyTouchPan.set(this._panVelocity[0], -this._panVelocity[1], 0);
                mobileMove.add(flyTouchPan.mulScalar(this.moveSpeed * dt));
                pinchMove.set(0, 0, this._pinchVelocity);
                mobileMove.add(pinchMove.mulScalar(this.moveSpeed * dt));
            }
        } else {
            screenToWorld(camera, touch[0], touch[1], distance, tmpOrbitMove);
            mobileMove.add(tmpOrbitMove.mulScalar(orbit * pan));
            pinchMove.set(0, 0, pinch[0]);
            mobileMove.add(pinchMove.mulScalar(orbit * double * this.pinchSpeed * dt));
        }
        deltas.move.append([mobileMove.x, mobileMove.y, mobileMove.z]);

        const mobileRotate = tmpV1.set(0, 0, 0);
        if (isWalk) {
            orbitRotate.set(touch[0], touch[1], 0);
            mobileRotate.add(orbitRotate.mulScalar(this.orbitSpeed * orbitFactor * dt));
        } else {
            orbitRotate.set(touch[0], touch[1], 0);
            mobileRotate.add(orbitRotate.mulScalar(orbit * (1 - pan) * this.orbitSpeed * dt));
            flyRotate.set(touch[0], touch[1], 0);
            mobileRotate.add(flyRotate.mulScalar(fly * (1 - double) * this.orbitSpeed * orbitFactor * dt));
        }
        deltas.rotate.append([mobileRotate.x, mobileRotate.y, mobileRotate.z]);

        const gpLeftX = applyStickCurve(leftStick[0]);
        const gpLeftY = applyStickCurve(leftStick[1]);
        const gpRightX = applyStickCurve(rightStick[0]);
        const gpRightY = applyStickCurve(rightStick[1]);
        const hasLeft = gpLeftX !== 0 || gpLeftY !== 0;
        const hasRight = gpRightX !== 0 || gpRightY !== 0;
        const gpMoveX = hasLeft ? gpLeftX : gpRightX;
        const gpMoveY = hasLeft ? gpLeftY : gpRightY;
        const gpRotX = (hasLeft && hasRight) ? gpRightX : 0;
        const gpRotY = (hasLeft && hasRight) ? gpRightY : 0;

        const gamepadMove = tmpV1.set(0, 0, 0);
        if (gpMoveX !== 0 || gpMoveY !== 0) {
            if (!isWalk) {
                if (state.cameraMode !== 'fly') {
                    state.cameraMode = 'fly';
                }
                stickMove.set(gpMoveX, 0, -gpMoveY);
                gamepadMove.add(stickMove.mulScalar(this.moveSpeed * dt));
            }
        }
        deltas.move.append([gamepadMove.x, gamepadMove.y, gamepadMove.z]);

        const gamepadRotate = tmpV1.set(0, 0, 0);
        if (gpRotX !== 0 || gpRotY !== 0) {
            if (!isWalk) {
                if (state.cameraMode !== 'fly') {
                    state.cameraMode = 'fly';
                }
                stickRotate.set(gpRotX, gpRotY, 0);
                gamepadRotate.add(stickRotate.mulScalar(this.orbitSpeed * orbitFactor * dt));
            }
        }
        deltas.rotate.append([gamepadRotate.x, gamepadRotate.y, gamepadRotate.z]);
    }
}

export { InputController };
