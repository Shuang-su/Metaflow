import type { GSplatHandler } from 'playcanvas';
import { GSplatAssetLoader } from 'playcanvas/build/playcanvas/src/framework/components/gsplat/gsplat-asset-loader.js';
import { GSplatOctreeResource } from 'playcanvas/build/playcanvas/src/scene/gsplat-unified/gsplat-octree.resource.js';

export function installPrefetchedOctree(handler: GSplatHandler) {
    handler.addParser({
        // createViewer has already validated this manifest. The stock parser
        // would issue another XHR instead of using the prefetched response.
        canParse: ({ basename, asset }) => basename === 'lod-meta.json' && !!asset?.data && 'tree' in asset.data,
        load: (_url, callback, asset) => {
            let resource: GSplatOctreeResource;
            try {
                // PlayCanvas declares the public and source-path AssetRegistry separately.
                const registry = handler.app.assets as unknown as ConstructorParameters<typeof GSplatAssetLoader>[0];
                resource = new GSplatOctreeResource(
                    asset.getFileUrl(),
                    { ...asset.data },
                    new GSplatAssetLoader(registry)
                );
            } catch (error) {
                callback(`Unable to open streamed splat manifest: ${String(error)}`);
                return;
            }
            callback(null, resource);
        }
    });
}
