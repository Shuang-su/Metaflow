/** Numbered hotspot geometry shared by Viewer textures and Studio canvas overlays. */
export const HOTSPOT_SIZE = 25;
export function drawHotspot(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, label: string, size = 64, borderWidth = 6, color = 'white') {
    const center = size / 2, radius = center - 4;
    ctx.save(); ctx.beginPath(); ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'black'; ctx.fill(); ctx.lineWidth = borderWidth; ctx.strokeStyle = color; ctx.stroke();
    ctx.font = `bold ${size / 2}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color; ctx.fillText(label, Math.floor(center), Math.floor(center) + 1); ctx.restore();
}
