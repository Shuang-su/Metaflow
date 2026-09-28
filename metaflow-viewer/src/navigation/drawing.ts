import type { ShaderMaterial } from 'playcanvas';
import { Entity, Layer, Mesh, MeshInstance, PRIMITIVE_TRIANGLES, SORTMODE_MANUAL } from 'playcanvas';

import type { WalkPhysicsState } from '../cameras/walk-controller';
import type { Global } from '../types';

import { routeLength } from './contracts';
import type { Goal, Region, Route, Point, NavigationManifest } from './contracts';
import { gaussianRouteMaterial } from './gaussian-depth';
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
    private material: ShaderMaterial;
    private hasLine = false;
    private displayStatus = document.createElement('p');
    private distance = document.createElement('p');
    private display = document.createElement('select');
    private manifest: NavigationManifest | null = null;
    private base = '';
    private current: Route | null = null;
    private actual: WalkPhysicsState | null = null;
    private targetRegions: Region[] = [];
    private navPositions: Float32Array | null = null;
    private navIndices: Uint32Array | null = null;
    private background = document.createElement('canvas');
    private backgroundKey = '';
    private backgroundError = '';
    private disposed = false;
    private enabled = false;
    private zoom = 1;
    private mapView: { x: number; z: number; span: number } | null = null;
    private fitPending = true;
    private following = false;
    private subscriptions: (() => void)[] = [];
    constructor(
        private global: Global,
        private goal: () => Goal | null,
        choose: (height: number) => void
    ) {
        const { root, state, settings, app, camera } = global;
        this.styles.textContent = `.sse-viewer .sse-guidance{position:absolute;left:16px;top:16px;width:220px;max-width:42vw;padding:12px;background:#13232ee8;color:#e4f0f6;border:1px solid #ffffff30;border-radius:12px;pointer-events:auto;font:13px/1.5 sans-serif;z-index:12}.sse-viewer .sse-guidance canvas{width:100%;aspect-ratio:1;touch-action:none;background:#0c1b26;border-radius:8px}.sse-viewer .sse-guidance p{margin:6px 0;overflow-wrap:anywhere}.sse-viewer .sse-guidance select,.sse-viewer .sse-guidance button,.sse-viewer .sse-guidance-setting button,.sse-viewer .sse-guidance-setting select{background:#233d50;color:#ecf6fc;border:1px solid #7890a0;border-radius:6px;padding:7px;font:inherit;max-width:100%}.sse-viewer .sse-guidance select{width:100%;margin-bottom:6px}.sse-viewer .sse-guidance-setting{display:flex;gap:10px;align-items:center;padding:10px;flex-wrap:wrap}.sse-viewer .sse-guidance-setting button[aria-checked=true]{background:#235d77}`;
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
            this.fitPending = true;
            this.following = false;
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
        this.panel.onkeydown = (e) => e.stopPropagation();
        this.panel.onpointermove = (e) => e.stopPropagation();
        this.panel.onpointerup = (e) => e.stopPropagation();
        const pointers = new Map<number, { x: number; y: number }>();
        this.canvas.onpointerdown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.canvas.setPointerCapture(e.pointerId);
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            this.following = false;
        };
        this.canvas.onpointermove = (e) => {
            const previous = pointers.get(e.pointerId);
            if (!previous || !this.mapView) return;
            const other = [...pointers].find(([id]) => id !== e.pointerId)?.[1];
            if (other) {
                const before = Math.hypot(previous.x - other.x, previous.y - other.y);
                const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
                if (before > 1) this.zoom = Math.max(0.5, Math.min(8, (this.zoom * after) / before));
            } else {
                const scale = ((410 / this.mapView.span) * this.zoom * this.canvas.clientWidth) / 440;
                this.mapView.x -= (e.clientX - previous.x) / scale;
                this.mapView.z -= (e.clientY - previous.y) / scale;
            }
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            this.drawMap();
        };
        this.canvas.onpointerup = this.canvas.onpointercancel = (e) => pointers.delete(e.pointerId);
        const mapActions = document.createElement('div');
        const fit = document.createElement('button'),
            follow = document.createElement('button');
        fit.textContent = '查看全程';
        follow.textContent = '跟随当前位置';
        fit.onclick = () => {
            this.following = false;
            this.fitPending = true;
            this.fitMap();
            this.drawMap();
        };
        follow.onclick = () => {
            this.following = true;
            this.zoom = 1;
            this.mapView = { x: this.actual?.position.x ?? 0, z: this.actual?.position.z ?? 0, span: 18 };
            this.drawMap();
        };
        mapActions.append(fit, follow);
        const cancel = document.createElement('button');
        cancel.textContent = '取消导览';
        cancel.onclick = () => this.onCancel();
        this.choicesElement.setAttribute('aria-label', '目标地面待确认');
        this.choicesElement.hidden = true;
        this.choicesElement.onchange = () => {
            if (this.choicesElement.value !== '') choose(Number(this.choicesElement.value));
        };
        this.panel.append(
            destinations,
            this.label,
            this.distance,
            this.choicesElement,
            this.canvas,
            mapActions,
            this.displayStatus,
            cancel
        );
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
        this.display.setAttribute('aria-label', '地面路线显示范围');
        this.display.add(new Option('完整剩余路线', 'full'));
        this.display.add(new Option('前方 12 米', 'near'));
        this.display.onchange = () => {
            state.guidanceRouteDisplay = this.display.value === 'near' ? 'near' : 'full';
        };
        const displaySub = global.events.on('guidanceRouteDisplay:changed', () => {
            this.preferences();
            this.drawLine();
        });
        this.subscriptions.push(() => displaySub.off());
        this.setting.append(this.toggle, this.radius, this.display);
        root.querySelector('.sse-settingsPanel')?.prepend(this.setting);
        this.material = gaussianRouteMaterial();
        this.layer = new Layer({
            name: 'Navigation with Gaussian depth',
            clearDepthBuffer: false,
            opaqueSortMode: SORTMODE_MANUAL,
            transparentSortMode: SORTMODE_MANUAL
        });
        app.scene.layers.push(this.layer);
        camera.camera.layers = [...camera.camera.layers, this.layer.id];
        // Keep the composition stable; hide the mesh, not the layer/render passes.
        this.layer.enabled = true;
        this.lineMesh = new Mesh(app.graphicsDevice);
        this.lineMesh.setPositions([0, 0, 0, 0, 0, 0, 0, 0, 0]);
        this.lineMesh.setIndices([0, 1, 2]);
        this.lineMesh.update(PRIMITIVE_TRIANGLES);
        this.line = new MeshInstance(this.lineMesh, this.material, this.node);
        this.line.drawOrder = 1;
        this.line.visible = false;
        this.layer.addMeshInstances([this.line]);
        const depthSub = app.scene.on('prerender:layer', (view, layer) => {
            if (layer !== this.layer || view !== camera.camera) return;
            const depth = camera.camera.camera.sceneDepthMap;
            const valid =
                !!depth &&
                camera.camera.shaderParams.sceneDepthMapReciprocal &&
                camera.camera.camera.sceneDepthMapVersion === app.graphicsDevice.renderVersion;
            this.line.visible = this.enabled && this.hasLine && valid;
            if (valid) {
                this.material.setParameter('mf79Depth', depth);
                this.material.setParameter('mf79Viewport', [app.graphicsDevice.width, app.graphicsDevice.height]);
            }
            const depthMessage = !this.hasLine
                ? ''
                : valid
                  ? state.guidanceRouteDisplay === 'near' && this.current && routeLength(this.current.points) > 12
                      ? '前方路段已截取；小地图保留全程'
                      : ''
                  : '高斯遮挡数据尚未就绪；小地图保留全程';
            const message = [this.backgroundError, depthMessage].filter(Boolean).join('；');
            if (this.displayStatus.textContent !== message) this.displayStatus.textContent = message;
        });
        this.subscriptions.push(() => depthSub.off());
    }
    preferences() {
        this.toggle.setAttribute('aria-checked', String(this.global.state.guidanceMode));
        this.radius.value = String(this.global.state.guidanceRadius);
        this.display.value = this.global.state.guidanceRouteDisplay;
    }
    visible(value: boolean) {
        this.enabled = value;
        this.panel.hidden = !value;
        this.line.visible = value && this.hasLine;
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
        if (route && this.fitPending) this.fitMap();
        this.distance.textContent = route ? `距到达区域约 ${routeLength(route.points).toFixed(1)} 米` : '';
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
        } catch (error) {
            this.backgroundError = `小地图底图加载失败：${String(error)}`;
            this.displayStatus.textContent = this.backgroundError;
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
    private drawLine() {
        const positions: number[] = [],
            indices: number[] = [];
        let remaining = this.global.state.guidanceRouteDisplay === 'near' ? 12 : Infinity;
        let arrowDistance = 1;
        const points = this.current?.points ?? [];
        for (let i = 1; i < points.length && remaining > 0; i++) {
            const a = points[i - 1],
                end = points[i],
                length = Math.hypot(end.x - a.x, end.y - a.y, end.z - a.z);
            if (length < 0.0001) continue;
            const t = Math.min(1, remaining / length),
                b = { x: a.x + (end.x - a.x) * t, y: a.y + (end.y - a.y) * t, z: a.z + (end.z - a.z) * t };
            remaining -= length * t;
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
            // Small directional triangles lie on each verified straight segment.
            for (; arrowDistance < h; arrowDistance += 2) {
                const d = arrowDistance;
                const t = d / h,
                    x = a.x + (b.x - a.x) * t,
                    z = a.z + (b.z - a.z) * t;
                const y = a.y + (b.y - a.y) * t + 0.05,
                    m = positions.length / 3;
                const ux = (b.x - a.x) / h,
                    uz = (b.z - a.z) / h;
                const tip = Math.min(0.18, h - d),
                    back = Math.min(0.1, d);
                positions.push(
                    x + ux * tip,
                    y,
                    z + uz * tip,
                    x - ux * back + uz * 0.16,
                    y,
                    z - uz * back - ux * 0.16,
                    x - ux * back - uz * 0.16,
                    y,
                    z - uz * back + ux * 0.16
                );
                indices.push(m, m + 1, m + 2);
            }
            arrowDistance -= h;
            // A disk marks the actual endpoint; a larger arrow marks a near-mode cutoff.
            if (i === points.length - 1 || t < 1) {
                const n = positions.length / 3;
                if (t < 1) {
                    const ux = (b.x - a.x) / h,
                        uz = (b.z - a.z) / h;
                    const back = Math.min(0.35, h);
                    positions.push(
                        b.x,
                        b.y + 0.05,
                        b.z,
                        b.x - ux * back + uz * 0.16,
                        b.y + 0.05,
                        b.z - uz * back - ux * 0.16,
                        b.x - ux * back - uz * 0.16,
                        b.y + 0.05,
                        b.z - uz * back + ux * 0.16
                    );
                    indices.push(n, n + 1, n + 2);
                } else {
                    positions.push(b.x, b.y + 0.05, b.z);
                    for (let j = 0; j <= 20; j++)
                        positions.push(
                            b.x + Math.cos((j * Math.PI) / 10) * 0.16,
                            b.y + 0.05,
                            b.z + Math.sin((j * Math.PI) / 10) * 0.16
                        );
                    for (let j = 1; j <= 20; j++) indices.push(n, n + j, n + j + 1);
                }
            }
        }
        if (positions.length) {
            this.lineMesh.setPositions(positions);
            this.lineMesh.setIndices(indices);
            this.lineMesh.update(PRIMITIVE_TRIANGLES);
        }
        this.hasLine = !!positions.length;
        this.line.visible = this.hasLine;
        this.line.visible = this.enabled && this.hasLine;
        if (!this.hasLine) this.displayStatus.textContent = '';
        this.global.app.renderNextFrame = true;
    }
    private fitMap() {
        if (!this.actual) return;
        const target = this.goal();
        const points = [this.actual.position, ...(this.current?.points ?? []), ...(target ? [target.camera] : [])];
        const minX = Math.min(...points.map((p) => p.x)) - 3,
            maxX = Math.max(...points.map((p) => p.x)) + 3;
        const minZ = Math.min(...points.map((p) => p.z)) - 3,
            maxZ = Math.max(...points.map((p) => p.z)) + 3;
        this.mapView = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, span: Math.max(12, maxX - minX, maxZ - minZ) };
        this.zoom = 1;
        this.fitPending = false;
    }
    private drawMap() {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, 440, 440);
        if (!this.actual) return;
        const a = this.actual,
            target = this.goal();
        if (!this.mapView) this.fitMap();
        if (!this.mapView) return;
        if (this.following) {
            this.mapView.x = a.position.x;
            this.mapView.z = a.position.z;
        }
        const scale = (410 / this.mapView.span) * this.zoom,
            cx = this.mapView.x,
            cz = this.mapView.z;
        const xy = (p: Point) => [220 + (p.x - cx) * scale, 220 + (p.z - cz) * scale];
        const poly = (v: Point[]) => {
            ctx.beginPath();
            v.forEach((p, i) => {
                const [x, y] = xy(p);
                if (i) ctx.lineTo(x, y);
                else ctx.moveTo(x, y);
            });
        };
        if (this.navPositions && this.navIndices) {
            const key = [cx, cz, scale, Math.round((a.supportHeight ?? 0) * 2)].join(':');
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
        this.material.destroy();
        this.node.destroy();
    }
}
