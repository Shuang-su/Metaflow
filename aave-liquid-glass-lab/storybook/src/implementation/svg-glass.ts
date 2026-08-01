import { generateLensMap } from './lens-map';
import type {
  GlassMaterial,
  LensGeometry,
  LensMapResource,
  LensPosition,
  SvgGlassController,
  SvgGlassOptions,
  SvgGlassUpdate
} from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const POOL_SIZE = 4;
let filterSequence = 0;

interface FilterGraph {
  filter: SVGFilterElement;
  image: SVGFEImageElement;
  mask: SVGFEFloodElement;
  blur?: SVGFEGaussianBlurElement;
  mapMatrix?: SVGFEColorMatrixElement;
  displacements: SVGFEDisplacementMapElement[];
}

interface TargetState {
  element: HTMLElement;
  previousFilter: string;
  previousWillChange: string;
  previousClipPath: string;
}

function svgElement<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string | number> = {}
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function channelMatrix(channel: 'R' | 'G' | 'B'): string {
  if (channel === 'R') {
    return '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0';
  }
  if (channel === 'G') {
    return '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0';
  }
  return '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0';
}

function mapMatrix(ratioX: number, ratioY: number): string {
  return `${ratioX} 0 0 0 ${0.5 * (1 - ratioX)}  0 ${ratioY} 0 0 ${0.5 * (1 - ratioY)}  0 0 1 0 0  0 0 0 1 0`;
}

function createFilterGraph(
  id: string,
  mapUrl: string,
  material: GlassMaterial,
  rich: boolean
): FilterGraph {
  const safari =
    typeof navigator !== 'undefined' &&
    /^((?!chrome|chromium|android).)*safari/i.test(navigator.userAgent);
  const filter = svgElement('filter', {
    id,
    filterUnits: 'objectBoundingBox',
    primitiveUnits: 'objectBoundingBox',
    'color-interpolation-filters': 'sRGB',
    x: 0,
    y: 0,
    width: 1,
    height: 1
  });

  filter.append(
    svgElement('feFlood', {
      'flood-color': 'rgb(128,128,128)',
      'flood-opacity': 1,
      result: 'mapBg'
    })
  );
  const image = svgElement('feImage', {
    'data-lens': '',
    href: mapUrl,
    preserveAspectRatio: 'none',
    result: 'rawMap'
  });
  filter.append(
    image,
    svgElement('feComposite', {
      in: 'rawMap',
      in2: 'mapBg',
      operator: 'over',
      result: 'map'
    })
  );

  const baseScale = Math.max(material.scaleX, material.scaleY);
  const ratioX = baseScale > 0 ? material.scaleX / baseScale : 0;
  const ratioY = baseScale > 0 ? material.scaleY / baseScale : 0;
  const needsMatrix = ratioX !== 1 || ratioY !== 1;
  const matrix = needsMatrix
    ? svgElement('feColorMatrix', {
        in: 'map',
        type: 'matrix',
        values: mapMatrix(ratioX, ratioY),
        result: 'scaledMap'
      })
    : undefined;
  if (matrix) filter.append(matrix);
  const mapInput = matrix ? 'scaledMap' : 'map';
  const sourceInput = material.blurAmount > 0 && rich ? 'blurred' : 'SourceGraphic';
  let blur: SVGFEGaussianBlurElement | undefined;

  if (material.blurAmount > 0 && rich) {
    blur = svgElement('feGaussianBlur', {
      in: 'SourceGraphic',
      stdDeviation: 0,
      result: 'blurred'
    });
    filter.append(blur);
  }

  const displacements: SVGFEDisplacementMapElement[] = [];
  if (rich && material.chromaAmount > 0) {
    const channels = ['R', 'G', 'B'] as const;
    const factors = [
      1 + 0.2 * material.chromaAmount,
      1 + 0.1 * material.chromaAmount,
      1
    ];
    channels.forEach((channel, index) => {
      const displacement = svgElement('feDisplacementMap', {
        'data-lens': '',
        in: sourceInput,
        in2: mapInput,
        scale: baseScale * factors[index],
        xChannelSelector: 'R',
        yChannelSelector: 'G'
      });
      displacements.push(displacement);
      filter.append(
        displacement,
        svgElement('feColorMatrix', {
          type: 'matrix',
          values: channelMatrix(channel),
          result: `disp${channel}`
        })
      );
    });
    filter.append(
      svgElement('feComposite', {
        in: 'dispR',
        in2: 'dispG',
        operator: 'arithmetic',
        k1: 0,
        k2: 1,
        k3: 1,
        k4: 0
      }),
      svgElement('feComposite', {
        in2: 'dispB',
        operator: 'arithmetic',
        k1: 0,
        k2: 1,
        k3: 1,
        k4: 0,
        result: 'lensResult'
      })
    );
  } else {
    const displacement = svgElement('feDisplacementMap', {
      'data-lens': '',
      in: sourceInput,
      in2: mapInput,
      scale: baseScale,
      xChannelSelector: 'R',
      yChannelSelector: 'G',
      result: 'lensResult'
    });
    displacements.push(displacement);
    filter.append(displacement);
  }

  if (
    rich &&
    (material.glowStrength > 0 || material.edgeStrength > 0)
  ) {
    if (material.specularDark) {
      const strength = material.specularStrength;
      const bias = 1 + (128 * strength) / 255;
      filter.append(
        svgElement('feColorMatrix', {
          in: 'map',
          type: 'matrix',
          values: `0 0 ${-strength} 0 ${bias}  0 0 ${-strength} 0 ${bias}  0 0 ${-strength} 0 ${bias}  0 0 0 0 1`,
          result: 'specMask'
        }),
        svgElement('feComposite', {
          in: 'specMask',
          in2: 'lensResult',
          operator: 'arithmetic',
          k1: 1,
          k2: 0,
          k3: 0,
          k4: 0,
          result: 'lensResult'
        })
      );
    } else {
      filter.append(
        svgElement('feColorMatrix', {
          in: safari ? 'rawMap' : 'map',
          type: 'matrix',
          values:
            '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 1 0 -0.5019607843',
          result: 'specMask'
        }),
        svgElement('feComposite', {
          in: 'specMask',
          in2: 'lensResult',
          operator: 'arithmetic',
          k1: 0,
          k2: material.specularStrength,
          k3: 1,
          k4: 0,
          result: 'lensResult'
        })
      );
    }
  }

  const mask = svgElement('feFlood', {
    'data-lens': '',
    'flood-color': 'black',
    'flood-opacity': 1,
    result: 'lensMask'
  });
  filter.append(
    mask,
    svgElement('feComposite', {
      in: 'SourceGraphic',
      in2: 'lensMask',
      operator: 'out',
      result: 'holedSG'
    }),
    svgElement('feComposite', {
      in: 'lensResult',
      in2: 'holedSG',
      operator: 'over'
    })
  );

  return {
    filter,
    image,
    mask,
    blur,
    mapMatrix: matrix,
    displacements
  };
}

function intersectionArea(
  left: number,
  top: number,
  width: number,
  height: number,
  target: DOMRect
): number {
  const right = left + width;
  const bottom = top + height;
  const overlapWidth = Math.max(
    0,
    Math.min(right, target.right) - Math.max(left, target.left)
  );
  const overlapHeight = Math.max(
    0,
    Math.min(bottom, target.bottom) - Math.max(top, target.top)
  );
  return overlapWidth * overlapHeight;
}

function setRegion(
  graph: FilterGraph,
  targetWidth: number,
  targetHeight: number,
  left: number,
  top: number,
  width: number,
  height: number,
  blurAmount: number,
  edgeBias: number
): void {
  // Aave eases this crop from .5px at rest to 0px while the lens expands.
  const alignedLeft = left + edgeBias;
  const alignedTop = top + edgeBias;
  const alignedWidth = Math.max(0, width - 2 * edgeBias);
  const alignedHeight = Math.max(0, height - 2 * edgeBias);
  const x = alignedLeft / targetWidth;
  const y = alignedTop / targetHeight;
  const w = alignedWidth / targetWidth;
  const h = alignedHeight / targetHeight;
  if (graph.blur) {
    graph.blur.setAttribute(
      'stdDeviation',
      `${blurAmount / targetWidth} ${blurAmount / targetHeight}`
    );
  }
  for (const element of [
    graph.image,
    graph.mask,
    ...graph.displacements
  ]) {
    element.setAttribute('x', String(x));
    element.setAttribute('y', String(y));
    element.setAttribute('width', String(w));
    element.setAttribute('height', String(h));
  }
}

function roundedRectMaskUri(
  width: number,
  height: number,
  radius: number
): string {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const safeRadius = Math.max(
    0,
    Math.min(Math.round(radius), Math.min(safeWidth, safeHeight) / 2)
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${safeWidth} ${safeHeight}" preserveAspectRatio="none"><rect x=".5" y=".5" width="${Math.max(0, safeWidth - 1)}" height="${Math.max(0, safeHeight - 1)}" rx="${Math.max(0, safeRadius - 0.5)}" fill="black"/></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

function mapMaterialKey(material: GlassMaterial): string {
  return JSON.stringify([
    material.depth,
    material.sdfBoundary,
    material.edgeFalloff,
    material.domeDepth,
    material.splayAmount,
    material.specularRotation,
    material.glowStrength,
    material.glowSpread,
    material.glowExponent,
    material.edgeStrength,
    material.edgeWidth,
    material.edgeExponent
  ]);
}

function filterMaterialKey(material: GlassMaterial): string {
  return JSON.stringify([
    material.scaleX,
    material.scaleY,
    material.chromaAmount,
    material.blurAmount,
    material.specularStrength,
    material.specularDark,
    material.glowStrength > 0 || material.edgeStrength > 0
  ]);
}

// [study:svg-controller:start]
export function createSvgGlass(options: SvgGlassOptions): SvgGlassController {
  let geometry: LensGeometry = { ...options.geometry };
  let mapGeometryFollowsGeometry = options.mapGeometry === undefined;
  let mapGeometry: LensGeometry = {
    ...(options.mapGeometry ?? options.geometry)
  };
  let material: GlassMaterial = { ...options.material };
  let position: LensPosition = { ...options.position };
  let tintColor = options.tintColor ?? '#ffffff';
  let tintOpacity = options.tintOpacity ?? Math.abs(material.tint);
  let tintBlur = options.tintBlur ?? 0;
  let shadowOpacity = options.shadowOpacity ?? 0;
  let restShadowOpacity = options.restShadowOpacity ?? 0;
  let edgeBias = options.edgeBias ?? 0.5;
  const filterResolution = options.filterResolution ?? 1;
  let map = generateLensMap(mapGeometry, material);
  let mapKey = JSON.stringify([mapGeometry, mapMaterialKey(material)]);
  let graphKey = filterMaterialKey(material);
  let version = 0;
  let mapRefreshTimer = 0;
  const baseId = `aave-glass-readable-${filterSequence++}`;

  const svg = svgElement('svg', {
    width: 0,
    height: 0,
    'aria-hidden': 'true'
  });
  Object.assign(svg.style, {
    position: 'absolute',
    pointerEvents: 'none',
    overflow: 'visible'
  });
  const defs = svgElement('defs');
  svg.append(defs);

  let mainGraph = createFilterGraph(
    `${baseId}-v0`,
    map.dataUrl,
    material,
    true
  );
  const poolGraphs = Array.from({ length: POOL_SIZE }, (_, index) =>
    createFilterGraph(
      `${baseId}-pool-${index}-v0`,
      map.dataUrl,
      material,
      false
    )
  );
  defs.append(mainGraph.filter, ...poolGraphs.map(graph => graph.filter));

  const brightness = document.createElement('div');
  brightness.className = 'aave-glass-brightness';
  Object.assign(brightness.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    pointerEvents: 'none',
    willChange: 'transform'
  });

  const tint = document.createElement('div');
  tint.className = 'aave-glass-tint';
  Object.assign(tint.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    pointerEvents: 'none',
    overflow: 'hidden',
    willChange: 'backdrop-filter, transform'
  });

  const backdrop = document.createElement('div');
  backdrop.className = 'aave-glass-backdrop';
  Object.assign(backdrop.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    pointerEvents: 'none',
    willChange: 'backdrop-filter, transform'
  });

  const pressShadow = document.createElement('div');
  pressShadow.className = 'aave-glass-press-shadow';
  const restShadow = document.createElement('div');
  restShadow.className = 'aave-glass-rest-shadow';
  for (const layer of [pressShadow, restShadow]) {
    Object.assign(layer.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      pointerEvents: 'none',
      boxSizing: 'border-box',
      willChange: 'transform, opacity'
    });
  }

  const targetStates = new Map<HTMLElement, TargetState>();
  const rememberTarget = (element: HTMLElement): TargetState => {
    const existing = targetStates.get(element);
    if (existing) return existing;
    const state = {
      element,
      previousFilter: element.style.filter,
      previousWillChange: element.style.willChange,
      previousClipPath: element.style.clipPath
    };
    targetStates.set(element, state);
    return state;
  };
  const clearTargets = () => {
    for (const state of targetStates.values()) {
      state.element.style.filter = state.previousFilter;
      state.element.style.willChange = state.previousWillChange;
      state.element.style.clipPath = state.previousClipPath;
    }
  };

  options.host.dataset.aaveGlassContainer = '';
  options.target.dataset.refractionTarget = '';
  options.host.append(
    svg,
    brightness,
    tint,
    backdrop,
    pressShadow,
    restShadow
  );
  rememberTarget(options.target);

  const refreshGraphs = () => {
    const nextMain = createFilterGraph(
      `${baseId}-v${version}`,
      map.dataUrl,
      material,
      true
    );
    mainGraph.filter.replaceWith(nextMain.filter);
    mainGraph = nextMain;
    poolGraphs.forEach((graph, index) => {
      const next = createFilterGraph(
        `${baseId}-pool-${index}-v${version}`,
        map.dataUrl,
        material,
        false
      );
      graph.filter.replaceWith(next.filter);
      poolGraphs[index] = next;
    });
  };

  const collectTargets = (): HTMLElement[] => {
    const nested = Array.from(
      options.host.querySelectorAll<HTMLElement>('[data-refraction-target]')
    );
    if (!nested.includes(options.target)) nested.unshift(options.target);
    return nested;
  };

  const sync = (forceMap = false, deferMap = false) => {
    const nextMapKey = JSON.stringify([
      mapGeometry,
      mapMaterialKey(material)
    ]);
    const nextGraphKey = filterMaterialKey(material);
    const mapChanged = forceMap || nextMapKey !== mapKey;
    const graphChanged =
      (mapChanged && !deferMap) || nextGraphKey !== graphKey;
    if (mapChanged && !deferMap) {
      map.dispose();
      map = generateLensMap(mapGeometry, material);
      mapKey = nextMapKey;
    }
    if (graphChanged) {
      graphKey = nextGraphKey;
      version += 1;
      refreshGraphs();
    }
    if (mapChanged && deferMap) {
      window.clearTimeout(mapRefreshTimer);
      mapRefreshTimer = window.setTimeout(() => sync(true), 90);
    }

    clearTargets();
    const hostRect = options.host.getBoundingClientRect();
    const lensLeft = hostRect.left + position.x - geometry.lensW;
    const lensTop = hostRect.top + position.y - geometry.lensH;
    const lensWidth = geometry.lensW * 2;
    const lensHeight = geometry.lensH * 2;
    const candidates = collectTargets()
      .map(element => {
        const rect = element.getBoundingClientRect();
        return {
          element,
          rect,
          area: intersectionArea(
            lensLeft,
            lensTop,
            lensWidth,
            lensHeight,
            rect
          )
        };
      })
      .filter(candidate => candidate.area > 0)
      .sort((a, b) => b.area - a.area);

    const main = candidates[0];
    if (main) {
      const state = rememberTarget(main.element);
      state.element.style.willChange = 'filter';
      state.element.style.filter = `url(#${mainGraph.filter.id})`;
      setRegion(
        mainGraph,
        Math.max(1, main.rect.width),
        Math.max(1, main.rect.height),
        lensLeft - main.rect.left,
        lensTop - main.rect.top,
        lensWidth,
        lensHeight,
        material.blurAmount,
        edgeBias
      );
      if (options.clipTarget && main.element === options.target) {
        const resolution = filterResolution;
        const localLeft = lensLeft - main.rect.left;
        const localTop = lensTop - main.rect.top;
        const clipTop = Math.max(0, localTop) * resolution;
        const clipRight = Math.max(
          0,
          main.rect.width - (localLeft + lensWidth)
        ) * resolution;
        const clipBottom = Math.max(
          0,
          main.rect.height - (localTop + lensHeight)
        ) * resolution;
        const clipLeft = Math.max(0, localLeft) * resolution;
        state.element.style.clipPath = `inset(${clipTop}px ${clipRight}px ${clipBottom}px ${clipLeft}px round ${Math.max(0, Math.min(geometry.borderRadius, geometry.lensW, geometry.lensH)) * resolution}px)`;
      }
    }

    candidates.slice(1, POOL_SIZE + 1).forEach((candidate, index) => {
      const graph = poolGraphs[index];
      const state = rememberTarget(candidate.element);
      state.element.style.willChange = 'filter';
      state.element.style.filter = `url(#${graph.filter.id})`;
      setRegion(
        graph,
        Math.max(1, candidate.rect.width),
        Math.max(1, candidate.rect.height),
        lensLeft - candidate.rect.left,
        lensTop - candidate.rect.top,
        lensWidth,
        lensHeight,
        material.blurAmount,
        edgeBias
      );
    });

    const shellLeft = position.x - geometry.lensW;
    const shellTop = position.y - geometry.lensH;
    const radius = Math.min(
      geometry.borderRadius,
      geometry.lensW,
      geometry.lensH
    );
    const mask = roundedRectMaskUri(lensWidth, lensHeight, radius);
    const placeLayer = (layer: HTMLDivElement, opacity = 1) => {
      layer.style.transform = `translate3d(${shellLeft}px, ${shellTop}px, 0)`;
      layer.style.width = `${lensWidth}px`;
      layer.style.height = `${lensHeight}px`;
      layer.style.borderRadius = `${radius}px`;
      layer.style.opacity = String(opacity);
    };
    placeLayer(brightness, Math.abs(material.brightness));
    placeLayer(tint);
    placeLayer(backdrop);
    placeLayer(pressShadow, shadowOpacity);
    placeLayer(restShadow, restShadowOpacity);

    brightness.style.background =
      material.brightness > 0 ? 'white' : 'black';
    tint.style.background =
      material.tint < 0
        ? `color-mix(in srgb, black ${Math.max(tintOpacity, Math.abs(material.tint)) * 100}%, transparent)`
        : `color-mix(in srgb, ${tintColor} ${Math.max(tintOpacity, Math.abs(material.tint)) * 100}%, transparent)`;
    const tintFilter = tintBlur > 0 ? `blur(${tintBlur}px)` : 'none';
    tint.style.backdropFilter = tintFilter;
    tint.style.setProperty('-webkit-backdrop-filter', tintFilter);
    const backdropFilter =
      material.blurAmount > 0 ? `blur(${material.blurAmount}px)` : 'none';
    backdrop.style.backdropFilter = backdropFilter;
    backdrop.style.setProperty('-webkit-backdrop-filter', backdropFilter);
    backdrop.style.maskImage = mask;
    backdrop.style.webkitMaskImage = mask;
    backdrop.style.maskSize = '100% 100%';
    backdrop.style.webkitMaskSize = '100% 100%';

    pressShadow.style.boxShadow = [
      material.edgeShadow,
      material.edgeInsetShadow ? `inset ${material.edgeInsetShadow}` : undefined
    ]
      .filter(Boolean)
      .join(', ');
    restShadow.style.boxShadow = [
      material.restEdgeShadow,
      material.restEdgeInsetShadow
        ? `inset ${material.restEdgeInsetShadow}`
        : undefined
    ]
      .filter(Boolean)
      .join(', ');
  };

  sync(true);
  const resizeObserver = new ResizeObserver(() => sync());
  resizeObserver.observe(options.host);
  resizeObserver.observe(options.target);

  return {
    update(next: SvgGlassUpdate) {
      let shouldDeferMap = false;
      if (next.geometry) {
        geometry = { ...geometry, ...next.geometry };
        if (mapGeometryFollowsGeometry && !next.mapGeometry) {
          mapGeometry = { ...mapGeometry, ...next.geometry };
          shouldDeferMap = true;
        }
      }
      if (next.mapGeometry) {
        mapGeometry = { ...mapGeometry, ...next.mapGeometry };
        mapGeometryFollowsGeometry = false;
        shouldDeferMap = true;
      }
      if (next.material) {
        const previousMapMaterial = mapMaterialKey(material);
        material = { ...material, ...next.material };
        shouldDeferMap ||= previousMapMaterial !== mapMaterialKey(material);
      }
      if (next.position) position = { ...position, ...next.position };
      if (next.tintColor !== undefined) tintColor = next.tintColor;
      if (next.tintOpacity !== undefined) tintOpacity = next.tintOpacity;
      if (next.tintBlur !== undefined) tintBlur = next.tintBlur;
      if (next.shadowOpacity !== undefined) {
        shadowOpacity = next.shadowOpacity;
      }
      if (next.restShadowOpacity !== undefined) {
        restShadowOpacity = next.restShadowOpacity;
      }
      if (next.edgeBias !== undefined) edgeBias = next.edgeBias;
      sync(false, shouldDeferMap);
    },
    getMap() {
      return map;
    },
    destroy() {
      resizeObserver.disconnect();
      window.clearTimeout(mapRefreshTimer);
      clearTargets();
      map.dispose();
      delete options.host.dataset.aaveGlassContainer;
      delete options.target.dataset.refractionTarget;
      svg.remove();
      brightness.remove();
      tint.remove();
      backdrop.remove();
      pressShadow.remove();
      restShadow.remove();
    }
  };
}
// [study:svg-controller:end]
