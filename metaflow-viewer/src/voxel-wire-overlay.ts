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
    const solid = (x: number, y: number, z: number) => collision.isVoxelSolid(x, y, z);
    for (let z = lo[2]; z <= hi[2]; z++) {
        for (let y = lo[1]; y <= hi[1]; y++) {
            for (let x = lo[0]; x <= hi[0]; x++) {
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
    private readonly mesh: Mesh;
    private readonly material = new StandardMaterial();
    private readonly center = new Vec3(Infinity, Infinity, Infinity);
    private colliders: VoxelCollision[] = [];
    private iterator: Generator<Cell | null, void, unknown> | null = null;
    private positions: number[] = [];
    private readonly seen = new Set<string>();
    private lastUpload = 0;
    private uploaded = 0;
    private instance: MeshInstance | null = null;

    constructor(
        private readonly app: AppBase,
        private readonly collision: VoxelCollision | TiledVoxelCollision,
        private readonly camera: Entity
    ) {
        this.mesh = new Mesh(app.graphicsDevice);
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
        this.entity.addComponent('render', { meshInstances: [], layers: [LAYERID_IMMEDIATE] });
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
            this.iterator = (function* () {
                for (const c of colliders) yield* surfaceCells(c, sampleCenter);
            })();
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
            this.mesh.setPositions(this.positions);
            this.mesh.update(PRIMITIVE_LINES);
            if (!this.instance) {
                this.instance = new MeshInstance(this.mesh, this.material);
                this.entity.render.meshInstances = [this.instance];
            }
            this.uploaded = this.positions.length;
            this.lastUpload = performance.now();
            this.entity.enabled = this.uploaded > 0;
        }
        if (this.iterator) this.app.renderNextFrame = true;
    }

    destroy(): void {
        this.iterator = null;
        this.entity.destroy();
        this.mesh.destroy();
        this.material.destroy();
    }
}

export { VoxelWireOverlay, surfaceCells, appendCellEdges };
