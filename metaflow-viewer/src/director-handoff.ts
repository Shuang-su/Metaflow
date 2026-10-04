/** Private same-tab handoff. This module adds no Viewer SDK or resource schema fields. */
export type DirectorPosition = { position: [number, number, number]; target: [number, number, number] };
export type DirectorResource = {
    id: string;
    title?: string;
    route: string;
    aliases?: string[];
    category?: string[];
    files: { model?: string; environment?: string; settings?: string; lod?: unknown[] };
};
export const HANDOFF_TTL = 30 * 60 * 1000;
export function normalizeDirectorPath(path: string): string {
    try {
        return decodeURIComponent(path).replace(/\/+$/, '') || '/';
    } catch {
        return '';
    }
}
export function directorBasePath(path: string): string | null {
    const normalized = normalizeDirectorPath(path);
    return normalized.endsWith('/director') ? normalized.slice(0, -9) || '/' : null;
}
export function resourceDataUrl(file: string): string {
    if (typeof file !== 'string' || !file || /[\\?#]/.test(file)) throw new Error('资源引用无效');
    const path = file.startsWith('/data/') ? file.slice(6) : file;
    if (path.startsWith('/') || /^[a-z]+:/i.test(path) || path.split('/').some((p) => p === '..' || p === '.'))
        throw new Error('摄影仅允许索引中的同站 /data/ 素材');
    return '/data/' + path.split('/').map(encodeURIComponent).join('/');
}
export function resolveDirectorResource(resources: DirectorResource[], path: string): DirectorResource {
    const base = directorBasePath(path);
    if (base === null) throw new Error('请在已有 ACG 资源地址后添加 /director');
    const resource = resources.find((r) =>
        [r.route, ...(r.aliases ?? [])].some((p) => normalizeDirectorPath(p) === base)
    );
    if (!resource) throw new Error('没有找到这个资源；请检查资源地址');
    if (!resource.category?.includes('acg')) throw new Error('Director 实验版目前仅支持 ACG 资源');
    if (!/\.(sog|ply)$/i.test(resource.files?.model ?? ''))
        throw new Error('此资源为流式或不支持的格式；实验版仅支持单文件 SOG / PLY');
    if (!resource.files.settings) throw new Error('此资源缺少摄影所需的初始相机设置');
    if (resource.files.environment && !/\.(sog|ply)$/i.test(resource.files.environment))
        throw new Error('此资源声明了不支持的环境模型格式');
    Object.values({
        model: resource.files.model,
        environment: resource.files.environment,
        settings: resource.files.settings
    })
        .filter(Boolean)
        .forEach((file) => resourceDataUrl(file!));
    return resource;
}
export function validDirectorPosition(value: unknown): value is DirectorPosition {
    const p = value as DirectorPosition;
    return (
        !!p &&
        [p.position, p.target].every(
            (v) => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))
        ) &&
        Math.hypot(...p.position.map((v, i) => v - p.target[i])) > 1e-6
    );
}
export function handoffIdentity(resource: Pick<DirectorResource, 'id' | 'files'>): string {
    return JSON.stringify([
        resource.id,
        resourceDataUrl(resource.files.model!),
        resource.files.environment ? resourceDataUrl(resource.files.environment) : null,
        resourceDataUrl(resource.files.settings!)
    ]);
}
export function saveDirectorPosition(
    storage: Pick<Storage, 'setItem'>,
    identity: string,
    pose: DirectorPosition,
    now = Date.now()
): boolean {
    if (!validDirectorPosition(pose)) return false;
    try {
        storage.setItem(
            'metaflow:director:camera',
            JSON.stringify({ version: 1, identity, at: now, position: pose.position, target: pose.target })
        );
        return true;
    } catch {
        return false;
    }
}
export function readDirectorPosition(
    storage: Pick<Storage, 'getItem'>,
    identity: string,
    now = Date.now()
): DirectorPosition | null {
    try {
        const record = JSON.parse(storage.getItem('metaflow:director:camera') ?? 'null');
        if (
            record?.version !== 1 ||
            record.identity !== identity ||
            !Number.isFinite(record.at) ||
            record.at > now ||
            now - record.at > HANDOFF_TTL ||
            !validDirectorPosition(record)
        )
            return null;
        return { position: [...record.position], target: [...record.target] };
    } catch {
        return null;
    }
}
