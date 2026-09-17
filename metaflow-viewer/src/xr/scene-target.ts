import { Entity, Vec3 } from 'playcanvas';

import { Picker } from '../picker';
import type { Global } from '../types';

/** An observation point, not a floor or a promise of collision-free space. */
const observationTarget = (head: Vec3, hit: Vec3 | null): Vec3 | null => {
    if (!hit || ![hit.x, hit.y, hit.z].every(Number.isFinite)) return null;
    const delta = new Vec3().sub2(hit, head),
        distance = delta.length();
    if (distance > 10 || distance <= 0.75) return null;
    return delta.mulScalar((distance - 0.75) / distance).add(head);
};
const stepToTarget = (head: Vec3, target: Vec3, speed: number, dt: number): Vec3 => {
    const delta = new Vec3().sub2(target, head),
        distance = delta.length();
    if (!distance) return delta;
    return delta.mulScalar(Math.min(distance, speed * Math.max(0, Math.min(dt, 0.05))) / distance);
};

/** One in-flight request, invalidatable without allowing a second GPU readback. */
class SceneTargetQuery {
    private generation = 0;
    private pending: Promise<Vec3 | null> | null = null;
    private nextPreview = 0;
    invalidate(): void {
        this.generation++;
    }
    get busy(): boolean {
        return this.pending !== null;
    }
    async query(now: number, commit: boolean, operation: () => Promise<Vec3 | null>): Promise<Vec3 | null> {
        const generation = this.generation;
        while (this.pending) {
            if (!commit) return null;
            await this.pending.catch((): null => null);
            if (generation !== this.generation) return null;
        }
        if (!commit && now < this.nextPreview) return null;
        this.nextPreview = now + 100;
        const request = operation();
        this.pending = request;
        try {
            const result = await request;
            return generation === this.generation ? result : null;
        } finally {
            if (this.pending === request) this.pending = null;
        }
    }
}

/** A dedicated mono picking camera; never overwrite an XR eye or the tracked head. */
class XrScenePicker {
    private readonly camera = new Entity('XR scene query camera');
    private readonly picker: Picker;
    private closed = false;
    constructor(global: Global) {
        this.camera.addComponent('camera', { enabled: false, fov: 8, nearClip: 0.01, farClip: 12 });
        global.app.root.addChild(this.camera);
        this.picker = new Picker(global.app, this.camera, {
            width: 65,
            height: 65,
            fresh: true,
            sourceCamera: global.camera
        });
    }
    async pick(origin: Vec3, direction: Vec3): Promise<Vec3 | null> {
        if (this.closed || ![...origin.toArray(), ...direction.toArray()].every(Number.isFinite)) return null;
        this.camera.setPosition(origin);
        const up = Math.abs(direction.y) > 0.99 ? new Vec3(0, 0, 1) : Vec3.UP;
        this.camera.lookAt(new Vec3().add2(origin, direction), up);
        return this.picker.pick(0.5, 0.5);
    }
    destroy(): void {
        this.closed = true;
        this.picker.release();
        this.camera.destroy();
    }
}
export { observationTarget, stepToTarget, SceneTargetQuery, XrScenePicker };
