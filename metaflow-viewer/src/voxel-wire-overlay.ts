import {
    BLEND_NORMAL,
    Entity,
    LAYERID_IMMEDIATE,
    Mesh,
    MeshInstance,
    PRIMITIVE_LINES,
    StandardMaterial,
    Vec3
} from 'playcanvas';
import type { AppBase } from 'playcanvas';

import { TiledVoxelCollision } from './collision';
import type { VoxelCollision } from './collision';

type Cell = [number, number, number, number];

// PICO 4 Ultra / Browser 4.0.38 loses one eye for large single line draws.
// Keep complete cells in bounded draws; do not reduce the sampled collision data.
const cellEdgeBatches = function* (positions: number[]): Generator<number[]> {
    const batchSize = 256 * 72; // 256 cells, 6144 vertices, twelve edges per cell.
    for (let i = 0; i < positions.length; i += batchSize) yield positions.slice(i, i + batchSize);
};

/** Yield every visited cell so callers can budget work, including long empty runs. */
function* surfaceCells(collision: VoxelCollision, center: Vec3, radius = 2): Generator<Cell | null, void, unknown> {
    const res = collision.voxelResolution;
    if (!Number.isFinite(res) || res <= 0) return;
    const sign = collision.flipXY ? -1 : 1;
    const origin = [collision.gridMinX, collision.gridMinY, collision.gridMinZ];
    const sizes = [collision.numVoxelsX, collision.numVoxelsY, collision.numVoxelsZ];
    const c = [center.x * sign, center.y * sign, center.z];
    const lo = origin.map((v, i) => Math.max(0, Math.floor((c[i] - radius - v) / res)));
    const hi = origin.map((v, i) => Math.min(sizes[i] - 1, Math.floor((c[i] + radius - v) / res)));
    if (lo.some((v, i) => v > hi[i])) return;
    const cx = Math.max(lo[0], Math.min(hi[0], Math.floor((c[0] - origin[0]) / res)));
    const cz = Math.max(lo[2], Math.min(hi[2], Math.floor((c[2] - origin[2]) / res)));
    const extent = Math.max(cx - lo[0], hi[0] - cx, cz - lo[2], hi[2] - cz);
    const solid = (x: number, y: number, z: number) => collision.isVoxelSolid(x, y, z);
    function* column(x: number, z: number): Generator<Cell | null, void, unknown> {
        if (x < lo[0] || x > hi[0] || z < lo[2] || z > hi[2]) return;
        for (let y = lo[1]; y <= hi[1]; y++) {
            if (
                solid(x, y, z) &&
                (!solid(x - 1, y, z) ||
                    !solid(x + 1, y, z) ||
                    !solid(x, y - 1, z) ||
                    !solid(x, y + 1, z) ||
                    !solid(x, y, z - 1) ||
                    !solid(x, y, z + 1))
            ) {
                // Negative axes reverse the cell bounds, not merely the minimum corner.
                yield [
                    sign * (origin[0] + (x + (sign < 0 ? 1 : 0)) * res),
                    sign * (origin[1] + (y + (sign < 0 ? 1 : 0)) * res),
                    origin[2] + z * res,
                    res
                ];
            } else yield null;
        }
    }
    // Visit the column under the head first, then expand horizontal rings. A capped
    // scan must not spend all its cells on the far side before reaching the feet.
    yield* column(cx, cz);
    for (let r = 1; r <= extent; r++) {
        for (let x = cx - r; x <= cx + r; x++) {
            yield* column(x, cz - r);
            yield* column(x, cz + r);
        }
        for (let z = cz - r + 1; z < cz + r; z++) {
            yield* column(cx - r, z);
            yield* column(cx + r, z);
        }
    }
}

/** Interleave loaded tiles so one tile cannot exhaust the entire display budget. */
function* nearbySurfaceCells(colliders: VoxelCollision[], center: Vec3): Generator<Cell | null, void, unknown> {
    const scans = colliders.map((c) => surfaceCells(c, center));
    while (scans.length) {
        for (let i = 0; i < scans.length;) {
            const next = scans[i].next();
            if (next.done === true) scans.splice(i, 1);
            else {
                yield next.value;
                i++;
            }
        }
    }
}

const appendCellEdges = (positions: number[], [x, y, z, size]: Cell): void => {
    for (let axis = 0; axis < 3; axis++) {
        for (let a = 0; a < 2; a++) {
            for (let b = 0; b < 2; b++) {
                const p = [x, y, z];
                p[(axis + 1) % 3] += a * size;
                p[(axis + 2) % 3] += b * size;
                positions.push(...p);
                p[axis] += size;
                positions.push(...p);
            }
        }
    }
};

/** Bounded, opt-in geometry overlay: both eyes share real world-space voxel cells. */
class VoxelWireOverlay {
    private active = false;
    private readonly entity = new Entity('Nearby collision voxels');
    private readonly batches: { entity: Entity; mesh: Mesh }[] = [];
    private readonly material = new StandardMaterial();
    private readonly center = new Vec3(Infinity, Infinity, Infinity);
    private colliders: VoxelCollision[] = [];
    private iterator: Generator<Cell | null, void, unknown> | null = null;
    private positions: number[] = [];
    private readonly seen = new Set<string>();
    private lastUpload = 0;
    private uploaded = 0;

    constructor(
        private readonly app: AppBase,
        private readonly collision: VoxelCollision | TiledVoxelCollision,
        private readonly camera: Entity
    ) {
        this.material.useLighting = false;
        this.material.useTonemap = false;
        this.material.useFog = false;
        this.material.diffuse.set(0, 0, 0);
        this.material.emissive.set(0.15, 0.95, 0.75);
        this.material.opacity = 0.7;
        this.material.blendType = BLEND_NORMAL;
        this.material.depthTest = false;
        this.material.depthWrite = false;
        this.material.update();
        this.entity.enabled = false;
        app.root.addChild(this.entity);
        app.once('destroy', () => this.destroy());
    }

    set enabled(value: boolean) {
        if (value === this.active) return;
        this.active = value;
        this.entity.enabled = value && this.uploaded > 0;
        this.iterator = null;
        if (value) this.center.set(Infinity, Infinity, Infinity);
    }

    update(): void {
        if (!this.active) return;
        const colliders =
            this.collision instanceof TiledVoxelCollision ? this.collision.getActiveColliders() : [this.collision];
        const eye = this.camera.getPosition();
        if (
            eye.distance(this.center) > 0.75 ||
            colliders.length !== this.colliders.length ||
            colliders.some((c, i) => c !== this.colliders[i])
        ) {
            this.center.copy(eye);
            this.colliders = colliders;
            // Include the ground below a standing user's eyes without increasing the scan volume.
            const sampleCenter = eye.clone().add(new Vec3(0, -0.6, 0));
            this.iterator = nearbySurfaceCells(colliders, sampleCenter);
            this.positions = [];
            this.seen.clear();
            this.uploaded = 0;
            this.entity.enabled = false;
        }
        const deadline = performance.now() + 2;
        for (let i = 0; this.iterator && i < 2048 && performance.now() < deadline; i++) {
            const next = this.iterator.next();
            if (next.done) {
                this.iterator = null;
                break;
            }
            if (!next.value) continue;
            const key = next.value.map((v) => v.toFixed(6)).join(',');
            if (this.seen.has(key)) continue;
            this.seen.add(key);
            appendCellEdges(this.positions, next.value);
            if (this.seen.size >= 2000) this.iterator = null;
        }
        if (this.positions.length !== this.uploaded && (!this.iterator || performance.now() - this.lastUpload >= 250)) {
            let count = 0;
            for (const positions of cellEdgeBatches(this.positions)) {
                let batch = this.batches[count];
                if (!batch) {
                    const mesh = new Mesh(this.app.graphicsDevice);
                    const entity = new Entity('Collision voxel batch');
                    entity.addComponent('render', {
                        meshInstances: [new MeshInstance(mesh, this.material)],
                        layers: [LAYERID_IMMEDIATE]
                    });
                    this.entity.addChild(entity);
                    batch = { entity, mesh };
                    this.batches.push(batch);
                }
                batch.mesh.setPositions(positions);
                batch.mesh.update(PRIMITIVE_LINES);
                batch.entity.enabled = true;
                count++;
            }
            // Reuse at most eight buffers; stale batches must disappear as the scan shrinks.
            for (let i = count; i < this.batches.length; i++) this.batches[i].entity.enabled = false;
            this.uploaded = this.positions.length;
            this.lastUpload = performance.now();
            this.entity.enabled = this.uploaded > 0;
        }
        if (this.iterator) this.app.renderNextFrame = true;
    }

    destroy(): void {
        this.iterator = null;
        this.entity.destroy();
        // Render components release their mesh instances and their owned meshes.
        this.batches.length = 0;
        this.material.destroy();
    }
}

export { VoxelWireOverlay, surfaceCells, nearbySurfaceCells, appendCellEdges, cellEdgeBatches };
