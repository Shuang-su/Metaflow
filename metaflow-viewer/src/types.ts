import type { Entity, EventHandler, AppBase } from 'playcanvas';

import type { AnalyticsClient, AnalyticsResourceContext, AnalyticsSink } from './analytics/client';
import type { ExperienceSettings } from './settings';

type CameraMode = 'orbit' | 'anim' | 'fly' | 'walk';

type InputMode = 'desktop' | 'touch';

type LoadMode = 'legacy-sog' | 'streaming-json';

type PrimarySourceKind = 'streaming-lod' | 'sog-bundle' | 'sog-meta' | 'ply' | 'unsupported';

type ResourceComposition = 'subject-only' | 'subject-with-environment';

type VoxelCoordinateSpace = 'world' | 'metaflow-rz180';

type AnimationFirstExitMode = 'orbit' | 'default';

type RevealEffect = 'radial' | 'none';

type ExperienceType = 'character' | 'scene';

type LoadingStage =
    | 'init'
    | 'renderer'
    | 'index'
    | 'environment'
    | 'detect'
    | 'download'
    | 'parse'
    | 'gpu'
    | 'collision'
    | 'voxel-meta'
    | 'voxel-bin'
    | 'voxel-build'
    | 'voxel-manifest'
    | 'voxel-tile'
    | 'voxel-tile-switch'
    | 'overlay'
    | 'prepare'
    | 'sort'
    | 'stream-schedule'
    | 'stream-loading'
    | 'legacy-lod-loading'
    | 'timeout'
    | 'error'
    | 'complete';

// configuration options are immutable at runtime
type Config = {
    poster?: HTMLImageElement;
    skyboxUrl?: string;
    contentUrl?: string;
    contents?: Promise<Response>;
    collisionUrl?: string;
    voxelUrl?: string;
    voxelManifestUrl?: string;
    voxelCoordinateSpace?: VoxelCoordinateSpace;
    environmentUrl?: string;
    environmentContents?: Promise<Response>;
    defaultCameraMode?: CameraMode;
    syntheticAnimation?: 'figure8';
    animationFirstExitMode?: AnimationFirstExitMode;
    revealEffect?: RevealEffect;
    experienceType?: ExperienceType;
    analyticsSink?: AnalyticsSink;
    analyticsEndpoint?: string;
    analyticsReplayRate?: number;
    posthogKey?: string;
    posthogHost?: string;
    posthogReplay?: boolean;
    analyticsResource?: AnalyticsResourceContext;
    analyticsResourceUrls?: {
        index?: string;
        content?: string;
        settings?: string;
        poster?: string;
        environment?: string;
    };
    analyticsRouteMatched?: boolean;

    noui: boolean;
    noanalytics?: boolean;
    noanim: boolean;
    nofx: boolean; // disable post effects
    hpr?: boolean; // override highPrecisionRendering (undefined = use settings)
    ministats: boolean;
    colorize: boolean; // render with LOD colorization
    unified: boolean; // preserved URL flag for Metaflow compatibility
    fullload: boolean; // load all streaming LOD data before first frame
    aa: boolean; // render with antialiasing
    budget?: number; // override splat budget in millions
    renderer: 'webgl' | 'webgpu'; // requested renderer
    heatmap: boolean; // render heatmap debug overlay
    debug: boolean; // auto-open developer debug panel
    lang?: string; // override the UI language (default: detect from browser)
};

// observable state that can change at runtime
type State = {
    loaded: boolean; // true once first frame is rendered
    readyToRender: boolean; // don't render till this is set
    performanceMode: boolean;
    progress: number; // content loading progress 0-100, -1 indeterminate
    loadingMode: LoadMode; // current model loading strategy
    loadingStage: LoadingStage; // structured loading stage for UI/logging
    loadingConflict: boolean; // true when the selected entry conflicts with its format contract
    loadingStatus: string; // current localized loading status
    inputMode: InputMode;
    cameraMode: CameraMode;
    hasAnimation: boolean;
    animationDuration: number;
    animationTime: number;
    animationPaused: boolean;
    hasAR: boolean;
    hasVR: boolean;
    hasCollision: boolean;
    hasCollisionOverlay: boolean;
    walkCapability: boolean; // resource declares walk/collision data, so show the walk affordance
    walkAllowed: boolean; // collision under the user is ready, so walk can be entered
    collisionOverlayEnabled: boolean;
    isFullscreen: boolean;
    controlsHidden: boolean;
    showAnnotations: boolean;
    gamingControls: boolean;
};

type Global = {
    app: AppBase;
    settings: ExperienceSettings;
    config: Config;
    state: State;
    events: EventHandler;
    analytics: AnalyticsClient;
    camera: Entity;
    renderer: 'webgl' | 'webgpu'; // actual renderer after engine fallback
};

export {
    CameraMode,
    InputMode,
    LoadMode,
    PrimarySourceKind,
    ResourceComposition,
    VoxelCoordinateSpace,
    AnimationFirstExitMode,
    RevealEffect,
    ExperienceType,
    LoadingStage,
    Config,
    State,
    Global
};
