import {
    StandardMaterial,
    BLEND_NORMAL,
    CULLFACE_NONE,
    Entity,
    LAYERID_UI,
    Mat4,
    Mesh,
    MeshInstance,
    Texture,
    Vec3
} from 'playcanvas';
import type { XrInputSource } from 'playcanvas';

import { localize } from '../localization';
import type { Global } from '../types';

import { headYaw } from './locomotion';
import type { XrPreferences } from './preferences';

type MenuAction = 'resume' | 'reset' | 'posture' | 'calibrate' | 'locomotion' | 'help' | 'exit';
type MenuRow = { action: MenuAction; label: string };

/** One unlit world-space surface: works in stereo without DOM Overlay or external fonts. */
class XrSpatialMenu {
    open = false;
    private help = false;
    private readonly entity: Entity;
    private readonly canvas = document.createElement('canvas');
    private readonly texture: Texture;
    private readonly material: StandardMaterial;
    private readonly mesh: Mesh;
    private readonly inverse = new Mat4();
    private readonly rayOrigin = new Vec3();
    private readonly rayDirection = new Vec3();
    private readonly pressed = new Map<XrInputSource, number>();
    private rows: MenuRow[] = [];
    private hovered = -1;
    private signature = '';
    private width = 0.68;
    private height = 0.86;
    private status = '';
    private trackingLimited = false;

    constructor(
        private readonly global: Global,
        private readonly action: (action: MenuAction) => void
    ) {
        this.canvas.width = 768;
        this.canvas.height = 1024;
        // Mipmaps preserve thin glyph strokes when the panel is viewed at a distance.
        this.texture = new Texture(global.app.graphicsDevice, { name: 'XR menu', mipmaps: true, flipY: true });
        this.material = new StandardMaterial();
        this.material.useLighting = false;
        this.material.useTonemap = false;
        this.material.useFog = false;
        this.material.diffuse.set(0, 0, 0);
        this.material.emissive.set(1, 1, 1);
        this.material.emissiveMap = this.texture;
        this.material.opacityMap = this.texture;
        this.material.opacityMapChannel = 'a';
        this.material.blendType = BLEND_NORMAL;
        this.material.cull = CULLFACE_NONE;
        this.material.depthWrite = false;
        this.material.depthTest = false;
        this.material.update();
        this.mesh = new Mesh(global.app.graphicsDevice);
        this.mesh.setPositions([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
        this.mesh.setNormals([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
        this.mesh.setUvs(0, [0, 0, 1, 0, 1, 1, 0, 1]);
        this.mesh.setIndices([0, 1, 2, 0, 2, 3]);
        this.mesh.update();
        this.entity = new Entity('Metaflow XR menu');
        this.entity.addComponent('render', {
            meshInstances: [new MeshInstance(this.mesh, this.material)],
            layers: [LAYERID_UI]
        });
        global.app.root.addChild(this.entity);
        this.entity.enabled = false;
    }

    show(): void {
        this.open = true;
        this.help = false;
        this.pressed.clear();
        this.hovered = -1;
        this.width = 0.68;
        this.height = 0.86;
        this.place(false);
        this.signature = '';
    }

    close(): void {
        this.open = false;
        this.help = false;
        this.cancel();
        this.signature = '';
    }

    toggle(): void {
        if (this.open) this.close();
        else this.show();
    }

    cancel(): void {
        this.pressed.clear();
        this.hovered = -1;
    }

    hide(): void {
        this.close();
        this.entity.enabled = false;
    }

    private place(compact: boolean): void {
        const head = this.global.camera;
        const yaw = headYaw(head);
        const radians = (yaw * Math.PI) / 180;
        const pitch = Math.max(-Math.PI / 6, Math.min(Math.PI / 6, Math.asin(head.forward.y)));
        const forward = new Vec3(
            -Math.sin(radians) * Math.cos(pitch),
            Math.sin(pitch),
            -Math.cos(radians) * Math.cos(pitch)
        );
        const right = new Vec3(Math.cos(radians), 0, -Math.sin(radians));
        const position = head.getPosition().clone().add(forward.mulScalar(1.2));
        if (compact) position.add(right.mulScalar(0.38));
        position.y -= compact ? 0.36 : 0.08;
        this.entity.setPosition(position);
        this.entity.setEulerAngles((pitch * 180) / Math.PI, yaw, 0);
    }

    private hit(source: XrInputSource): number {
        this.inverse.copy(this.entity.getWorldTransform()).invert();
        this.inverse.transformPoint(source.getOrigin(), this.rayOrigin);
        this.inverse.transformVector(source.getDirection(), this.rayDirection);
        if (this.rayDirection.z >= -0.00001) return -1;
        const distance = -this.rayOrigin.z / this.rayDirection.z;
        if (distance <= 0 || distance > 5) return -1;
        const x = this.rayOrigin.x + this.rayDirection.x * distance;
        const y = this.rayOrigin.y + this.rayDirection.y * distance;
        if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5) return -1;
        if (!this.open) return 0;
        const py = (0.5 - y) * this.canvas.height;
        const index = Math.floor((py - 242) / 96);
        return py >= 242 && index >= 0 && index < this.rows.length && (py - 242) % 96 < 80 ? index : -1;
    }

    begin(source: XrInputSource): boolean {
        const index = this.hit(source);
        if (this.open || index >= 0) {
            this.pressed.set(source, index);
            return true;
        }
        return false;
    }

    select(source: XrInputSource): void {
        const index = this.pressed.get(source);
        if (index === undefined || index < 0 || this.hit(source) !== index) return;
        this.pressed.delete(source);
        if (!this.open) {
            this.show();
            return;
        }
        const row = this.rows[index];
        if (!row) return;
        if (row.action === 'help') {
            this.help = !this.help;
            this.signature = '';
        } else this.action(row.action);
    }

    release(source: XrInputSource): void {
        this.pressed.delete(source);
    }

    update(
        preferences: XrPreferences,
        status: string,
        sources: Set<XrInputSource>,
        valid: Set<XrInputSource>,
        trackingLimited = false
    ): void {
        this.entity.enabled = true;
        this.status = status;
        this.trackingLimited = trackingLimited;
        if (!this.open) {
            this.width = 0.23;
            this.height = 0.075;
            // Keep the small summon control reachable. Freeze it during a selection.
            if (!this.pressed.size) this.place(true);
        }
        this.entity.setLocalScale(this.width, this.height, 1);
        this.hovered = -1;
        for (const source of sources) {
            if (!valid.has(source)) continue;
            const hit = this.hit(source);
            if (hit >= 0) this.hovered = hit;
            // Transient gaze/pinch is rendered only while supplied by the browser.
            if (this.open || hit >= 0) {
                const end = source.getDirection().clone().mulScalar(1.4).add(source.getOrigin());
                this.global.app.drawLine(
                    source.getOrigin(),
                    end,
                    this.material.emissive,
                    false,
                    this.global.app.scene.layers.getLayerById(LAYERID_UI)
                );
            }
        }
        const signature = JSON.stringify([this.open, this.help, this.hovered, preferences, status, trackingLimited]);
        if (signature !== this.signature) {
            this.signature = signature;
            this.draw(preferences);
        }
    }

    private draw(preferences: XrPreferences): void {
        const ctx = this.canvas.getContext('2d')!;
        const text = (key: string) => localize(`xr.${key}`);
        ctx.clearRect(0, 0, 768, 1024);
        ctx.fillStyle = '#10212bef';
        ctx.beginPath();
        ctx.roundRect(0, 0, 768, 1024, 44);
        ctx.fill();
        if (!this.open) {
            ctx.fillStyle = this.hovered >= 0 ? '#92e9dc' : '#e2f5f4';
            ctx.font = '600 210px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text('menu'), 384, 512, 690);
            this.texture.setSource(this.canvas);
            return;
        }
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#92e9dc';
        ctx.font = '500 23px system-ui, sans-serif';
        ctx.fillText('METAFLOW  /  IMMERSIVE', 48, 55);
        ctx.fillStyle = '#f1faf9';
        ctx.font = '600 45px system-ui, sans-serif';
        ctx.fillText(text(this.help ? 'help' : 'title'), 48, 117);
        ctx.fillStyle = '#a9c4cb';
        ctx.font = '28px system-ui, sans-serif';
        ctx.fillText(text(this.trackingLimited ? 'tracking-limited' : this.status), 48, 172, 672);
        ctx.fillText(text('menu-hint'), 48, 213, 672);
        this.rows = this.help
            ? [
                  { action: 'help', label: text('back') },
                  { action: 'resume', label: text('resume') }
              ]
            : [
                  { action: 'resume', label: text('resume') },
                  { action: 'reset', label: text('reset') },
                  { action: 'posture', label: `${text('posture')}: ${text(preferences.posture)}` },
                  { action: 'calibrate', label: text('calibrate') },
                  { action: 'locomotion', label: `${text('locomotion')}: ${text(preferences.locomotion)}` },
                  { action: 'help', label: text('help') },
                  { action: 'exit', label: text('exit') }
              ];
        if (this.status === 'ar-status')
            this.rows = this.rows.filter((row) => ['resume', 'help', 'exit'].includes(row.action));
        this.rows.forEach((row, i) => {
            const y = 242 + i * 96;
            ctx.fillStyle = i === this.hovered ? '#2b655f' : '#213b47';
            ctx.beginPath();
            ctx.roundRect(32, y, 704, 80, 20);
            ctx.fill();
            ctx.fillStyle = '#f1faf9';
            ctx.font = '500 38px system-ui, sans-serif';
            ctx.fillText(row.label, 56, y + 51, 650);
        });
        if (this.help) {
            ctx.fillStyle = '#d8e7eb';
            ctx.font = '28px system-ui, sans-serif';
            [
                'help-move',
                'help-single',
                'help-turn',
                'help-select',
                'help-vision',
                'help-floor',
                'help-posture',
                'help-free'
            ].forEach((key, i) => {
                ctx.fillText(text(key), 48, 490 + i * 65, 672);
            });
        }
        ctx.fillStyle = '#87a5ae';
        ctx.font = '24px system-ui, sans-serif';
        ctx.fillText(text(this.trackingLimited ? 'tracking-recovery' : 'tracking-hint'), 48, 977, 672);
        this.texture.setSource(this.canvas);
    }

    destroy(): void {
        this.entity.destroy();
        this.mesh.destroy();
        this.material.destroy();
        this.texture.destroy();
    }
}

export { XrSpatialMenu };
export type { MenuAction };
