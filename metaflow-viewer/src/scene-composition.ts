import type { Entity } from 'playcanvas';

import type { CreateViewerOptions } from './options';

type Layer = NonNullable<CreateViewerOptions['sceneLayers']>[number];

/** Wait for all loads before releasing a failed composition, including late successes. */
export async function assembleSceneLayers(
    primary: Entity,
    layers: Layer[],
    root: Entity,
    load: (layer: Layer) => Promise<Entity | null>,
    cancelled: () => boolean,
    release: (node: Entity) => void
) {
    const owned = [primary];
    const configure = (node: Entity, layer: Layer) => {
        node.name = `scene-layer-${layer.id}`;
        node.enabled = layer.visible;
        node.reparent(root);
    };
    try {
        configure(primary, layers[0]);
        // Fetches can start earlier, but at most two additional decoders/uploads
        // run together. Wait for both workers before releasing any late successes.
        const pending = layers.slice(1);
        let next = 0;
        const results = await Promise.allSettled(
            Array.from({ length: Math.min(2, pending.length) }, async () => {
                while (next < pending.length && !cancelled()) {
                    const layer = pending[next++];
                    const node = await load(layer);
                    if (node) {
                        owned.push(node);
                        if (!cancelled()) configure(node, layer);
                    }
                }
            })
        );
        const failed = results.find((r) => r.status === 'rejected');
        if (failed?.status === 'rejected') throw failed.reason;
        if (cancelled()) for (const node of owned) release(node);
    } catch (error) {
        for (const node of owned) release(node);
        throw error;
    }
}
