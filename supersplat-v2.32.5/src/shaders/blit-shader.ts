import { backgroundGLSL } from '../../../metaflow-viewer/src/background-renderer';
const vertexShader = /* glsl*/ `
    attribute vec2 vertex_position;
    void main(void) {
        gl_Position = vec4(vertex_position, 0.0, 1.0);
    }
`;

const fragmentShader = /* glsl*/ `
    uniform sampler2D srcTexture;
    void main(void) {
        ivec2 texel = ivec2(gl_FragCoord.xy);
        gl_FragColor = texelFetch(srcTexture, texel, 0);
    }
`;


const backgroundFragmentShader = backgroundGLSL + fragmentShader.replace('gl_FragColor = texelFetch(srcTexture, texel, 0);',
    `vec4 pixel = texelFetch(srcTexture, texel, 0);
    vec2 uv = gl_FragCoord.xy / mfBackgroundSize;
    gl_FragColor = mfBackgroundMeta.x > .5 ? vec4(pixel.rgb + mfBackgroundColor(vec2(uv.x, 1. - uv.y)) * (1. - pixel.a), 1.) : pixel;`);

export { vertexShader, fragmentShader, backgroundFragmentShader };
