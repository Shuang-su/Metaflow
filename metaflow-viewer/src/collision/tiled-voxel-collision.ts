import type { Collision, PushOut, RayHit } from './collision';
import { loadVoxelCollision } from './voxel-collision';
import type { LoadVoxelCollisionOptions, VoxelCollision } from './voxel-collision';

type Bounds3 = {
    min: [number, number, number];
    max: [number, number, number];
};

type VoxelTileEntry = {
    id: string;
    ix: number;
    iz: number;
    coreBounds: Bounds3;
    dataBounds: Bounds3;
    url: string;
};

type VoxelTileManifest = {
    version: 1;
    voxelResolution: number;
    tileSize: number;
    overlap: number;
    fullBounds: Bounds3;
    tiles: VoxelTileEntry[];
};

class TiledVoxelCollision implements Collision {
    private readonly _tilesById = new Map<string, VoxelTileEntry>();

    private readonly _loaded = new Map<string, VoxelCollision>();

    private readonly _loading = new Map<string, Promise<void>>();

    private readonly _activeIds = new Set<string>();

    private readonly _scratchPush: PushOut = { x: 0, y: 0, z: 0 };

    private readonly _resultNormal = { nx: 0, ny: 1, nz: 0 };

    private readonly _resultHit: RayHit = { x: 0, y: 0, z: 0 };

    private _centerId = '';

    onTilesChanged: (() => void) | null = null;

    private constructor(
        private readonly manifest: VoxelTileManifest,
        private readonly manifestUrl: string,
        private readonly loadOptions: LoadVoxelCollisionOptions
    ) {
        for (const tile of manifest.tiles) {
            this._tilesById.set(tile.id, tile);
        }
    }

    static async load(manifestUrl: string, options: LoadVoxelCollisionOptions = {}): Promise<TiledVoxelCollision> {
        const response = await fetch(manifestUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch voxel tile manifest: ${response.statusText}`);
        }
        const manifest = (await response.json()) as VoxelTileManifest;
        return new TiledVoxelCollision(manifest, manifestUrl, options);
    }

    get voxelResolution(): number {
        return this.manifest.voxelResolution;
    }

    getActiveColliders(): VoxelCollision[] {
        const result: VoxelCollision[] = [];
        for (const id of this._activeIds) {
            const collision = this._loaded.get(id);
            if (collision) {
                result.push(collision);
            }
        }
        return result;
    }

    isCurrentTileLoaded(): boolean {
        return this._centerId !== '' && this._loaded.has(this._centerId);
    }

    updateForQueryPosition(x: number, z: number): void {
        const center = this._findTile(x, z);
        if (!center || center.id === this._centerId) {
            return;
        }

        this._centerId = center.id;
        const desired = new Set<string>();
        for (const tile of this.manifest.tiles) {
            if (Math.abs(tile.ix - center.ix) <= 1 && Math.abs(tile.iz - center.iz) <= 1) {
                desired.add(tile.id);
            }
        }

        this._activeIds.clear();
        for (const id of desired) {
            this._activeIds.add(id);
            this._ensureLoaded(id);
        }

        for (const id of Array.from(this._loaded.keys())) {
            if (!desired.has(id)) {
                this._loaded.delete(id);
            }
        }

        this.onTilesChanged?.();
    }

    isFreeAt(x: number, y: number, z: number): boolean {
        for (const collision of this.getActiveColliders()) {
            if (collision.isFreeAt(x, y, z)) {
                return true;
            }
        }
        return false;
    }

    querySurfaceNormal(
        x: number,
        y: number,
        z: number,
        rdx: number,
        rdy: number,
        rdz: number
    ): { nx: number; ny: number; nz: number } {
        for (const collision of this.getActiveColliders()) {
            if (
                collision.isFreeAt(x, y, z) ||
                collision.querySphere(x, y, z, collision.voxelResolution * 0.5, this._scratchPush)
            ) {
                return collision.querySurfaceNormal(x, y, z, rdx, rdy, rdz);
            }
        }
        this._resultNormal.nx = 0;
        this._resultNormal.ny = 1;
        this._resultNormal.nz = 0;
        return this._resultNormal;
    }

    queryRay(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): RayHit | null {
        let best: RayHit | null = null;
        let bestDistSq = Infinity;
        for (const collision of this.getActiveColliders()) {
            const hit = collision.queryRay(ox, oy, oz, dx, dy, dz, maxDist);
            if (!hit) continue;

            const hx = hit.x - ox;
            const hy = hit.y - oy;
            const hz = hit.z - oz;
            const distSq = hx * hx + hy * hy + hz * hz;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                best = hit;
            }
        }

        if (!best) {
            return null;
        }

        this._resultHit.x = best.x;
        this._resultHit.y = best.y;
        this._resultHit.z = best.z;
        return this._resultHit;
    }

    querySphere(cx: number, cy: number, cz: number, radius: number, out: PushOut): boolean {
        return this._queryVolume(cx, cy, cz, radius, 0, out, false);
    }

    queryCapsule(cx: number, cy: number, cz: number, halfHeight: number, radius: number, out: PushOut): boolean {
        return this._queryVolume(cx, cy, cz, radius, halfHeight, out, true);
    }

    private _queryVolume(
        cx: number,
        cy: number,
        cz: number,
        radius: number,
        halfHeight: number,
        out: PushOut,
        capsule: boolean
    ): boolean {
        let resolvedX = cx;
        let resolvedY = cy;
        let resolvedZ = cz;
        let totalX = 0;
        let totalY = 0;
        let totalZ = 0;
        let hit = false;

        for (let pass = 0; pass < 3; pass++) {
            let passHit = false;
            for (const collision of this.getActiveColliders()) {
                const collided = capsule
                    ? collision.queryCapsule(resolvedX, resolvedY, resolvedZ, halfHeight, radius, this._scratchPush)
                    : collision.querySphere(resolvedX, resolvedY, resolvedZ, radius, this._scratchPush);
                if (!collided) continue;

                resolvedX += this._scratchPush.x;
                resolvedY += this._scratchPush.y;
                resolvedZ += this._scratchPush.z;
                totalX += this._scratchPush.x;
                totalY += this._scratchPush.y;
                totalZ += this._scratchPush.z;
                passHit = true;
                hit = true;
            }

            if (!passHit) {
                break;
            }
        }

        if (hit) {
            out.x = totalX;
            out.y = totalY;
            out.z = totalZ;
        }
        return hit;
    }

    private _findTile(x: number, z: number): VoxelTileEntry | null {
        let nearest: VoxelTileEntry | null = null;
        let nearestDistSq = Infinity;
        for (const tile of this.manifest.tiles) {
            const { min, max } = tile.coreBounds;
            if (x >= min[0] && x < max[0] && z >= min[2] && z < max[2]) {
                return tile;
            }

            const cx = (min[0] + max[0]) * 0.5;
            const cz = (min[2] + max[2]) * 0.5;
            const dx = cx - x;
            const dz = cz - z;
            const distSq = dx * dx + dz * dz;
            if (distSq < nearestDistSq) {
                nearestDistSq = distSq;
                nearest = tile;
            }
        }
        return nearest;
    }

    private _ensureLoaded(id: string): void {
        if (this._loaded.has(id) || this._loading.has(id)) {
            return;
        }

        const tile = this._tilesById.get(id);
        if (!tile) {
            return;
        }

        const jsonUrl = new URL(tile.url, new URL(this.manifestUrl, location.href)).href;
        const promise = loadVoxelCollision(jsonUrl, this.loadOptions)
            .then((collision) => {
                this._loading.delete(id);
                if (!this._activeIds.has(id)) {
                    return;
                }
                this._loaded.set(id, collision);
                this.onTilesChanged?.();
            })
            .catch((err: Error) => {
                this._loading.delete(id);
                console.warn(`Failed to load voxel tile ${id}:`, err);
            });
        this._loading.set(id, promise);
    }
}

const loadTiledVoxelCollision = (
    manifestUrl: string,
    options: LoadVoxelCollisionOptions = {}
): Promise<TiledVoxelCollision> => TiledVoxelCollision.load(manifestUrl, options);

export { TiledVoxelCollision, loadTiledVoxelCollision };
export type { VoxelTileEntry, VoxelTileManifest };
