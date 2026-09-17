import {
    StandardMaterial,
    BLEND_NORMAL,
    CULLFACE_NONE,
    Entity,
    Color,
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

import { DwellInput } from './dwell';
import { confirmSelection } from './feedback';
import { xrGuidance } from './guidance';
import { InputOwner } from './input-owner';
import { hasStick, headYaw } from './locomotion';
import type { XrPreferences } from './preferences';
import { WheelInput } from './wheel';

type MenuAction =
    | 'resume'
    | 'reset'
    | 'posture'
    | 'calibrate'
    | 'locomotion'
    | 'help'
    | 'exit'
    | 'collision'
    | 'settings'
    | 'movement-speed'
    | 'turn-speed'
    | 'trajectory'
    | 'auxiliary'
    | 'confirmation'
    | 'dwell-duration'
    | 'main-hand'
    | 'hand-movement'
    | 'boost'
    | 'turn-left'
    | 'turn-right'
    | 'confirm'
    | 'cancel';
type MenuRow = { action: MenuAction; label: string };

/** One unlit world-space surface: works in stereo without DOM Overlay or external fonts. */
class XrSpatialMenu {
    open = false;
    readonly ownership = new InputOwner<XrInputSource>();
    readonly dwell = new DwellInput();
    private auxiliary = false;
    private confirmation: MenuAction | null = null;
    private revision = 0;
    private dwellSource: XrInputSource | null = null;
    private hoverOnly = false;
    private dwellTooFar = false;
    private handsOnly = false;
    private palmPosition: Vec3 | null = null;
    private palmSource: XrInputSource | null = null;
    private readonly progressPoints = Array.from({ length: 33 }, () => new Vec3());
    private readonly progressCenter = new Vec3();
    private readonly progressRight = new Vec3();
    private readonly progressUp = new Vec3();
    private readonly progressColor = new Color(0.57, 0.91, 0.86);
    private help = false;
    private settings = false;
    private guidance: string[] = ['input-wait', 'tracking-hint'];
    private wheelOwner: XrInputSource | null = null;
    private readonly wheel = new WheelInput();
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
    private inputHint = 'hand-hint';

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
        this.wheelOwner = null;
        this.wheel?.cancel();
        this.cancel();
        this.auxiliary = false;
        this.confirmation = null;
        this.settings = false;
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
        this.wheelOwner = null;
        this.open = false;
        this.help = false;
        this.cancel();
        this.signature = '';
    }

    toggle(source?: XrInputSource): void {
        if (this.wheelOwner && source !== this.wheelOwner) return;
        if (this.open) this.close();
        else if (source && hasStick(source)) {
            this.show();
            this.wheelOwner = source;
            this.width = this.height = 0.45;
        } else this.show();
    }

    canToggle(source: XrInputSource): boolean {
        return !this.wheelOwner || source === this.wheelOwner;
    }

    get wheelOpen(): boolean {
        return !!this.wheelOwner;
    }

    inputLost(source: XrInputSource): void {
        this.release(source);
        if (source === this.wheelOwner) this.show();
    }

    private sampleWheel(): void {
        const source = this.wheelOwner;
        if (source) this.wheel.update(source.gamepad.axes, !!source.gamepad.buttons[0]?.pressed);
    }

    cancel(): void {
        this.wheel?.cancel();
        this.pressed.clear();
        this.hovered = -1;
        this.revision++;
        this.dwell.reset(true);
        this.dwellSource = null;
        this.ownership.clear();
    }

    hide(): void {
        this.close();
        this.entity.enabled = false;
    }

    setPalm(position: Vec3 | null, source: XrInputSource | null = null): void {
        this.palmPosition = position;
        this.palmSource = source;
    }

    private changed(): void {
        this.cancel();
        this.signature = '';
    }

    private activate(action: MenuAction): void {
        if (action === 'confirm') {
            const pending = this.confirmation;
            this.confirmation = null;
            this.changed();
            if (pending) this.action(pending);
        } else if (action === 'cancel') {
            this.confirmation = null;
            this.changed();
        } else if (['reset', 'calibrate', 'boost', 'exit'].includes(action)) {
            this.wheelOwner = null;
            this.width = 0.68;
            this.height = 0.86;
            this.confirmation = action;
            this.changed();
        } else if (action === 'settings' || action === 'auxiliary' || action === 'help') {
            if (action === 'settings') this.settings = !this.settings;
            if (action === 'auxiliary') this.auxiliary = !this.auxiliary;
            if (action === 'help') this.help = !this.help;
            this.changed();
        } else {
            this.changed();
            this.action(action);
        }
    }

    private updateDwell(preferences: XrPreferences, sources: Set<XrInputSource>, valid: Set<XrInputSource>): void {
        if (preferences.confirmation !== 'dwell' || this.wheelOpen || this.pressed.size) {
            this.dwell.reset(true);
            if (this.ownership.kind === 'dwell') this.ownership.clear();
            this.dwellSource = null;
            return;
        }
        const eligible = [...sources].filter(
            (source) =>
                valid.has(source) &&
                source !== this.palmSource &&
                source.inputSource?.targetRayMode !== 'transient-pointer'
        );
        if (this.dwellSource && !eligible.includes(this.dwellSource)) {
            this.ownership.release(this.dwellSource);
            this.dwellSource = null;
            this.dwell.reset(true);
        }
        const source = this.dwellSource ?? eligible.find((source) => this.hit(source) >= 0);
        this.dwellTooFar = false;
        let index = -1,
            inside = false;
        if (source) {
            index = this.hit(source);
            if (index >= 0) {
                const headDistance = this.global.camera.getPosition().distance(this.entity.getPosition());
                const angularSize =
                    2 * Math.atan((this.open ? (this.height * 70) / 1024 : this.height) / (2 * headDistance));
                this.dwellTooFar = angularSize < Math.PI / 90;
                inside = angularSize >= Math.PI / 90 && (!this.open || this.rayOrigin.x >= 0.32);
                if (!this.ownership.claim(source, 'dwell')) return;
                this.dwellSource = source;
            }
        }
        const key = index >= 0 ? `${this.revision}:${this.open ? this.rows[index]?.action : 'entry'}` : null;
        const commit = this.dwell.update(performance.now(), key, inside, preferences.dwellDuration ?? 1000);
        if (commit && source) {
            confirmSelection(source);
            if (this.open) this.activate(this.rows[index].action);
            else this.show();
        } else if (index < 0 && this.dwellSource) {
            this.ownership.release(this.dwellSource);
            this.dwellSource = null;
        }
        if (inside && this.dwell.progress > 0) {
            const y = this.open ? 0.5 - (277 + index * 84) / 1024 : 0;
            this.progressCenter.set(this.open ? 0.41 : 0, y, 0.001);
            this.entity.getWorldTransform().transformPoint(this.progressCenter, this.progressCenter);
            this.progressRight.copy(this.entity.right);
            this.progressUp.copy(this.entity.up);
            const radius = this.open ? (this.height * 26) / 1024 : 0.027;
            const count = Math.ceil(this.dwell.progress * 32);
            const layer = this.global.app.scene.layers.getLayerById(LAYERID_UI);
            for (let i = 0; i <= count; i++) {
                const angle = -Math.PI / 2 + Math.min(i / 32, this.dwell.progress) * Math.PI * 2;
                const x = Math.cos(angle) * radius,
                    y = -Math.sin(angle) * radius;
                this.progressPoints[i].set(
                    this.progressCenter.x + this.progressRight.x * x + this.progressUp.x * y,
                    this.progressCenter.y + this.progressRight.y * x + this.progressUp.y * y,
                    this.progressCenter.z + this.progressRight.z * x + this.progressUp.z * y
                );
                if (i)
                    this.global.app.drawLine(
                        this.progressPoints[i - 1],
                        this.progressPoints[i],
                        this.progressColor,
                        false,
                        layer
                    );
            }
        }
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

    private intersect(source: XrInputSource, point?: Vec3): boolean {
        this.inverse.copy(this.entity.getWorldTransform()).invert();
        this.inverse.transformPoint(source.getOrigin(), this.rayOrigin);
        this.inverse.transformVector(source.getDirection(), this.rayDirection);
        if (this.rayDirection.z >= -0.00001) return false;
        const distance = -this.rayOrigin.z / this.rayDirection.z;
        if (distance <= 0 || distance > 5) return false;
        const x = this.rayOrigin.x + this.rayDirection.x * distance;
        const y = this.rayOrigin.y + this.rayDirection.y * distance;
        if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5) return false;
        if (point) point.copy(source.getDirection()).mulScalar(distance).add(source.getOrigin());
        this.rayOrigin.set(x, y, 0);
        return true;
    }

    private hit(source: XrInputSource): number {
        if (!this.intersect(source)) return -1;
        if (!this.open) return 0;
        const py = (0.5 - this.rayOrigin.y) * this.canvas.height;
        const index = Math.floor((py - 242) / 84);
        return py >= 242 && index >= 0 && index < this.rows.length && (py - 242) % 84 < 70 ? index : -1;
    }

    isPointedAt(source: XrInputSource): boolean {
        return this.hit(source) >= 0;
    }

    begin(source: XrInputSource): boolean {
        if (this.wheelOwner && source !== this.wheelOwner) return true;
        if ((this.open || this.hit(source) >= 0) && !this.ownership.claim(source, 'direct')) return true;
        this.dwell.reset(true);
        this.dwellSource = null;
        if (this.wheelOwner) {
            if (source === this.wheelOwner) {
                this.sampleWheel();
                this.wheel.begin();
            }
            return true;
        }
        const index = this.hit(source);
        if (this.open || index >= 0) {
            this.pressed.set(source, index);
            return true;
        }
        return false;
    }

    select(source: XrInputSource): void {
        if (this.wheelOwner) {
            if (source !== this.wheelOwner) return;
            this.sampleWheel();
            const selected = this.wheel.commit();
            if (selected === null) return;
            confirmSelection(source);
            if (selected < 0) this.action('resume');
            else if (selected === 2) this.show();
            else this.activate((['resume', 'locomotion', 'settings', 'reset'] as const)[selected]);
            return;
        }
        const index = this.pressed.get(source);
        if (index === undefined || index < 0 || this.hit(source) !== index) return;
        this.pressed.delete(source);
        if (!this.open) {
            confirmSelection(source);
            this.show();
            return;
        }
        const row = this.rows[index];
        if (!row) return;
        confirmSelection(source);
        this.activate(row.action);
    }

    release(source: XrInputSource): void {
        if (source === this.wheelOwner) this.wheel.release();
        this.pressed.delete(source);
        this.ownership.release(source);
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
        this.handsOnly = ![...valid].some(hasStick);
        this.hoverOnly = preferences.confirmation === 'dwell';
        if (this.open && !valid.size) this.status = 'input-wait';
        if (this.wheelOwner) {
            if (!sources.has(this.wheelOwner) || !valid.has(this.wheelOwner)) this.show();
            else {
                this.sampleWheel();
                this.entity.setLocalScale(this.width, this.height, 1);
                const signature = JSON.stringify([
                    'wheel',
                    this.wheel.selection,
                    this.wheel.armed,
                    this.wheel.pressing,
                    preferences
                ]);
                if (signature !== this.signature) {
                    this.signature = signature;
                    this.drawWheel();
                }
                return;
            }
        }
        const sticks = [...valid].filter(hasStick).length;
        this.guidance = xrGuidance(
            sticks,
            [...valid].some((source) => !!source.hand),
            [...valid].some((source) => source.inputSource?.targetRayMode === 'transient-pointer'),
            preferences.locomotion === 'comfort',
            status === 'free-roam',
            status === 'ar-status'
        );
        this.inputHint = sticks > 1 ? 'help-move' : sticks === 1 ? 'continuous-hint' : 'hand-hint';
        if (!this.open) {
            this.width = 0.23;
            this.height = 0.075;
            this.entity.setLocalScale(this.width, this.height, 1);
            // Freeze before the press too: aiming should not chase head movement.
            const pointed = [...sources].some((source) => valid.has(source) && this.hit(source) >= 0);
            if (!this.pressed.size && !pointed) {
                if (this.palmPosition) {
                    this.entity.setPosition(this.palmPosition);
                    this.entity.setRotation(this.global.camera.getRotation());
                } else this.place(true);
            }
        }
        this.entity.setLocalScale(this.width, this.height, 1);
        this.hovered = -1;
        for (const source of sources) {
            if (!valid.has(source) || (!this.open && source === this.palmSource)) continue;
            const hit = this.hit(source);
            if (hit >= 0) this.hovered = hit;
            // Transient gaze/pinch is rendered only while supplied by the browser.
            if (this.open || hit >= 0) {
                const end = source.getDirection().clone().mulScalar(1.4).add(source.getOrigin());
                const onPanel = this.intersect(source, end);
                const layer = this.global.app.scene.layers.getLayerById(LAYERID_UI);
                this.global.app.drawLine(source.getOrigin(), end, this.material.emissive, false, layer);
                if (onPanel) {
                    // World-sized ring on the panel, including its non-interactive margins.
                    const right = this.entity.right.clone().mulScalar(0.006);
                    const up = this.entity.up.clone().mulScalar(0.006);
                    let previous = end.clone().add(right);
                    for (let i = 1; i <= 16; i++) {
                        const angle = (i / 16) * Math.PI * 2;
                        const next = end
                            .clone()
                            .add(right.clone().mulScalar(Math.cos(angle)))
                            .add(up.clone().mulScalar(Math.sin(angle)));
                        this.global.app.drawLine(previous, next, this.material.emissive, false, layer);
                        previous = next;
                    }
                }
            }
        }
        const signature = JSON.stringify([
            this.open,
            this.help,
            this.settings,
            this.hovered,
            [...this.pressed.values()],
            preferences,
            status,
            trackingLimited,
            this.inputHint,
            this.guidance,
            this.auxiliary,
            this.confirmation,
            this.handsOnly,
            this.hoverOnly,
            this.dwellTooFar,
            this.status,
            this.global.state.hasCollisionOverlay,
            this.global.state.collisionOverlayEnabled
        ]);
        if (signature !== this.signature) {
            this.signature = signature;
            this.draw(preferences);
        }
        this.updateDwell(preferences, sources, valid);
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
        ctx.fillText(
            text(
                this.confirmation
                    ? 'confirm-title'
                    : this.help
                      ? 'help'
                      : this.auxiliary
                        ? 'auxiliary'
                        : this.settings
                          ? 'settings'
                          : 'title'
            ),
            48,
            117
        );
        ctx.fillStyle = '#a9c4cb';
        ctx.font = '28px system-ui, sans-serif';
        ctx.fillText(text(this.trackingLimited ? 'tracking-limited' : this.status), 48, 172, 672);
        ctx.fillText(
            this.status === 'ar-status'
                ? text('menu-hint')
                : `${text(preferences.locomotion)} · ${text(preferences.seatedBoost ? 'boost-on' : 'real-height')} · ${text('paused')}`,
            48,
            213,
            672
        );
        this.rows = this.confirmation
            ? [
                  { action: 'confirm', label: `${text('confirm-action')} · ${text(this.confirmation)}` },
                  { action: 'cancel', label: text('cancel') }
              ]
            : this.help
              ? [
                    { action: 'help', label: text('back') },
                    { action: 'resume', label: text('resume') }
                ]
              : this.auxiliary
                ? [
                      { action: 'auxiliary', label: text('back') },
                      {
                          action: 'confirmation',
                          label: `${text('confirmation')} · ${text(preferences.confirmation ?? 'direct')}`
                      },
                      {
                          action: 'dwell-duration',
                          label: `${text('dwell-duration')} · ${(preferences.dwellDuration ?? 1000) / 1000}s`
                      },
                      { action: 'main-hand', label: `${text('main-hand')} · ${text(preferences.mainHand ?? 'right')}` },
                      { action: 'boost', label: `${text('boost')} · ${text(preferences.seatedBoost ? 'on' : 'off')}` },
                      {
                          action: 'hand-movement',
                          label: `${text('hand-movement')} · ${text(`hand-${preferences.handMovement ?? 'teleport'}`)}`
                      },
                      { action: 'help', label: text('help') },
                      { action: 'resume', label: text('resume') }
                  ]
                : this.settings
                  ? [
                        { action: 'settings', label: text('back') },
                        {
                            action: 'locomotion',
                            label: text(preferences.locomotion === 'comfort' ? 'switch-continuous' : 'switch-comfort')
                        },
                        ...(this.handsOnly
                            ? [
                                  { action: 'turn-left' as MenuAction, label: text('turn-left') },
                                  { action: 'turn-right' as MenuAction, label: text('turn-right') }
                              ]
                            : [
                                  {
                                      action: 'movement-speed' as MenuAction,
                                      label: `${text('movement-speed')} · ${preferences.movementSpeed} m/s`
                                  },
                                  {
                                      action: 'turn-speed' as MenuAction,
                                      label: `${text('turn-speed')} · ${preferences.rotateSpeed}°/s`
                                  }
                              ]),
                        {
                            action: 'trajectory',
                            label: `${text('trajectory')} · ${text(preferences.trajectory ?? 'arc')}`
                        },
                        ...(this.global.state.hasCollisionOverlay
                            ? [
                                  {
                                      action: 'collision' as MenuAction,
                                      label: text(
                                          this.global.state.collisionOverlayEnabled
                                              ? 'collision-hide'
                                              : 'collision-show'
                                      )
                                  }
                              ]
                            : []),
                        { action: 'resume', label: text('resume') }
                    ]
                  : [
                        { action: 'resume', label: text('resume') },
                        { action: 'reset', label: text('reset') },
                        { action: 'calibrate', label: text('calibrate') },
                        {
                            action: 'locomotion',
                            label: text(preferences.locomotion === 'comfort' ? 'switch-continuous' : 'switch-comfort')
                        },
                        { action: 'settings', label: text('settings') },
                        { action: 'auxiliary', label: text('auxiliary') },
                        { action: 'help', label: text('help') },
                        { action: 'exit', label: text('exit') }
                    ];
        if (this.status === 'ar-status')
            this.rows = this.rows.filter((row) =>
                ['resume', 'help', 'exit', 'collision', 'confirm', 'cancel'].includes(row.action)
            );
        this.rows.forEach((row, i) => {
            const y = 242 + i * 84;
            const pressed = i === this.hovered && [...this.pressed.values()].includes(i);
            ctx.fillStyle = pressed ? '#3b8276' : i === this.hovered ? '#2b655f' : '#213b47';
            ctx.beginPath();
            ctx.roundRect(32, y, 704, 70, 18);
            ctx.fill();
            ctx.fillStyle = '#f1faf9';
            ctx.font = '500 34px system-ui, sans-serif';
            ctx.fillText(row.label, 56, y + 46, this.hoverOnly ? 545 : 650);
            if (this.hoverOnly) {
                ctx.strokeStyle = '#92e9dc';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(699, y + 35, 26, 0, Math.PI * 2);
                ctx.stroke();
            }
        });
        if (this.help) {
            ctx.fillStyle = '#d8e7eb';
            ctx.font = '28px system-ui, sans-serif';
            this.guidance.forEach((key, i) => {
                ctx.fillText(text(key), 48, 490 + i * 65, 672);
            });
        }
        ctx.fillStyle = '#87a5ae';
        ctx.font = '24px system-ui, sans-serif';
        ctx.fillText(
            text(
                this.dwellTooFar
                    ? 'dwell-closer'
                    : this.trackingLimited
                      ? 'tracking-recovery'
                      : this.status === 'ar-status' || this.help
                        ? 'tracking-hint'
                        : this.guidance[0]
            ),
            48,
            977,
            672
        );
        this.texture.setSource(this.canvas);
    }

    private drawWheel(): void {
        const ctx = this.canvas.getContext('2d')!;
        const text = (key: string) => localize(`xr.${key}`);
        ctx.clearRect(0, 0, 768, 1024);
        ctx.save();
        // Match the square world surface while retaining the panel texture allocation.
        ctx.scale(1, 1024 / 768);
        const labels = [text('resume'), text('mode-switch'), text('full-panel'), text('reset')];
        for (let i = 0; i < 4; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / 2;
            ctx.beginPath();
            ctx.arc(384, 384, 374, a - Math.PI / 4 + 0.02, a + Math.PI / 4 - 0.02);
            ctx.arc(384, 384, 112, a + Math.PI / 4 - 0.02, a - Math.PI / 4 + 0.02, true);
            ctx.closePath();
            ctx.fillStyle = this.wheel.selection === i ? (this.wheel.pressing ? '#3b8276' : '#2b655f') : '#10212bf5';
            ctx.fill();
            ctx.fillStyle = '#f1faf9';
            ctx.font = '600 35px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labels[i], 384 + Math.cos(a) * 245, 384 + Math.sin(a) * 245, 245);
        }
        ctx.beginPath();
        ctx.arc(384, 384, 103, 0, Math.PI * 2);
        ctx.fillStyle = this.wheel.selection < 0 ? '#2b655f' : '#10212bf5';
        ctx.fill();
        ctx.fillStyle = '#f1faf9';
        ctx.font = '600 33px system-ui, sans-serif';
        ctx.fillText(text(this.wheel.armed ? 'cancel' : 'neutral'), 384, 369, 180);
        ctx.font = '24px system-ui, sans-serif';
        ctx.fillText(text(this.wheel.armed ? 'trigger-confirm' : 'release-trigger'), 384, 411, 184);
        ctx.restore();
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
