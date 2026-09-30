import type { AssetRef } from './document';

export const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
};
export const jsonBlob = (data: unknown) => new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
export const assetKey = (ref: AssetRef) => `${ref.role}:${ref.name}:${ref.size ?? 0}:${ref.modified ?? 0}`;
const database = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('metaflow-studio-handles', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('handles');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});
export const rememberHandle = async (ref: AssetRef, handle: FileSystemFileHandle) => {
    const db = await database();
    try {
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction('handles', 'readwrite');
            transaction.objectStore('handles').put(handle, assetKey(ref));
            transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
        });
    } finally {
        db.close();
    }
};
export const restoreHandle = async (ref: AssetRef): Promise<File | null> => {
    const db = await database();
    try {
        const handle = await new Promise<FileSystemFileHandle>((resolve, reject) => {
            const request = db.transaction('handles').objectStore('handles').get(assetKey(ref));
            request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        if (handle && await handle.queryPermission({ mode: 'read' }) === 'granted') return await handle.getFile();
        return null;
    } finally {
        db.close();
    }
};
export const chooseFiles = async (accept = '', directory = false): Promise<{ file: File; handle?: FileSystemFileHandle; name: string }[]> => {
    if (typeof window.showOpenFilePicker === 'function' && !directory) {
        let handles: FileSystemFileHandle[];
        try {
            handles = await window.showOpenFilePicker({ multiple: true,
                ...(accept ? { types: [{ description: '支持的文件', accept: { 'application/octet-stream': accept.split(',') as `.${string}`[] } }] } : {}) });
        } catch (error) {
            if ((error as DOMException).name === 'AbortError') return [];
            throw error;
        }
        return Promise.all(handles.map(async handle => ({ file: await handle.getFile(), handle, name: handle.name })));
    }
    return new Promise((resolve) => {
        const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.accept = accept;
        if (directory) input.setAttribute('webkitdirectory', '');
        // Keep the picker alive while the native dialog is open (Safari may
        // otherwise collect a detached input before delivering its change event).
        input.style.display = 'none'; document.body.append(input);
        input.onchange = () => {
            const files = Array.from(input.files); input.remove();
            resolve(files.map(file => ({ file, name: file.webkitRelativePath ? file.webkitRelativePath.split('/').slice(1).join('/') : file.name })));
        };
        input.oncancel = () => {
            input.remove(); resolve([]);
        };
        input.click();
    });
};
export const validateCollision = async (json: File, binary: File) => {
    if (!json.name.endsWith('.voxel.json') || binary.name !== json.name.replace('.voxel.json', '.voxel.bin')) throw new Error('请选择同名的 .voxel.json 和 .voxel.bin 文件');
    const meta = JSON.parse(await json.text());
    const count = meta.nodeWordCount ?? meta.nodeCount;
    if (!Number.isSafeInteger(count) || count <= 0 || !Number.isSafeInteger(meta.leafDataCount) || meta.leafDataCount < 0 || binary.size !== (count + meta.leafDataCount) * 4) throw new Error('碰撞二进制长度与元数据不匹配');
    if (!Number.isFinite(meta.voxelResolution) || meta.voxelResolution <= 0 || !Number.isInteger(meta.treeDepth) || meta.treeDepth < 0 || meta.treeDepth > 30) throw new Error('碰撞网格精度或树深无效');
    // splat-transform 2.6 uses sceneBounds; older exports use gaussianBounds.
    // Bounds used by the octree remain gridBounds in both formats. Preserve the
    // source metadata and validate every supplied source-bounds field.
    const sourceBounds = ['gaussianBounds', 'sceneBounds'].filter(field => field in meta);
    if (!sourceBounds.length) throw new Error('碰撞坐标范围缺失：sceneBounds / gaussianBounds');
    for (const field of ['gridBounds', ...sourceBounds]) {
        const bounds = meta[field];
        if (!bounds || ![bounds.min, bounds.max].every(v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)) || bounds.min.some((v: number, i: number) => v >= bounds.max[i])) throw new Error(`碰撞坐标范围无效：${field}`);
    }
    if (meta.leafSize !== 4 || ![1, 2].includes(meta.nodeStride ?? 1)) throw new Error('碰撞叶节点或字宽格式不受支持');
    const stride = meta.nodeStride ?? 1;
    if (count % stride !== 0 || (meta.nodeCount !== undefined && count !== meta.nodeCount * stride)) throw new Error('碰撞节点数量与字宽不匹配');
    const words = new Uint32Array(await binary.arrayBuffer());
    const nodes = count / stride;
    for (let i = 0; i < nodes; i++) {
        const mask = stride === 1 ? words[i] >>> 24 : words[i * 2] & 255;
        const offset = stride === 1 ? words[i] & 0xffffff : words[i * 2 + 1];
        if (mask === 255 && offset === 0) continue;
        if (mask === 0) {
            if ((offset + 1) * 2 > meta.leafDataCount) throw new Error('碰撞叶节点超出二进制范围');
        } else {
            let children = 0; for (let bits = mask; bits; bits &= bits - 1) children++;
            if (offset <= i || offset + children > nodes) throw new Error('碰撞子节点地址无效');
        }
    }
    return meta;
};
