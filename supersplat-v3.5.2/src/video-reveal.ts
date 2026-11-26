import type { BoundingBox } from 'playcanvas';
import { Vec3 } from 'playcanvas';

import { GsplatRevealRadial  } from '../../metaflow-viewer/src/gsplat-reveal-radial';
import type { RevealDotProfile } from '../../metaflow-viewer/src/gsplat-reveal-radial';

import type { Scene } from './scene';
import type { Splat } from './splat';

const visibleRevealSplats = (scene: Scene): Splat[] => scene.events.invoke('scene.splats')
.filter((s: Splat) => s.visible && s.instances.count > 0);

const createVideoRevealEffect = (scene: Scene, splats: Splat[], dotProfile: RevealDotProfile = 'streamingScene') => {
    if (!splats.length) throw new Error('There are no visible Gaussian elements to render');
    const bounds = splats[0].worldBound.clone() as BoundingBox;
    for (const splat of splats.slice(1)) bounds.add(splat.worldBound);
    const focus = scene.events.invoke('camera.getPose')?.target;
    // The shared effect computes timing and parameters only. Editor 3.x has no
    // per-entity GSplat material: its projection pass owns the GPU adapter.
    return new GsplatRevealRadial(scene.app, [], bounds,
        focus ? new Vec3(focus.x, focus.y, focus.z) : bounds.center, { dotProfile });
};

class VideoReveal {
    readonly effect: GsplatRevealRadial;
    private readonly scene: Scene;

    constructor(scene: Scene, splats: Splat[], profile: RevealDotProfile) {
        this.scene = scene;
        this.effect = createVideoRevealEffect(scene, splats, profile);
    }

    prepare(seconds: number, signal: AbortSignal) {
        signal.throwIfAborted();
        this.scene.projectedSplatRenderer.videoReveal = this.effect.getCaptureParameters(seconds);
    }

    destroy() {
        this.scene.projectedSplatRenderer.videoReveal = null;
    }
}

export { createVideoRevealEffect, VideoReveal, visibleRevealSplats };
