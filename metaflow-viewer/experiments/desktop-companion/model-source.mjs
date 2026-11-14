// Pure model transport: no renderer, DOM elements, camera or WebGL required.
export const MAX_MODEL_BYTES = 50 * 1024 * 1024;
const INFLATE_CHUNK_BYTES = 16 * 1024;

const fail = (message, code) => Object.assign(new Error(message), { code });
const validSize = (value) => Number.isSafeInteger(value) && value > 0 && value <= MAX_MODEL_BYTES;
function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException('角色载入已取消', 'AbortError');
}

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let value = i;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  crcTable[i] = value >>> 0;
}
function updateCrc(crc, data) {
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 255] ^ (crc >>> 8);
  return crc >>> 0;
}

function gzipMetadata(data, expectedSize) {
  if (data.length < 18 || data[0] !== 0x1f || data[1] !== 0x8b || data[2] !== 8 || (data[3] & 0xe0)) {
    throw fail('角色压缩文件头无效，请重新下载。', 'MODEL_GZIP_FORMAT');
  }
  const flags = data[3], trailer = data.length - 8;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 10;
  if (flags & 4) {
    if (offset + 2 > trailer) throw fail('角色压缩文件不完整。', 'MODEL_GZIP_FORMAT');
    offset += 2 + view.getUint16(offset, true);
  }
  for (const flag of [8, 16]) if (flags & flag) {
    while (offset < trailer && data[offset] !== 0) offset++;
    offset++;
  }
  if (flags & 2) {
    if (offset + 2 > trailer) throw fail('角色压缩文件不完整。', 'MODEL_GZIP_FORMAT');
    const expected = view.getUint16(offset, true);
    const actual = (updateCrc(0xffffffff, data.subarray(0, offset)) ^ 0xffffffff) & 0xffff;
    if (actual !== expected) throw fail('角色压缩文件头校验失败。', 'MODEL_GZIP_CRC');
    offset += 2;
  }
  if (offset >= trailer) throw fail('角色压缩文件不完整。', 'MODEL_GZIP_FORMAT');
  // Internal assets use a single gzip member and are below 2^32 bytes, so
  // ISIZE must exactly match the declared uncompressed length.
  if (view.getUint32(trailer + 4, true) !== expectedSize) throw fail('角色解压长度与描述不一致。', 'MODEL_GZIP_SIZE');
  return { crc: view.getUint32(trailer, true) };
}

function outputCollector(expectedSize, expectedCrc, signal) {
  const output = new Uint8Array(expectedSize);
  let written = 0, crc = 0xffffffff;
  return {
    append(chunk) {
      checkAbort(signal);
      if (written + chunk.byteLength > expectedSize) throw fail('角色解压数据超过预期长度。', 'MODEL_GZIP_SIZE');
      output.set(chunk, written); written += chunk.byteLength; crc = updateCrc(crc, chunk);
    },
    finish() {
      checkAbort(signal);
      if (written !== expectedSize) throw fail('角色解压数据不完整。', 'MODEL_GZIP_SIZE');
      if (((crc ^ 0xffffffff) >>> 0) !== expectedCrc) throw fail('角色压缩文件校验失败，请重新下载。', 'MODEL_GZIP_CRC');
      return output.buffer;
    },
  };
}

async function inflateNative(data, expectedSize, expectedCrc, signal) {
  if (typeof DecompressionStream !== 'function') throw fail('当前浏览器没有原生 gzip 解压能力。', 'NATIVE_GZIP_UNAVAILABLE');
  const output = outputCollector(expectedSize, expectedCrc, signal);
  let offset = 0;
  const input = new ReadableStream({
    pull(controller) {
      checkAbort(signal);
      if (offset >= data.length) { controller.close(); return; }
      const end = Math.min(offset + INFLATE_CHUNK_BYTES, data.length);
      controller.enqueue(data.subarray(offset, end)); offset = end;
    },
  });
  const reader = input.pipeThrough(new DecompressionStream('gzip')).getReader();
  const abort = () => { reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      checkAbort(signal);
      const { done, value } = await reader.read();
      checkAbort(signal);
      if (done) break;
      output.append(value);
    }
    return output.finish();
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}

async function inflateCompatible(data, expectedSize, expectedCrc, signal) {
  let Gunzip;
  try { ({ Gunzip } = await import('./vendor/fflate/browser.mjs')); }
  catch { throw fail('兼容解压组件无法加载，请刷新后重试。', 'MODEL_GZIP_COMPONENT'); }
  checkAbort(signal);
  const output = outputCollector(expectedSize, expectedCrc, signal);
  const inflater = new Gunzip((chunk) => output.append(chunk));
  inflater.onmember = () => { throw fail('角色压缩包包含不支持的多个数据段。', 'MODEL_GZIP_FORMAT'); };
  // Streaming Gunzip has no terminate(). Small input chunks bound each push;
  // yielding between batches allows cancellation and the load timeout to run.
  let batch = 0;
  for (let offset = 0; offset < data.length; offset += INFLATE_CHUNK_BYTES) {
    checkAbort(signal);
    const end = Math.min(offset + INFLATE_CHUNK_BYTES, data.length);
    inflater.push(data.subarray(offset, end), end === data.length);
    if (++batch % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return output.finish();
}

async function inflateGzip(data, expectedSize, signal, decoder) {
  checkAbort(signal);
  const { crc } = gzipMetadata(data, expectedSize);
  if (!['auto', 'native', 'fflate'].includes(decoder)) throw fail('无效的角色解压方式。', 'MODEL_GZIP_DECODER');
  if (decoder !== 'fflate') {
    try { return await inflateNative(data, expectedSize, crc, signal); }
    catch (error) {
      checkAbort(signal);
      // A proven size/checksum/format error is not a browser-compatibility
      // problem. The fallback also verifies CRC: fflate itself does not.
      if (decoder === 'native' || String(error.code || '').startsWith('MODEL_GZIP_')) throw error;
    }
  }
  try { return await inflateCompatible(data, expectedSize, crc, signal); }
  catch (error) {
    checkAbort(signal);
    if (String(error.code || '').startsWith('MODEL_GZIP_')) throw error;
    throw fail('角色压缩数据无法解压，文件可能不完整或已损坏。', 'MODEL_GZIP_DECODE');
  }
}

/**
 * URL, File/Blob, ArrayBuffer/view, lossless parts, or an internal gzip source.
 * progress(loaded, total, message?) reports transport bytes. gzipDecoder is an
 * explicit optional backend preference; production defaults to native + fallback.
 * .gz assets must be served as raw gzip files, not HTTP Content-Encoding:gzip.
 */
export async function readModel(source, signal, progress = () => {}, { gzipDecoder = 'auto' } = {}) {
  checkAbort(signal);
  if (source && typeof source === 'object' && 'compression' in source) {
    if (source.compression !== 'gzip' || typeof source.url !== 'string' || !source.url || !validSize(source.bytes) || !validSize(source.decodedBytes)) {
      throw fail('角色压缩描述无效或超过 50 MB 限制。', 'MODEL_GZIP_DESCRIPTOR');
    }
    const compressed = await readModel(source.url, signal, (loaded) => {
      if (loaded > source.bytes) throw fail('角色压缩文件长度不一致。', 'MODEL_GZIP_SIZE');
      progress(loaded, source.bytes);
    });
    checkAbort(signal);
    if (compressed.byteLength !== source.bytes) throw fail('角色压缩文件长度不一致。', 'MODEL_GZIP_SIZE');
    progress(source.bytes, source.bytes, '正在无损解压角色');
    return inflateGzip(new Uint8Array(compressed), source.decodedBytes, signal, gzipDecoder);
  }
  if (source && typeof source === 'object' && 'parts' in source) {
    const total = source.bytes, parts = source.parts;
    if (!validSize(total) || !Array.isArray(parts) || !parts.length || parts.length > 16) throw new Error('角色分片描述无效或超过 50 MB 限制。');
    let declared = 0;
    for (const part of parts) {
      if (!part || typeof part.url !== 'string' || !part.url || !validSize(part.bytes)) throw new Error('角色分片描述无效。');
      declared += part.bytes;
    }
    if (declared !== total) throw new Error('角色分片总长度不一致。');
    const result = new Uint8Array(total); let offset = 0;
    for (const part of parts) {
      checkAbort(signal);
      const buffer = await readModel(part.url, signal, (loaded) => {
        if (loaded > part.bytes) throw new Error('角色分片长度不一致。');
        progress(offset + loaded, total);
      });
      checkAbort(signal);
      if (buffer.byteLength !== part.bytes) throw new Error('角色分片长度不一致。');
      result.set(new Uint8Array(buffer), offset); offset += part.bytes; progress(offset, total);
    }
    return result.buffer;
  }
  if (source instanceof ArrayBuffer) {
    if (source.byteLength > MAX_MODEL_BYTES) throw new Error('请选择小于 50 MB 的角色。');
    return source;
  }
  if (ArrayBuffer.isView(source)) {
    if (source.byteLength > MAX_MODEL_BYTES) throw new Error('请选择小于 50 MB 的角色。');
    return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  }
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    if (source.size > MAX_MODEL_BYTES) throw new Error('请选择小于 50 MB 的角色。');
    const buffer = await source.arrayBuffer(); checkAbort(signal); progress(source.size, source.size); return buffer;
  }
  const response = await fetch(source, { signal, credentials: 'same-origin' });
  if (!response.ok) throw new Error('角色文件暂时无法读取，请重试。');
  const total = Number(response.headers.get('content-length')) || 0;
  if (total > MAX_MODEL_BYTES) { await response.body?.cancel().catch(() => {}); throw new Error('请选择小于 50 MB 的角色。'); }
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = await response.arrayBuffer(); checkAbort(signal);
    if (buffer.byteLength > MAX_MODEL_BYTES) throw new Error('角色超过 50 MB 限制。');
    progress(buffer.byteLength, total); return buffer;
  }
  const abort = () => { reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  const chunks = []; let count = 0;
  try {
    while (true) {
      checkAbort(signal);
      const { done, value } = await reader.read(); checkAbort(signal); if (done) break;
      count += value.byteLength; if (count > MAX_MODEL_BYTES) throw new Error('角色超过 50 MB 限制。');
      chunks.push(value); progress(count, total);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { signal?.removeEventListener('abort', abort); }
  const result = new Uint8Array(count); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result.buffer;
}
