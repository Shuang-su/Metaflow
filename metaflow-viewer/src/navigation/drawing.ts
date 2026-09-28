import {
    BLEND_NORMAL,
    CULLFACE_NONE,
    Color,
    Entity,
    FUNC_LESSEQUAL,
    Layer,
    Mesh,
    MeshInstance,
    PRIMITIVE_TRIANGLES,
    SORTMODE_MANUAL,
    StandardMaterial
} from 'playcanvas';

import type { WalkPhysicsState } from '../cameras/walk-controller';
import type { Global } from '../types';

import type { Goal, Region, Route, Point, NavigationManifest } from './contracts';
export class NavigationDrawing {
    onCancel: () => void = () => undefined;
    onSelect: (index: number) => void = () => undefined;
    private panel = document.createElement('section');
    private canvas = document.createElement('canvas');
    private label = document.createElement('p');
    private choicesElement = document.createElement('select');
    private setting = document.createElement('div');
    private toggle = document.createElement('button');
    private radius = document.createElement('select');
    private styles = document.createElement('style');
    private layer: Layer;
    private node = new Entity('MF79 guidance');
    private lineMesh: Mesh;
    private line: MeshInstance;
    private materials: StandardMaterial[];
    private depth: Mesh[] = [];
    private occluders = new Map<string, string>();
    private manifest: NavigationManifest | null = null;
    private base = '';
    private current: Route | null = null;
    private actual: WalkPhysicsState | null = null;
    private targetRegions: Region[] = [];
    private navPositions: Float32Array | null = null;
    private navIndices: Uint32Array | null = null;
    private background = document.createElement('canvas');
    private backgroundKey = '';
    private disposed = false;
    private enabled = false;
    private zoom = 1;
    private subscriptions: (() => void)[] = [];
    constructor(
        private global: Global,
        private goal: () => Goal | null,
        choose: (height: number) => void
    ) {
        const { root, state, settings, app, camera } = global;
        this.styles.textContent = `.sse-viewer .sse-guidance{position:absolute;left:16px;top:16px;width:220px;max-width:42vw;padding:12px;background:#13232ee8;color:#e4f0f6;border:1px solid #ffffff30;border-radius:12px;pointer-events:auto;font:13px/1.5 sans-serif;z-index:12}.sse-viewer .sse-guidance canvas{width:100%;aspect-ratio:1;touch-action:none;background:#0c1b26;border-radius:8px}.sse-viewer .sse-guidance p{margin:6px 0;overflow-wrap:anywhere}.sse-viewer .sse-guidance select,.sse-viewer .sse-guidance button,.sse-viewer .sse-guidance-setting button,.sse-viewer .sse-guidance-setting select{background:#233d50;color:#ecf6fc;border:1px solid #7890a0;border-radius:6px;padding:7px;font:inherit;max-width:100%}.sse-viewer .sse-guidance select{width:100%;margin-bottom:6px}.sse-viewer .sse-guidance-setting{display:flex;gap:10px;align-items:center;padding:10px}.sse-viewer .sse-guidance-setting button[aria-checked=true]{background:#235d77}`;
        root.append(this.styles);
        this.panel.className = 'sse-guidance';
        this.panel.setAttribute('aria-label', '步行导览');
        const destinations = document.createElement('select');
        destinations.setAttribute('aria-label', '导览目的地');
        destinations.add(new Option('选择目的地', ''));
        settings.annotations.forEach((a, i) =>
            destinations.add(new Option(`${i + 1} · ${a.title || '标点'}`, String(i)))
        );
        destinations.onchange = () => {
            if (destinations.value !== '') this.onSelect(Number(destinations.value));
        };
        const sub = global.events.on('guidanceTarget:changed', (i: number | null) => {
            destinations.value = i === null ? '' : String(i);
        });
        this.subscriptions.push(() => sub.off());
        this.canvas.width = this.canvas.height = 440;
        this.background.width = this.background.height = 440;
        this.canvas.setAttribute('aria-label', '当前位置、目标范围与剩余路线小地图');
        this.canvas.onwheel = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.zoom = Math.max(0.5, Math.min(8, this.zoom * Math.exp(-e.deltaY * 0.002)));
            this.drawMap();
        };
        this.panel.onpointerdown = (e) => e.stopPropagation();
        this.panel.onwheel = (e) => e.stopPropagation();
        const cancel = document.createElement('button');
        cancel.textContent = '取消导览';
        cancel.onclick = () => this.onCancel();
        this.choicesElement.setAttribute('aria-label', '目标地面待确认');
        this.choicesElement.hidden = true;
        this.choicesElement.onchange = () => {
            if (this.choicesElement.value !== '') choose(Number(this.choicesElement.value));
        };
        this.panel.append(destinations, this.label, this.choicesElement, this.canvas, cancel);
        if (global.config.ui) root.append(this.panel);
        this.setting.className = 'sse-guidance-setting';
        this.toggle.textContent = '导览模式';
        this.toggle.setAttribute('role', 'switch');
        this.toggle.onclick = () => {
            state.guidanceMode = !state.guidanceMode;
        };
        this.radius.setAttribute('aria-label', '保存相机附近到达范围');
        this.radius.add(new Option('附近 2 米', '2'));
        this.radius.add(new Option('附近 3 米', '3'));
        this.radius.onchange = () => {
            state.guidanceRadius = this.radius.value === '3' ? 3 : 2;
        };
        this.setting.append(this.toggle, this.radius);
        root.querySelector('.sse-settingsPanel')?.prepend(this.setting);
        const material = (depth: boolean) => {
            const m = new StandardMaterial();
            m.useLighting = m.useSkybox = m.useFog = m.useTonemap = false;
            m.diffuse = m.specular = new Color(0, 0, 0);
            m.emissive = new Color(0.12, 0.55, 1);
            m.blendType = BLEND_NORMAL;
            m.cull = CULLFACE_NONE;
            m.depthTest = true;
            m.depthWrite = depth;
            m.depthFunc = FUNC_LESSEQUAL;
            m.redWrite = m.greenWrite = m.blueWrite = m.alphaWrite = !depth;
            m.update();
            return m;
        };
        this.materials = [material(true), material(false)];
        this.layer = new Layer({
            name: 'Navigation with collision depth',
            clearDepthBuffer: true,
            opaqueSortMode: SORTMODE_MANUAL,
            transparentSortMode: SORTMODE_MANUAL
        });
        app.scene.layers.push(this.layer);
        camera.camera.layers = [...camera.camera.layers, this.layer.id];
        this.layer.enabled = false;
        this.lineMesh = new Mesh(app.graphicsDevice);
        this.lineMesh.setPositions([0, 0, 0, 0, 0, 0, 0, 0, 0]);
        this.lineMesh.setIndices([0, 1, 2]);
        this.lineMesh.update(PRIMITIVE_TRIANGLES);
        this.line = new MeshInstance(this.lineMesh, this.materials[1], this.node);
        this.line.drawOrder = 1;
        this.line.visible = false;
        this.layer.addMeshInstances([this.line]);
    }
    preferences() {
        this.toggle.setAttribute('aria-checked', String(this.global.state.guidanceMode));
        this.radius.value = String(this.global.state.guidanceRadius);
    }
    visible(value: boolean) {
        this.enabled = value;
        this.panel.hidden = !value;
        this.layer.enabled = value && this.line.visible;
    }
    status(message: string) {
        this.label.textContent = message;
    }
    choices(rows: { floor: number; count: number }[]) {
        this.choicesElement.replaceChildren();
        this.choicesElement.hidden = rows.length < 2;
        if (rows.length >= 2) {
            this.choicesElement.add(new Option('目标地面待确认，请选择', ''));
            rows.forEach((r) =>
                this.choicesElement.add(new Option(`地面高度 ${r.floor.toFixed(2)} 米`, String(r.floor)))
            );
        }
    }
    regions(regions: Region[]) {
        this.targetRegions = regions;
        this.drawMap();
    }
    route(route: Route | null) {
        this.current = route;
        this.drawLine();
        this.drawMap();
    }
    pose(pose: WalkPhysicsState) {
        this.actual = pose;
        if (pose.tick % 6 === 0) this.drawMap();
    }
    async assets(manifest: NavigationManifest, url: string) {
        if (this.manifest) return;
        this.manifest = manifest;
        this.base = new URL('.', new URL(url, location.href)).href;
        try {
            const [p, i] = await Promise.all([
                this.bytes('nav-positions.bin', manifest.display.positionsHash),
                this.bytes('nav-indices.bin', manifest.display.indicesHash)
            ]);
            if (this.disposed) return;
            this.navPositions = new Float32Array(p);
            this.navIndices = new Uint32Array(i);
            this.drawMap();
        } catch {
            /* Optional background failure does not invalidate a route. */
        }
    }
    private async bytes(name: string, hash: string) {
        const response = await fetch(new URL(name, this.base));
        if (!response.ok) throw Error('Missing navigation drawing asset');
        const data = await response.arrayBuffer();
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), (n) =>
            n.toString(16).padStart(2, '0')
        ).join('');
        if (digest !== hash) throw Error('Navigation drawing fingerprint mismatch');
        return data;
    }
    private ensureDepth(p: Point) {
        const tile = this.manifest?.tiles.find(
            t => p.x >= t.bounds.min.x && p.x < t.bounds.max.x && p.z >= t.bounds.min.z && p.z < t.bounds.max.z
        );
        if (!tile) return false;
        if (!this.occluders.has(tile.name)) {
            this.occluders.set(tile.name, 'pending');
            Promise.all([
                this.bytes(`${tile.name}-positions.bin`, tile.positionsHash),
                this.bytes(`${tile.name}-indices.bin`, tile.indicesHash)
            ])
                .then(([p, i]) => {
                    if (this.disposed) return;
                    const mesh = new Mesh(this.global.app.graphicsDevice);
                    mesh.setPositions(new Float32Array(p));
                    mesh.setIndices(new Uint32Array(i));
                    mesh.update(PRIMITIVE_TRIANGLES);
                    const instance = new MeshInstance(mesh, this.materials[0], this.node);
                    instance.drawOrder = 0;
                    this.layer.addMeshInstances([instance]);
                    this.depth.push(mesh);
                    this.occluders.set(tile.name, 'ready');
                    this.drawLine();
                })
                .catch(() => {
                    if (!this.disposed) this.occluders.set(tile.name, 'error');
                });
        }
        return this.occluders.get(tile.name) === 'ready';
    }
    private drawLine() {
        const positions: number[] = [],
            indices: number[] = [];
        let remaining = 12;
        const points = this.current?.points ?? [];
        for (let i = 1; i < points.length && remaining > 0; i++) {
            const a = points[i - 1],
                end = points[i],
                length = Math.hypot(end.x - a.x, end.y - a.y, end.z - a.z);
            if (length < 0.0001) continue;
            const t = Math.min(1, remaining / length),
                b = { x: a.x + (end.x - a.x) * t, y: a.y + (end.y - a.y) * t, z: a.z + (end.z - a.z) * t };
            remaining -= length * t;
            const aReady = this.ensureDepth(a),
                bReady = this.ensureDepth(b);
            if (!aReady || !bReady) continue;
            const h = Math.hypot(b.x - a.x, b.z - a.z);
            if (h < 0.0001) continue;
            const dx = ((b.z - a.z) / h) * 0.045,
                dz = (-(b.x - a.x) / h) * 0.045,
                n = positions.length / 3;
            positions.push(
                a.x - dx,
                a.y + 0.045,
                a.z - dz,
                a.x + dx,
                a.y + 0.045,
                a.z + dz,
                b.x + dx,
                b.y + 0.045,
                b.z + dz,
                b.x - dx,
                b.y + 0.045,
                b.z - dz
            );
            indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
        }
        if (positions.length) {
            this.lineMesh.setPositions(positions);
            this.lineMesh.setIndices(indices);
            this.lineMesh.update(PRIMITIVE_TRIANGLES);
        }
        this.line.visible = !!positions.length;
        this.layer.enabled = this.enabled && this.line.visible;
        this.global.app.renderNextFrame = true;
    }
    private drawMap() {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, 440, 440);
        if (!this.actual) return;
        const a = this.actual,
            target = this.goal(),
            points = [a.position, ...(this.current?.points ?? []), ...(target ? [target.camera] : [])];
        const minX = Math.min(...points.map((p) => p.x)) - 3,
            maxX = Math.max(...points.map((p) => p.x)) + 3,
            minZ = Math.min(...points.map((p) => p.z)) - 3,
            maxZ = Math.max(...points.map((p) => p.z)) + 3;
        const scale = Math.round((410 / Math.max(12, maxX - minX, maxZ - minZ)) * this.zoom * 5) / 5,
            cx = Math.round((minX + maxX) / 2),
            cz = Math.round((minZ + maxZ) / 2),
            xy = (p: Point) => [220 + (p.x - cx) * scale, 220 + (p.z - cz) * scale];
        const poly = (v: Point[]) => {
            ctx.beginPath();
            v.forEach((p, i) => {
                const [x, y] = xy(p);
                if (i) ctx.lineTo(x, y);
                else ctx.moveTo(x, y);
            });
        };
        if (this.navPositions && this.navIndices) {
            const key = [
                Math.round(cx),
                Math.round(cz),
                Math.round(scale * 5),
                Math.round((a.supportHeight ?? 0) * 2)
            ].join(':');
            const bg = this.background.getContext('2d');
            if (bg && key !== this.backgroundKey) {
                this.backgroundKey = key;
                bg.clearRect(0, 0, 440, 440);
                bg.fillStyle = '#284252';
                const p = this.navPositions,
                    idx = this.navIndices;
                for (let i = 0; i < idx.length; i += 3) {
                    const n = idx[i] * 3;
                    if (
                        Math.abs(p[n + 1] - (a.supportHeight ?? p[n + 1])) > 1 ||
                        Math.abs(p[n] - cx) > 440 / scale ||
                        Math.abs(p[n + 2] - cz) > 440 / scale
                    )
                        continue;
                    bg.beginPath();
                    for (let j = 0; j < 3; j++) {
                        const n = idx[i + j] * 3,
                            x = 220 + (p[n] - cx) * scale,
                            y = 220 + (p[n + 2] - cz) * scale;
                        if (j) bg.lineTo(x, y);
                        else bg.moveTo(x, y);
                    }
                    bg.closePath();
                    bg.fill();
                }
            }
            ctx.drawImage(this.background, 0, 0);
        }
        // A selected polygon can stretch far beyond the arrival disk. Show only
        // the polygon/disk intersection used by Arrival, not the entire polygon.
        if (target) {
            const [x, y] = xy(target.camera);
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, target.radius * scale, 0, Math.PI * 2);
            ctx.clip();
            ctx.fillStyle = '#79618a66';
            for (const r of this.targetRegions) {
                poly(r.vertices);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
        }
        if (target) {
            const [x, y] = xy(target.camera);
            ctx.strokeStyle = '#c9a4f0';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, target.radius * scale, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = '#d7aeff';
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
        }
        if (this.current) {
            poly(this.current.points);
            ctx.strokeStyle = '#66bbff';
            ctx.lineWidth = 4;
            ctx.stroke();
        }
        const [x, y] = xy(a.position);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((-a.yaw * Math.PI) / 180);
        ctx.fillStyle = '#7fffe0';
        ctx.beginPath();
        ctx.moveTo(0, -11);
        ctx.lineTo(7, 8);
        ctx.lineTo(0, 4);
        ctx.lineTo(-7, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    destroy() {
        this.disposed = true;
        this.subscriptions.forEach((f) => f());
        this.panel.remove();
        this.setting.remove();
        this.styles.remove();
        this.global.app.scene.layers.remove(this.layer);
        this.global.camera.camera.layers = this.global.camera.camera.layers.filter((id) => id !== this.layer.id);
        this.lineMesh.destroy();
        this.depth.forEach((m) => m.destroy());
        this.materials.forEach((m) => m.destroy());
        this.node.destroy();
    }
}
