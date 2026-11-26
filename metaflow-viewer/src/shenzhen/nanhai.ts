import { Asset, BLEND_NORMAL, Color, StandardMaterial } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import type { ViewerHandle } from '../types';

import mapHtml from './nanhai-map.html';
import { mountSiteMap } from './site-map';
import type { Registration, SiteMapOptions } from './site-map';
async function prepareRepairOverlay(
    app: AppBase,
    dataRoot: string,
    reviewButton: HTMLButtonElement,
    signal: AbortSignal
) {
    const asset = new Asset('Nanhai surveyed repairs', 'container', { url: dataRoot + 'repairs.glb' });
    app.assets.add(asset);
    const loaded = new Promise<void>((resolve, reject) => {
        asset.once('load', resolve);
        asset.once('error', reject);
    });
    app.assets.load(asset);
    await loaded;
    if (signal.aborted) return;
    const entity = asset.resource.instantiateRenderEntity();
    const material = new StandardMaterial();
    material.diffuse = new Color(0, 0.85, 0.85);
    material.emissive = new Color(0, 0.52, 0.45);
    material.opacity = 0.78;
    material.blendType = BLEND_NORMAL;
    material.depthWrite = false;
    material.update();
    for (const component of entity.findComponents('render')) {
        for (const instance of component.meshInstances) instance.material = material;
    }
    entity.setLocalPosition(0, 0.018, 0);
    entity.enabled = false;
    app.root.addChild(entity);
    reviewButton.hidden = false;
    reviewButton.onclick = () => {
        entity.enabled = !entity.enabled;
        reviewButton.setAttribute('aria-pressed', String(entity.enabled));
        reviewButton.textContent = entity.enabled ? '隐藏补面' : '显示补面';
        app.renderNextFrame = true;
    };
}

export function attachNanhaiMap(
    viewer: ViewerHandle,
    host: HTMLElement,
    dataRoot: string,
    inspect: boolean,
    options?: SiteMapOptions
) {
    const camera = viewer.app.root.findComponents('camera')[0]?.entity;
    const root = host.querySelector<HTMLElement>('.sse-viewer');
    if (!camera || !root) return (): void => undefined;
    const markup = document.createElement('template');
    markup.innerHTML = mapHtml;
    const elements = Array.from(markup.content.children);
    root.append(markup.content);

    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/assets/nanhai-map.css';
    const styles = new Promise<void>((resolve, reject) => {
        stylesheet.onload = () => resolve();
        stylesheet.onerror = () => reject(new Error('现场地图样式载入失败'));
    });
    document.head.append(stylesheet);
    const image = new Image();
    image.src = dataRoot + (options ? 'map.webp' : 'map.webp?v=5.24.1');
    const controller = new AbortController();
    const registration = fetch(dataRoot + 'map.json', { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error('现场地图载入失败');
        return (await response.json()) as Registration;
    });
    let unmount: (() => void) | undefined;
    const presented = viewer.state.loaded
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
              viewer.events.once('firstFrame', () => resolve());
          });
    Promise.all([registration, image.decode(), styles, presented])
        .then(([map]) => {
            if (!controller.signal.aborted) unmount = mountSiteMap(viewer, camera, map, image, host, options);
        })
        .catch((error) => {
            if (!controller.signal.aborted) console.error('现场地图载入失败', error);
        });
    if (inspect)
        prepareRepairOverlay(viewer.app, dataRoot, host.querySelector('#repairs'), controller.signal).catch((error) => {
            if (!controller.signal.aborted) console.error('补面载入失败', error);
        });
    return () => {
        controller.abort();
        unmount?.();
        stylesheet.remove();
        elements.forEach((element) => element.remove());
    };
}
