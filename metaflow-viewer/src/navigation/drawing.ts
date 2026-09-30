import type { ShaderMaterial } from 'playcanvas';
import { Entity, Layer, Mesh, MeshInstance, PRIMITIVE_TRIANGLES, SORTMODE_MANUAL } from 'playcanvas';

import type { WalkPhysicsState } from '../cameras/walk-controller';
import type { Global } from '../types';

import { routeLength } from './contracts';
import type { Goal, Region, Route, Point, NavigationManifest } from './contracts';
import { gaussianRouteMaterial } from './gaussian-depth';
import { GaussianMapAssets } from './map-assets';
import type { GaussianMapLayer, MapSourceExpectation } from './map-assets';
import { nearbyNavigationAnnotationIndices } from './nav-annotation';

/** Visual clipping only: this never changes the native route or arrival surfaces. */
export function clipMapSegment(start: Point, end: Point, range?: readonly [number, number]) {
    let lo = 0,
        hi = 1;
    if (range) {
        const [min, max] = range;
        const dy = end.y - start.y;
        if (Math.abs(dy) < 0.000001) {
            if (start.y < min || start.y > max) return null;
        } else {
            const first = (min - start.y) / dy,
                last = (max - start.y) / dy;
            lo = Math.max(0, Math.min(first, last));
            hi = Math.min(1, Math.max(first, last));
            if (lo > hi) return null;
        }
    }
    const at = (t: number): Point => ({
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
        z: start.z + (end.z - start.z) * t
    });
    return { start: at(lo), end: at(hi), enters: lo > 0, exits: hi < 1 };
}

type MapDisplayLayer = Pick<GaussianMapLayer, 'id' | 'label' | 'supportRange'>;
type MapLayerMembership = 'shown' | 'other' | 'unconfirmed';

/** Exact identities take priority. Height is a visual fallback for a sole map layer. */
export function mapLayerMembership(
    layerId: string | undefined,
    height: number,
    layers: readonly MapDisplayLayer[],
    displayedId: string | null
): MapLayerMembership {
    const displayed = layers.find((layer) => layer.id === displayedId);
    if (!displayed) return 'unconfirmed';
    if (layerId && layers.some((layer) => layer.id === layerId)) return layerId === displayedId ? 'shown' : 'other';
    if (layers.length !== 1) return 'unconfirmed';
    return height >= displayed.supportRange[0] && height <= displayed.supportRange[1] ? 'shown' : 'other';
}

/** Display-only route selection; neither the native route nor Arrival is changed. */
export function mapRouteForLayer(route: Route | null, layers: readonly MapDisplayLayer[], displayedId: string | null) {
    const displayed = layers.find((layer) => layer.id === displayedId);
    const segments: { start: Point; end: Point }[] = [];
    const boundaries: { point: Point; label: string }[] = [];
    let unconfirmed = false;
    if (!route) return { segments, boundaries, unconfirmed };
    const spans = (route.surfaces ?? []).filter(
        (span) =>
            !!span.surfaceId &&
            !!span.layerId &&
            Number.isSafeInteger(span.start) &&
            Number.isSafeInteger(span.end) &&
            span.start >= 0 &&
            span.end > span.start &&
            span.end < route.points.length
    );
    for (let i = 1; i < route.points.length; i++) {
        const covering = spans.filter((span) => span.start <= i - 1 && span.end >= i);
        const ids = [...new Set(covering.map((span) => span.layerId))];
        const known = ids.length === 1 && layers.some((layer) => layer.id === ids[0]);
        if (ids.length > 1 || (!known && layers.length !== 1) || !displayed) {
            unconfirmed = true;
            continue;
        }
        if (known && ids[0] !== displayedId) continue;
        const segment = clipMapSegment(route.points[i - 1], route.points[i], displayed.supportRange);
        if (!segment) continue;
        segments.push({ start: segment.start, end: segment.end });
        // A height slice does not establish stairs, another floor or connectivity.
        if (segment.enters) boundaries.push({ point: segment.start, label: '路线超出当前高度范围' });
        if (segment.exits) boundaries.push({ point: segment.end, label: '路线超出当前高度范围' });
    }
    // Only exact, valid route occurrences linked at a shared endpoint can name
    // another confirmed layer. Repeated occurrences of one surface stay distinct.
    for (const span of spans.filter((span) => span.layerId === displayedId)) {
        const outgoing = spans.filter(
            (other) =>
                other.start === span.end &&
                other.layerId !== displayedId &&
                layers.some((layer) => layer.id === other.layerId)
        );
        const ids = [...new Set(outgoing.map((other) => other.layerId))];
        if (ids.length === 1) {
            const destination = layers.find((layer) => layer.id === ids[0]);
            const point = route.points[span.end];
            if (
                destination &&
                segments.some(
                    (segment) => segment.end.x === point.x && segment.end.y === point.y && segment.end.z === point.z
                )
            )
                boundaries.unshift({ point, label: `通往 ${destination.label}` });
        }
    }
    return { segments, boundaries, unconfirmed };
}

export class NavigationDrawing {
    onCancel: () => void = () => undefined;
    onSelect: (index: number) => void = () => undefined;
    private panel = document.createElement('section');
    private canvas = document.createElement('canvas');
    private label = document.createElement('p');
    private choicesElement = document.createElement('select');
    private setting = document.createElement('div');
    private toggle = document.createElement('div');
    private mapToggle = document.createElement('div');
    private mapSettingButton: HTMLButtonElement;
    private mapCapability = false;
    private mapSection = document.createElement('div');
    private mapFloor = document.createElement('select');
    private cancel = document.createElement('button');
    private mapFloorManual = false;
    private requestedLayer: string | null = null;
    private maps = new GaussianMapAssets({ onChange: () => this.mapsChanged() });
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
    private current: Route | null = null;
    private actual: WalkPhysicsState | null = null;
    private targetRegions: Region[] = [];
    private backgroundError = '';
    private mapOverlayStatus = '';
    private depthStatus = '';
    private disposed = false;
    private enabled = false;
    private zoom = 1;
    private mapView: { x: number; z: number; span: number } | null = null;
    private fitPending = true;
    private following = false;
    private mapMarkers: { index: number; x: number; y: number }[] = [];
    private subscriptions: (() => void)[] = [];
    constructor(
        private global: Global,
        private goal: () => Goal | null,
        choose: (height: number) => void
    ) {
        const { root, state, app, camera } = global;
        this.mapCapability = !!global.config.navigationMapUrl;
        this.panel.className = 'sse-guidance';
        this.panel.setAttribute('aria-label', '步行导览与高斯小地图');
        const targetSub = global.events.on('guidanceTarget:changed', () => {
            this.fitPending = true;
            this.following = false;
        });
        this.subscriptions.push(() => targetSub.off());
        this.canvas.width = this.canvas.height = 440;
        this.canvas.setAttribute('aria-label', '高斯俯视图、当前位置、目标范围与剩余路线小地图');
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
        this.panel.onclick = (e) => {
            e.stopPropagation();
            if ((e.target as HTMLElement).closest('button')) root.focus({ preventScroll: true });
        };
        const pointers = new Map<number, { x: number; y: number }>();
        const gestures = new Map<number, { x: number; y: number; moved: boolean }>();
        this.canvas.onpointerdown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.canvas.setPointerCapture(e.pointerId);
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            gestures.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: false });
            if (pointers.size > 1)
                gestures.forEach((gesture) => {
                    gesture.moved = true;
                });
            this.following = false;
        };
        this.canvas.onpointermove = (e) => {
            const previous = pointers.get(e.pointerId);
            if (!previous || !this.mapView) return;
            const gesture = gestures.get(e.pointerId);
            if (gesture && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 5) gesture.moved = true;
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
        this.canvas.onpointerup = (e) => {
            const gesture = gestures.get(e.pointerId);
            if (gesture && !gesture.moved && this.global.state.guidanceMode) {
                const rect = this.canvas.getBoundingClientRect();
                const x = ((e.clientX - rect.left) * 440) / rect.width;
                const y = ((e.clientY - rect.top) * 440) / rect.height;
                const marker = this.mapMarkers.find(
                    (point) => Math.hypot(point.x - x, point.y - y) <= (18 * 440) / rect.width
                );
                if (marker) this.onSelect(marker.index);
            }
            pointers.delete(e.pointerId);
            gestures.delete(e.pointerId);
            if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
        };
        this.canvas.onpointercancel = (e) => {
            pointers.delete(e.pointerId);
            gestures.delete(e.pointerId);
        };
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
            const actual = this.mapPose();
            this.mapView = { x: actual.position.x, z: actual.position.z, span: 18 };
            this.drawMap();
        };
        mapActions.className = 'sse-guidanceMapActions';
        mapActions.append(fit, follow);
        this.cancel.className = 'sse-guidanceCancel';
        this.cancel.textContent = '取消导览';
        this.cancel.onclick = () => this.onCancel();
        this.mapFloor.setAttribute('aria-label', '小地图楼层');
        this.mapFloor.onchange = () => {
            this.mapFloorManual = this.mapFloor.value !== '';
            if (this.mapFloorManual) this.selectMapLayer(this.mapFloor.value);
            else this.drawMap();
        };
        this.mapSection.className = 'sse-guidanceMap';
        this.mapSection.append(this.mapFloor, this.canvas, mapActions, this.displayStatus);
        this.choicesElement.setAttribute('aria-label', '目标地面待确认');
        this.choicesElement.hidden = true;
        this.choicesElement.onchange = () => {
            if (this.choicesElement.value !== '') choose(Number(this.choicesElement.value));
        };
        this.panel.append(this.label, this.distance, this.choicesElement, this.mapSection, this.cancel);
        if (global.config.ui) root.append(this.panel);
        this.setting.className = 'sse-settingsGroup sse-guidanceSettings';
        const addSwitch = (label: string, control: HTMLDivElement, change: () => void) => {
            const row = document.createElement('div');
            row.className = 'sse-settingsRow';
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            control.className = 'sse-toggleSwitch';
            control.setAttribute('role', 'switch');
            control.setAttribute('aria-label', label);
            control.tabIndex = 0;
            const track = document.createElement('div');
            track.className = 'sse-toggleTrack';
            const thumb = document.createElement('div');
            thumb.className = 'sse-toggleThumb';
            track.append(thumb);
            control.append(track);
            row.append(button, control);
            row.onclick = (event) => {
                event.stopPropagation();
                if (control.getAttribute('aria-disabled') === 'true') return;
                change();
                root.focus({ preventScroll: true });
            };
            control.onkeydown = (event) => {
                event.stopPropagation();
                if (control.getAttribute('aria-disabled') === 'true') return;
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    change();
                }
            };
            this.setting.append(row);
            return button;
        };
        addSwitch('导览模式', this.toggle, () => {
            state.guidanceMode = !state.guidanceMode;
        });
        this.mapSettingButton = addSwitch('小地图', this.mapToggle, () => {
            state.guidanceMapVisible = !state.guidanceMapVisible;
        });
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
        const routeRow = document.createElement('div');
        routeRow.className = 'sse-settingsRow sse-guidanceRouteSetting';
        const routeLabel = document.createElement('label');
        routeLabel.textContent = '地面路线';
        routeRow.append(routeLabel, this.display);
        this.setting.append(routeRow);
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
            this.depthStatus = depthMessage;
            this.updateDisplayStatus();
        });
        this.subscriptions.push(() => depthSub.off());
        const mapSub = global.events.on('guidanceMapVisible:changed', () => {
            this.preferences();
            this.drawMap();
        });
        this.subscriptions.push(() => mapSub.off());
        let lastMapFrame = 0;
        let lastCameraPose = '';
        const frameEnd = () => {
            if (!state.guidanceMapVisible || state.cameraMode === 'walk') return;
            const now = performance.now();
            if (now - lastMapFrame < 100) return;
            lastMapFrame = now;
            const pose = this.mapPose();
            const key = [pose.position.x, pose.position.z, pose.supportHeight, pose.yaw].join(':');
            if (key === lastCameraPose) return;
            lastCameraPose = key;
            this.drawMap();
        };
        app.on('frameend', frameEnd);
        this.subscriptions.push(() => app.off('frameend', frameEnd));
        this.preferences();
    }
    preferences() {
        this.toggle.setAttribute('aria-checked', String(this.global.state.guidanceMode));
        this.toggle.classList.toggle('sse-active', this.global.state.guidanceMode);
        this.mapToggle.setAttribute('aria-checked', String(this.global.state.guidanceMapVisible));
        this.mapToggle.classList.toggle('sse-active', this.global.state.guidanceMapVisible);
        this.mapToggle.setAttribute('aria-disabled', String(!this.mapCapability));
        this.mapToggle.tabIndex = this.mapCapability ? 0 : -1;
        this.mapToggle.title = this.mapCapability ? '' : '此场景暂未提供高斯地图';
        this.mapSettingButton.disabled = !this.mapCapability;
        this.mapSettingButton.title = this.mapToggle.title;
        this.mapSettingButton.textContent = this.mapCapability ? '小地图' : '小地图 · 未提供';
        this.mapSection.hidden = !this.global.state.guidanceMapVisible || !this.mapCapability;
        this.panel.hidden =
            !!this.global.state.xrMode ||
            (!this.enabled && !(this.global.state.guidanceMapVisible && this.mapCapability));
        this.display.value = this.global.state.guidanceRouteDisplay;
    }
    visible(value: boolean) {
        this.enabled = value && this.global.state.guidanceMode;
        this.panel.hidden =
            !!this.global.state.xrMode ||
            (!this.enabled && !(this.global.state.guidanceMapVisible && this.mapCapability));
        this.cancel.hidden = !this.enabled;
        this.label.hidden = this.distance.hidden = !this.enabled;
        this.line.visible = this.enabled && this.hasLine;
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
    assets(manifest: NavigationManifest, _url: string) {
        // Navigation geometry belongs to route feasibility and Gaussian depth occlusion.
        // Only pre-generated Gaussian images are used as the map's visible background.
        this.manifest = manifest;
    }
    async mapAssets(url: string, expected: MapSourceExpectation = {}) {
        this.mapCapability = true;
        this.preferences();
        this.requestedLayer = null;
        await this.maps.load(url, expected);
    }
    private selectMapLayer(id: string) {
        if (this.requestedLayer === id) return;
        this.requestedLayer = id;
        void this.maps.selectLayer(id).catch((error: unknown) => {
            if (this.disposed) return;
            this.backgroundError = `高斯地图加载失败：${String(error)}`;
            this.updateDisplayStatus();
        });
    }
    private mapsChanged() {
        if (this.disposed) return;
        const layers = this.maps.manifest?.layers ?? [];
        const selected = this.mapFloorManual ? this.mapFloor.value : '';
        this.mapFloor.replaceChildren(new Option('自动选择显示层', ''));
        layers.forEach((layer) => this.mapFloor.add(new Option(layer.label, layer.id)));
        if (selected && layers.some((layer) => layer.id === selected)) this.mapFloor.value = selected;
        else this.mapFloorManual = false;
        this.mapFloor.hidden = layers.length < 2;
        this.backgroundError = this.maps.status === 'ready' ? '' : this.maps.message;
        this.updateDisplayStatus();
        this.drawMap();
    }
    private updateDisplayStatus() {
        const message = [this.backgroundError, this.mapOverlayStatus, this.depthStatus].filter(Boolean).join('；');
        if (this.displayStatus.textContent !== message) this.displayStatus.textContent = message;
    }
    private mapPose() {
        if (this.actual && this.global.state.cameraMode === 'walk') return this.actual;
        const position = this.global.camera.getPosition();
        return { position, yaw: this.global.camera.getEulerAngles().y, supportHeight: position.y };
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
        if (!this.hasLine) {
            this.depthStatus = '';
            this.updateDisplayStatus();
        }
        this.global.app.renderNextFrame = true;
    }
    private fitMap() {
        const actual = this.mapPose();
        const target = this.goal();
        const points = [actual.position, ...(this.current?.points ?? []), ...(target ? [target.camera] : [])];
        const minX = Math.min(...points.map((p) => p.x)) - 3,
            maxX = Math.max(...points.map((p) => p.x)) + 3;
        const minZ = Math.min(...points.map((p) => p.z)) - 3,
            maxZ = Math.max(...points.map((p) => p.z)) + 3;
        this.mapView = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, span: Math.max(12, maxX - minX, maxZ - minZ) };
        this.zoom = 1;
        this.fitPending = false;
    }
    private drawMap() {
        if (!this.global.state.guidanceMapVisible || !this.mapCapability || this.global.state.xrMode || this.disposed)
            return;
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, 440, 440);
        const a = this.mapPose(),
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
        const membership = (layerId: string | undefined, height: number) =>
            mapLayerMembership(layerId, height, this.maps.floorList, this.maps.layerId);
        const regionMembership = this.targetRegions.map((region) => membership(region.layerId, region.floor));
        const displayedRegions = this.targetRegions.filter((_region, index) => regionMembership[index] === 'shown');
        const targetOnLayer =
            displayedRegions.length > 0 || (this.maps.floorList.length === 1 && this.targetRegions.length === 0);
        const mapRoute = mapRouteForLayer(this.current, this.maps.floorList, this.maps.layerId);
        const multiLayer = this.maps.floorList.length > 1;
        const unresolvedOverlay =
            multiLayer &&
            (mapRoute.unconfirmed ||
                regionMembership.includes('unconfirmed') ||
                (target && !this.targetRegions.length));
        this.mapOverlayStatus = [
            unresolvedOverlay ? '路线或目标与底图的楼层关联尚未确认，未确认叠层暂不显示' : '',
            multiLayer ? '当前位置楼层尚未关联；底图切层只改变显示' : ''
        ]
            .filter(Boolean)
            .join('；');
        this.updateDisplayStatus();
        const poly = (v: Point[]) => {
            ctx.beginPath();
            v.forEach((p, i) => {
                const [x, y] = xy(p);
                if (i) ctx.lineTo(x, y);
                else ctx.moveTo(x, y);
            });
        };
        if (!this.mapFloorManual && this.maps.manifest) {
            const suggested =
                this.maps.floorList.length === 1
                    ? this.maps.floorList[0].id
                    : this.maps.suggestLayer(a.supportHeight ?? a.position.y, this.maps.layerId ?? undefined);
            if (suggested) this.selectMapLayer(suggested);
        }
        for (const tile of this.maps.tiles) {
            const { minX, minZ, maxX, maxZ } = tile.bounds;
            const [x, y] = xy({ x: minX, y: 0, z: minZ });
            ctx.drawImage(tile.image, x, y, (maxX - minX) * scale, (maxZ - minZ) * scale);
        }
        if (!this.maps.tiles.length) {
            ctx.fillStyle = '#aaa';
            ctx.font = '13px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(this.maps.status === 'loading' ? '高斯地图加载中' : '暂未提供高斯地图', 220, 220);
        }
        // A selected polygon can stretch far beyond the arrival disk. Show only
        // the polygon/disk intersection used by Arrival, not the entire polygon.
        if (target && targetOnLayer) {
            const [x, y] = xy(target.camera);
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, target.radius * scale, 0, Math.PI * 2);
            ctx.clip();
            ctx.fillStyle = '#79618a66';
            for (const r of displayedRegions) {
                poly(r.vertices);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
        }
        if (target && targetOnLayer) {
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
            ctx.beginPath();
            for (const segment of mapRoute.segments) {
                const a = xy(segment.start),
                    b = xy(segment.end);
                ctx.moveTo(a[0], a[1]);
                ctx.lineTo(b[0], b[1]);
            }
            ctx.strokeStyle = '#66bbff';
            ctx.lineWidth = 4;
            ctx.stroke();
            const labeled: number[][] = [];
            for (const { point, label } of mapRoute.boundaries) {
                const [x, y] = xy(point);
                if (labeled.some(([a, b]) => Math.hypot(a - x, b - y) < 24)) continue;
                labeled.push([x, y]);
                ctx.fillStyle = '#66bbff';
                ctx.beginPath();
                ctx.arc(x, y, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.font = '12px Arial, sans-serif';
                ctx.textAlign = 'left';
                ctx.lineWidth = 3;
                ctx.strokeStyle = '#000';
                ctx.strokeText(label, x + 9, y + 4);
                ctx.fillStyle = '#fff';
                ctx.fillText(label, x + 9, y + 4);
            }
        }
        this.mapMarkers = [];
        if (this.global.state.guidanceMode) {
            const nearby = nearbyNavigationAnnotationIndices(
                this.global.settings.annotations,
                a.position,
                a.supportHeight,
                this.global.state.guidanceTarget
            );
            for (const index of nearby) {
                if (index === this.global.state.guidanceTarget && !targetOnLayer) continue;
                if (
                    index !== this.global.state.guidanceTarget &&
                    membership(undefined, a.supportHeight ?? a.position.y) !== 'shown'
                )
                    continue;
                const annotation = this.global.settings.annotations[index];
                const position = annotation.camera.initial.position;
                const [x, y] = xy({ x: position[0], y: position[1], z: position[2] });
                this.mapMarkers.push({ index, x, y });
                if (index === this.global.state.guidanceTarget) continue;
                ctx.fillStyle = '#42d2f6';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, y, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
        }
        if (
            multiLayer ||
            (this.global.state.cameraMode === 'walk' &&
                membership(undefined, a.supportHeight ?? a.position.y) !== 'shown')
        )
            return;
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
        this.maps.destroy();
        this.global.app.scene.layers.remove(this.layer);
        this.global.camera.camera.layers = this.global.camera.camera.layers.filter((id) => id !== this.layer.id);
        this.lineMesh.destroy();
        this.material.destroy();
        this.node.destroy();
    }
}
