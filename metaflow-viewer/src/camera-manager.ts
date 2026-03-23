import {
    type BoundingBox,
    Vec3
} from 'playcanvas';

import { createRotateTrack } from './animation/create-rotate-track';
import { AnimController } from './cameras/anim-controller';
import { Camera, type CameraFrame, type CameraController } from './cameras/camera';
import { FlyController } from './cameras/fly-controller';
import { OrbitController } from './cameras/orbit-controller';
import { WalkController } from './cameras/walk-controller';
import { WalkSource } from './cameras/walk-source';
import { easeOut } from './core/math';
import { Annotation } from './settings';
import { CameraMode, Global } from './types';
import type { VoxelCollider } from './voxel-collider';

const tmpCamera = new Camera();
const tmpv = new Vec3();

const createCamera = (position: Vec3, target: Vec3, fov: number) => {
    const result = new Camera();
    result.look(position, target);
    result.fov = fov;
    return result;
};

const createFrameCamera = (bbox: BoundingBox, fov: number) => {
    const sceneSize = bbox.halfExtents.length();
    const distance = sceneSize / Math.sin(fov / 180 * Math.PI * 0.5);
    return createCamera(
        new Vec3(2, 1, 2).normalize().mulScalar(distance).add(bbox.center),
        bbox.center,
        fov
    );
};

const resolvePreferredCameraMode = (
    preferred: CameraMode | undefined,
    isObjectExperience: boolean,
    hasCollider: boolean
): CameraMode => {
    switch (preferred) {
        case 'orbit':
            return 'orbit';
        case 'fly':
            return 'fly';
        case 'walk':
            return hasCollider ? 'walk' : 'fly';
        default:
            return isObjectExperience ? 'orbit' : 'fly';
    }
};

const resolveInitialCameraMode = (
    preferred: CameraMode | undefined,
    hasAnimation: boolean,
    startInAnimation: boolean,
    isObjectExperience: boolean,
    hasCollider: boolean
): CameraMode => {
    if (preferred === 'anim') {
        return hasAnimation ? 'anim' : resolvePreferredCameraMode(undefined, isObjectExperience, hasCollider);
    }

    if (hasAnimation && startInAnimation) {
        return 'anim';
    }

    return resolvePreferredCameraMode(preferred, isObjectExperience, hasCollider);
};

class CameraManager {
    update: (deltaTime: number, cameraFrame: CameraFrame) => void;

    setCollider: (collider: VoxelCollider | null) => void;

    // holds the camera state
    camera = new Camera();

    constructor(global: Global, bbox: BoundingBox, collider: VoxelCollider | null = null) {
        const { config, events, settings, state } = global;

        // Character resources under /acg should exit animation to orbit on first cancel/interrupt,
        // except known scene-like entries (itasha, ggc/gcc).
        const pathname = (globalThis?.location?.pathname || '').toLowerCase();
        const isAcgRoute = pathname.startsWith('/acg/');
        const isSceneLikeRoute = /\/(itasha|ggc|gcc)\/?$/.test(pathname);
        const shouldFirstExitAnimToOrbit = isAcgRoute && !isSceneLikeRoute;

        const camera0 = settings.cameras[0].initial;
        const frameCamera = createFrameCamera(bbox, camera0.fov);
        const resetCamera = createCamera(new Vec3(camera0.position), new Vec3(camera0.target), camera0.fov);

        const getAnimTrack = (initial: Camera, isObjectExperience: boolean) => {
            const { animTracks } = settings;

            // extract the camera animation track from settings
            if (animTracks?.length > 0 && settings.startMode === 'animTrack') {
                // use the first animTrack
                return animTracks[0];
            } else if (isObjectExperience) {
                // create basic rotation animation if no anim track is specified
                initial.calcFocusPoint(tmpv);
                return createRotateTrack(initial.position, tmpv, initial.fov);
            }
            return null;
        };

        // object experience starts outside the bounding box
        const isObjectExperience = !bbox.containsPoint(resetCamera.position);
        const animTrack = getAnimTrack(settings.hasStartPose ? resetCamera : frameCamera, isObjectExperience);
        const startInAnimation = settings.startMode === 'animTrack';

        let currentCollider = collider;
        let pendingDefaultWalk = config.defaultCameraMode === 'walk' && !currentCollider;

        const controllers = {
            orbit: new OrbitController(),
            fly: new FlyController(),
            walk: new WalkController(),
            anim: animTrack ? new AnimController(animTrack) : null
        };

        controllers.fly.fov = resetCamera.fov;
        controllers.fly.collider = currentCollider;
        controllers.walk.collider = currentCollider;

        const walkSource = new WalkSource();
        walkSource.onComplete = () => {
            events.fire('walkComplete');
        };

        const getController = (cameraMode: CameraMode): CameraController => {
            return controllers[cameraMode];
        };

        // set the global animation flag
        state.hasAnimation = !!controllers.anim;
        state.animationDuration = controllers.anim ? controllers.anim.animState.cursor.duration : 0;
        const preferredMode = resolvePreferredCameraMode(
            config.defaultCameraMode,
            isObjectExperience,
            !!currentCollider
        );

        // initialize camera mode and initial camera position
        state.cameraMode = resolveInitialCameraMode(
            config.defaultCameraMode,
            state.hasAnimation,
            startInAnimation,
            isObjectExperience,
            !!currentCollider
        );
        this.camera.copy(resetCamera);

        const target = new Camera(this.camera);             // the active controller updates this
        const from = new Camera(this.camera);               // stores the previous camera state during transition
        let fromMode: CameraMode = preferredMode;
        let preWalkMode: CameraMode = preferredMode;
        let hasHandledFirstAnimExit = false;

        this.setCollider = (nextCollider: VoxelCollider | null) => {
            const hadCollider = !!currentCollider;
            currentCollider = nextCollider;
            controllers.fly.collider = nextCollider;
            controllers.walk.collider = nextCollider;

            if (!hadCollider && nextCollider && pendingDefaultWalk && state.cameraMode === 'fly') {
                pendingDefaultWalk = false;
                state.cameraMode = 'walk';
            } else if (nextCollider) {
                pendingDefaultWalk = false;
            }
        };

        // enter the initial controller
        getController(state.cameraMode).onEnter(this.camera);

        // transition time between cameras
        const transitionSpeed = 1.0;
        let transitionTimer = 1;

        const startTransition = () => {
            from.copy(this.camera);
            transitionTimer = 0;
        };

        // application update
        this.update = (deltaTime: number, frame: CameraFrame) => {

            // use dt of 0 if animation is paused
            const dt = state.cameraMode === 'anim' && state.animationPaused ? 0 : deltaTime;

            // update transition timer
            transitionTimer = Math.min(1, transitionTimer + deltaTime * transitionSpeed);

            const controller = getController(state.cameraMode);

            if (state.cameraMode === 'walk') {
                walkSource.update(dt, this.camera.position, this.camera.angles, frame);
            }

            controller.update(dt, frame, target);

            if (transitionTimer < 1) {
                // lerp away from previous camera during transition
                this.camera.lerp(from, target, easeOut(transitionTimer));
            } else {
                this.camera.copy(target);
            }

            // update animation timeline
            if (state.cameraMode === 'anim') {
                state.animationTime = controllers.anim.animState.cursor.value;
            }
        };

        // handle input events
        events.on('inputEvent', (eventName, event) => {
            switch (eventName) {
                case 'frame':
                    state.cameraMode = 'orbit';
                    controllers.orbit.goto(frameCamera);
                    startTransition();
                    break;
                case 'reset':
                    state.cameraMode = 'orbit';
                    controllers.orbit.goto(resetCamera);
                    startTransition();
                    break;
                case 'playPause':
                    if (state.hasAnimation) {
                        if (state.cameraMode === 'anim') {
                            state.animationPaused = !state.animationPaused;
                        } else {
                            state.cameraMode = 'anim';
                            state.animationPaused = false;
                        }
                    }
                    break;
                case 'toggleWalk':
                    if (currentCollider) {
                        if (state.cameraMode === 'walk') {
                            state.cameraMode = preWalkMode;
                        } else {
                            preWalkMode = state.cameraMode;
                            state.cameraMode = 'walk';
                        }
                    }
                    break;
                case 'requestFirstPerson':
                    if (state.cameraMode !== 'walk') {
                        state.cameraMode = 'fly';
                    }
                    break;
                case 'exitWalk':
                    if (state.cameraMode === 'walk') {
                        state.cameraMode = preWalkMode;
                    }
                    break;
                case 'cancel':
                case 'interrupt':
                    if (state.cameraMode === 'anim') {
                        if (shouldFirstExitAnimToOrbit && !hasHandledFirstAnimExit) {
                            hasHandledFirstAnimExit = true;
                            state.cameraMode = 'orbit';
                        } else {
                            state.cameraMode = fromMode;
                        }
                    }
                    break;
            }
        });

        // handle camera mode switching
        events.on('cameraMode:changed', (value, prev) => {
            if (prev === 'walk') {
                walkSource.cancelWalk();
            }

            // store previous camera mode and pose
            target.copy(this.camera);
            startTransition();
            fromMode = prev;

            // exit the old controller
            const prevController = getController(prev);
            prevController.onExit(this.camera);

            // enter new controller
            const newController = getController(value);
            newController.onEnter(this.camera);

        });

        // tap/click-to-walk auto navigation in walk mode
        events.on('walkTo', (position: Vec3, normal: Vec3) => {
            if (state.cameraMode === 'walk') {
                walkSource.walkTo(position);
                events.fire('walkTarget:set', position, normal);
            }
        });

        events.on('walkCancel', () => {
            walkSource.cancelWalk();
            events.fire('walkTarget:clear');
        });

        events.on('walkComplete', () => {
            events.fire('walkTarget:clear');
        });

        // handle user scrubbing the animation timeline
        events.on('scrubAnim', (time) => {
            // switch to animation camera if we're not already there
            state.cameraMode = 'anim';

            // set time
            controllers.anim.animState.cursor.value = time;
        });

        // handle user picking in the scene
        events.on('pick', (position: Vec3) => {
            // switch to orbit camera on pick
            state.cameraMode = 'orbit';

            // construct camera
            tmpCamera.copy(this.camera);
            tmpCamera.look(this.camera.position, position);

            controllers.orbit.goto(tmpCamera);
            startTransition();
        });

        events.on('annotation.activate', (annotation: Annotation) => {
            // switch to orbit camera on pick
            state.cameraMode = 'orbit';

            const { initial } = annotation.camera;

            // construct camera
            tmpCamera.fov = initial.fov;
            tmpCamera.look(
                new Vec3(initial.position),
                new Vec3(initial.target)
            );

            controllers.orbit.goto(tmpCamera);
            startTransition();
        });
    }
}

export { CameraManager };
