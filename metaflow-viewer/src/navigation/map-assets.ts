/** Cached, offline Gaussian slices. These images are visual data, never a
 * collision source or evidence that two navigation surfaces are connected. */
export type MapBounds = { minX: number; minZ: number; maxX: number; maxZ: number };
export type GaussianMapTile = {
    id: string;
    url: string;
    sha256: string;
    width: number;
    height: number;
    bounds: MapBounds;
    status: 'ready' | 'missing' | 'error';
};
export type GaussianMapLayer = {
    id: string;
    label: string;
    supportRange: [number, number];
    sliceRange: [number, number];
    bounds: MapBounds;
    tiles: GaussianMapTile[];
};
export type GaussianMapManifest = {
    version: 1;
    scene: string;
    generator?: string;
    source: { gaussianHash: string; collisionHash: string; transform: number[] };
    layers: GaussianMapLayer[];
    coverage: { expected: number; ready: number; status: 'complete' | 'incomplete' };
};
export type LoadedMapTile = { image: ImageBitmap | HTMLImageElement; bounds: MapBounds; id: string };
export type MapAssetStatus = 'idle' | 'loading' | 'ready' | 'incomplete' | 'error';
export type MapSourceExpectation = { collisionHash?: string; gaussianHash?: string; transform?: readonly number[] };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const range = (v: unknown): v is [number, number] =>
    Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n)) && v[0] <= v[1];
const bounds = (v: unknown): v is MapBounds =>
    isObject(v) &&
    ['minX', 'minZ', 'maxX', 'maxZ'].every((k) => typeof v[k] === 'number' && Number.isFinite(v[k])) &&
    Number(v.minX) < Number(v.maxX) &&
    Number(v.minZ) < Number(v.maxZ);

export function validateMapManifest(value: unknown, expected: MapSourceExpectation = {}): GaussianMapManifest {
    if (
        !isObject(value) ||
        value.version !== 1 ||
        typeof value.scene !== 'string' ||
        !isObject(value.source) ||
        typeof value.source.gaussianHash !== 'string' ||
        typeof value.source.collisionHash !== 'string' ||
        !Array.isArray(value.source.transform) ||
        value.source.transform.length !== 16 ||
        !value.source.transform.every((n) => typeof n === 'number' && Number.isFinite(n)) ||
        !Array.isArray(value.layers) ||
        !value.layers.length ||
        !isObject(value.coverage)
    ) {
        throw new Error('地图清单格式无效');
    }
    if (expected.collisionHash && value.source.collisionHash !== expected.collisionHash)
        throw new Error('地图与当前碰撞资产版本不一致');
    if (expected.gaussianHash && value.source.gaussianHash !== expected.gaussianHash)
        throw new Error('地图与当前高斯资产版本不一致');
    if (expected.transform !== undefined) {
        if (expected.transform.length !== 16 || !expected.transform.every(Number.isFinite))
            throw new Error('当前地图坐标变换格式无效');
        const sourceTransform = value.source.transform;
        if (expected.transform.some((n, i) => Math.abs(n - Number(sourceTransform[i])) > 1e-8))
            throw new Error('地图与当前场景坐标变换不一致');
    }
    const ids = new Set<string>();
    let total = 0,
        ready = 0;
    for (const layer of value.layers) {
        if (
            !isObject(layer) ||
            typeof layer.id !== 'string' ||
            !layer.id ||
            ids.has(layer.id) ||
            typeof layer.label !== 'string' ||
            !range(layer.supportRange) ||
            !range(layer.sliceRange) ||
            !bounds(layer.bounds) ||
            !Array.isArray(layer.tiles) ||
            !layer.tiles.length
        )
            throw new Error('地图楼层格式无效');
        ids.add(layer.id);
        const tileIds = new Set<string>();
        const rectangles: MapBounds[] = [];
        let tileArea = 0;
        for (const tile of layer.tiles) {
            if (
                !isObject(tile) ||
                typeof tile.id !== 'string' ||
                tileIds.has(tile.id) ||
                typeof tile.url !== 'string' ||
                !bounds(tile.bounds) ||
                !Number.isInteger(tile.width) ||
                !Number.isInteger(tile.height) ||
                Number(tile.width) <= 0 ||
                Number(tile.height) <= 0 ||
                Number(tile.width) > 4096 ||
                Number(tile.height) > 4096 ||
                !['ready', 'missing', 'error'].includes(String(tile.status)) ||
                typeof tile.sha256 !== 'string' ||
                (tile.status === 'ready' && !/^[a-f0-9]{64}$/.test(tile.sha256))
            )
                throw new Error('地图瓦片格式无效');
            if (
                tile.bounds.minX < layer.bounds.minX - 1e-6 ||
                tile.bounds.maxX > layer.bounds.maxX + 1e-6 ||
                tile.bounds.minZ < layer.bounds.minZ - 1e-6 ||
                tile.bounds.maxZ > layer.bounds.maxZ + 1e-6
            )
                throw new Error('地图瓦片超出楼层范围');
            tileIds.add(tile.id);
            for (const previous of rectangles) {
                const dx = Math.min(previous.maxX, tile.bounds.maxX) - Math.max(previous.minX, tile.bounds.minX);
                const dz = Math.min(previous.maxZ, tile.bounds.maxZ) - Math.max(previous.minZ, tile.bounds.minZ);
                if (dx > 1e-6 && dz > 1e-6) throw new Error('地图瓦片相互重叠');
            }
            rectangles.push(tile.bounds);
            tileArea += (tile.bounds.maxX - tile.bounds.minX) * (tile.bounds.maxZ - tile.bounds.minZ);
            total++;
            if (tile.status === 'ready') ready++;
        }
        const area = (layer.bounds.maxX - layer.bounds.minX) * (layer.bounds.maxZ - layer.bounds.minZ);
        if (Math.abs(area - tileArea) > Math.max(1e-5, area * 1e-6)) throw new Error('地图楼层覆盖存在缺口');
    }
    if (
        value.coverage.expected !== total ||
        value.coverage.ready !== ready ||
        !['complete', 'incomplete'].includes(String(value.coverage.status)) ||
        (value.coverage.status === 'complete' && (total === 0 || total !== ready))
    )
        throw new Error('地图覆盖记录不一致');
    return value as unknown as GaussianMapManifest;
}

type CachedTile = LoadedMapTile & { bytes: number; used: number };
export class GaussianMapAssets {
    manifest: GaussianMapManifest | null = null;
    layerId: string | null = null;
    tiles: LoadedMapTile[] = [];
    status: MapAssetStatus = 'idle';
    message = '';
    private manifestUrl = '';
    private cache = new Map<string, CachedTile>();
    private cacheBytes = 0;
    private generation = 0;
    private request: AbortController | null = null;
    private destroyed = false;
    private onChange: () => void;
    private fetchResource: typeof fetch;
    private budget: number;

    constructor(options: { onChange?: () => void; fetch?: typeof fetch; budgetBytes?: number } = {}) {
        this.onChange = options.onChange ?? (() => {});
        this.fetchResource = options.fetch ?? fetch.bind(globalThis);
        this.budget = options.budgetBytes ?? 64 * 1024 ** 2;
    }
    get floorList() {
        return this.manifest?.layers ?? [];
    }

    async load(url: string, expected: MapSourceExpectation = {}, signal?: AbortSignal) {
        this.cancel();
        this.clearCache();
        this.manifest = null;
        this.tiles = [];
        this.layerId = null;
        this.manifestUrl = new URL(url, typeof location === 'undefined' ? 'http://localhost/' : location.href).href;
        const ticket = ++this.generation,
            controller = new AbortController();
        this.request = controller;
        const abort = () => controller.abort();
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) controller.abort();
        this.update('loading', '正在加载高斯小地图');
        try {
            const response = await this.fetchResource(this.manifestUrl, { signal: controller.signal });
            if (!response.ok) throw new Error(`地图清单加载失败 (${response.status})`);
            const manifest = validateMapManifest(await response.json(), expected);
            if (ticket !== this.generation || this.destroyed) return;
            this.manifest = manifest;
            this.update('idle', '请选择地图楼层');
        } catch (error) {
            if (ticket === this.generation && !controller.signal.aborted && !this.destroyed)
                this.update('error', (error as Error).message);
        } finally {
            signal?.removeEventListener('abort', abort);
            if (this.request === controller) this.request = null;
        }
    }

    /** A display suggestion only. Overlapping height ranges require a stable
     * surface association from navigation, or explicit user selection. */
    suggestLayer(supportHeight: number, previousId?: string | null): string | null {
        if (!Number.isFinite(supportHeight)) return null;
        const matching = this.floorList.filter(
            (layer) => supportHeight >= layer.supportRange[0] && supportHeight <= layer.supportRange[1]
        );
        if (previousId && matching.some((layer) => layer.id === previousId)) return previousId;
        return matching.length === 1 ? matching[0].id : null;
    }

    async selectLayer(id: string) {
        if (this.destroyed) return;
        const layer = this.floorList.find((v) => v.id === id);
        if (!layer) {
            this.update('error', '地图楼层不存在');
            return;
        }
        this.cancel();
        const ticket = ++this.generation,
            controller = new AbortController();
        this.request = controller;
        this.layerId = id;
        this.tiles = [];
        this.update('loading', '正在加载本层高斯底图');
        const retained = new Set<string>();
        let failures = 0;
        for (const tile of layer.tiles) {
            if (ticket !== this.generation || controller.signal.aborted || this.destroyed) return;
            if (tile.status !== 'ready') {
                failures++;
                continue;
            }
            const url = new URL(tile.url, this.manifestUrl).href,
                key = `${url}:${tile.sha256}`;
            try {
                let cached = this.cache.get(key);
                if (!cached) {
                    const bytes = tile.width * tile.height * 4;
                    this.evict(bytes, retained);
                    if (this.cacheBytes + bytes > this.budget) throw new Error('地图显示内存预算不足');
                    const response = await this.fetchResource(url, { signal: controller.signal });
                    if (!response.ok) throw new Error(`地图瓦片加载失败 (${response.status})`);
                    const data = await response.arrayBuffer();
                    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), (v) =>
                        v.toString(16).padStart(2, '0')
                    ).join('');
                    if (hash !== tile.sha256) throw new Error('地图瓦片校验失败');
                    const image = await this.decode(new Blob([data], { type: 'image/webp' }));
                    if (ticket !== this.generation || this.destroyed) {
                        this.release(image);
                        return;
                    }
                    if (image.width !== tile.width || image.height !== tile.height) {
                        this.release(image);
                        throw new Error('地图瓦片尺寸不一致');
                    }
                    cached = { id: tile.id, image, bounds: tile.bounds, bytes, used: performance.now() };
                    this.cache.set(key, cached);
                    this.cacheBytes += bytes;
                }
                cached.used = performance.now();
                retained.add(key);
                this.tiles.push(cached);
                this.onChange();
            } catch (error) {
                if (controller.signal.aborted || ticket !== this.generation || this.destroyed) return;
                failures++;
                this.message = (error as Error).message;
            }
        }
        if (ticket === this.generation && !this.destroyed) {
            this.request = null;
            if (failures || this.manifest?.coverage.status !== 'complete')
                this.update('incomplete', this.message || '部分高斯底图缺失；路线状态不受影响');
            else this.update('ready', '');
        }
    }
    private decode(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
        if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
        return new Promise((resolve, reject) => {
            const image = new Image(),
                url = URL.createObjectURL(blob);
            image.onload = () => {
                URL.revokeObjectURL(url);
                resolve(image);
            };
            image.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('地图瓦片无法解码'));
            };
            image.src = url;
        });
    }
    private release(image: ImageBitmap | HTMLImageElement) {
        if ('close' in image) image.close();
    }
    private evict(need: number, retained: Set<string>) {
        for (const [key, tile] of [...this.cache.entries()].sort((a, b) => a[1].used - b[1].used)) {
            if (this.cacheBytes + need <= this.budget) break;
            if (retained.has(key)) continue;
            this.release(tile.image);
            this.cache.delete(key);
            this.cacheBytes -= tile.bytes;
        }
    }
    private update(status: MapAssetStatus, message: string) {
        this.status = status;
        this.message = message;
        this.onChange();
    }
    private cancel() {
        this.request?.abort();
        this.request = null;
    }
    private clearCache() {
        for (const tile of this.cache.values()) this.release(tile.image);
        this.cache.clear();
        this.cacheBytes = 0;
    }
    destroy() {
        this.destroyed = true;
        this.generation++;
        this.cancel();
        this.clearCache();
        this.tiles = [];
        this.manifest = null;
    }
}
