const vertexGLSL = /* glsl */ `
attribute vec3 aPosition;
uniform mat4 matrix_view;
uniform mat4 matrix_projection;
varying vec3 skyDirection;
void main(void) {
    mat4 view = matrix_view;
    view[3].xyz = vec3(0.0);
    vec4 clip = matrix_projection * view * vec4(aPosition, 1.0);
    gl_Position = vec4(clip.xy, clip.w - 0.0000001, clip.w);
    skyDirection = aPosition;
}`;
const fragmentGLSL = /* glsl */ `
uniform sampler2D backgroundSky;
varying vec3 skyDirection;
void main(void) {
    vec3 d = normalize(skyDirection);
    vec2 uv = vec2(atan(d.x, d.z) / 6.28318530718 + 0.5,
                   acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359);
    gl_FragColor = vec4(texture2D(backgroundSky, uv).rgb, 1.0);
}`;
const vertexWGSL = /* wgsl */ `
attribute aPosition: vec3f;
uniform matrix_view: mat4x4f;
uniform matrix_projection: mat4x4f;
varying skyDirection: vec3f;
@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    var view = uniform.matrix_view;
    view[3] = vec4f(0.0, 0.0, 0.0, 1.0);
    let clip = uniform.matrix_projection * view * vec4f(input.aPosition, 1.0);
    output.position = vec4f(clip.xy, clip.w - 0.0000001, clip.w);
    output.skyDirection = input.aPosition;
    return output;
}`;
const fragmentWGSL = /* wgsl */ `
var backgroundSky: texture_2d<f32>;
var backgroundSkySampler: sampler;
varying skyDirection: vec3f;
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    let d = normalize(input.skyDirection);
    let uv = vec2f(atan2(d.x, d.z) / 6.28318530718 + 0.5,
                   acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359);
    output.color = vec4f(textureSample(backgroundSky, backgroundSkySampler, uv).rgb, 1.0);
    return output;
}`;

const cloudGLSL = `
uniform sampler2D backgroundSky;
uniform vec2 cloudDisplacement;
varying vec3 skyDirection;
float mfHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float mfNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mfHash(i), mfHash(i + vec2(1.0, 0.0)), u.x),
               mix(mfHash(i + vec2(0.0, 1.0)), mfHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float mfCloudNoise(vec2 p) {
    return 0.55 * mfNoise(p) + 0.25 * mfNoise(p * 2.03 + 7.1)
         + 0.13 * mfNoise(p * 4.11 + 13.7) + 0.07 * mfNoise(p * 8.21);
}

void main(void) {
    vec3 d = normalize(skyDirection);
    vec2 uv = vec2(atan(d.x, d.z) / 6.28318530718 + 0.5, acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359);
    vec3 color = pow(texture2D(backgroundSky, uv).rgb, vec3(2.2));
    float elevation = d.y;
    vec2 cloudUv = d.xz / max(elevation + 0.1, 0.12) * 1.8 - cloudDisplacement;
    float cloudField = mfCloudNoise(cloudUv);
    float coverage = smoothstep(0.74 - 0.32 * 0.55, 0.94 - 0.32 * 0.55, cloudField);
    coverage *= smoothstep(-0.025, 0.16, elevation);
    vec3 cloudColor = vec3(0.80, 0.84, 0.91) * (0.72 + 0.3 * (1.0 - coverage) + 0.12 * cloudField);
    cloudColor += vec3(1.0, 0.88, 0.7) * pow(max(d.y,0.0),12.0) * coverage * (1.0 - coverage);
    float transmission = exp(-coverage * 3.2);
    color = mix(cloudColor, color, transmission);
    gl_FragColor = vec4(pow(clamp(color,0.0,1.0),vec3(1.0/2.2)),1.0);
}`;
export { vertexGLSL, vertexWGSL, fragmentGLSL, fragmentWGSL, cloudGLSL };
