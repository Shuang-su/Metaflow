import { generateSurfaceMap } from './surface-map';
import {
  GAUSSIAN_BLUR_SHADER,
  REFRACTION_SHADER,
  VERTEX_SHADER
} from './webgl-shaders';
import type {
  GlassMaterial,
  SurfaceMapRegion,
  WebGlLens,
  WebGlRefractionController,
  WebGlRefractionOptions
} from './types';

interface Scene {
  bbox: [number, number, number, number];
  bboxSize: [number, number];
  circles: Array<[number, number, number]>;
  circleMaterials: GlassMaterial[];
  circleScales: number[];
  bar: [number, number, number, number, number] | null;
  barMaterial?: GlassMaterial;
  map: ImageData;
  mapKey: string;
}

interface ProgramUniforms {
  video: WebGLUniformLocation | null;
  map: WebGLUniformLocation | null;
  blurred: WebGLUniformLocation | null;
  baseScale: WebGLUniformLocation | null;
  ratioX: WebGLUniformLocation | null;
  ratioY: WebGLUniformLocation | null;
  chromaAmount: WebGLUniformLocation | null;
  specStrength: WebGLUniformLocation | null;
  adaptStrength: WebGLUniformLocation | null;
  specLumaLow: WebGLUniformLocation | null;
  specLumaHigh: WebGLUniformLocation | null;
  hasBlur: WebGLUniformLocation | null;
  bbox: WebGLUniformLocation | null;
  circles: Array<WebGLUniformLocation | null>;
  scale: WebGLUniformLocation | null;
  bar: WebGLUniformLocation | null;
  barRadius: WebGLUniformLocation | null;
  barBaseScale: WebGLUniformLocation | null;
  barRatioX: WebGLUniformLocation | null;
  barRatioY: WebGLUniformLocation | null;
  bboxSize: WebGLUniformLocation | null;
}

interface GlResources {
  refractionProgram: WebGLProgram;
  blurProgram: WebGLProgram;
  sourceTexture: WebGLTexture;
  mapTexture: WebGLTexture;
  blurTextureA: WebGLTexture;
  blurTextureB: WebGLTexture;
  blurFramebufferA: WebGLFramebuffer;
  blurFramebufferB: WebGLFramebuffer;
  positionBuffer: WebGLBuffer;
  refractionPosition: number;
  blurPosition: number;
  uniforms: ProgramUniforms;
  blurSource: WebGLUniformLocation | null;
  blurDirection: WebGLUniformLocation | null;
  blurWidth: number;
  blurHeight: number;
}

function createShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create WebGL shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message =
      gl.getShaderInfoLog(shader) ?? 'Unknown shader compilation error';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to create WebGL program');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.detachShader(program, vertex);
  gl.detachShader(program, fragment);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message =
      gl.getProgramInfoLog(program) ?? 'Unable to link WebGL program';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function createTexture(gl: WebGLRenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error('Unable to create WebGL texture');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_WRAP_S,
    gl.CLAMP_TO_EDGE
  );
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_WRAP_T,
    gl.CLAMP_TO_EDGE
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return texture;
}

function createFramebuffer(
  gl: WebGLRenderingContext,
  texture: WebGLTexture
): WebGLFramebuffer {
  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) throw new Error('Unable to create framebuffer');
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return framebuffer;
}

function createResources(gl: WebGLRenderingContext): GlResources {
  gl.getExtension('OES_standard_derivatives');
  const refractionProgram = createProgram(
    gl,
    VERTEX_SHADER,
    REFRACTION_SHADER
  );
  const blurProgram = createProgram(
    gl,
    VERTEX_SHADER,
    GAUSSIAN_BLUR_SHADER
  );
  const sourceTexture = createTexture(gl);
  const mapTexture = createTexture(gl);
  const blurTextureA = createTexture(gl);
  const blurTextureB = createTexture(gl);
  const blurFramebufferA = createFramebuffer(gl, blurTextureA);
  const blurFramebufferB = createFramebuffer(gl, blurTextureB);
  const positionBuffer = gl.createBuffer();
  if (!positionBuffer) throw new Error('Unable to create position buffer');
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1
    ]),
    gl.STATIC_DRAW
  );

  const uniforms: ProgramUniforms = {
    video: gl.getUniformLocation(refractionProgram, 'u_video'),
    map: gl.getUniformLocation(refractionProgram, 'u_map'),
    blurred: gl.getUniformLocation(refractionProgram, 'u_blurred'),
    baseScale: gl.getUniformLocation(
      refractionProgram,
      'u_baseScale'
    ),
    ratioX: gl.getUniformLocation(refractionProgram, 'u_ratioX'),
    ratioY: gl.getUniformLocation(refractionProgram, 'u_ratioY'),
    chromaAmount: gl.getUniformLocation(
      refractionProgram,
      'u_chromaAmount'
    ),
    specStrength: gl.getUniformLocation(
      refractionProgram,
      'u_specStrength'
    ),
    adaptStrength: gl.getUniformLocation(
      refractionProgram,
      'u_adaptStrength'
    ),
    specLumaLow: gl.getUniformLocation(
      refractionProgram,
      'u_specLumaLow'
    ),
    specLumaHigh: gl.getUniformLocation(
      refractionProgram,
      'u_specLumaHigh'
    ),
    hasBlur: gl.getUniformLocation(refractionProgram, 'u_hasBlur'),
    bbox: gl.getUniformLocation(refractionProgram, 'u_bbox'),
    circles: [0, 1, 2].map(index =>
      gl.getUniformLocation(refractionProgram, `u_circles[${index}]`)
    ),
    scale: gl.getUniformLocation(refractionProgram, 'u_scale'),
    bar: gl.getUniformLocation(refractionProgram, 'u_bar'),
    barRadius: gl.getUniformLocation(
      refractionProgram,
      'u_barRadius'
    ),
    barBaseScale: gl.getUniformLocation(
      refractionProgram,
      'u_barBaseScale'
    ),
    barRatioX: gl.getUniformLocation(
      refractionProgram,
      'u_barRatioX'
    ),
    barRatioY: gl.getUniformLocation(
      refractionProgram,
      'u_barRatioY'
    ),
    bboxSize: gl.getUniformLocation(
      refractionProgram,
      'u_bboxSize'
    )
  };

  gl.useProgram(refractionProgram);
  gl.uniform1i(uniforms.video, 0);
  gl.uniform1i(uniforms.map, 1);
  gl.uniform1i(uniforms.blurred, 2);

  return {
    refractionProgram,
    blurProgram,
    sourceTexture,
    mapTexture,
    blurTextureA,
    blurTextureB,
    blurFramebufferA,
    blurFramebufferB,
    positionBuffer,
    refractionPosition: gl.getAttribLocation(
      refractionProgram,
      'a_pos'
    ),
    blurPosition: gl.getAttribLocation(blurProgram, 'a_pos'),
    uniforms,
    blurSource: gl.getUniformLocation(blurProgram, 'u_source'),
    blurDirection: gl.getUniformLocation(blurProgram, 'u_dir'),
    blurWidth: 0,
    blurHeight: 0
  };
}

function destroyResources(
  gl: WebGLRenderingContext,
  resources: GlResources
): void {
  gl.deleteTexture(resources.sourceTexture);
  gl.deleteTexture(resources.mapTexture);
  gl.deleteTexture(resources.blurTextureA);
  gl.deleteTexture(resources.blurTextureB);
  gl.deleteFramebuffer(resources.blurFramebufferA);
  gl.deleteFramebuffer(resources.blurFramebufferB);
  gl.deleteBuffer(resources.positionBuffer);
  gl.deleteProgram(resources.refractionProgram);
  gl.deleteProgram(resources.blurProgram);
}

function draw(
  gl: WebGLRenderingContext,
  resources: GlResources,
  position: number
): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, resources.positionBuffer);
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function sourceReady(
  source: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement
): boolean {
  if (source instanceof HTMLVideoElement) {
    return (
      source.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      source.videoWidth > 0 &&
      source.videoHeight > 0
    );
  }
  if (source instanceof HTMLImageElement) {
    return source.complete && source.naturalWidth > 0;
  }
  return source.width > 0 && source.height > 0;
}

function uploadSource(
  gl: WebGLRenderingContext,
  texture: WebGLTexture,
  source: TexImageSource,
  unit: number
): void {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    source
  );
}

function depthRatio(material: GlassMaterial, halfSize: number): number {
  if (material.depth <= 1) return material.depth;
  return halfSize > 0 ? material.depth / halfSize : 0;
}

function createScene(
  lenses: WebGlLens[],
  width: number,
  height: number,
  requestedMapSize: number | undefined,
  mapScale: number,
  maximumTextureSize: number
): Scene {
  const circleLenses = lenses
    .filter(lens => lens.shape !== 'bar')
    .slice(0, 3);
  const barLens = lenses.find(lens => lens.shape === 'bar');
  const active = [...circleLenses, ...(barLens ? [barLens] : [])];

  if (active.length === 0) {
    const emptyMap = new ImageData(1, 1);
    emptyMap.data.set([128, 128, 128, 0]);
    return {
      bbox: [0, 0, 0, 0],
      bboxSize: [1, 1],
      circles: [],
      circleMaterials: [],
      circleScales: [],
      bar: null,
      map: emptyMap,
      mapKey: 'empty'
    };
  }

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const lens of active) {
    left = Math.min(left, lens.x - lens.geometry.lensW - 4);
    top = Math.min(top, lens.y - lens.geometry.lensH - 4);
    right = Math.max(right, lens.x + lens.geometry.lensW + 4);
    bottom = Math.max(bottom, lens.y + lens.geometry.lensH + 4);
  }
  left = Math.max(0, left);
  top = Math.max(0, top);
  right = Math.min(width, right);
  bottom = Math.min(height, bottom);

  // The progress lens asks the source renderer to include the full horizontal
  // video width in the tight bbox. This leaves room for overscroll stretch
  // without reallocating the drawing buffer.
  if (barLens) {
    const barLeft = Math.max(
      0,
      barLens.x - barLens.geometry.lensW
    );
    const horizontalExtension = Math.min(barLeft, 48);
    left = Math.max(0, left - horizontalExtension);
    right = Math.min(width, right + horizontalExtension);
  }
  const bboxWidth = Math.max(1, right - left);
  const bboxHeight = Math.max(1, bottom - top);
  const mapSize = Math.min(
    requestedMapSize ??
      Math.max(128, Math.round(bboxWidth * mapScale)),
    maximumTextureSize
  );

  const regions: SurfaceMapRegion[] = active.map(lens => {
    const common = {
      cx: lens.x - left,
      cy: lens.y - top,
      depthRatio: depthRatio(
        lens.material,
        Math.min(lens.geometry.lensW, lens.geometry.lensH)
      ),
      domeDepth: lens.material.domeDepth,
      specularRotation: lens.material.specularRotation,
      glowStrength: lens.material.glowStrength,
      glowSpread: lens.material.glowSpread,
      glowExponent: lens.material.glowExponent,
      edgeStrength: lens.material.edgeStrength,
      edgeWidth: lens.material.edgeWidth,
      edgeExponent: lens.material.edgeExponent
    };
    if (lens.shape === 'bar') {
      return {
        ...common,
        shape: 'rect' as const,
        width: lens.geometry.lensW * 2,
        height: lens.geometry.lensH * 2,
        cornerRadius: lens.geometry.borderRadius
      };
    }
    return {
      ...common,
      shape: 'circle' as const,
      radius: lens.geometry.lensW
    };
  });
  const map = generateSurfaceMap({
    containerW: bboxWidth,
    containerH: bboxHeight,
    regions,
    mapSize
  });
  if (!map) throw new Error('Unable to generate a WebGL surface map');

  const circles = circleLenses.map(
    lens =>
      [
        lens.x - left,
        lens.y - top,
        lens.geometry.lensW
      ] as [number, number, number]
  );
  const bar = barLens
    ? ([
        barLens.x - left,
        barLens.y - top,
        barLens.geometry.lensW * 2,
        barLens.geometry.lensH * 2,
        barLens.geometry.borderRadius
      ] as [number, number, number, number, number])
    : null;
  const mapKey = JSON.stringify({
    width,
    height,
    left,
    top,
    bboxWidth,
    bboxHeight,
    mapSize,
    regions
  });

  return {
    bbox: [
      left / width,
      top / height,
      bboxWidth / width,
      bboxHeight / height
    ],
    bboxSize: [bboxWidth, bboxHeight],
    circles,
    circleMaterials: circleLenses.map(lens => lens.material),
    circleScales: circleLenses.map(lens => lens.pressScale ?? 1),
    bar,
    barMaterial: barLens?.material,
    map: map.imageData,
    mapKey
  };
}

function scaleComponents(
  material: GlassMaterial | undefined
): [number, number, number] {
  if (!material) return [0, 0, 0];
  const base = Math.max(material.scaleX, material.scaleY);
  return [
    base,
    base > 0 ? material.scaleX / base : 0,
    base > 0 ? material.scaleY / base : 0
  ];
}

// [study:webgl-controller:start]
export function createWebGlRefraction(
  options: WebGlRefractionOptions
): WebGlRefractionController {
  const gl = options.canvas.getContext('webgl', {
    alpha: false,
    premultipliedAlpha: false,
    antialias: false
  });
  if (!gl) throw new Error('WebGL is not available');

  const maximumTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  let resources = createResources(gl);
  let lenses = options.lenses;
  let scene: Scene | undefined;
  let sceneKey = '';
  let running = false;
  let animationFrame = 0;
  let contextLost = false;
  let cssWidth = 0;
  let cssHeight = 0;

  const uploadMap = (nextScene: Scene) => {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, resources.mapTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      nextScene.map
    );
  };

  const rebuildScene = () => {
    const mapScale =
      (options.dpr ?? Math.min(window.devicePixelRatio || 1, 3)) *
      (options.canvasScale ?? 1.25);
    const next = createScene(
      lenses,
      Math.max(1, cssWidth),
      Math.max(1, cssHeight),
      options.mapSize,
      mapScale,
      maximumTextureSize
    );
    if (next.mapKey !== sceneKey) {
      uploadMap(next);
      sceneKey = next.mapKey;
    }
    scene = next;
  };

  const resize = () => {
    const dpr =
      (options.dpr ?? Math.min(window.devicePixelRatio || 1, 3)) *
      (options.canvasScale ?? 1);
    cssWidth = Math.max(1, options.canvas.clientWidth);
    cssHeight = Math.max(1, options.canvas.clientHeight);
    const displayWidth = Math.min(
      maximumTextureSize,
      Math.round(cssWidth * dpr)
    );
    const displayHeight = Math.min(
      maximumTextureSize,
      Math.round(cssHeight * dpr)
    );
    if (
      options.canvas.width !== displayWidth ||
      options.canvas.height !== displayHeight
    ) {
      options.canvas.width = displayWidth;
      options.canvas.height = displayHeight;
      sceneKey = '';
    }
    rebuildScene();
  };

  const render = () => {
    if (contextLost || !sourceReady(options.source)) return;
    const nextWidth = Math.max(1, options.canvas.clientWidth);
    const nextHeight = Math.max(1, options.canvas.clientHeight);
    if (
      nextWidth !== cssWidth ||
      nextHeight !== cssHeight ||
      !scene
    ) {
      resize();
    }
    if (!scene) return;

    const displayWidth = options.canvas.width;
    const displayHeight = options.canvas.height;
    uploadSource(gl, resources.sourceTexture, options.source, 0);

    const primary =
      scene.circleMaterials[0] ??
      scene.barMaterial ??
      lenses[0]?.material;
    const blurAmount =
      options.blurAmount ?? primary?.blurAmount ?? 0;
    const hasBlur = blurAmount > 0.001;
    if (hasBlur) {
      const blurWidth = (displayWidth >> 1) || 1;
      const blurHeight = (displayHeight >> 1) || 1;
      if (
        blurWidth !== resources.blurWidth ||
        blurHeight !== resources.blurHeight
      ) {
        resources.blurWidth = blurWidth;
        resources.blurHeight = blurHeight;
        for (const texture of [
          resources.blurTextureA,
          resources.blurTextureB
        ]) {
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            blurWidth,
            blurHeight,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null
          );
        }
      }

      const scaledBlur =
        (blurAmount * (displayWidth / (cssWidth || displayWidth))) /
        2;
      gl.useProgram(resources.blurProgram);
      gl.uniform1i(resources.blurSource, 0);
      gl.bindFramebuffer(
        gl.FRAMEBUFFER,
        resources.blurFramebufferA
      );
      gl.viewport(0, 0, resources.blurWidth, resources.blurHeight);
      gl.uniform2f(
        resources.blurDirection,
        scaledBlur / displayWidth,
        0
      );
      draw(gl, resources, resources.blurPosition);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, resources.blurTextureA);
      gl.bindFramebuffer(
        gl.FRAMEBUFFER,
        resources.blurFramebufferB
      );
      gl.uniform2f(
        resources.blurDirection,
        0,
        scaledBlur / displayHeight
      );
      draw(gl, resources, resources.blurPosition);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, resources.sourceTexture);
    }

    gl.viewport(0, 0, displayWidth, displayHeight);
    gl.useProgram(resources.refractionProgram);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(
      gl.TEXTURE_2D,
      hasBlur ? resources.blurTextureB : resources.sourceTexture
    );
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, resources.mapTexture);

    const baseScales = new Float32Array(3);
    const ratioX = new Float32Array(3);
    const ratioY = new Float32Array(3);
    for (let index = 0; index < 3; index += 1) {
      const components = scaleComponents(
        scene.circleMaterials[index]
      );
      baseScales[index] = components[0];
      ratioX[index] = components[1];
      ratioY[index] = components[2];
    }
    gl.uniform1fv(resources.uniforms.baseScale, baseScales);
    gl.uniform1fv(resources.uniforms.ratioX, ratioX);
    gl.uniform1fv(resources.uniforms.ratioY, ratioY);
    gl.uniform1f(
      resources.uniforms.chromaAmount,
      primary?.chromaAmount ?? 0
    );
    gl.uniform1f(
      resources.uniforms.specStrength,
      primary?.specularStrength ?? 0
    );
    gl.uniform1f(
      resources.uniforms.adaptStrength,
      options.adaptStrength ?? 0.5 * (primary?.tint ?? 0)
    );
    gl.uniform1f(
      resources.uniforms.specLumaLow,
      options.specLumaLow ?? 0.3
    );
    gl.uniform1f(
      resources.uniforms.specLumaHigh,
      options.specLumaHigh ?? 0.7
    );
    gl.uniform1f(resources.uniforms.hasBlur, Number(hasBlur));
    gl.uniform4f(resources.uniforms.bbox, ...scene.bbox);

    for (let index = 0; index < 3; index += 1) {
      const circle = scene.circles[index] ?? [0, 0, 0];
      gl.uniform3f(
        resources.uniforms.circles[index],
        circle[0],
        circle[1],
        circle[2]
      );
    }
    gl.uniform1fv(
      resources.uniforms.scale,
      new Float32Array([
        scene.circleScales[0] ?? 1,
        scene.circleScales[1] ?? 1,
        scene.circleScales[2] ?? 1
      ])
    );

    if (scene.bar && scene.barMaterial) {
      gl.uniform4f(
        resources.uniforms.bar,
        scene.bar[0],
        scene.bar[1],
        scene.bar[2],
        scene.bar[3]
      );
      gl.uniform1f(resources.uniforms.barRadius, scene.bar[4]);
      const barScale = scaleComponents(scene.barMaterial);
      gl.uniform1f(resources.uniforms.barBaseScale, barScale[0]);
      gl.uniform1f(resources.uniforms.barRatioX, barScale[1]);
      gl.uniform1f(resources.uniforms.barRatioY, barScale[2]);
    } else {
      gl.uniform4f(resources.uniforms.bar, 0, 0, 0, 0);
      gl.uniform1f(resources.uniforms.barRadius, 0);
      gl.uniform1f(resources.uniforms.barBaseScale, 0);
      gl.uniform1f(resources.uniforms.barRatioX, 0);
      gl.uniform1f(resources.uniforms.barRatioY, 0);
    }
    gl.uniform2f(
      resources.uniforms.bboxSize,
      scene.bboxSize[0],
      scene.bboxSize[1]
    );
    draw(gl, resources, resources.refractionPosition);
  };

  const tick = () => {
    render();
    if (running) animationFrame = requestAnimationFrame(tick);
  };

  const onContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    running = false;
    cancelAnimationFrame(animationFrame);
  };
  const onContextRestored = () => {
    contextLost = false;
    resources = createResources(gl);
    sceneKey = '';
    resize();
    render();
  };
  options.canvas.addEventListener('webglcontextlost', onContextLost);
  options.canvas.addEventListener(
    'webglcontextrestored',
    onContextRestored
  );

  resize();
  render();

  return {
    render,
    start() {
      if (running) return;
      running = true;
      tick();
    },
    stop() {
      running = false;
      cancelAnimationFrame(animationFrame);
      render();
    },
    resize,
    updateLenses(nextLenses) {
      const previousGeometryKey = JSON.stringify(
        lenses.map(({ pressScale: _pressScale, ...lens }) => lens)
      );
      const nextGeometryKey = JSON.stringify(
        nextLenses.map(({ pressScale: _pressScale, ...lens }) => lens)
      );
      lenses = nextLenses;
      if (previousGeometryKey === nextGeometryKey && scene) {
        scene.circleScales = nextLenses
          .filter(lens => lens.shape !== 'bar')
          .slice(0, 3)
          .map(lens => lens.pressScale ?? 1);
        render();
        return;
      }
      sceneKey = '';
      rebuildScene();
      render();
    },
    dispose() {
      running = false;
      cancelAnimationFrame(animationFrame);
      options.canvas.removeEventListener(
        'webglcontextlost',
        onContextLost
      );
      options.canvas.removeEventListener(
        'webglcontextrestored',
        onContextRestored
      );
      if (!contextLost) destroyResources(gl, resources);
    }
  };
}
// [study:webgl-controller:end]
