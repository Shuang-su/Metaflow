import { computeDomeConstants, domeGradient, erf, imageSignature } from './math';
import type { GlassMaterial, LensGeometry, LensMapResource } from './types';

export interface LensPixelMapResource {
  canvas: HTMLCanvasElement;
  imageData: ImageData;
  loopMs: number;
  signature: string;
}

export interface LensPixelMapOptions {
  /**
   * WebGL lens maps use transparent neutral pixels outside the SDF. DOM/SVG
   * maps keep those pixels opaque because feImage is clipped by the filter.
   */
  transparentOutside?: boolean;
  /** Reuse the caller's canvas to avoid allocating one per animation frame. */
  canvas?: HTMLCanvasElement;
}

/**
 * Generates the displacement pixels shared by the DOM/SVG and WebGL paths.
 *
 * The algorithm writes one quadrant and mirrors it into the other three.
 * Mirroring is not only a speed optimisation: each quadrant receives different
 * R/G signs and a different directional B-channel specular value.
 */
// [study:lens-map:start]
export function generateLensMapPixels(
  geometry: LensGeometry,
  material: GlassMaterial,
  options: LensPixelMapOptions = {}
): LensPixelMapResource {
  const startedAt = performance.now();
  const { lensW, lensH } = geometry;
  const mapSize = Math.max(2, Math.round(geometry.mapSize / 2) * 2);
  const halfMap = mapSize >> 1;
  const canvas = options.canvas ?? document.createElement('canvas');
  canvas.width = mapSize;
  canvas.height = mapSize;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is required to generate a lens map');

  const imageData = context.createImageData(mapSize, mapSize);
  const pixels = imageData.data;
  const borderRadius = Math.min(geometry.borderRadius, lensW, lensH);
  const innerHalfW = Math.max(0, lensW - material.depth);
  const innerHalfH = Math.max(0, lensH - material.depth);
  const innerRadius = Math.max(
    0,
    Math.min(geometry.borderRadius, innerHalfW, innerHalfH)
  );
  const invSigma =
    material.depth > 0 ? 1 / (material.depth * Math.SQRT2) : 1e6;
  const hasSpecular =
    material.glowStrength > 0 || material.edgeStrength > 0;
  const rotation = (material.specularRotation * Math.PI) / 180;
  const directionX = Math.cos(rotation);
  const directionY = Math.sin(rotation);
  const spreadThreshold = (1 - material.glowSpread) * Math.SQRT2;
  const spreadRange = material.glowSpread * Math.SQRT2;
  const invSpread = spreadRange > 0.001 ? 1 / spreadRange : 0;
  const invEdgeWidth = material.edgeWidth > 0 ? 1 / material.edgeWidth : 0;
  const pixelWidth = (2 * lensW) / mapSize;
  const pixelHeight = (2 * lensH) / mapSize;
  const invLensW = 1 / lensW;
  const invLensH = 1 / lensH;
  const dome =
    material.domeDepth > 0
      ? computeDomeConstants(material.domeDepth, lensW, lensH)
      : undefined;
  const domeX = dome ? new Float32Array(halfMap) : undefined;
  const usesSplay = material.splayAmount < 1;
  const splayHalfExtent = 0.5 * Math.min(lensW, lensH);
  const invSplayHalfExtent =
    splayHalfExtent > 0 ? 1 / splayHalfExtent : 0;

  if (dome && domeX) {
    const radiusSquared = dome.Rx * dome.Rx;
    const maxPosition = 0.999 * dome.Rx;
    for (let column = 0; column < halfMap; column += 1) {
      const position = lensW - (column + 0.5) * pixelWidth;
      const bounded = Math.min(position, maxPosition);
      domeX[column] =
        (bounded / Math.sqrt(radiusSquared - bounded * bounded)) *
        dome.scaleX;
    }
  }

  const setPixel = (
    offset: number,
    red: number,
    green: number,
    blue: number,
    alpha = 255
  ) => {
    pixels[offset] = red;
    pixels[offset + 1] = green;
    pixels[offset + 2] = blue;
    pixels[offset + 3] = alpha;
  };

  for (let row = 0; row < halfMap; row += 1) {
    const mirroredRow = mapSize - 1 - row;
    const y = lensH - (row + 0.5) * pixelHeight;
    const outerY = y - lensH + borderRadius;
    const innerY = material.edgeFalloff ? y - innerHalfH + innerRadius : 0;
    const baseNormalY = dome
      ? domeGradient(y, dome.Ry, dome.scaleY)
      : Math.min(1, y * invLensH);
    const normalisedY = Math.min(1, y * invLensH);
    const splayY = usesSplay
      ? Math.max(0, 1 - (lensH - y) * invSplayHalfExtent)
      : 0;

    for (let column = 0; column < halfMap; column += 1) {
      const mirroredColumn = mapSize - 1 - column;
      const x = lensW - (column + 0.5) * pixelWidth;
      const outerX = x - lensW + borderRadius;
      const outsideX = Math.max(outerX, 0);
      const outsideY = Math.max(outerY, 0);
      const distance =
        Math.sqrt(outsideX * outsideX + outsideY * outsideY) +
        Math.min(Math.max(outerX, outerY), 0) -
        borderRadius;

      const topLeft = (row * mapSize + column) * 4;
      const topRight = (row * mapSize + mirroredColumn) * 4;
      const bottomLeft = (mirroredRow * mapSize + column) * 4;
      const bottomRight =
        (mirroredRow * mapSize + mirroredColumn) * 4;

      if (material.sdfBoundary && distance >= 0) {
        const alpha = options.transparentOutside ? 0 : 255;
        setPixel(topLeft, 128, 128, 128, alpha);
        setPixel(topRight, 128, 128, 128, alpha);
        setPixel(bottomLeft, 128, 128, 128, alpha);
        setPixel(bottomRight, 128, 128, 128, alpha);
        continue;
      }

      let normalX = domeX ? domeX[column] : Math.min(1, x * invLensW);
      let normalY = baseNormalY;

      if (usesSplay) {
        const amount = 1 - material.splayAmount;
        const suppressX = splayY * amount;
        const suppressY =
          Math.max(0, 1 - (lensW - x) * invSplayHalfExtent) * amount;
        if (suppressX > 0.001 || suppressY > 0.001) {
          const originalX = normalX;
          const originalY = normalY;
          normalX = originalX * (1 - suppressX);
          normalY = originalY * (1 - suppressY);
          const originalLength = Math.sqrt(
            originalX * originalX + originalY * originalY
          );
          const nextLength = Math.sqrt(
            normalX * normalX + normalY * normalY
          );
          if (nextLength > 0.001) {
            const correction = originalLength / nextLength;
            normalX *= correction;
            normalY *= correction;
          }
        }
      }

      let edgeMask = 1;
      if (material.edgeFalloff) {
        const innerX = x - innerHalfW + innerRadius;
        const positiveX = Math.max(innerX, 0);
        const positiveY = Math.max(innerY, 0);
        const innerDistance =
          Math.sqrt(positiveX * positiveX + positiveY * positiveY) +
          Math.min(Math.max(innerX, innerY), 0) -
          innerRadius;
        edgeMask = 0.5 * (1 + erf(innerDistance * invSigma));
      }

      const displacementX = 0.5 * normalX * edgeMask;
      const displacementY = 0.5 * normalY * edgeMask;
      const positiveR = ((0.5 + displacementX) * 255 + 0.5) | 0;
      const negativeR = ((0.5 - displacementX) * 255 + 0.5) | 0;
      const positiveG = ((0.5 + displacementY) * 255 + 0.5) | 0;
      const negativeG = ((0.5 - displacementY) * 255 + 0.5) | 0;

      let sameSignBlue = 128;
      let oppositeSignBlue = 128;
      if (hasSpecular) {
        const directionalX = Math.min(1, x * invLensW) * directionX;
        const directionalY = normalisedY * directionY;
        const sameSign = Math.abs(directionalX + directionalY);
        const oppositeSign = Math.abs(directionalX - directionalY);
        let edgeBand = 0;
        if (material.edgeStrength > 0) {
          edgeBand = distance < 0 ? 1 + distance * invEdgeWidth : 0;
          edgeBand = Math.max(0, edgeBand);
        }

        const specular = (directional: number) => {
          let value = 0;
          if (material.glowStrength > 0) {
            const glow = Math.max(
              0,
              Math.min(1, (directional - spreadThreshold) * invSpread)
            );
            value +=
              material.glowStrength *
              Math.pow(glow, material.glowExponent) *
              edgeMask;
          }
          if (material.edgeStrength > 0) {
            value +=
              material.edgeStrength *
              edgeBand *
              Math.pow(directional, material.edgeExponent);
          }
          return ((127 * Math.min(1, value) + 128 + 0.5) | 0);
        };

        sameSignBlue = specular(sameSign);
        oppositeSignBlue = specular(oppositeSign);
      }

      setPixel(topLeft, positiveR, positiveG, sameSignBlue);
      setPixel(topRight, negativeR, positiveG, oppositeSignBlue);
      setPixel(bottomLeft, positiveR, negativeG, oppositeSignBlue);
      setPixel(bottomRight, negativeR, negativeG, sameSignBlue);
    }
  }

  const loopMs = performance.now() - startedAt;
  context.putImageData(imageData, 0, 0);
  return {
    canvas,
    imageData,
    signature: imageSignature(pixels),
    loopMs
  };
}

/** Encodes the exact DOM/SVG lens map as a PNG data URL for feImage. */
export function generateLensMap(
  geometry: LensGeometry,
  material: GlassMaterial
): LensMapResource {
  const pixelMap = generateLensMapPixels(geometry, material);
  const encodeStartedAt = performance.now();
  const dataUrl = pixelMap.canvas.toDataURL('image/png');
  const encodeMs = performance.now() - encodeStartedAt;

  return {
    imageData: pixelMap.imageData,
    dataUrl,
    signature: pixelMap.signature,
    loopMs: pixelMap.loopMs,
    encodeMs,
    dispose() {
      pixelMap.canvas.width = 0;
      pixelMap.canvas.height = 0;
    }
  };
}
// [study:lens-map:end]
