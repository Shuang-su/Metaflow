import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVRMLoader } from './vrm-loader.mjs';

test('createVRMLoader requires valid configuration', () => {
    assert.doesNotThrow(() => createVRMLoader());
    assert.doesNotThrow(() => createVRMLoader({ limitBytes: 100 * 1024 * 1024 }));
    assert.throws(() => createVRMLoader({ limitBytes: -1 }), /limitBytes must be a positive integer/);
    assert.throws(() => createVRMLoader({ timeoutMs: -100 }), /timeoutMs must be positive/);
    assert.throws(() => createVRMLoader({ fetchImpl: null }), /fetchImpl is required/);
});

test('load rejects invalid inputs', async () => {
    const loader = createVRMLoader();
    
    await assert.rejects(
        loader.load({ url: '', filename: 'test.vrm' }),
        /需要有效的 VRM 文件 URL/
    );
    
    await assert.rejects(
        loader.load({ url: 'https://example.com/model.vrm', filename: 'test.glb' }),
        /需要 \.vrm 文件扩展名/
    );
    
    await assert.rejects(
        loader.load({ url: 'https://example.com/model.vrm', filename: '' }),
        /需要 \.vrm 文件扩展名/
    );
});

test('load rejects oversized Content-Length before download', async () => {
    const loader = createVRMLoader({
        limitBytes: 1000,
        fetchImpl: async () => ({
            ok: true,
            headers: { get: (key) => key === 'content-length' ? '1001' : null },
            body: null
        })
    });
    
    await assert.rejects(
        loader.load({ url: 'https://example.com/large.vrm', filename: 'large.vrm' }),
        /VRM 文件超过.*限制/
    );
});

test('load rejects HTTP errors and cancels body', async () => {
    let bodyCancelled = false;
    const loader = createVRMLoader({
        fetchImpl: async () => ({
            ok: false,
            status: 404,
            headers: { get: () => null },
            body: {
                cancel: async () => { bodyCancelled = true; }
            }
        })
    });
    
    await assert.rejects(
        loader.load({ url: 'https://example.com/missing.vrm', filename: 'missing.vrm' }),
        /VRM 请求失败.*404/
    );
    
    assert.equal(bodyCancelled, true, 'Failed response body should be cancelled');
});

test('new load cancels previous in-flight load', async () => {
    let firstCancelled = false;
    let fetchCount = 0;
    
    const loader = createVRMLoader({
        fetchImpl: async (url) => {
            fetchCount++;
            if (fetchCount === 1) {
                // First request - delay it
                await new Promise(resolve => setTimeout(resolve, 100));
                throw new Error('Should have been cancelled');
            }
            // Second request
            return {
                ok: true,
                headers: { get: () => null },
                body: {
                    getReader: () => ({
                        read: async () => ({ done: true }),
                        releaseLock: () => {}
                    }),
                    cancel: async () => {}
                }
            };
        }
    });
    
    const first = loader.load({ url: 'https://example.com/first.vrm', filename: 'first.vrm' });
    first.catch(() => { firstCancelled = true; });
    
    // Start second load immediately
    await new Promise(resolve => setTimeout(resolve, 10));
    const second = loader.load({ url: 'https://example.com/second.vrm', filename: 'second.vrm' });
    
    await assert.rejects(first, /已取消上一个 VRM 加载/);
    assert.equal(firstCancelled, true, 'First load should be cancelled');
    
    // Second load should fail with parse error (no valid VRM data)
    await assert.rejects(second);
});

test('cancel aborts current load', async () => {
    let readerCancelled = false;
    
    const loader = createVRMLoader({
        fetchImpl: async () => ({
            ok: true,
            headers: { get: () => null },
            body: {
                getReader: () => ({
                    read: async () => {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        return { done: false, value: new Uint8Array(10) };
                    },
                    cancel: async () => { readerCancelled = true; },
                    releaseLock: () => {}
                })
            }
        })
    });
    
    const load = loader.load({ url: 'https://example.com/test.vrm', filename: 'test.vrm' });
    
    await new Promise(resolve => setTimeout(resolve, 50));
    loader.cancel();
    
    await assert.rejects(load, /加载已取消/);
    assert.equal(readerCancelled, true, 'Reader should be cancelled');
});

test('timeout aborts stalled load', async () => {
    const loader = createVRMLoader({
        timeoutMs: 100,
        fetchImpl: async () => ({
            ok: true,
            headers: { get: () => null },
            body: {
                getReader: () => ({
                    read: async () => {
                        // Stall indefinitely
                        await new Promise(() => {});
                    },
                    cancel: async () => {},
                    releaseLock: () => {}
                })
            }
        })
    });
    
    await assert.rejects(
        loader.load({ url: 'https://example.com/slow.vrm', filename: 'slow.vrm' }),
        /VRM 加载超时/
    );
});

test('enforces size limit on actual chunks', async () => {
    const loader = createVRMLoader({
        limitBytes: 100,
        fetchImpl: async () => ({
            ok: true,
            headers: { get: () => null }, // No Content-Length
            body: {
                getReader: () => ({
                    read: (() => {
                        let count = 0;
                        return async () => {
                            if (count++ === 0) {
                                return { done: false, value: new Uint8Array(101) };
                            }
                            return { done: true };
                        };
                    })(),
                    cancel: async () => {},
                    releaseLock: () => {}
                })
            }
        })
    });
    
    await assert.rejects(
        loader.load({ url: 'https://example.com/large.vrm', filename: 'large.vrm' }),
        /VRM 文件超过.*限制/
    );
});
