let assetSerial = 0;

function namedError(name, message) {
    const error = new Error(message);
    error.name = name;
    return error;
}

function cancelBody(body) {
    if (!body || body.locked) return;
    try { Promise.resolve(body.cancel()).catch(() => {}); } catch {}
}

/**
 * Owns only the in-progress request. A successfully returned Asset belongs to
 * the caller, and cancel()/the next load never unloads a delivered asset.
 */
export function createAssetLoader({
    app,
    Asset,
    fetchImpl = fetch,
    limitBytes = 150 * 1024 * 1024,
    timeoutMs = 120000
} = {}) {
    if (!app?.assets || typeof Asset !== 'function' || typeof fetchImpl !== 'function') {
        throw new TypeError('app.assets, Asset and fetchImpl are required');
    }
    if (!Number.isSafeInteger(limitBytes) || limitBytes < 1) throw new RangeError('limitBytes must be a positive integer');
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('timeoutMs must be positive');
    let current = null;

    function detachAssetListeners(task) {
        task.asset?.off('load', task.onLoad);
        task.asset?.off('error', task.onError);
    }

    function discard(task) {
        if (!task.asset) return;
        // unload before remove lets PlayCanvas notify its parser/texture owners
        // and clear the URL cache. A late parser completion may need this again.
        try { task.asset.unload(); } finally { app.assets.remove(task.asset); }
    }

    function settle(task, error, asset) {
        if (task.settled) return;
        task.settled = true;
        clearTimeout(task.timer);
        task.controller.signal.removeEventListener('abort', task.onAbort);
        if (current === task) current = null;
        if (error) task.reject(error);
        else task.resolve(asset);
    }

    function fail(task, error) {
        if (task.settled) return;
        task.controller.abort(error);
    }

    function abort(task) {
        if (task.settled) return;
        if (task.reader) {
            try { Promise.resolve(task.reader.cancel()).catch(() => {}); } catch {}
        } else {
            cancelBody(task.response?.body);
        }
        // Decoding cannot be forcibly aborted through AssetRegistry. Retain
        // exactly the load/error cleanup pair until its terminal callback.
        if (!task.parseStarted || task.parseFinished) detachAssetListeners(task);
        try {
            discard(task);
        } finally {
            settle(task, task.controller.signal.reason ?? namedError('AbortError', '加载已取消'));
        }
    }

    async function download(task, url) {
        const response = await fetchImpl(url, { signal: task.controller.signal, credentials: 'omit' });
        if (task.settled) {
            cancelBody(response?.body);
            return null;
        }
        task.response = response;
        if (!response.ok) throw new Error(`资源请求失败（${response.status}）`);
        const declaredBytes = Number(response.headers?.get('content-length'));
        const limitMessage = `资源超过原型的 ${(limitBytes / (1024 * 1024)).toLocaleString('en-US', { maximumFractionDigits: 2 })} MiB 上限`;
        if (declaredBytes > limitBytes) throw new RangeError(limitMessage);
        const reader = response.body?.getReader();
        if (!reader) throw new Error('浏览器无法以流方式读取该资源');
        task.reader = reader;
        const chunks = [];
        let bytes = 0;
        try {
            while (!task.settled) {
                const { done, value } = await reader.read();
                if (task.settled || done) break;
                if (!(value instanceof Uint8Array)) throw new TypeError('资源流返回了无效的字节数据');
                bytes += value.byteLength;
                if (bytes > limitBytes) throw new RangeError(limitMessage);
                chunks.push(value);
            }
        } catch (error) {
            // Native fetch aborts the reader as well; custom streams also need
            // cancellation before releaseLock, otherwise their source can run on.
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
        chunks.length = 0;
        return buffer;
    }

    async function run(task, url, filename) {
        try {
            const buffer = await download(task, url);
            if (task.settled || !buffer) return;
            // PlayCanvas coalesces/cache-shares parser requests by URL, even
            // after removal from AssetRegistry. A unique in-memory URL prevents
            // a cancelled old parse from destroying a same-URL retry's resource.
            // The network request above uses the original URL; parsers consume
            // contents below, so this fragment is never sent over the network.
            const assetUrl = `${url}${url.includes('#') ? '&' : '#'}mf165-load=${++assetSerial}`;
            const asset = new Asset(filename, 'gsplat', {
                url: assetUrl,
                filename,
                contents: Promise.resolve(new Response(buffer))
            });
            task.asset = asset;
            task.onLoad = () => {
                task.parseFinished = true;
                detachAssetListeners(task);
                if (task.settled || task.controller.signal.aborted) {
                    discard(task);
                } else if (!asset.resource) {
                    discard(task);
                    settle(task, new Error('解析未返回有效的高斯资源'));
                } else {
                    settle(task, null, asset);
                }
            };
            task.onError = (error) => {
                task.parseFinished = true;
                detachAssetListeners(task);
                discard(task);
                settle(task, error instanceof Error ? error : new Error(String(error)));
            };
            asset.on('load', task.onLoad);
            asset.on('error', task.onError);
            app.assets.add(asset);
            if (task.settled) return;
            task.parseStarted = true;
            app.assets.load(asset);
        } catch (error) {
            fail(task, error instanceof Error ? error : new Error(String(error)));
        }
    }

    return {
        load({ url, filename } = {}) {
            if (current) fail(current, namedError('AbortError', '已取消上一个加载请求'));
            if (typeof url !== 'string' || !url.trim() || typeof filename !== 'string' || !/\.(ply|sog)$/i.test(filename)) {
                return Promise.reject(new TypeError('请提供有效的 PLY 或 SOG 文件地址和文件名'));
            }
            const task = {
                controller: new AbortController(),
                settled: false,
                response: null,
                reader: null,
                asset: null,
                parseStarted: false,
                parseFinished: false,
                onLoad: null,
                onError: null,
                onAbort: null,
                timer: null,
                resolve: null,
                reject: null
            };
            const promise = new Promise((resolve, reject) => { task.resolve = resolve; task.reject = reject; });
            current = task;
            task.onAbort = () => abort(task);
            task.controller.signal.addEventListener('abort', task.onAbort, { once: true });
            task.timer = setTimeout(() => fail(task, namedError('TimeoutError', '加载超过时限，已取消；可以重试或换一个较小的人像')), timeoutMs);
            void run(task, url, filename);
            return promise;
        },
        cancel() {
            if (current) fail(current, namedError('AbortError', '加载已取消'));
        }
    };
}
