import { defaultPostEffectSettings } from './schemas/defaults';
import type { ExperienceSettings as V1, AnimTrack as AnimTrackV1 } from './schemas/v1';
import { validateV1 } from './schemas/v1';
import type { ExperienceSettings as V2, AnimTrack as AnimTrackV2, PostEffectSettings } from './schemas/v2';
import { validateV2 } from './schemas/v2';
import { validateLimitsV1, validateLimitsV2 } from './schemas/validate-limits';
import { assertObject } from './schemas/validate-utils';

const legacyPostEffectSettings = (): PostEffectSettings => ({
    sharpness: {
        enabled: false,
        amount: 0
    },
    bloom: {
        enabled: false,
        intensity: 1,
        blurLevel: 2
    },
    grading: {
        enabled: false,
        brightness: 0,
        contrast: 1,
        saturation: 1,
        tint: [1, 1, 1]
    },
    vignette: {
        enabled: false,
        intensity: 0.5,
        inner: 0.3,
        outer: 0.75,
        curvature: 1
    },
    fringing: {
        enabled: false,
        intensity: 0.5
    }
});

const normalizePostEffectSettings = (input: any): PostEffectSettings => {
    const defaults = legacyPostEffectSettings();
    const source = input && typeof input === 'object' ? input : {};
    const rootDisabled = source.enabled === false;

    // Some Metaflow v2 settings predate the expanded upstream schema and only
    // contain `{ enabled: false }`. Keep those scenes valid by filling each
    // effect from current defaults while preserving any explicit child values.
    const mergeEffect = <T extends { enabled: boolean }>(fallback: T, value: any): T => ({
        ...fallback,
        ...(value && typeof value === 'object' ? value : {}),
        enabled: rootDisabled ? false : value?.enabled === true
    });

    return {
        sharpness: mergeEffect(defaults.sharpness, source.sharpness),
        bloom: mergeEffect(defaults.bloom, source.bloom),
        grading: mergeEffect(defaults.grading, source.grading),
        vignette: mergeEffect(defaults.vignette, source.vignette),
        fringing: mergeEffect(defaults.fringing, source.fringing)
    };
};

const migrateV1 = (input: V1): V1 => {
    const settings = structuredClone(input);
    if (settings.animTracks) {
        settings.animTracks?.forEach((track: AnimTrackV1) => {
            // some early settings did not have frameRate set on anim tracks
            if (!track.frameRate) {
                const defaultFrameRate = 30;

                track.frameRate = defaultFrameRate;
                const times = track.keyframes.times;
                for (let i = 0; i < times.length; i++) {
                    times[i] *= defaultFrameRate;
                }
            }

            // smoothness property added in v1.4.0
            if (!Object.prototype.hasOwnProperty.call(track, 'smoothness')) {
                track.smoothness = 0;
            }
        });
    } else {
        // some scenes were published without animTracks
        settings.animTracks = [];
    }

    return settings;
};

const migrateAnimTrackV2 = (animTrackV1: AnimTrackV1, fov: number): AnimTrackV2 => {
    return {
        name: animTrackV1.name,
        duration: animTrackV1.duration,
        frameRate: animTrackV1.frameRate,
        loopMode: animTrackV1.loopMode,
        interpolation: animTrackV1.interpolation,
        smoothness: animTrackV1.smoothness,
        keyframes: {
            times: animTrackV1.keyframes.times,
            values: {
                position: animTrackV1.keyframes.values.position,
                target: animTrackV1.keyframes.values.target,
                fov: new Array(animTrackV1.keyframes.times.length).fill(fov)
            }
        }
    };
};

const migrateV2 = (v1: V1): V2 => {
    // Preserve tonemapping from v1 if it exists, otherwise default to 'none'
    const tonemapping = (v1 as any).tonemapping || 'none';
    const background = (v1 as any).background || {};

    return {
        version: 2,
        tonemapping,
        highPrecisionRendering: false,
        background: {
            color: (background.color as [number, number, number]) || [0, 0, 0],
            skyboxUrl: background.skyboxUrl,
            gradient: background.gradient
        },
        // Shared defaults rather than a private copy, so a migrated document lands inside the
        // authoring bounds and `validateSettings(v1, { limits: true })` reports the caller's
        // data instead of values invented here. Every effect is `enabled: false`, so which
        // numbers they carry is inert.
        postEffectSettings: defaultPostEffectSettings(),
        animTracks: v1.animTracks.map((animTrackV1: AnimTrackV1) => {
            return migrateAnimTrackV2(animTrackV1, v1.camera.fov || 60);
        }),
        cameras: [
            {
                initial: {
                    position: (v1.camera.position || [0, 0, 5]) as [number, number, number],
                    target: (v1.camera.target || [0, 0, 0]) as [number, number, number],
                    fov: v1.camera.fov || 75
                }
            }
        ],
        annotations: [],
        startMode: v1.camera.startAnim === 'animTrack' ? 'animTrack' : 'default',
        hasStartPose: !!(v1.camera.position && v1.camera.target)
    };
};

// migrate a JSON object to the latest settings schema (assumes valid input)
const importSettings = (settings: any): V2 => {
    let result: V2;

    const version = settings.version;
    if (version === undefined) {
        // v1 -> v2
        result = migrateV2(migrateV1(settings as V1));
    } else if (version === 2) {
        // Metaflow has published partial v2 post-effect objects. Normalize
        // them at the compatibility boundary instead of weakening render code.
        result = {
            ...settings,
            postEffectSettings: normalizePostEffectSettings(settings.postEffectSettings)
        } as V2;
    } else {
        throw new Error(`Unsupported experience settings version: ${version}`);
    }

    return result;
};

/** Options for {@link validateSettings}. */
type ValidateOptions = {
    /**
     * Also check the exported authoring bounds. Off by default: those bounds are stricter
     * than what the viewer will render, and some settings in the wild fail them. Producers
     * writing new settings should turn this on.
     */
    limits?: boolean;
};

/**
 * Validate unknown data against any supported settings schema version.
 *
 * @param settings - Data to validate.
 * @param options - See {@link ValidateOptions}.
 * @throws If the data is not valid settings, with a message naming the offending field.
 */
const validateSettings = (settings: unknown, options: ValidateOptions = {}): void => {
    const obj = assertObject(settings, 'settings');
    const version = obj.version;

    if (version === undefined) {
        validateV1(settings);
        if (options.limits) {
            // Fields the migration would coerce, as the caller wrote them.
            validateLimitsV1(settings as V1);

            // Everything else has to be checked against the migrated result, so a value the
            // migration derived can fail — v1 keyframe times in seconds are rescaled to
            // frames, for instance, and may land on a fraction. Say so, rather than reporting
            // a path and number the caller never wrote.
            let migrated: V2;
            try {
                migrated = migrateV2(migrateV1(settings as V1));
            } catch (err) {
                throw new Error(`settings could not be migrated for validation: ${(err as Error).message}`);
            }
            try {
                validateLimitsV2(migrated);
            } catch (err) {
                throw new Error(`${(err as Error).message} (checked after migrating from v1)`);
            }
        }
    } else if (version === 2) {
        validateV2(settings);
        if (options.limits) {
            validateLimitsV2(settings as V2);
        }
    } else if (typeof version !== 'number') {
        throw new Error(`settings.version must be a number, got ${typeof version}`);
    } else {
        throw new Error(`Unsupported experience settings version: ${version}`);
    }
};

export type { AnimTrack, Camera, Annotation, CameraPose, PostEffectSettings, ExperienceSettings } from './schemas/v2';
export type { AnimTrackLimits, AnnotationLimits, Bounds, NumericRange, PostEffectRanges } from './schemas/ranges';
export type { CameraFit } from './schemas/defaults';
export type { ValidateOptions };

export {
    ANIM_TRACK_LIMITS,
    ANNOTATION_LIMITS,
    CAMERA_FOV_RANGE,
    POST_EFFECT_RANGES,
    isCameraFovInRange
} from './schemas/ranges';
export {
    DEFAULT_BACKGROUND_COLOR,
    DEFAULT_CAMERA_FOV,
    DEFAULT_TONEMAPPING,
    defaultPostEffectSettings,
    defaultSettings
} from './schemas/defaults';

export { importSettings, validateSettings };
