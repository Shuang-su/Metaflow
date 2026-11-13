import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

/**
 * VRM 1.0 loader for desktop portrait experiment.
 * Loads VRM models, validates humanoid skeleton, and returns a THREE.js VRM instance.
 * 
 * License considerations:
 * - LAPLACE Milky Green (明前奶绿) and Persona examples are reference-only; not distributed.
 * - Users must provide their own VRM files or use explicitly licensed models.
 * - Attribution is preserved in VRM metadata.
 */

let loadSerial = 0;

function namedError(name, message) {
    const error = new Error(message);
    error.name = name;
    return error;
}

/**
 * Create a VRM loader that supports cancellation, timeout, and size limits.
 * Returns a VRM instance with scene, humanoid bones, expressions, and lookAt.
 */
export function createVRMLoader({
    fetchImpl = fetch,
    limitBytes = 150 * 1024 * 1024,
    timeoutMs = 120000
} = {}) {
    if (typeof fetchImpl !== 'function') {
        throw new TypeError('fetchImpl is required');
    }
    if (!Number.isSafeInteger(limitBytes) || limitBytes < 1) {
        throw new RangeError('limitBytes must be a positive integer');
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new RangeError('timeoutMs must be positive');
    }

    let current = null;

    function settle(task, error, vrm) {
        if (task.settled) return;
        task.settled = true;
        clearTimeout(task.timer);
        task.controller.signal.removeEventListener('abort', task.onAbort);
        if (current === task) current = null;
        if (error) task.reject(error);
        else task.resolve(vrm);
    }

    function fail(task, error) {
        if (task.settled) return;
        task.controller.abort(error);
    }

    function abort(task) {
        if (task.settled) return;
        if (task.reader) {
            try { Promise.resolve(task.reader.cancel()).catch(() => {}); } catch {}
        }
        // Dispose any partially loaded resources
        if (task.vrm) {
            VRMUtils.deepDispose(task.vrm.scene);
        }
        settle(task, task.controller.signal.reason ?? namedError('AbortError', '加载已取消'));
    }

    async function download(task, url) {
        const response = await fetchImpl(url, { 
            signal: task.controller.signal, 
            credentials: 'omit',
            mode: 'cors'
        });
        if (task.settled) {
            try { Promise.resolve(response.body?.cancel()).catch(() => {}); } catch {}
            return null;
        }
        task.response = response;
        if (!response.ok) {
            // Cancel body before throwing
            if (response.body) {
                try { Promise.resolve(response.body.cancel()).catch(() => {}); } catch {}
            }
            throw new Error(`VRM 请求失败（${response.status}）`);
        }
        const declaredBytes = Number(response.headers?.get('content-length'));
        const limitMessage = `VRM 文件超过 ${(limitBytes / (1024 * 1024)).toFixed(1)} MiB 限制`;
        if (declaredBytes > limitBytes) {
            throw new RangeError(limitMessage);
        }
        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('无法以流方式读取 VRM 文件');
        }
        task.reader = reader;
        const chunks = [];
        let bytes = 0;
        try {
            while (!task.settled) {
                const { done, value } = await reader.read();
                if (task.settled || done) break;
                if (!(value instanceof Uint8Array)) {
                    throw new TypeError('资源流返回了无效的数据');
                }
                bytes += value.byteLength;
                if (bytes > limitBytes) {
                    throw new RangeError(limitMessage);
                }
                chunks.push(value);
            }
        } catch (error) {
            try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {}
            throw error;
        } finally {
            reader.releaseLock();
            task.reader = null;
        }
        if (task.settled) return null;
        const buffer = new Uint8Array(bytes);
        let offset = 0;
        for (const chunk of chunks) {
            buffer.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return buffer.buffer;
    }

    async function parse(task, arrayBuffer, filename) {
        const loader = new GLTFLoader();
        loader.register((parser) => new VRMLoaderPlugin(parser));
        
        // Create a blob URL for GLTFLoader (it expects a URL)
        const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' });
        const blobUrl = URL.createObjectURL(blob);
        
        try {
            const gltf = await loader.loadAsync(blobUrl);
            URL.revokeObjectURL(blobUrl);
            
            if (task.settled) {
                if (gltf.userData?.vrm) {
                    VRMUtils.deepDispose(gltf.userData.vrm.scene);
                }
                return null;
            }
            
            const vrm = gltf.userData?.vrm;
            if (!vrm || !(vrm instanceof VRM)) {
                throw new Error('文件不包含有效的 VRM 数据');
            }
            
            // Validate humanoid skeleton
            if (!vrm.humanoid) {
                throw new Error('VRM 缺少必需的 humanoid 骨骼定义');
            }
            
            // Store metadata (ensure userData exists)
            if (!vrm.userData) vrm.userData = {};
            vrm.userData.filename = filename;
            vrm.userData.loadSerial = ++loadSerial;
            
            return vrm;
        } catch (error) {
            URL.revokeObjectURL(blobUrl);
            throw error;
        }
    }

    async function run(task, url, filename) {
        try {
            const arrayBuffer = await download(task, url);
            if (task.settled || !arrayBuffer) return;
            
            const vrm = await parse(task, arrayBuffer, filename);
            if (task.settled || !vrm) {
                if (vrm) VRMUtils.deepDispose(vrm.scene);
                return;
            }
            
            task.vrm = vrm;
            settle(task, null, vrm);
        } catch (error) {
            fail(task, error instanceof Error ? error : new Error(String(error)));
        }
    }

    return {
        /**
         * Load a VRM file from URL.
         * @param {Object} options
         * @param {string} options.url - The URL to load from (blob: or https:)
         * @param {string} options.filename - Display filename for error messages
         * @returns {Promise<VRM>} The loaded VRM instance
         */
        load({ url, filename } = {}) {
            if (current) {
                fail(current, namedError('AbortError', '已取消上一个 VRM 加载'));
            }
            if (typeof url !== 'string' || !url.trim()) {
                return Promise.reject(new TypeError('需要有效的 VRM 文件 URL'));
            }
            if (typeof filename !== 'string' || !/\.vrm$/i.test(filename)) {
                return Promise.reject(new TypeError('需要 .vrm 文件扩展名'));
            }
            
            const task = {
                controller: new AbortController(),
                settled: false,
                response: null,
                reader: null,
                vrm: null,
                onAbort: null,
                timer: null,
                resolve: null,
                reject: null
            };
            
            const promise = new Promise((resolve, reject) => {
                task.resolve = resolve;
                task.reject = reject;
            });
            
            current = task;
            task.onAbort = () => abort(task);
            task.controller.signal.addEventListener('abort', task.onAbort, { once: true });
            task.timer = setTimeout(
                () => fail(task, namedError('TimeoutError', 'VRM 加载超时')),
                timeoutMs
            );
            
            void run(task, url, filename);
            return promise;
        },
        
        /**
         * Cancel the current load operation.
         */
        cancel() {
            if (current) {
                fail(current, namedError('AbortError', 'VRM 加载已取消'));
            }
        }
    };
}

/**
 * Calculate bounding box for a VRM model in its reference pose.
 * @param {VRM} vrm - The VRM instance
 * @returns {{center: THREE.Vector3, halfExtents: THREE.Vector3}} Bounds
 */
export function getVRMBounds(vrm) {
    if (!vrm?.scene) {
        throw new TypeError('需要有效的 VRM 场景');
    }
    
    const box = new THREE.Box3();
    box.setFromObject(vrm.scene);
    
    if (!box.isEmpty()) {
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);
        return {
            center,
            halfExtents: size.multiplyScalar(0.5)
        };
    }
    
    // Fallback to humanoid bounds if scene bounds fail
    if (vrm.humanoid) {
        const bones = [];
        ['hips', 'head', 'leftHand', 'rightHand', 'leftFoot', 'rightFoot'].forEach(boneName => {
            const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
            if (bone) bones.push(bone);
        });
        
        if (bones.length > 0) {
            bones.forEach(bone => box.expandByObject(bone));
            if (!box.isEmpty()) {
                const center = new THREE.Vector3();
                const size = new THREE.Vector3();
                box.getCenter(center);
                box.getSize(size);
                return {
                    center,
                    halfExtents: size.multiplyScalar(0.5)
                };
            }
        }
    }
    
    throw new Error('无法计算 VRM 边界');
}
