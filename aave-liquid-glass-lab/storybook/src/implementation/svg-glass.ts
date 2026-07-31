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
  mapMatrix?: SVGFEColorMatrixElement;
  displacements: SVGFEDisplacementMapElement[];
}

interface TargetState {
  element: HTMLElement;
  previousFilter: string;
  previousWillChange: string;
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

  if (material.blurAmount > 0 && rich) {
    filter.append(
      svgElement('feGaussianBlur', {
        in: 'SourceGraphic',
        stdDeviation: material.blurAmount / 100,
        result: 'blurred'
      })
    );
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
          in: 'rawMap',
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
  height: number
): void {
  // The half-pixel inset aligns the primitive region with the raster map's
  // pixel centres and matches the source implementation's filter bounds.
  const alignedLeft = left + 0.5;
  const alignedTop = top + 0.5;
  const alignedWidth = Math.max(0, width - 1);
  const alignedHeight = Math.max(0, height - 1);
  const x = alignedLeft / targetWidth;
  const y = alignedTop / targetHeight;
  const w = alignedWidth / targetWidth;
  const h = alignedHeight / targetHeight;
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
  let map = generateLensMap(mapGeometry, material);
  let mapKey = JSON.stringify([mapGeometry, mapMaterialKey(material)]);
  let graphKey = filterMaterialKey(material);
  let version = 0;
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

  const shell = document.createElement('div');
  shell.className = 'aave-glass-visual-shell';
  shell.setAttribute('aria-hidden', 'true');
  Object.assign(shell.style, {
    position: 'absolute',
    zIndex: '4',
    pointerEvents: 'none',
    boxSizing: 'border-box',
    willChange: 'transform'
  });

  const brightness = document.createElement('div');
  brightness.className = 'aave-glass-brightness';
  Object.assign(brightness.style, {
    position: 'absolute',
    inset: '0',
    pointerEvents: 'none',
    borderRadius: 'inherit'
  });
  shell.append(brightness);

  const targetStates = new Map<HTMLElement, TargetState>();
  const rememberTarget = (element: HTMLElement): TargetState => {
    const existing = targetStates.get(element);
    if (existing) return existing;
    const state = {
      element,
      previousFilter: element.style.filter,
      previousWillChange: element.style.willChange
    };
    targetStates.set(element, state);
    return state;
  };
  const clearTargets = () => {
    for (const state of targetStates.values()) {
      state.element.style.filter = state.previousFilter;
      state.element.style.willChange = state.previousWillChange;
    }
  };

  options.host.dataset.aaveGlassContainer = '';
  options.target.dataset.refractionTarget = '';
  options.host.append(svg, shell);
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

  const sync = (forceMap = false) => {
    const nextMapKey = JSON.stringify([
      mapGeometry,
      mapMaterialKey(material)
    ]);
    const nextGraphKey = filterMaterialKey(material);
    const mapChanged = forceMap || nextMapKey !== mapKey;
    const graphChanged = mapChanged || nextGraphKey !== graphKey;
    if (mapChanged) {
      map.dispose();
      map = generateLensMap(mapGeometry, material);
      mapKey = nextMapKey;
    }
    if (graphChanged) {
      graphKey = nextGraphKey;
      version += 1;
      refreshGraphs();
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
        lensHeight
      );
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
        lensHeight
      );
    });

    const shellLeft = position.x - geometry.lensW;
    const shellTop = position.y - geometry.lensH;
    const radius = Math.min(
      geometry.borderRadius,
      geometry.lensW,
      geometry.lensH
    );
    shell.style.left = `${shellLeft}px`;
    shell.style.top = `${shellTop}px`;
    shell.style.width = `${lensWidth}px`;
    shell.style.height = `${lensHeight}px`;
    shell.style.borderRadius = `${radius}px`;
    shell.style.background =
      material.tint === 0 && tintOpacity === 0
        ? 'transparent'
        : material.tint < 0
          ? `rgb(0 0 0 / ${Math.max(tintOpacity, Math.abs(material.tint))})`
          : `color-mix(in srgb, ${tintColor} ${Math.max(tintOpacity, Math.abs(material.tint)) * 100}%, transparent)`;
    shell.style.boxShadow = [
      material.edgeShadow,
      material.edgeInsetShadow ? `inset ${material.edgeInsetShadow}` : undefined
    ]
      .filter(Boolean)
      .join(', ');
    shell.style.maskImage = roundedRectMaskUri(
      lensWidth,
      lensHeight,
      radius
    );
    shell.style.webkitMaskImage = shell.style.maskImage;
    shell.style.maskSize = '100% 100%';
    shell.style.webkitMaskSize = '100% 100%';

    brightness.style.background =
      material.brightness > 0 ? 'white' : 'black';
    brightness.style.opacity = String(Math.abs(material.brightness));
  };

  sync(true);
  const resizeObserver = new ResizeObserver(() => sync());
  resizeObserver.observe(options.host);
  resizeObserver.observe(options.target);

  return {
    update(next: SvgGlassUpdate) {
      if (next.geometry) {
        geometry = { ...geometry, ...next.geometry };
        if (mapGeometryFollowsGeometry && !next.mapGeometry) {
          mapGeometry = { ...mapGeometry, ...next.geometry };
        }
      }
      if (next.mapGeometry) {
        mapGeometry = { ...mapGeometry, ...next.mapGeometry };
        mapGeometryFollowsGeometry = false;
      }
      if (next.material) material = { ...material, ...next.material };
      if (next.position) position = { ...position, ...next.position };
      if (next.tintColor !== undefined) tintColor = next.tintColor;
      if (next.tintOpacity !== undefined) tintOpacity = next.tintOpacity;
      sync();
    },
    getMap() {
      return map;
    },
    destroy() {
      resizeObserver.disconnect();
      clearTargets();
      map.dispose();
      delete options.host.dataset.aaveGlassContainer;
      delete options.target.dataset.refractionTarget;
      svg.remove();
      shell.remove();
    }
  };
}
// [study:svg-controller:end]
