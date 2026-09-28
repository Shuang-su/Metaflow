import { CameraFrame, ShaderMaterial, SEMANTIC_POSITION, BLEND_NORMAL, CULLFACE_NONE } from 'playcanvas';

/** Reuse 2.22.4's MRT splat depth without enabling a visual post effect.
 * CameraFrame's public extension point supplies the pass. Its own sanitizer still
 * decides device/MSAA/prepass compatibility. The temporary depth consumer flag is
 * removed BEFORE passes are created, so no DoF pass or blur is enabled.
 */
export class GuidanceCameraFrame extends CameraFrame {
    override createRenderPass() {
        const pass = super.createRenderPass();
        const sanitize = pass.sanitizeOptions.bind(pass);
        pass.sanitizeOptions = (options) => {
            if (!this.app.scene.gsplat.sceneDepthWrite) return sanitize(options);
            const result = sanitize({ ...options, dofEnabled: true });
            result.dofEnabled = options.dofEnabled;
            return result;
        };
        return pass;
    }
}

/** Scene depth is reciprocal opacity-weighted GS depth, not collision geometry.
 * The line renders after the scene pass has published its texture. It never
 * writes the scene depth itself, and uses no CPU readback / per-pixel picking.
 */
export function gaussianRouteMaterial() {
    const material = new ShaderMaterial({
        uniqueName: 'mf79-gaussian-occluded-route-v1',
        attributes: { aPosition: SEMANTIC_POSITION },
        vertexGLSL: `
            attribute vec3 aPosition;
            uniform mat4 matrix_model, matrix_viewProjection, matrix_view;
            varying float routeDepth;
            void main(void) {
                vec4 world = matrix_model * vec4(aPosition, 1.0);
                routeDepth = -(matrix_view * world).z;
                gl_Position = matrix_viewProjection * world;
            }`,
        fragmentGLSL: `
            uniform sampler2D mf79Depth;
            uniform vec2 mf79Viewport;
            varying float routeDepth;
            void main(void) {
                float reciprocal = texture2D(mf79Depth, gl_FragCoord.xy / mf79Viewport).r;
                if (reciprocal <= 0.0) discard;
                float opacity = 1.0 - smoothstep(0.015, 0.045, routeDepth - 1.0 / reciprocal);
                if (opacity < 0.01) discard;
                gl_FragColor = vec4(0.2, 0.7, 1.0, opacity);
            }`,
        vertexWGSL: `
            attribute aPosition: vec3f;
            uniform matrix_model: mat4x4f;
            uniform matrix_viewProjection: mat4x4f;
            uniform matrix_view: mat4x4f;
            varying routeDepth: f32;
            @vertex fn vertexMain(input: VertexInput) -> VertexOutput {
                var output: VertexOutput;
                let world = uniform.matrix_model * vec4f(input.aPosition, 1.0);
                output.routeDepth = -(uniform.matrix_view * world).z;
                output.position = uniform.matrix_viewProjection * world;
                return output;
            }`,
        fragmentWGSL: `
            var mf79Depth: texture_2d<uff>;
            uniform mf79Viewport: vec2f;
            varying routeDepth: f32;
            @fragment fn fragmentMain(input: FragmentInput) -> FragmentOutput {
                var output: FragmentOutput;
                let uv = pcPosition.xy / uniform.mf79Viewport;
                let texel = vec2i(uv * vec2f(textureDimensions(mf79Depth, 0)));
                let reciprocal = textureLoad(mf79Depth, texel, 0).r;
                if (reciprocal <= 0.0) { discard; }
                let opacity = 1.0 - smoothstep(0.015, 0.045, routeDepth - 1.0 / reciprocal);
                if (opacity < 0.01) { discard; }
                output.color = vec4f(0.2, 0.7, 1.0, opacity);
                return output;
            }`
    });
    material.blendType = BLEND_NORMAL;
    material.cull = CULLFACE_NONE;
    material.depthTest = false;
    material.depthWrite = false;
    material.sceneTexturesWrite = false;
    return material;
}
