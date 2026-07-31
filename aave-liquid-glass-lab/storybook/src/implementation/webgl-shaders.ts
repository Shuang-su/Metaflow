export const VERTEX_SHADER = `
attribute vec2 a_pos;
varying vec2 v_uv;

void main() {
  // Flip Y so UV (0,0) is top-left, matching HTML and CSS coordinates.
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const GAUSSIAN_BLUR_SHADER = `
precision highp float;
uniform sampler2D u_source;
uniform vec2 u_dir;
varying vec2 v_uv;

void main() {
  vec4 c = texture2D(u_source, v_uv) * 0.2042;
  c += (
    texture2D(u_source, v_uv + 1.0 * u_dir) +
    texture2D(u_source, v_uv - 1.0 * u_dir)
  ) * 0.1801;
  c += (
    texture2D(u_source, v_uv + 2.0 * u_dir) +
    texture2D(u_source, v_uv - 2.0 * u_dir)
  ) * 0.1240;
  c += (
    texture2D(u_source, v_uv + 3.0 * u_dir) +
    texture2D(u_source, v_uv - 3.0 * u_dir)
  ) * 0.0663;
  c += (
    texture2D(u_source, v_uv + 4.0 * u_dir) +
    texture2D(u_source, v_uv - 4.0 * u_dir)
  ) * 0.0276;
  gl_FragColor = c;
}
`;

// [study:webgl-shader:start]
export const REFRACTION_SHADER = `
#extension GL_OES_standard_derivatives : enable
precision highp float;

uniform sampler2D u_video;
uniform sampler2D u_map;
uniform sampler2D u_blurred;
uniform float u_baseScale[3];
uniform float u_ratioX[3];
uniform float u_ratioY[3];
uniform float u_chromaAmount;
uniform float u_specStrength;
uniform float u_adaptStrength;
uniform float u_specLumaLow;
uniform float u_specLumaHigh;
uniform float u_hasBlur;
uniform vec4 u_bbox;
uniform vec3 u_circles[3];
uniform float u_scale[3];
uniform vec4 u_bar;
uniform float u_barRadius;
uniform float u_barBaseScale;
uniform float u_barRatioX;
uniform float u_barRatioY;
uniform vec2 u_bboxSize;

varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  vec2 bMin = u_bbox.xy;
  vec2 bSize = u_bbox.zw;
  vec2 bMax = bMin + bSize;

  // Pixels outside the tight lens bbox pass through unchanged.
  if (
    uv.x < bMin.x ||
    uv.x > bMax.x ||
    uv.y < bMin.y ||
    uv.y > bMax.y
  ) {
    gl_FragColor = texture2D(u_video, uv);
    return;
  }

  vec2 mUV = (uv - bMin) / bSize;
  vec2 pxPos = mUV * u_bboxSize;
  float mask = 0.0;
  float baseScale = 0.0;
  float ratioX = 0.0;
  float ratioY = 0.0;

  // The visible SDF and map-sample assignment are deliberately separate.
  // This prevents a pressed, shrinking lens from leaving its old rim behind.
  vec2 domCenter = pxPos;
  float domScale = 1.0;
  float domDist = 1.0;
  for (int i = 0; i < 3; i++) {
    if (u_circles[i].z < 0.1) continue;
    float s = max(u_scale[i], 0.001);
    float radius = u_circles[i].z;
    float rho = length(pxPos - u_circles[i].xy);
    float dist = rho - radius * s;
    float aa = fwidth(dist);
    float circleMask = 1.0 - smoothstep(-aa, aa, dist);
    if (circleMask > mask) {
      mask = circleMask;
      baseScale = u_baseScale[i];
      ratioX = u_ratioX[i];
      ratioY = u_ratioY[i];
    }

    // Four pixels clear the map's hard edge without swallowing neighbours.
    float normalisedDistance =
      rho / (radius * max(1.0, s) + 4.0);
    if (normalisedDistance < domDist) {
      domDist = normalisedDistance;
      domCenter = u_circles[i].xy;
      domScale = s;
    }
  }

  if (u_bar.z > 0.1 && u_bar.w > 0.1) {
    vec2 q =
      abs(pxPos - u_bar.xy) -
      u_bar.zw * 0.5 +
      vec2(u_barRadius);
    float barDist =
      length(max(q, 0.0)) +
      min(max(q.x, q.y), 0.0) -
      u_barRadius;
    float aaBar = fwidth(barDist);
    float barMask = 1.0 - smoothstep(-aaBar, aaBar, barDist);
    if (barMask > mask) {
      mask = barMask;
      baseScale = u_barBaseScale;
      ratioX = u_barRatioX;
      ratioY = u_barRatioY;
    }
  }

  vec2 scaledPx =
    domCenter + (pxPos - domCenter) / domScale;
  vec4 displacement =
    texture2D(u_map, scaledPx / u_bboxSize);

  // Equivalent to the DOM path's map feColorMatrix.
  float mappedR =
    displacement.r * ratioX + 0.5 * (1.0 - ratioX);
  float mappedG =
    displacement.g * ratioY + 0.5 * (1.0 - ratioY);
  vec2 offset =
    vec2(mappedR - 0.5, mappedG - 0.5) * baseScale;

  vec4 color;
  if (u_chromaAmount > 0.001) {
    float redScale = 1.0 + u_chromaAmount * 0.2;
    float greenScale = 1.0 + u_chromaAmount * 0.1;
    if (u_hasBlur > 0.5) {
      color.r = mix(
        texture2D(
          u_video,
          clamp(uv + offset * redScale, 0.0, 1.0)
        ).r,
        texture2D(
          u_blurred,
          clamp(uv + offset * redScale, 0.0, 1.0)
        ).r,
        mask
      );
      color.g = mix(
        texture2D(
          u_video,
          clamp(uv + offset * greenScale, 0.0, 1.0)
        ).g,
        texture2D(
          u_blurred,
          clamp(uv + offset * greenScale, 0.0, 1.0)
        ).g,
        mask
      );
      color.b = mix(
        texture2D(u_video, clamp(uv + offset, 0.0, 1.0)).b,
        texture2D(u_blurred, clamp(uv + offset, 0.0, 1.0)).b,
        mask
      );
    } else {
      color.r = texture2D(
        u_video,
        clamp(uv + offset * redScale, 0.0, 1.0)
      ).r;
      color.g = texture2D(
        u_video,
        clamp(uv + offset * greenScale, 0.0, 1.0)
      ).g;
      color.b = texture2D(
        u_video,
        clamp(uv + offset, 0.0, 1.0)
      ).b;
    }
    color.a = 1.0;
  } else {
    vec2 displacedUv = clamp(uv + offset, 0.0, 1.0);
    if (u_hasBlur > 0.5) {
      color = mix(
        texture2D(u_video, displacedUv),
        texture2D(u_blurred, displacedUv),
        mask
      );
    } else {
      color = texture2D(u_video, displacedUv);
    }
  }

  // Adapt specular polarity to the luminance under the glass.
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  float specular = displacement.b - 0.502;
  float lumaLow = min(u_specLumaLow, u_specLumaHigh);
  float lumaHigh = max(u_specLumaLow, u_specLumaHigh);
  float darkBlend = smoothstep(lumaLow, lumaHigh, luma);
  vec3 additive = color.rgb + specular * u_specStrength;
  vec3 multiplicative =
    color.rgb * (1.0 - specular * u_specStrength);
  color.rgb = mix(additive, multiplicative, darkBlend);
  color.rgb = max(color.rgb, vec3(0.0));

  // Pull bright and dark areas towards mid-gray inside the lens only.
  float correction =
    (0.5 - luma) * u_adaptStrength * mask;
  color.rgb += correction;

  gl_FragColor = color;
}
`;
// [study:webgl-shader:end]
