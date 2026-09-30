/** Built-in annotation capability. Titles and body text are never commands. */
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue | null =>
    value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : null;
export const NAV_ARRIVAL_RADIUS = 2 as const;
export function navigationCapability(annotation: unknown) {
    const value = record(annotation),
        extras = record(value?.extras),
        metaflow = record(extras?.metaflow),
        nav = record(metaflow?.nav);
    const declared = nav?.enabled === true;
    if (!declared) return { declared: false, enabled: false, reason: '普通标识' };
    const initial = record(record(value?.camera)?.initial);
    const tuple = (v: unknown): v is number[] =>
        Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
    const valid =
        initial &&
        tuple(initial.position) &&
        tuple(initial.target) &&
        typeof initial.fov === 'number' &&
        Number.isFinite(initial.fov) &&
        initial.fov > 0 &&
        initial.fov < 180;
    return { declared: true, enabled: !!valid, reason: valid ? '' : '尚未保存有效观看相机' };
}
export const isNavigationAnnotation = (annotation: unknown) => navigationCapability(annotation).enabled;
export const navigationAnnotationIndices = (annotations: readonly unknown[]) =>
    annotations.flatMap((a, i) => (isNavigationAnnotation(a) ? [i] : []));
export function navigationMetadataWritable(annotation: { extras?: unknown }): boolean {
    if (annotation.extras === undefined) return true;
    const extras = record(annotation.extras);
    if (!extras) return false;
    if (extras.metaflow === undefined) return true;
    const metaflow = record(extras.metaflow);
    return !!metaflow && (metaflow.nav === undefined || !!record(metaflow.nav));
}
/** Immutable narrow merge: unknown extension fields survive save/undo/export.
 * Non-object extension containers cannot hold this key without data loss: refuse the edit. */
export function withNavigationEnabled<T extends { extras?: unknown }>(annotation: T, enabled: boolean): T {
    if (!navigationMetadataWritable(annotation)) throw Error('@Nav 无法写入非对象扩展字段；原数据保留');
    const extras = record(annotation.extras) ?? {},
        metaflow = record(extras.metaflow) ?? {},
        nav = record(metaflow.nav) ?? {};
    return { ...annotation, extras: { ...extras, metaflow: { ...metaflow, nav: { ...nav, enabled } } } };
}
export function nearbyNavigationAnnotationIndices(
    annotations: readonly unknown[],
    position: { x: number; y: number; z: number },
    supportHeight: number | null | undefined,
    targetIndex: number | null
): number[] {
    const candidates = navigationAnnotationIndices(annotations)
        .flatMap((index) => {
            if (index === targetIndex) return [];
            const a = annotations[index] as { camera: { initial: { position: number[] } } };
            const p = a.camera.initial.position,
                distance = Math.hypot(p[0] - position.x, p[2] - position.z);
            // This is a display filter only. Saved eye height cannot establish a navigation surface.
            // Unknown layer association is kept conservative; topology-based filtering can refine it.
            const sameHeight =
                supportHeight !== null && supportHeight !== undefined
                    ? Math.abs(p[1] - supportHeight - 1.5) <= 1.5
                    : Math.abs(p[1] - position.y) <= 1.5;
            return distance <= 12 && sameHeight ? [{ index, distance }] : [];
        })
        .sort((a, b) => a.distance - b.distance || a.index - b.index);
    const target = targetIndex !== null && isNavigationAnnotation(annotations[targetIndex]) ? [targetIndex] : [];
    return [...target, ...candidates.slice(0, 3 - target.length).map((c) => c.index)];
}
