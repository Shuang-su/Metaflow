// Metaflow SP f3c2d6114ca0e8c7de0dd633db685dab59f0e18c · navigation/map-window-layout.ts
export type Box = { left: number; top: number; right: number; bottom: number };
export type WindowRect = { x: number; y: number; width: number; height: number };
export type EdgePosition = { horizontal: 'left' | 'right'; vertical: 'top' | 'bottom'; x: number; y: number };
export type WindowPreference = { width: number | null; u: number; v: number; edge?: EdgePosition };
export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';
export type ResizeAnchor = { x: number; y: number; corner?: ResizeCorner };
export const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(Math.max(low, high), n));

/** Actual external hit targets: 44px corner at -23px, 48px grip at -27px. */
export function mapHandleInsets(corner: ResizeCorner) {
    return { left: corner.endsWith('w') ? 23 : 0, right: corner.endsWith('e') ? 23 : 0,
        top: 27, bottom: corner.startsWith('s') ? 23 : 0 };
}

export function mapEdgePosition(rect: WindowRect, bounds: Box): EdgePosition {
    const left = rect.x - bounds.left, right = bounds.right - rect.x - rect.width;
    const top = rect.y - bounds.top, bottom = bounds.bottom - rect.y - rect.height;
    return { horizontal: left <= right ? 'left' : 'right', vertical: top <= bottom ? 'top' : 'bottom',
        x: Math.max(0, Math.min(left, right)), y: Math.max(0, Math.min(top, bottom)) };
}

export function mapPositionFromEdge(edge: EdgePosition, bounds: Box, width: number, height: number) {
    return { x: edge.horizontal === 'left' ? bounds.left + edge.x : bounds.right - edge.x - width,
        y: edge.vertical === 'top' ? bounds.top + edge.y : bounds.bottom - edge.y - height };
}

export function resizeDirection(corner: ResizeCorner): [number, number] {
    return [corner.endsWith('w') ? -1 : 1, corner.startsWith('n') ? -1 : 1];
}

export function resizeAnchor(rect: WindowRect, corner: ResizeCorner): ResizeAnchor {
    const [sx, sy] = resizeDirection(corner);
    return { x: rect.x + (sx < 0 ? rect.width : 0), y: rect.y + (sy < 0 ? rect.height : 0), corner };
}

export function resizedMapWindow(rect: WindowRect, width: number, corner: ResizeCorner, extra = rect.height - rect.width): WindowRect {
    const anchor = resizeAnchor(rect, corner), [sx, sy] = resizeDirection(corner), height = width + extra;
    return { x: anchor.x - (sx < 0 ? width : 0), y: anchor.y - (sy < 0 ? height : 0), width, height };
}

/** Face the screen center. The dead band avoids flipping when a window rests near a midline. */
export function mapResizeCorner(rect: WindowRect, bounds: Box, previous: ResizeCorner = 'nw'): ResizeCorner {
    const dx = rect.x + rect.width / 2 - (bounds.left + bounds.right) / 2;
    const dy = rect.y + rect.height / 2 - (bounds.top + bounds.bottom) / 2;
    return `${dy > 32 ? 'n' : dy < -32 ? 's' : previous[0]}${dx > 32 ? 'w' : dx < -32 ? 'e' : previous[1]}` as ResizeCorner;
}

/** Overlapping maximal empty rectangles allow a panel to sit beside a turn card. */
export function freeMapRegions(bounds: Box, obstacles: Box[]): Box[] {
    let regions = [bounds];
    for (const o of obstacles) {
        regions = regions.flatMap(b => {
            if (o.right <= b.left || o.left >= b.right || o.bottom <= b.top || o.top >= b.bottom) return [b];
            return [
                { ...b, right: Math.min(b.right, o.left) },
                { ...b, left: Math.max(b.left, o.right) },
                { ...b, bottom: Math.min(b.bottom, o.top) },
                { ...b, top: Math.max(b.top, o.bottom) }
            ].filter(r => r.right > r.left && r.bottom > r.top);
        });
    }
    return regions.filter((b, i) => !regions.some((a, j) => j !== i && a.left <= b.left && a.top <= b.top &&
        a.right >= b.right && a.bottom >= b.bottom && (j < i || a.left < b.left || a.top < b.top || a.right > b.right || a.bottom > b.bottom)));
}

export function mapWindowRect(bounds: Box, regions: Box[], wanted: WindowRect, minWidth: number,
    anchor?: ResizeAnchor): WindowRect {
    const [sx, sy] = resizeDirection(anchor?.corner ?? 'nw');
    const fits = regions.map(b => {
        const extra = wanted.height - wanted.width;
        const fixed = anchor && anchor.x <= b.right + .5 && anchor.y <= b.bottom + .5 && anchor.x >= b.left - .5 && anchor.y >= b.top - .5;
        if (anchor && !fixed) return null;
        const spaceX = fixed ? (sx < 0 ? anchor.x - b.left : b.right - anchor.x) : b.right - b.left;
        const spaceY = fixed ? (sy < 0 ? anchor.y - b.top : b.bottom - anchor.y) : b.bottom - b.top;
        const capacity = Math.min(spaceX, spaceY - extra, 480);
        if (capacity < minWidth) return null;
        const width = clamp(wanted.width, minWidth, capacity), height = width + extra;
        const x = fixed ? anchor.x - (sx < 0 ? width : 0) : clamp(wanted.x, b.left, b.right - width);
        const y = fixed ? anchor.y - (sy < 0 ? height : 0) : clamp(wanted.y, b.top, b.bottom - height);
        return { x, y, width, height, score: Math.hypot(x - wanted.x, y - wanted.y) + Math.abs(width - wanted.width) * 4 + (width < minWidth ? 10000 : 0) };
    }).filter((r): r is WindowRect & { score: number } => !!r);
    fits.sort((a, b) => a.score - b.score);
    if (fits[0]) { const { score, ...rect } = fits[0]; return rect; }
    // A viewport change can invalidate the drag anchor; constrain it afresh.
    if (anchor) return mapWindowRect(bounds, regions, wanted, minWidth);
    // No readable non-overlapping placement. The host switches to its map panel.
    return { x: bounds.left, y: bounds.top, width: 0, height: 0 };
}

export function relativeMapPosition(rect: WindowRect, bounds: Box) {
    return {
        u: clamp((rect.x - bounds.left) / Math.max(1, bounds.right - bounds.left - rect.width), 0, 1),
        v: clamp((rect.y - bounds.top) / Math.max(1, bounds.bottom - bounds.top - rect.height), 0, 1)
    };
}

export function mapBackingSize(cssWidth: number, dpr: number) {
    return Math.max(1, Math.round(cssWidth * clamp(dpr || 1, 1, 2)));
}
