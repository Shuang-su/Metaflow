export interface QrEyeLayer {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

export interface QrScene {
  size: number;
  occupancy: Uint8Array;
  matrixLength: number;
  gridOriginUv: number;
  cellUv: number;
  dotRadius: number;
  /** Three layers for each of the three finder eyes. */
  eyes: QrEyeLayer[];
  dotColor: string;
  backgroundColor: string;
}

export interface QrDisplacement {
  canvas: HTMLCanvasElement;
  lensOrigin: [number, number];
  lensSize: [number, number];
  scale: [number, number];
  chromaAmount: number;
}

export interface QrRefractionController {
  draw(): void;
  updateDisplacement(displacement: QrDisplacement | null): void;
  updatePaintingScale(canvas: HTMLCanvasElement | OffscreenCanvas): void;
  updatePaintingColor(canvas: HTMLCanvasElement | OffscreenCanvas): void;
  updateEyeScale(group: number, scale: number): void;
  updateEyeColor(
    group: number,
    red: number,
    green: number,
    blue: number
  ): void;
  updateBackgroundColor(color: string): void;
  dispose(): void;
}

const QR_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = (a_position * 0.5) + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/**
 * This is the readable form of the QR shader used by the Aave example. QR
 * modules are not drawn into a source canvas and sampled back. The shader
 * performs an O(1) occupancy lookup, evaluates the three finder eyes as
 * rounded-rect SDFs, and then samples each RGB channel at a different
 * displacement.
 */
// [study:qr-shader:start]
const QR_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 v_uv;
out vec4 fragColor;

uniform float u_dotRadius;
uniform vec3 u_backgroundColor;
uniform sampler2D u_paintingScaleTexture;
uniform sampler2D u_occupancyTexture;
uniform float u_gridOriginUv;
uniform float u_cellUv;
uniform float u_invCellUv;
uniform int u_matrixLength;

uniform sampler2D u_displacementMap;
uniform sampler2D u_paintingColorTexture;
uniform int u_displacementActive;
uniform vec2 u_lensOrigin;
uniform vec2 u_lensSize;
uniform vec2 u_displacementScale;
uniform float u_chromaAmount;

uniform vec2 u_eyeCenter[3];
uniform vec3 u_eyeHalf[3];
uniform vec3 u_eyeRadius[3];
uniform vec3 u_eyeColor[3];
uniform float u_eyeScale[3];
uniform float u_eyeRefractionScale;

float testDot(vec2 position, float radiusSquared) {
  int column = int(floor((position.x - u_gridOriginUv) * u_invCellUv));
  int row = int(floor((position.y - u_gridOriginUv) * u_invCellUv));
  if (
    column < 0 ||
    column >= u_matrixLength ||
    row < 0 ||
    row >= u_matrixLength
  ) {
    return 1.0;
  }
  if (
    texelFetch(u_occupancyTexture, ivec2(column, row), 0).r < 0.5
  ) {
    return 1.0;
  }
  vec2 center =
    vec2(u_gridOriginUv) +
    (vec2(float(column), float(row)) + 0.5) * u_cellUv;
  vec2 delta = position - center;
  return dot(delta, delta) < radiusSquared ? 0.0 : 1.0;
}

float roundedRectSdf(vec2 point, float halfSize, float radius) {
  vec2 delta = abs(point) - vec2(halfSize) + vec2(radius);
  return
    length(max(delta, vec2(0.0))) +
    min(max(delta.x, delta.y), 0.0) -
    radius;
}

vec4 testEyes(vec2 position) {
  for (int group = 0; group < 3; group++) {
    vec2 local = (position - u_eyeCenter[group]) / u_eyeScale[group];
    if (
      roundedRectSdf(
        local,
        u_eyeHalf[group].z,
        u_eyeRadius[group].z
      ) < 0.0
    ) {
      return vec4(u_eyeColor[group], 1.0);
    }
    if (
      roundedRectSdf(
        local,
        u_eyeHalf[group].y,
        u_eyeRadius[group].y
      ) < 0.0
    ) {
      return vec4(u_backgroundColor, 1.0);
    }
    if (
      roundedRectSdf(
        local,
        u_eyeHalf[group].x,
        u_eyeRadius[group].x
      ) < 0.0
    ) {
      return vec4(u_eyeColor[group], 1.0);
    }
  }
  return vec4(0.0);
}

vec4 sampleStatic(vec2 position, float radiusSquared) {
  vec4 eye = testEyes(position);
  if (eye.a > 0.5) return eye;
  float hole = testDot(position, radiusSquared);
  if (hole < 0.5) return vec4(0.0, 0.0, 0.0, -1.0);
  return vec4(u_backgroundColor, 1.0);
}

void main() {
  // The QR coordinate system starts at the top-left like CSS.
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
  float paint = texture(u_paintingScaleTexture, uv).r;
  float radiusSquared =
    pow(u_dotRadius * (1.0 - paint), 2.0);

  if (u_displacementActive == 0) {
    vec4 staticColor = sampleStatic(uv, radiusSquared);
    if (staticColor.a < 0.0) discard;
    fragColor = staticColor;
    return;
  }

  vec2 lensUv = (uv - u_lensOrigin) / u_lensSize;
  bool insideLens =
    lensUv.x >= 0.0 &&
    lensUv.x <= 1.0 &&
    lensUv.y >= 0.0 &&
    lensUv.y <= 1.0;
  if (!insideLens) {
    vec4 staticColor = sampleStatic(uv, radiusSquared);
    if (staticColor.a < 0.0) discard;
    fragColor = staticColor;
    return;
  }

  vec4 displacementSample = texture(u_displacementMap, lensUv);
  if (displacementSample.a < 0.01) {
    vec4 staticColor = sampleStatic(uv, radiusSquared);
    if (staticColor.a < 0.0) discard;
    fragColor = staticColor;
    return;
  }

  vec2 displacement =
    (displacementSample.rg - 0.5) * u_displacementScale;
  float redScale = 1.0 + u_chromaAmount * 2.0;
  float greenScale = 1.0 + u_chromaAmount;
  vec2 uvRed = uv + displacement * redScale;
  vec2 uvGreen = uv + displacement * greenScale;
  vec2 uvBlue = uv + displacement;

  // Finder eyes remain legible by receiving only 16% of the displacement.
  vec2 eyeDisplacement = displacement * u_eyeRefractionScale;
  vec4 eyeRed = testEyes(uv + eyeDisplacement * redScale);
  vec4 eyeGreen = testEyes(uv + eyeDisplacement * greenScale);
  vec4 eyeBlue = testEyes(uv + eyeDisplacement);

  float red;
  float green;
  float blue;
  if (eyeRed.a > 0.5) {
    red = eyeRed.r;
  } else {
    float hole = testDot(uvRed, radiusSquared);
    float paintRed = texture(u_paintingColorTexture, uvRed).r;
    red = mix(paintRed, u_backgroundColor.r, hole);
  }
  if (eyeGreen.a > 0.5) {
    green = eyeGreen.g;
  } else {
    float hole = testDot(uvGreen, radiusSquared);
    float paintGreen = texture(u_paintingColorTexture, uvGreen).g;
    green = mix(paintGreen, u_backgroundColor.g, hole);
  }
  if (eyeBlue.a > 0.5) {
    blue = eyeBlue.b;
  } else {
    float hole = testDot(uvBlue, radiusSquared);
    float paintBlue = texture(u_paintingColorTexture, uvBlue).b;
    blue = mix(paintBlue, u_backgroundColor.b, hole);
  }

  fragColor = vec4(red, green, blue, 1.0);
}
`;
// [study:qr-shader:end]

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create QR shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'QR shader error';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertex: WebGLShader,
  fragment: WebGLShader
): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to create QR program');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'QR link error';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function configureTexture(
  gl: WebGL2RenderingContext,
  filter: number
): void {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
}

function resolveColor(
  canvas: HTMLCanvasElement,
  cssColor: string
): [number, number, number] {
  canvas.style.color = cssColor;
  const resolved = getComputedStyle(canvas).color;
  canvas.style.color = '';
  const p3 = resolved.match(
    /color\(display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/
  );
  if (p3) {
    return [
      Number.parseFloat(p3[1]),
      Number.parseFloat(p3[2]),
      Number.parseFloat(p3[3])
    ];
  }
  const rgb = resolved.match(/\d+(?:\.\d+)?/g);
  if (!rgb) return [1, 1, 1];
  return [
    Number.parseFloat(rgb[0]) / 255,
    Number.parseFloat(rgb[1]) / 255,
    Number.parseFloat(rgb[2]) / 255
  ];
}

export function createQrRefraction(
  canvas: HTMLCanvasElement,
  scene: QrScene
): QrRefractionController {
  // The source renderer oversamples by 1.25 and caps DPR at 3.
  const renderScale = 1.25 * Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(scene.size * renderScale);
  canvas.height = Math.round(scene.size * renderScale);

  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false
  });
  if (!gl) throw new Error('WebGL2 is required for the QR example');

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ZERO);

  const vertexShader = compileShader(
    gl,
    gl.VERTEX_SHADER,
    QR_VERTEX_SHADER
  );
  const fragmentShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    QR_FRAGMENT_SHADER
  );
  const program = createProgram(gl, vertexShader, fragmentShader);
  gl.useProgram(program);

  const vertices = new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    1, 1
  ]);
  const indices = new Uint16Array([0, 1, 2, 2, 1, 3]);
  const vertexBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();
  if (!vertexBuffer || !indexBuffer) {
    throw new Error('Unable to create QR geometry buffers');
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const occupancyTexture = gl.createTexture();
  const displacementTexture = gl.createTexture();
  const paintingScaleTexture = gl.createTexture();
  const paintingColorTexture = gl.createTexture();
  if (
    !occupancyTexture ||
    !displacementTexture ||
    !paintingScaleTexture ||
    !paintingColorTexture
  ) {
    throw new Error('Unable to create QR textures');
  }

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, occupancyTexture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.R8,
    scene.matrixLength,
    scene.matrixLength,
    0,
    gl.RED,
    gl.UNSIGNED_BYTE,
    scene.occupancy
  );
  configureTexture(gl, gl.NEAREST);
  gl.uniform1i(gl.getUniformLocation(program, 'u_occupancyTexture'), 0);
  gl.uniform1f(
    gl.getUniformLocation(program, 'u_gridOriginUv'),
    scene.gridOriginUv
  );
  gl.uniform1f(
    gl.getUniformLocation(program, 'u_cellUv'),
    scene.cellUv
  );
  gl.uniform1f(
    gl.getUniformLocation(program, 'u_invCellUv'),
    1 / scene.cellUv
  );
  gl.uniform1i(
    gl.getUniformLocation(program, 'u_matrixLength'),
    scene.matrixLength
  );

  const textureUnits: Array<[WebGLTexture, number, string]> = [
    [displacementTexture, 1, 'u_displacementMap'],
    [paintingScaleTexture, 2, 'u_paintingScaleTexture'],
    [paintingColorTexture, 3, 'u_paintingColorTexture']
  ];
  for (const [texture, unit, uniform] of textureUnits) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    configureTexture(gl, gl.LINEAR);
    gl.uniform1i(gl.getUniformLocation(program, uniform), unit);
  }

  gl.uniform1f(
    gl.getUniformLocation(program, 'u_dotRadius'),
    scene.dotRadius
  );
  const backgroundUniform = gl.getUniformLocation(
    program,
    'u_backgroundColor'
  );
  const displacementActive = gl.getUniformLocation(
    program,
    'u_displacementActive'
  );
  const lensOrigin = gl.getUniformLocation(program, 'u_lensOrigin');
  const lensSize = gl.getUniformLocation(program, 'u_lensSize');
  const displacementScale = gl.getUniformLocation(
    program,
    'u_displacementScale'
  );
  const chromaAmount = gl.getUniformLocation(
    program,
    'u_chromaAmount'
  );
  const eyeRefractionScale = gl.getUniformLocation(
    program,
    'u_eyeRefractionScale'
  );
  gl.uniform1f(eyeRefractionScale, 0.16);
  gl.uniform1i(displacementActive, 0);

  const eyeColorUniforms: Array<WebGLUniformLocation | null> = [];
  const eyeScaleUniforms: Array<WebGLUniformLocation | null> = [];
  const initialEyeColor = resolveColor(canvas, scene.dotColor);
  for (let group = 0; group < 3; group += 1) {
    const outer = scene.eyes[group * 3];
    const middle = scene.eyes[group * 3 + 1];
    const inner = scene.eyes[group * 3 + 2];
    gl.uniform2f(
      gl.getUniformLocation(program, `u_eyeCenter[${group}]`),
      (outer.x + outer.width / 2) / scene.size,
      (outer.y + outer.height / 2) / scene.size
    );
    gl.uniform3f(
      gl.getUniformLocation(program, `u_eyeHalf[${group}]`),
      outer.width / 2 / scene.size,
      middle.width / 2 / scene.size,
      inner.width / 2 / scene.size
    );
    gl.uniform3f(
      gl.getUniformLocation(program, `u_eyeRadius[${group}]`),
      outer.radius / scene.size,
      middle.radius / scene.size,
      inner.radius / scene.size
    );
    const colorUniform = gl.getUniformLocation(
      program,
      `u_eyeColor[${group}]`
    );
    eyeColorUniforms.push(colorUniform);
    gl.uniform3f(colorUniform, ...initialEyeColor);
    const scaleUniform = gl.getUniformLocation(
      program,
      `u_eyeScale[${group}]`
    );
    eyeScaleUniforms.push(scaleUniform);
    gl.uniform1f(scaleUniform, 1);
  }

  const textureSize = new WeakMap<WebGLTexture, [number, number]>();
  const uploadCanvas = (
    texture: WebGLTexture,
    unit: number,
    source: HTMLCanvasElement | OffscreenCanvas
  ) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const previous = textureSize.get(texture);
    if (!previous || previous[0] !== source.width || previous[1] !== source.height) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
      textureSize.set(texture, [source.width, source.height]);
    } else {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      );
    }
  };

  const updateBackgroundColor = (color: string) => {
    gl.useProgram(program);
    gl.uniform3f(backgroundUniform, ...resolveColor(canvas, color));
  };
  updateBackgroundColor(scene.backgroundColor);

  return {
    draw() {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawElements(
        gl.TRIANGLES,
        indices.length,
        gl.UNSIGNED_SHORT,
        0
      );
    },
    updateDisplacement(displacement) {
      gl.useProgram(program);
      if (!displacement) {
        gl.uniform1i(displacementActive, 0);
        return;
      }
      uploadCanvas(displacementTexture, 1, displacement.canvas);
      gl.uniform1i(displacementActive, 1);
      gl.uniform2f(lensOrigin, ...displacement.lensOrigin);
      gl.uniform2f(lensSize, ...displacement.lensSize);
      gl.uniform2f(displacementScale, ...displacement.scale);
      gl.uniform1f(chromaAmount, displacement.chromaAmount);
    },
    updatePaintingScale(source) {
      uploadCanvas(paintingScaleTexture, 2, source);
    },
    updatePaintingColor(source) {
      uploadCanvas(paintingColorTexture, 3, source);
    },
    updateEyeScale(group, scale) {
      gl.useProgram(program);
      gl.uniform1f(eyeScaleUniforms[group], scale);
    },
    updateEyeColor(group, red, green, blue) {
      gl.useProgram(program);
      gl.uniform3f(eyeColorUniforms[group], red, green, blue);
    },
    updateBackgroundColor,
    dispose() {
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteBuffer(vertexBuffer);
      gl.deleteBuffer(indexBuffer);
      gl.deleteTexture(occupancyTexture);
      gl.deleteTexture(displacementTexture);
      gl.deleteTexture(paintingScaleTexture);
      gl.deleteTexture(paintingColorTexture);
    }
  };
}
