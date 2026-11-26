import type { Entity } from 'playcanvas';
import { Mat4, Quat } from 'playcanvas';

export type SceneTransform = {
    displayEuler?: [number, number, number];
    /** Row-major matrix mapping the stored resource directly into viewer world. */
    storedToWorld?: number[][];
};

export function applySceneTransform(node: Entity, transform: SceneTransform) {
    if (transform.storedToWorld) {
        if (transform.displayEuler) throw Error('A layer must specify only one display transform');
        const rows = transform.storedToWorld;
        if (rows.length !== 4 || rows.some((row) => row.length !== 4 || row.some((n) => !Number.isFinite(n))))
            throw Error('Invalid scene transform');
        const matrix = new Mat4().set(rows[0].map((_, column) => rows.map((row) => row[column])).flat());
        const position = matrix.getTranslation(),
            rotation = new Quat().setFromMat4(matrix),
            scale = matrix.getScale();
        const rebuilt = new Mat4().setTRS(position, rotation, scale);
        if (rebuilt.data.some((n, i) => Math.abs(n - matrix.data[i]) > 1e-5))
            throw Error('Scene transform must be a positive-scale TRS matrix');
        node.setLocalPosition(position);
        node.setLocalRotation(rotation);
        node.setLocalScale(scale);
    } else {
        node.setLocalPosition(0, 0, 0);
        node.setLocalScale(1, 1, 1);
        node.setLocalEulerAngles(...(transform.displayEuler ?? [0, 0, 180]));
    }
}
