export interface LensGeometry {
  /** Lens half-width in CSS pixels. The visual width is lensW * 2. */
  lensW: number;
  /** Lens half-height in CSS pixels. The visual height is lensH * 2. */
  lensH: number;
  borderRadius: number;
  mapSize: number;
}

export interface GlassMaterial {
  depth: number;
  chromaAmount: number;
  scaleX: number;
  scaleY: number;
  blurAmount: number;
  sdfBoundary: boolean;
  edgeFalloff: boolean;
  brightness: number;
  specularStrength: number;
  specularRotation: number;
  glowStrength: number;
  glowSpread: number;
  glowExponent: number;
  tint: number;
  edgeStrength: number;
  edgeWidth: number;
  edgeExponent: number;
  specularDark: boolean;
  domeDepth: number;
  splayAmount: number;
  edgeShadow?: string;
  edgeInsetShadow?: string;
  restEdgeShadow?: string;
  restEdgeInsetShadow?: string;
}

export interface LensPosition {
  /** Lens centre relative to the refraction target's top-left corner. */
  x: number;
  y: number;
}

export interface LensMapResource {
  imageData: ImageData;
  dataUrl: string;
  signature: string;
  loopMs: number;
  encodeMs: number;
  dispose(): void;
}

export interface SurfaceMapResource {
  imageData: ImageData;
  signature: string;
}

export interface SvgGlassOptions {
  host: HTMLElement;
  target: HTMLElement;
  geometry: LensGeometry;
  /** Geometry baked into the map. Defaults to the displayed geometry. */
  mapGeometry?: LensGeometry;
  material: GlassMaterial;
  position: LensPosition;
  tintColor?: string;
  tintOpacity?: number;
  filterResolution?: number;
}

export interface SvgGlassUpdate {
  geometry?: Partial<LensGeometry>;
  mapGeometry?: Partial<LensGeometry>;
  material?: Partial<GlassMaterial>;
  position?: Partial<LensPosition>;
  tintColor?: string;
  tintOpacity?: number;
}

export interface SvgGlassController {
  update(next: SvgGlassUpdate): void;
  getMap(): LensMapResource;
  destroy(): void;
}

export interface WebGlLens extends LensPosition {
  id: string;
  geometry: LensGeometry;
  material: GlassMaterial;
  /** Circle is the default. Bar uses an analytical rounded-rect SDF. */
  shape?: 'circle' | 'bar';
  /** Per-lens geometric press scale. */
  pressScale?: number;
}

export interface WebGlRefractionOptions {
  canvas: HTMLCanvasElement;
  source: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement;
  lenses: WebGlLens[];
  blurAmount?: number;
  dpr?: number;
  /** Extra drawing-buffer oversampling. The video implementation uses 1.25. */
  canvasScale?: number;
  mapSize?: number;
  adaptStrength?: number;
  specLumaLow?: number;
  specLumaHigh?: number;
}

export interface WebGlRefractionController {
  render(): void;
  start(): void;
  stop(): void;
  resize(): void;
  updateLenses(lenses: WebGlLens[]): void;
  dispose(): void;
}

export interface SurfaceMapCircle {
  shape?: 'circle';
  cx: number;
  cy: number;
  radius: number;
  depthRatio?: number;
  domeDepth?: number;
  specularRotation?: number;
  glowStrength?: number;
  glowSpread?: number;
  glowExponent?: number;
  edgeStrength?: number;
  edgeWidth?: number;
  edgeExponent?: number;
}

export interface SurfaceMapRect {
  shape: 'rect';
  cx: number;
  cy: number;
  width: number;
  height: number;
  cornerRadius?: number;
  depthRatio?: number;
  domeDepth?: number;
  specularRotation?: number;
  glowStrength?: number;
  glowSpread?: number;
  glowExponent?: number;
  edgeStrength?: number;
  edgeWidth?: number;
  edgeExponent?: number;
}

export type SurfaceMapRegion = SurfaceMapCircle | SurfaceMapRect;

export interface SurfaceMapOptions {
  containerW: number;
  containerH: number;
  regions: SurfaceMapRegion[];
  depthRatio?: number;
  specularRotation?: number;
  glowStrength?: number;
  glowSpread?: number;
  glowExponent?: number;
  edgeStrength?: number;
  edgeWidth?: number;
  edgeExponent?: number;
  domeDepth?: number;
  mapSize?: number;
}

export const DEFAULT_GEOMETRY: LensGeometry = {
  lensW: 90,
  lensH: 60,
  borderRadius: 0,
  mapSize: 256
};

/** Exact zero-effect defaults used by the source AaveGlass implementation. */
export const DEFAULT_MATERIAL: GlassMaterial = {
  depth: 0,
  chromaAmount: 0,
  scaleX: 0,
  scaleY: 0,
  blurAmount: 0,
  sdfBoundary: false,
  edgeFalloff: false,
  brightness: 0,
  specularStrength: 0,
  specularRotation: 0,
  glowStrength: 0,
  glowSpread: 1,
  glowExponent: 1.5,
  tint: 0,
  edgeStrength: 0,
  edgeWidth: 3,
  edgeExponent: 1.5,
  specularDark: false,
  domeDepth: 0,
  splayAmount: 0
};
