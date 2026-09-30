import type { ExperienceSettings } from '../../../../metaflow-viewer/src/settings';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export const toCssColor = (color: [number, number, number]) =>
    `rgb(${color.map((v) => Math.round(clamp01(v) * 255)).join(' ')})`;
const toShaderFloat = (value: number) => clamp01(value).toFixed(8);
const toShaderVec3 = (color: [number, number, number]) => {
    // Compose runs before gamma output. Convert CSS/sRGB colors to linear so
    // the displayed gradient matches the Metaflow CSS background semantics.
    const channels = color.map((v) => Math.pow(clamp01(v), 2.2).toFixed(8));
    return `vec3(${channels.join(', ')})`;
};
const toShaderVec3Wgsl = (color: [number, number, number]) => {
    const channels = color.map((v) => Math.pow(clamp01(v), 2.2).toFixed(8));
    return `vec3f(${channels.join(', ')})`;
};
export const gradientCss = (gradient: NonNullable<ExperienceSettings['background']['gradient']>) => {
    const horizonStop = `${Math.round(clamp01(gradient.horizonStop ?? 0.55) * 100)}%`;
    const bottomStop = `${Math.round(clamp01(gradient.bottomStop ?? 1) * 100)}%`;
    const stops = [
        `${toCssColor(gradient.topColor)} 0%`,
        `${toCssColor(gradient.horizonColor ?? gradient.bottomColor)} ${horizonStop}`,
        `${toCssColor(gradient.bottomColor)} ${bottomStop}`
    ];
    return `linear-gradient(180deg, ${stops.join(', ')})`;
};

export const composeGradientGlsl = (gradient: NonNullable<ExperienceSettings['background']['gradient']>) => {
    const horizonStop = toShaderFloat(gradient.horizonStop ?? 0.55);
    const bottomStop = toShaderFloat(gradient.bottomStop ?? 1);
    const horizonColor = gradient.horizonColor ?? gradient.bottomColor;

    return /* glsl */ `
        // Metaflow scene gradients live behind a transparent splat render.
        // CameraFrame composes through an offscreen texture, so we recreate the
        // CSS gradient here instead of letting transparent pixels become black.
        float metaflowGradientY = clamp(1.0 - uv.y, 0.0, 1.0);
        float metaflowGradientTopToHorizon = max(${horizonStop}, 0.00001);
        float metaflowGradientHorizonToBottom = max(${bottomStop} - ${horizonStop}, 0.00001);
        vec3 metaflowGradientTop = ${toShaderVec3(gradient.topColor)};
        vec3 metaflowGradientHorizon = ${toShaderVec3(horizonColor)};
        vec3 metaflowGradientBottom = ${toShaderVec3(gradient.bottomColor)};
        vec3 metaflowGradientFirst = mix(metaflowGradientTop, metaflowGradientHorizon, clamp(metaflowGradientY / metaflowGradientTopToHorizon, 0.0, 1.0));
        vec3 metaflowGradientSecond = mix(metaflowGradientHorizon, metaflowGradientBottom, clamp((metaflowGradientY - ${horizonStop}) / metaflowGradientHorizonToBottom, 0.0, 1.0));
        vec3 metaflowGradient = mix(metaflowGradientFirst, metaflowGradientSecond, step(${horizonStop}, metaflowGradientY));
        result = mix(metaflowGradient, result, scene.a);
    `;
};

export const composeGradientWgsl = (gradient: NonNullable<ExperienceSettings['background']['gradient']>) => {
    const horizonStop = toShaderFloat(gradient.horizonStop ?? 0.55);
    const bottomStop = toShaderFloat(gradient.bottomStop ?? 1);
    const horizonColor = gradient.horizonColor ?? gradient.bottomColor;

    return /* wgsl */ `
        // Metaflow scene gradients live behind a transparent splat render.
        // CameraFrame composes through an offscreen texture, so we recreate the
        // CSS gradient here instead of letting transparent pixels become black.
        let metaflowGradientY = clamp(1.0 - uv.y, 0.0, 1.0);
        let metaflowGradientTopToHorizon = max(${horizonStop}, 0.00001);
        let metaflowGradientHorizonToBottom = max(${bottomStop} - ${horizonStop}, 0.00001);
        let metaflowGradientTop = ${toShaderVec3Wgsl(gradient.topColor)};
        let metaflowGradientHorizon = ${toShaderVec3Wgsl(horizonColor)};
        let metaflowGradientBottom = ${toShaderVec3Wgsl(gradient.bottomColor)};
        let metaflowGradientFirst = mix(metaflowGradientTop, metaflowGradientHorizon, clamp(metaflowGradientY / metaflowGradientTopToHorizon, 0.0, 1.0));
        let metaflowGradientSecond = mix(metaflowGradientHorizon, metaflowGradientBottom, clamp((metaflowGradientY - ${horizonStop}) / metaflowGradientHorizonToBottom, 0.0, 1.0));
        let metaflowGradient = mix(metaflowGradientFirst, metaflowGradientSecond, step(${horizonStop}, metaflowGradientY));
        result = mix(metaflowGradient, result, scene.a);
    `;
};

