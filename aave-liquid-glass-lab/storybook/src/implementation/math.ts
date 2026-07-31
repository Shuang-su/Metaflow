export const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

/**
 * This intentionally matches the compact approximation used by Aave.
 * Changing it to a more accurate erf implementation changes the 8-bit map.
 */
export function erf(value: number): number {
  return Math.tanh(1.7724538509 * value);
}

export interface DomeConstants {
  Rx: number;
  Ry: number;
  scaleX: number;
  scaleY: number;
}

function integrateDome(radius: number, halfExtent: number): number {
  let sum = 0;
  for (let index = 0; index <= 200; index += 1) {
    const position = (index / 200) * halfExtent;
    const gradient = position / Math.sqrt(radius * radius - position * position);
    sum += index === 0 || index === 200 ? gradient * 0.5 : gradient;
  }
  return sum / 200;
}

export function computeDomeConstants(
  domeDepth: number,
  halfWidth: number,
  halfHeight: number
): DomeConstants {
  const depth = Math.max(
    0.01,
    Math.min(domeDepth, Math.min(halfWidth, halfHeight) - 1)
  );
  const Rx = (halfWidth * halfWidth + depth * depth) / (2 * depth);
  const Ry = (halfHeight * halfHeight + depth * depth) / (2 * depth);
  const integralX = integrateDome(Rx, halfWidth);
  const integralY = integrateDome(Ry, halfHeight);

  return {
    Rx,
    Ry,
    scaleX: integralX > 0 ? 0.5 / integralX : 1,
    scaleY: integralY > 0 ? 0.5 / integralY : 1
  };
}

export function domeGradient(position: number, radius: number, scale: number): number {
  const bounded = Math.min(position, 0.999 * radius);
  return (bounded / Math.sqrt(radius * radius - bounded * bounded)) * scale;
}

export function roundedRectSdf(
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  borderRadius: number
): number {
  const qx = Math.abs(x) - halfWidth + borderRadius;
  const qy = Math.abs(y) - halfHeight + borderRadius;
  const outsideX = Math.max(qx, 0);
  const outsideY = Math.max(qy, 0);
  return (
    Math.sqrt(outsideX * outsideX + outsideY * outsideY) +
    Math.min(Math.max(qx, qy), 0) -
    borderRadius
  );
}

export function imageSignature(data: Uint8ClampedArray): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < data.length; index += 1) {
    hash ^= data[index];
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
