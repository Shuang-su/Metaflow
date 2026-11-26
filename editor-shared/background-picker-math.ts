import { clamp, RGB } from '../metaflow-viewer/src/background';

export type HSV = [number, number, number];

// Hue and saturation are editing state: black/grey must not reset the user's hue.
export function rgbToHsv(rgb: RGB, previous: HSV = [0, 0, 0]): HSV {
    const [r, g, b] = rgb;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    let h = previous[0];
    if (delta > 0) {
        h = (max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) / 6;
        h = (h + 1) % 1;
        if (h === 0 && previous[0] === 1) h = 1;
    }
    return [h, max === 0 ? previous[1] : delta / max, max];
}

export function hsvToRgb([h, s, v]: HSV): RGB {
    const channel = (n: number) => {
        const k = (n + h * 6) % 6;
        return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    };
    return [channel(5), channel(3), channel(1)];
}

export function scrubSpeed(verticalOffset: number): number {
    return verticalOffset <= -32 ? 2 : verticalOffset >= 64 ? 0.25 : verticalOffset >= 32 ? 0.5 : 1;
}

export function scrubValue(value: number, dx: number, dy: number, min: number, max: number): number {
    return clamp(value + dx * scrubSpeed(dy), min, max);
}
