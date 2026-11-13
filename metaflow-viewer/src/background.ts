/** Shared screen-space background contract. Values are sRGB, positions are normalized. */
export type RGB = [number, number, number];
export type GradientStop = { position: number; color: RGB; opacity?: number };
export type BackgroundGradient = {
    topColor: RGB;
    horizonColor?: RGB;
    bottomColor: RGB;
    horizonStop?: number;
    bottomStop?: number;
    type?: 'linear' | 'radial';
    stops?: GradientStop[];
    angle?: number;
    center?: [number, number];
    radius?: [number, number];
};
export type Background = { color: RGB; gradient?: BackgroundGradient };
export type BackgroundFill = Background & { rememberedGradient?: BackgroundGradient };
export const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const finite = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
export const normalizeColor = (v: RGB): RGB => [0, 1, 2].map((i) => clamp(finite(v?.[i], 0))) as RGB;
export const normalizeGradient = (g: BackgroundGradient): BackgroundGradient => ({
    ...g,
    type: g.type === 'radial' ? 'radial' : 'linear',
    angle: finite(g.angle, 180),
    center: [clamp(finite(g.center?.[0], 0.5)), clamp(finite(g.center?.[1], 0.5))],
    radius: [clamp(finite(g.radius?.[0], 0.5), 0.001, 4), clamp(finite(g.radius?.[1], 0.5), 0.001, 4)],
    stops: (g.stops?.length >= 2
        ? g.stops
        : [
              { position: 0, color: g.topColor },
              { position: clamp(g.horizonStop ?? 0.55), color: g.horizonColor ?? g.bottomColor },
              { position: clamp(g.bottomStop ?? 1), color: g.bottomColor }
          ]
    )
        .map((s) => ({
            position: clamp(finite(s.position, 0)),
            color: normalizeColor(s.color),
            opacity: clamp(finite(s.opacity, 1))
        }))
        .sort((a, b) => a.position - b.position)
});
export const defaultGradient = (color: RGB): BackgroundGradient =>
    normalizeGradient({
        topColor: color,
        bottomColor: [1, 1, 1],
        type: 'linear',
        angle: 180,
        stops: [
            { position: 0, color },
            { position: 1, color: [1, 1, 1] }
        ]
    });
export const gradientPosition = (gradient: BackgroundGradient, x: number, y: number, width = 1, height = 1) => {
    const g = normalizeGradient(gradient);
    if (g.type === 'radial') return Math.hypot((x - g.center[0]) / g.radius[0], (y - g.center[1]) / g.radius[1]);
    const a = (g.angle * Math.PI) / 180,
        dx = Math.sin(a),
        dy = -Math.cos(a);
    return 0.5 + ((x - 0.5) * width * dx + (y - 0.5) * height * dy) / (Math.abs(dx) * width + Math.abs(dy) * height);
};
/** Alpha is resolved against the base before interpolation, including partial-opacity stops. */
export const sampleRamp = (g: BackgroundGradient, base: RGB, t: number): RGB => {
    base = normalizeColor(base);
    const stops = g.stops;
    let b = stops.findIndex((s) => s.position > t);
    if (b < 0) b = stops.length;
    const left = stops[Math.max(0, b - 1)],
        right = stops[Math.min(stops.length - 1, b)];
    const f = left === right ? 0 : clamp((t - left.position) / Math.max(1e-10, right.position - left.position));
    return base.map((c, i) => {
        const l = left.color[i] * (left.opacity ?? 1) + c * (1 - (left.opacity ?? 1));
        const r = right.color[i] * (right.opacity ?? 1) + c * (1 - (right.opacity ?? 1));
        return l + (r - l) * f;
    }) as RGB;
};
export const sampleBackground = (bg: Background, x: number, y: number, w = 1, h = 1): RGB =>
    bg.gradient
        ? sampleRamp(normalizeGradient(bg.gradient), bg.color, gradientPosition(bg.gradient, x, y, w, h))
        : normalizeColor(bg.color);
/** Keep legacy three-colour readers useful without rewriting existing legacy settings. */
export const exportBackground = (bg: Background): Background => {
    if (!bg.gradient) return { color: [...bg.color] };
    const g = normalizeGradient(bg.gradient);
    return {
        color: [...bg.color],
        gradient: {
            ...g,
            topColor: sampleBackground(bg, 0.5, 0),
            horizonColor: sampleBackground(bg, 0.5, 0.55),
            bottomColor: sampleBackground(bg, 0.5, 1),
            horizonStop: 0.55,
            bottomStop: 1
        }
    };
};
export const cssColor = (input: RGB) =>
    `rgb(${normalizeColor(input)
        .map((v) => Math.round(clamp(v) * 255))
        .join(' ')})`;
export const backgroundCss = (bg: Background) => {
    if (!bg.gradient) return cssColor(bg.color);
    const g = normalizeGradient(bg.gradient);
    const stops = g.stops
        .map(
            (s) =>
                `${cssColor(s.color.map((v, i) => v * s.opacity + bg.color[i] * (1 - s.opacity)) as RGB)} ${s.position * 100}%`
        )
        .join(', ');
    return g.type === 'radial'
        ? `radial-gradient(ellipse ${g.radius[0] * 100}% ${g.radius[1] * 100}% at ${g.center[0] * 100}% ${g.center[1] * 100}%, ${stops})`
        : `linear-gradient(${g.angle}deg, ${stops})`;
};
