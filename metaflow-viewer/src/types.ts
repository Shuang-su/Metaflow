import type { Entity, EventHandler, AppBase } from 'playcanvas';

import type { ExperienceSettings } from './settings';

type CameraMode = 'orbit' | 'anim' | 'fly' | 'walk';

type WalkInputMode = 'none' | 'gamepad' | 'touchclick' | 'keyboard' | 'mouseclick';

type FlyInputMode = 'none' | 'gesture' | 'gamepad';

type InputMode = 'desktop' | 'touch';

type LoadMode = 'legacy-sog' | 'streaming-json';

type LoadingStage =
    | 'init'
    | 'environment'
    | 'detect'
    | 'download'
    | 'parse'
    | 'gpu'
    | 'voxel-meta'
    | 'voxel-bin'
    | 'voxel-build'
    | 'prepare'
    | 'sort'
    | 'stream-schedule'
    | 'stream-loading'
    | 'legacy-lod-loading'
    | 'timeout'
    | 'complete';

// configuration options are immutable at runtime
type Config = {
    poster?: HTMLImageElement;
    skyboxUrl?: string;
    contentUrl?: string;
    contents?: Promise<Response>;
    voxelUrl?: string;
    environmentUrl?: string;
    environmentContents?: Promise<Response>;
    defaultCameraMode?: CameraMode;

    noui: boolean;
    noanim: boolean;
    ministats: boolean;
    colorize: boolean;                          // render with LOD colorization
    unified: boolean;                           // force unified rendering mode
    aa: boolean;                                // render with antialiasing
};

// observable state that can change at runtime
type State = {
    loaded: boolean;                            // true once first frame is rendered
    readyToRender: boolean;                     // don't render till this is set
    retinaDisplay: boolean;                     // controls canvas pixel density
    gamingControls: boolean;                    // shared runtime semantic for "direct-control" submodes
    hqMode: boolean;
    loadingMode: LoadMode;                      // current loading strategy
    loadingStage: LoadingStage;                 // structured loading stage for UI/logging
    loadingConflict: boolean;                   // true when structure/name detection conflict occurs
    progress: number;                           // content loading progress 0-100
    loadingStatus: string;                      // current loading status text
    inputMode: InputMode;
    cameraMode: CameraMode;
    flyInputMode: FlyInputMode;                 // touch fly first-input lock mode
    flyInputLocked: boolean;                    // true when fly submode was explicitly chosen
    walkInputMode: WalkInputMode;               // first-input lock mode for walk
    walkInputLocked: boolean;
    hasAnimation: boolean;
    animationDuration: number;
    animationTime: number;
    animationPaused: boolean;
    hasAR: boolean;
    hasVR: boolean;
    hasCollision: boolean;
    hasVoxelOverlay: boolean;
    voxelOverlayEnabled: boolean;
    isFullscreen: boolean;
    controlsHidden: boolean;
};

type Global = {
    app: AppBase;
    settings: ExperienceSettings;
    config: Config;
    state: State;
    events: EventHandler;
    camera: Entity;
};

export { CameraMode, InputMode, WalkInputMode, FlyInputMode, LoadMode, LoadingStage, Config, State, Global };
