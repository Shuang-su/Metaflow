import { Vec3, Vec4, Mat4 } from 'playcanvas';

import type { OverlayMode } from './document';
import { drawHotspot, HOTSPOT_SIZE } from './viewer-compat/hotspot-drawing';
import type { Annotation } from '../../../metaflow-viewer/src/settings';

export type Projected = { index: number; x: number; y: number; annotation: Annotation };
export const projectAnnotations = (annotations: Annotation[], viewProjection: Mat4, width: number, height: number): Projected[] => {
    const clip = new Vec4();
    return annotations.flatMap((annotation, index) => {
        clip.set(...annotation.position, 1);
        viewProjection.transformVec4(clip, clip);
        if (clip.w <= 0 || Math.abs(clip.x) > clip.w || Math.abs(clip.y) > clip.w) return [];
        return [{ index, x: (clip.x / clip.w + 1) * width / 2, y: (1 - clip.y / clip.w) * height / 2, annotation }];
    });
};
/** Viewer placement: flip left at the right edge before clamping to the viewport. */
export const placeAnnotationCard = (x: number, y: number, cardWidth: number, cardHeight: number, width: number, height: number, bottomInset = 8) => {
    const gap = 25, margin = 8;
    const flipped = x + gap + cardWidth > width - margin;
    const left = Math.max(margin, Math.min(flipped ? x - gap - cardWidth : x + gap, width - cardWidth - margin));
    const top = Math.max(margin, Math.min(y - cardHeight / 2, height - cardHeight - bottomInset));
    return { left, top, flipped };
};
export const wrapText = (text: string, measure: (text: string) => number, maxWidth: number): string[] => {
    const lines: string[] = [];
    for (const paragraph of text.replace(/\r/g, '').split('\n')) {
        let line = '';
        for (const character of Array.from(paragraph)) {
            if (line && measure(line + character) > maxWidth) {
                lines.push(line); line = '';
            }
            line += character;
        }
        lines.push(line);
    }
    return lines;
};
export const drawAnnotations = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, points: Projected[], width: number, height: number, mode: OverlayMode, selected: number, hovered = -1, displayScale?: number, hotspots = true) => {
    if (mode === 'off') return;
    const scale = displayScale ?? Math.max(0.65, Math.min(width, height) / 720);
    ctx.save(); ctx.scale(scale, scale);
    const w = width / scale, h = height / scale;
    ctx.font = '500 14px system-ui, "PingFang SC", sans-serif'; ctx.textBaseline = 'top';
    for (const { index, x, y, annotation } of points) {
        const px = x / scale, py = y / scale;
        if (hotspots) {
            ctx.save(); ctx.translate(px - HOTSPOT_SIZE / 2, py - HOTSPOT_SIZE / 2); ctx.scale(HOTSPOT_SIZE / 64, HOTSPOT_SIZE / 64);
            drawHotspot(ctx, String(index + 1), 64, 6, index === hovered ? '#ff6600' : '#ccc'); ctx.restore();
        }
        if (mode === 'selected' && index !== selected) continue;
        const cardWidth = Math.min(mode === 'titles' ? 230 : 310, w - 20);
        const title = wrapText(annotation.title, text => ctx.measureText(text).width, cardWidth - 24);
        const body = mode === 'selected' ? wrapText(annotation.text, text => ctx.measureText(text).width, cardWidth - 24) : [];
        const maxLines = Math.max(1, Math.floor((h - 52) / 21));
        const lines = [...title, ...body].slice(0, maxLines);
        if (title.length + body.length > maxLines) lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, -1)}…`;
        const cardHeight = lines.length * 21 + 24;
        const { left: cx, top: cy } = placeAnnotationCard(px, py, cardWidth, cardHeight, w, h);
        ctx.fillStyle = 'rgba(20,24,31,0.94)'; ctx.beginPath(); ctx.roundRect(cx, cy, cardWidth, cardHeight, 8); ctx.fill();
        lines.forEach((line, i) => {
            ctx.fillStyle = i < title.length ? '#fff' : '#cdd5e0'; ctx.fillText(line, cx + 12, cy + 12 + i * 21);
        });
    }
    ctx.restore();
};
// Kept separate from DOM card layout so preview and video use the same clipping.
export const moveAlongView = (position: number[], camera: number[], distance: number): [number, number, number] => {
    const p = new Vec3(position), direction = p.clone().sub(new Vec3(camera)).normalize();
    p.add(direction.mulScalar(distance));
    return [p.x, p.y, p.z];
};
