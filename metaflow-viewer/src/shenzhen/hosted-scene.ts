import type { CreateViewerOptions } from '../options';
import type { SceneTransform } from '../scene-transform';
import type { AnimTrack, CameraPose, ExperienceSettings } from '../settings';

import { prepareApec } from './apec';

type HostedResource = {
    id: string;
    title: string;
    files: {
        sceneManifest?: string;
        bookmarks?: string;
        backgroundSky?: string;
    };
    tracks?: { orbit?: string };
    viewer?: Pick<CreateViewerOptions, 'worldUnitsPerMeter' | 'walkFallbackPosition'>;
};

type SceneLayer = SceneTransform & { id: string; path: string; defaultVisible?: boolean };
type SceneManifest = { resources: SceneLayer[]; cameraClipping?: CreateViewerOptions['cameraClipping'] };
type Orbit = {
    duration: number;
    timeline: { frameRate: number; smoothness: number; loop: boolean };
    poses: (CameraPose & { time: number })[];
};
type Bookmark = CameraPose & { id: string; title: string; group: string };

const hostedIds = new Set(['shenzhenCivilCenter', 'szu', 'huafa', 'nanhai-e-cool-building-3']);

async function readJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to load scene configuration (${response.status}): ${url}`);
    return response.json();
}

const dataUrl = (path: string) => new URL('/data/' + path, location.href).href;
const aimAt = (settings: ExperienceSettings, pose: CameraPose): ExperienceSettings => ({
    ...settings,
    cameras: [{ initial: { position: pose.position, target: pose.target, fov: pose.fov } }],
    hasStartPose: true
});

async function orbitSettings(settings: ExperienceSettings, orbitUrl: string): Promise<ExperienceSettings> {
    const { duration, timeline, poses } = await readJson<Orbit>(orbitUrl);
    const track: AnimTrack = {
        name: 'orbit',
        duration,
        frameRate: timeline.frameRate,
        loopMode: timeline.loop ? 'repeat' : 'none',
        interpolation: 'spline',
        smoothness: timeline.smoothness,
        keyframes: {
            times: poses.map(({ time }) => time * timeline.frameRate),
            values: {
                position: poses.flatMap(({ position }) => position),
                target: poses.flatMap(({ target }) => target),
                fov: poses.map(({ fov }) => fov)
            }
        }
    };
    return { ...aimAt(settings, poses[0]), startMode: 'animTrack', animTracks: [track] };
}

export async function prepareHostedScene(options: CreateViewerOptions, resource?: HostedResource) {
    if (resource?.id === 'apec-media-center-2026') return prepareApec(options);
    if (!resource || !hostedIds.has(resource.id)) return { options };
    const locationUrl = new URL(location.href);
    const query = locationUrl.searchParams;
    const { id, files } = resource;
    document.title = resource.title;
    const config: CreateViewerOptions = {
        ...options,
        initialViewPreload: true,
        worldUnitsPerMeter: resource.viewer?.worldUnitsPerMeter,
        walkFallbackPosition: resource.viewer?.walkFallbackPosition
    };
    const modelUrl = new URL(config.contentUrl, location.href);
    if (id === 'nanhai-e-cool-building-3') {
        const dataRoot = new URL('../', modelUrl).href;
        config.displayEuler = [-90, 0, 0];
        config.orbitMovementMode = 'fly';
        config.controlsHintInitiallyClosed = true;
        if (query.get('repairs') === 'off' && !query.has('collision')) {
            config.collisionUrl = new URL('collision-survey.glb', dataRoot).href;
        }
        return { options: config, nanhai: { dataRoot, inspect: query.has('inspect') } };
    }

    // The three outdoor pages previously opened with a complete image.
    config.revealEffect = 'none';
    const authoredSky = files.backgroundSky ? dataUrl(files.backgroundSky) : undefined;
    if (query.get('sky') === 'authored') {
        config.sunnySky = authoredSky ? { authoredUrl: authoredSky } : undefined;
    } else {
        config.sunnySky = {
            dynamicUrl: '/assets/clear-no-clouds.png',
            staticUrl: '/assets/clear-noon-clouds.png',
            authoredUrl: authoredSky
        };
    }

    const sceneManifest = files.sceneManifest ? dataUrl(files.sceneManifest) : undefined;
    const layout = sceneManifest
        ? readJson<SceneManifest>(sceneManifest).then((manifest) => {
              const layers = manifest.resources.map(({ path, defaultVisible, ...layer }) => ({
                  ...layer,
                  url: new URL(path, sceneManifest).href,
                  visible: defaultVisible !== false
              }));
              const primary = layers.find((layer) => layer.url === modelUrl.href);
              if (!primary?.visible)
                  throw new Error('Scene composition does not contain its visible indexed primary model');
              config.sceneLayers = [primary, ...layers.filter((layer) => layer !== primary && layer.visible)];
              config.cameraClipping = manifest.cameraClipping;
          })
        : undefined;

    config.settings = Promise.resolve(options.settings).then(async (raw): Promise<ExperienceSettings> => {
        const settings = raw as ExperienceSettings;
        if (id === 'shenzhenCivilCenter') {
            return { ...settings, startMode: 'default', animTracks: [] };
        }
        if (id === 'szu' && resource.tracks?.orbit) {
            return orbitSettings(settings, dataUrl(resource.tracks.orbit));
        }
        const view = query.get('view');
        if (id === 'huafa' && view && files.bookmarks) {
            const bookmarks = await readJson<Bookmark[]>(dataUrl(files.bookmarks));
            const pose = bookmarks.find((mark) => mark.id === view);
            if (!pose) throw new Error(`Unknown Huafa viewpoint: ${view}`);
            return { ...aimAt(settings, pose), startMode: 'default', animTracks: [] };
        }
        return settings;
    });
    if (id === 'shenzhenCivilCenter') config.syntheticAnimation = 'figure8';
    if (id === 'szu' && query.get('track') !== null && query.get('track') !== 'orbit') {
        locationUrl.searchParams.delete('track');
        history.replaceState(history.state, '', locationUrl);
    }
    if (id === 'huafa' && query.get('view')) {
        config.defaultCameraMode = 'orbit';
        config.syntheticAnimation = 'none';
    }
    // Settings and scene layout fetch independently. Observe both failures even if startup aborts.
    await Promise.all([layout, config.settings]);
    if (id === 'szu') config.cameraClipping = { near: 0.05, far: 15000 };
    return { options: config };
}
