import { gsplatRevealRadialWGSL } from '../../../metaflow-viewer/src/gsplat-reveal-radial';

// The canonical effect uses PlayCanvas's material-uniform syntax. The compute
// projector has an explicit uniform buffer; only its binding syntax changes.
const videoRevealWGSL = gsplatRevealRadialWGSL
.replace(/^uniform \w+: \w+;\s*$/gm, '')
.replaceAll('uniform.', 'uniforms.');

// Same scalar-size convention as PlayCanvas gsplatHelpersVS. The adapter feeds
// world covariance column lengths, so per-object/per-point transforms are
// applied once and the original covariance returns exactly after the lift wave.
const videoRevealHelpersWGSL = /* wgsl */`
fn gsplatMakeSpherical(scale: ptr<function, vec3f>, size: f32) {
    *scale = vec3f(size);
}
fn gsplatGetSizeFromScale(scale: vec3f) -> f32 {
    return sqrt(dot(scale, scale) / 3.0);
}
`;

export { videoRevealWGSL, videoRevealHelpersWGSL };
