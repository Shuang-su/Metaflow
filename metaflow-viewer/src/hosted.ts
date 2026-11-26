import type { CreateViewerOptions } from './options';
import { attachApec } from './shenzhen/apec';
import { prepareHostedScene } from './shenzhen/hosted-scene';
import { attachNanhaiMap } from './shenzhen/nanhai';

import { createViewerWithExtension } from './index';

async function createHostedViewer(options: CreateViewerOptions, resource?: Parameters<typeof prepareHostedScene>[1]) {
    const scene = await prepareHostedScene(options, resource);
    const map = 'nanhai' in scene ? scene.nanhai : undefined;
    const apec = 'apec' in scene ? scene.apec : undefined;
    const handle = await createViewerWithExtension(
        scene.options,
        options.noui
            ? undefined
            : apec
              ? (view) => attachApec(view, options.container, apec)
              : map
                ? (view) => attachNanhaiMap(view, options.container, map.dataRoot, map.inspect)
                : undefined
    );
    if (map || apec)
        window.addEventListener('pagehide', (event) => {
            if (!event.persisted) handle.destroy();
        });
    return handle;
}

export { createViewer } from './index';
export { createHostedViewer };
