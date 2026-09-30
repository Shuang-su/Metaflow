import { Entity, Layer, Mesh, MeshInstance, PlaneGeometry, RenderPassForward, Vec3 } from 'playcanvas';

import { Annotation as ViewerAnnotation } from './viewer-compat/annotation';
import type { Annotation } from '../../../metaflow-viewer/src/settings';
import type { Scene } from '../scene';

/** Viewer billboards in Editor's explicit render graph, without Viewer DOM/global setup. */
export class StudioHotspots {
    readonly base: RenderPassForward;
    readonly overlay: RenderPassForward;
    private layers: Layer[];
    private mesh: Mesh;
    private entries: { entity: Entity; texture: ReturnType<typeof ViewerAnnotation._createHotspotTexture>; materials: ReturnType<typeof ViewerAnnotation._createHotspotMaterial>[] }[] = [];
    private viewPosition = new Vec3();
    private initialized = false;
    constructor(private scene: Scene) {
        const { app, graphicsDevice } = scene;
        this.layers = ['Studio Hotspot Base', 'Studio Hotspot Overlay'].map(name => new Layer({ name }));
        for (const layer of this.layers) app.scene.layers.push(layer);
        scene.camera.camera.layers = [...scene.camera.camera.layers, ...this.layers.map(layer => layer.id)];
        this.mesh = Mesh.fromGeometry(graphicsDevice, new PlaneGeometry({ widthSegments: 1, lengthSegments: 1 }));
        const passes = this.layers.map(() => {
            const pass = new RenderPassForward(graphicsDevice, app.scene.layers, app.scene, app.renderer);
            return pass;
        });
        [this.base, this.overlay] = passes;
    }
    prepare(annotations: Annotation[], hovered: number, enabled: boolean, cssHeight: number) {
        const { camera, app } = this.scene;
        if (!this.initialized) {
            this.base.init(camera.mainTarget); this.overlay.init(camera.mainTarget);
            this.base.addLayer(camera.camera, this.layers[0], true, false);
            this.overlay.addLayer(camera.camera, this.layers[1], true, false); this.initialized = true;
        }
        while (this.entries.length > annotations.length) this.removeLast();
        while (this.entries.length < annotations.length) {
            const index = this.entries.length;
            const texture = ViewerAnnotation._createHotspotTexture(app, String(index + 1));
            const materials = [ViewerAnnotation._createHotspotMaterial(texture), ViewerAnnotation._createHotspotMaterial(texture, { opacity: 0.25, depthTest: false, depthWrite: false })];
            const entity = new Entity(`Studio hotspot ${index + 1}`);
            materials.forEach((material, layer) => {
                const child = new Entity(); const meshInstance = new MeshInstance(this.mesh, material);
                meshInstance.cull = false;
                child.addComponent('render', { layers: [this.layers[layer].id], meshInstances: [meshInstance] }); entity.addChild(child);
            });
            app.root.addChild(entity); this.entries.push({ entity, texture, materials });
        }
        const cam = camera.camera;
        this.entries.forEach(({ entity, materials }, index) => {
            const position = annotations[index].position;
            this.viewPosition.set(...position); cam.viewMatrix.transformPoint(this.viewPosition, this.viewPosition);
            const depth = -this.viewPosition.z;
            entity.enabled = enabled && depth > 0;
            entity.setPosition(...position); entity.setRotation(camera.mainCamera.getRotation()); entity.rotateLocal(90, 0, 0);
            const scale = ViewerAnnotation.hotspotSize / Math.max(1, cssHeight) * 2 * depth / cam.projectionMatrix.data[5];
            entity.setLocalScale(scale, scale, scale);
            const color = index === hovered ? ViewerAnnotation.hoverColor : ViewerAnnotation.hotspotColor;
            for (const material of materials) {
                if (!material.emissive.equals(color)) {
                    material.emissive.copy(color); material.update();
                }
            }
        });
        this.base.enabled = this.overlay.enabled = enabled && annotations.length > 0;
    }
    private removeLast() {
        const entry = this.entries.pop(); entry.entity.destroy();
        entry.materials.forEach(material => material.destroy()); entry.texture.destroy();
    }
    destroy() {
        while (this.entries.length) this.removeLast();
        this.base.destroy(); this.overlay.destroy(); this.mesh.destroy();
        const ids = this.layers.map(layer => layer.id);
        this.scene.camera.camera.layers = this.scene.camera.camera.layers.filter(id => !ids.includes(id));
        this.layers.forEach(layer => this.scene.app.scene.layers.remove(layer));
    }
}
