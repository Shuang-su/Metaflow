import {
  clamp,
  computeDomeConstants,
  domeGradient,
  erf,
  imageSignature
} from './math';
import type {
  SurfaceMapOptions,
  SurfaceMapRegion,
  SurfaceMapResource
} from './types';

interface PreparedRegion {
  isRect: boolean;
  cx: number;
  cy: number;
  halfWidth: number;
  halfHeight: number;
  minHalf: number;
  cornerRadius: number;
  depth: number;
  innerHalf: number;
  invSigma: number;
  dome?: ReturnType<typeof computeDomeConstants>;
  directionX: number;
  directionY: number;
  glowStrength: number;
  glowExponent: number;
  edgeStrength: number;
  edgeWidth: number;
  edgeExponent: number;
  hasSpecular: boolean;
  spreadThreshold: number;
  spreadRange: number;
}

function prepareRegion(
  region: SurfaceMapRegion,
  defaults: Required<
    Pick<
      SurfaceMapOptions,
      | 'depthRatio'
      | 'specularRotation'
      | 'glowStrength'
      | 'glowSpread'
      | 'glowExponent'
      | 'edgeStrength'
      | 'edgeWidth'
      | 'edgeExponent'
      | 'domeDepth'
    >
  >
): PreparedRegion {
  const isRect = region.shape === 'rect';
  const halfWidth = isRect ? region.width / 2 : region.radius;
  const halfHeight = isRect ? region.height / 2 : region.radius;
  const minHalf = Math.min(halfWidth, halfHeight);
  const cornerRadius = isRect
    ? region.cornerRadius ?? minHalf
    : 0;
  const depth = minHalf * (region.depthRatio ?? defaults.depthRatio);
  const innerHalf = Math.max(0, minHalf - depth);
  const domeDepth = region.domeDepth ?? defaults.domeDepth;
  const dome =
    !isRect && domeDepth > 0
      ? computeDomeConstants(domeDepth, halfWidth, halfWidth)
      : undefined;
  const rotation =
    ((region.specularRotation ?? defaults.specularRotation) * Math.PI) /
    180;
  const glowStrength = region.glowStrength ?? defaults.glowStrength;
  const glowSpread = region.glowSpread ?? defaults.glowSpread;
  const edgeStrength = region.edgeStrength ?? defaults.edgeStrength;

  return {
    isRect,
    cx: region.cx,
    cy: region.cy,
    halfWidth,
    halfHeight,
    minHalf,
    cornerRadius,
    depth,
    innerHalf,
    invSigma: depth > 0 ? 1 / (depth * Math.SQRT2) : 1e6,
    dome,
    directionX: Math.cos(rotation),
    directionY: Math.sin(rotation),
    glowStrength,
    glowExponent: region.glowExponent ?? defaults.glowExponent,
    edgeStrength,
    edgeWidth: region.edgeWidth ?? defaults.edgeWidth,
    edgeExponent: region.edgeExponent ?? defaults.edgeExponent,
    hasSpecular: glowStrength > 0 || edgeStrength > 0,
    spreadThreshold: glowStrength > 0 ? (1 - glowSpread) * Math.SQRT2 : 0,
    spreadRange: glowStrength > 0 ? glowSpread * Math.SQRT2 : 0
  };
}

/**
 * Generates a bbox-local map for canvas/video surfaces.
 *
 * Unlike the DOM map, pixels outside all regions use alpha 0 so overlapping
 * circle and bar regions can be composed without a second mask texture.
 */
export function generateSurfaceMap(
  options: SurfaceMapOptions
): SurfaceMapResource | null {
  const {
    containerW,
    containerH,
    regions,
    mapSize = 512
  } = options;
  if (containerW <= 0 || containerH <= 0) return null;

  const mapWidth = Math.max(1, Math.round(mapSize));
  const mapHeight = Math.max(
    1,
    Math.round((containerH / containerW) * mapWidth)
  );
  const imageData = new ImageData(mapWidth, mapHeight);
  const pixels = imageData.data;
  const defaults = {
    depthRatio: options.depthRatio ?? 0.125,
    specularRotation: options.specularRotation ?? 45,
    glowStrength: options.glowStrength ?? 0,
    glowSpread: options.glowSpread ?? 1,
    glowExponent: options.glowExponent ?? 1.5,
    edgeStrength: options.edgeStrength ?? 0,
    edgeWidth: options.edgeWidth ?? 3,
    edgeExponent: options.edgeExponent ?? 1.5,
    domeDepth: options.domeDepth ?? 0
  };
  const prepared = regions.map(region => prepareRegion(region, defaults));

  for (let row = 0; row < mapHeight; row += 1) {
    for (let column = 0; column < mapWidth; column += 1) {
      const offset = (row * mapWidth + column) * 4;
      const x = ((column + 0.5) / mapWidth) * containerW;
      const y = ((row + 0.5) / mapHeight) * containerH;
      let matched = false;

      for (const region of prepared) {
        const localX = x - region.cx;
        const localY = y - region.cy;
        if (
          Math.abs(localX) > region.halfWidth + region.depth ||
          Math.abs(localY) > region.halfHeight + region.depth
        ) {
          continue;
        }

        let distance: number;
        let mapNormalX: number;
        let mapNormalY: number;
        let directionalX: number;
        let directionalY: number;

        if (region.isRect) {
          const qx =
            Math.abs(localX) - region.halfWidth + region.cornerRadius;
          const qy =
            Math.abs(localY) - region.halfHeight + region.cornerRadius;
          const outsideX = Math.max(qx, 0);
          const outsideY = Math.max(qy, 0);
          const outsideLength = Math.sqrt(
            outsideX * outsideX + outsideY * outsideY
          );
          distance =
            outsideLength +
            Math.min(Math.max(qx, qy), 0) -
            region.cornerRadius;
          if (distance >= 0) continue;

          let normalX: number;
          let normalY: number;
          if (qx > 0 || qy > 0) {
            normalX =
              (outsideX / Math.max(outsideLength, 1e-6)) *
              Math.sign(localX);
            normalY =
              (outsideY / Math.max(outsideLength, 1e-6)) *
              Math.sign(localY);
          } else if (qx > qy) {
            normalX = Math.sign(localX);
            normalY = 0;
          } else {
            normalX = 0;
            normalY = Math.sign(localY);
          }
          const radial =
            region.minHalf > 0
              ? clamp((region.minHalf + distance) / region.minHalf)
              : 0;
          mapNormalX = normalX * radial;
          mapNormalY = normalY * radial;
          directionalX = mapNormalX;
          directionalY = mapNormalY;
        } else {
          const radius = Math.sqrt(
            localX * localX + localY * localY
          );
          distance = radius - region.halfWidth;
          if (distance >= 0) continue;
          directionalX = clamp(localX / region.halfWidth, -1, 1);
          directionalY = clamp(localY / region.halfWidth, -1, 1);

          if (region.dome && radius > 0.001) {
            const gradient = domeGradient(
              radius,
              region.dome.Rx,
              region.dome.scaleX
            );
            mapNormalX = (localX / radius) * gradient;
            mapNormalY = (localY / radius) * gradient;
          } else {
            mapNormalX = directionalX;
            mapNormalY = directionalY;
          }
        }

        const distanceFromInnerEdge = distance + region.depth;
        const edgeMask =
          0.5 * (1 + erf(distanceFromInnerEdge * region.invSigma));
        pixels[offset] = Math.round(
          clamp((0.5 - 0.5 * mapNormalX * edgeMask) * 255, 0, 255)
        );
        pixels[offset + 1] = Math.round(
          clamp((0.5 - 0.5 * mapNormalY * edgeMask) * 255, 0, 255)
        );

        if (region.hasSpecular) {
          const directional = Math.abs(
            directionalX * region.directionX +
              directionalY * region.directionY
          );
          let specular = 0;
          if (region.glowStrength > 0) {
            const glow =
              region.spreadRange > 0.001
                ? clamp(
                    (directional - region.spreadThreshold) /
                      region.spreadRange
                  )
                : 0;
            specular +=
              region.glowStrength *
              Math.pow(glow, region.glowExponent) *
              edgeMask;
          }
          if (region.edgeStrength > 0) {
            const edge =
              distance < 0
                ? Math.max(0, 1 + distance / region.edgeWidth)
                : 0;
            specular +=
              region.edgeStrength *
              edge *
              Math.pow(directional, region.edgeExponent);
          }
          pixels[offset + 2] = Math.round(
            127 * Math.min(1, specular) + 128
          );
        } else {
          pixels[offset + 2] = 128;
        }
        pixels[offset + 3] = 255;
        matched = true;
        break;
      }

      if (!matched) {
        pixels[offset] = 128;
        pixels[offset + 1] = 128;
        pixels[offset + 2] = 128;
        pixels[offset + 3] = 0;
      }
    }
  }

  return {
    imageData,
    signature: imageSignature(pixels)
  };
}
