import {
    Entity,
    Mesh,
    MeshInstance,
    StandardMaterial,
    Texture,
    Vec3,
    CULLFACE_NONE,
    BLEND_NORMAL,
    LAYERID_UI
} from 'playcanvas';

import { localize } from '../localization';
import type { Global } from '../types';

import type { TeleportReason } from './teleport';

/** One persistent text surface, shared by all preview sources; no per-frame texture allocation. */
class TeleportHint {
    private readonly canvas = document.createElement('canvas');
    private readonly texture: Texture;
    private readonly material = new StandardMaterial();
    private readonly mesh: Mesh;
    private readonly entity = new Entity('XR teleport feedback');
    private signature = '';
    private readonly position = new Vec3();
    constructor(private readonly global: Global) {
        this.canvas.width = 768;
        this.canvas.height = 128;
        this.texture = new Texture(global.app.graphicsDevice, {
            name: 'XR teleport feedback',
            mipmaps: true,
            flipY: true
        });
        this.material.useLighting = this.material.useTonemap = this.material.useFog = false;
        this.material.diffuse.set(0, 0, 0);
        this.material.emissive.set(1, 1, 1);
        this.material.emissiveMap = this.material.opacityMap = this.texture;
        this.material.opacityMapChannel = 'a';
        this.material.blendType = BLEND_NORMAL;
        this.material.cull = CULLFACE_NONE;
        this.material.depthTest = this.material.depthWrite = false;
        this.material.update();
        this.mesh = new Mesh(global.app.graphicsDevice);
        this.mesh.setPositions([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
        this.mesh.setNormals([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
        this.mesh.setUvs(0, [0, 0, 1, 0, 1, 1, 0, 1]);
        this.mesh.setIndices([0, 1, 2, 0, 2, 3]);
        this.mesh.update();
        this.entity.addComponent('render', {
            meshInstances: [new MeshInstance(this.mesh, this.material)],
            layers: [LAYERID_UI]
        });
        global.app.root.addChild(this.entity);
        this.hide();
    }
    hide(): void {
        this.entity.enabled = false;
    }
    show(reason: TeleportReason | 'observe', at: Vec3): void {
        const label = localize(`xr.target-${reason}`);
        if (label !== this.signature) {
            this.signature = label;
            const ctx = this.canvas.getContext('2d')!;
            ctx.clearRect(0, 0, 768, 128);
            ctx.fillStyle = '#10212bef';
            ctx.beginPath();
            ctx.roundRect(0, 0, 768, 128, 28);
            ctx.fill();
            ctx.fillStyle =
                reason === 'valid' || reason === 'observe' ? '#92e9dc' : reason === 'loading' ? '#ffd479' : '#ffaaa0';
            ctx.font = '600 52px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, 384, 64, 710);
            this.texture.setSource(this.canvas);
        }
        const head = this.global.camera;
        const width = Math.min(1.5, Math.max(0.5, head.getPosition().distance(at) * 0.18));
        this.position.copy(at);
        this.position.y += 0.2;
        // An unknown tile may start at the controller itself. Keep its text readable
        // instead of placing a large label inside the headset near clipping plane.
        if (head.getPosition().distance(this.position) < 0.75) {
            this.position.copy(head.forward).mulScalar(1.2).add(head.getPosition());
            this.position.y -= 0.2;
        }
        this.entity.setPosition(this.position);
        this.entity.setRotation(head.getRotation());
        this.entity.setLocalScale(width, width / 6, 1);
        this.entity.enabled = true;
    }
    destroy(): void {
        this.entity.destroy();
        this.mesh.destroy();
        this.material.destroy();
        this.texture.destroy();
    }
}
export { TeleportHint };
