import QRCode from 'qrcode';
import type { QRCodeErrorCorrectionLevel } from 'qrcode';
import type { QrEyeLayer, QrScene } from './qr-refraction';

const LOGO_FRACTION: Record<QRCodeErrorCorrectionLevel, number> = {
  low: 0.07,
  medium: 0.15,
  quartile: 0.25,
  high: 0.3,
  L: 0.07,
  M: 0.15,
  Q: 0.25,
  H: 0.3
};

export interface CreateQrSceneOptions {
  value?: string;
  size?: number;
  errorCorrectionLevel?: QRCodeErrorCorrectionLevel;
  reserveLogo?: boolean;
  dotColor?: string;
  backgroundColor?: string;
}

/**
 * Converts the QR matrix into the exact GPU inputs used by the WebGL shader.
 * Finder eyes are removed from the occupancy texture because they are evaluated
 * analytically as three nested rounded-rect SDFs.
 */
// [study:qr-scene:start]
export function createQrScene({
  value = 'https://aave.com',
  size = 300,
  errorCorrectionLevel = 'Q',
  reserveLogo = true,
  dotColor = 'var(--fg-max, #17171d)',
  backgroundColor = 'var(--bg-max, #ffffff)'
}: CreateQrSceneOptions = {}): QrScene {
  const qr = QRCode.create(value, { errorCorrectionLevel });
  const matrixLength = qr.modules.size;
  const usableSize = size - 20;
  const cellSize = usableSize / matrixLength;
  const occupancy = new Uint8Array(matrixLength * matrixLength);
  const eyes: QrEyeLayer[] = [];

  const finderPositions = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 }
  ];
  for (const finder of finderPositions) {
    const originX =
      (matrixLength - 7) * cellSize * finder.x + 10;
    const originY =
      (matrixLength - 7) * cellSize * finder.y + 10;
    for (let layer = 0; layer < 3; layer += 1) {
      eyes.push({
        x: originX + cellSize * layer,
        y: originY + cellSize * layer,
        width: cellSize * (7 - 2 * layer),
        height: cellSize * (7 - 2 * layer),
        radius: -((layer - 2) * 10) + (layer === 0 ? 2 : 3)
      });
    }
  }

  const logoSize = reserveLogo
    ? LOGO_FRACTION[errorCorrectionLevel] * usableSize
    : 0;
  const logoModules = Math.floor((1.5 * logoSize) / cellSize);
  const logoStart = matrixLength / 2 - logoModules / 2;
  const logoEnd = matrixLength / 2 + logoModules / 2 - 1;

  for (let row = 0; row < matrixLength; row += 1) {
    for (let column = 0; column < matrixLength; column += 1) {
      if (!qr.modules.get(row, column)) continue;
      const inFinder =
        (row < 7 && column < 7) ||
        (row > matrixLength - 8 && column < 7) ||
        (row < 7 && column > matrixLength - 8);
      const inLogo =
        reserveLogo &&
        row > logoStart &&
        row < logoEnd &&
        column > logoStart &&
        column < logoEnd;
      if (inFinder || inLogo) continue;

      // The source matrix is intentionally transposed into texture x/y.
      occupancy[column * matrixLength + row] = 255;
    }
  }

  return {
    size,
    occupancy,
    matrixLength,
    gridOriginUv: 10 / size,
    cellUv: cellSize / size,
    dotRadius: cellSize / 2.85 / size,
    eyes,
    dotColor,
    backgroundColor
  };
}
// [study:qr-scene:end]
