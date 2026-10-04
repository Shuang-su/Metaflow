import {
  Output,
  BufferTarget,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  WebMOutputFormat,
} from "mediabunny";
import { VideoOutputTransaction } from "./video-output-transaction";
import { frameCount } from "./model";
import { abortable } from "./abortable";
export type ExportSettings = {
  width: number;
  height: number;
  fps: number;
  format: "mp4" | "webm";
};
export function encoderConfig(s: ExportSettings): VideoEncoderConfig {
  return {
    codec:
      s.format === "mp4"
        ? s.width * s.height > 1920 * 1080
          ? s.fps > 30
            ? "avc1.640034"
            : "avc1.640033"
          : "avc1.64002a"
        : "vp09.00.51.08",
    width: s.width,
    height: s.height,
    framerate: s.fps,
    bitrate: Math.round(s.width * s.height * s.fps * 0.16),
    latencyMode: "quality",
    ...(s.format === "mp4" ? { avc: { format: "avc" as const } } : {}),
  };
}
export async function preflight(s: ExportSettings) {
  if (!("VideoEncoder" in window)) return false;
  try {
    return !!(await VideoEncoder.isConfigSupported(encoderConfig(s))).supported;
  } catch {
    return false;
  }
}
/** Same serialized muxer-write and transactional-save pattern as the Editor candidate. No Editor scene imports. */
export async function exportVideo(
  settings: ExportSettings,
  duration: number,
  render: (time: number) => Promise<HTMLCanvasElement>,
  signal: AbortSignal,
  progress: (n: number) => void,
  file?: FileSystemWritableFileStream,
) {
  if (!(await preflight(settings)))
    throw new Error("当前设备不支持所选编码与尺寸组合");
  signal.throwIfAborted();
  const target = new BufferTarget(),
    source = new EncodedVideoPacketSource(
      settings.format === "mp4" ? "avc" : "vp9",
    );
  const output = new Output({
    target,
    format:
      settings.format === "mp4"
        ? new Mp4OutputFormat({ fastStart: "in-memory" })
        : new WebMOutputFormat(),
  });
  output.addVideoTrack(source, { frameRate: settings.fps });
  const transaction = file ? new VideoOutputTransaction(file) : null;
  let writes = Promise.resolve(),
    failure: unknown = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      writes = writes
        .then(() => {
          signal.throwIfAborted();
          return source.add(EncodedPacket.fromEncodedChunk(chunk), meta);
        })
        .catch((e) => {
          failure = e;
        });
    },
    error: (e) => {
      failure = e;
    },
  });
  const closeEncoder = () => {
    if (encoder.state !== "closed") encoder.close();
  };
  const wait = <T>(task: Promise<T>) => abortable(task, signal, closeEncoder);
  const check = () => {
    signal.throwIfAborted();
    if (failure) throw failure;
  };
  try {
    await output.start();
    encoder.configure(encoderConfig(settings));
    const count = frameCount(duration, settings.fps);
    for (let n = 0; n < count; n++) {
      check();
      const canvas = await render(n / settings.fps);
      check();
      const timestamp = Math.round((n * 1e6) / settings.fps),
        end = Math.round(((n + 1) * 1e6) / settings.fps);
      const frame = new VideoFrame(canvas, {
        timestamp,
        duration: end - timestamp,
      });
      try {
        encoder.encode(frame, {
          keyFrame: n % Math.max(1, Math.round(settings.fps * 2)) === 0,
        });
      } finally {
        frame.close();
      }
      if (encoder.encodeQueueSize > 3) {
        await wait(encoder.flush());
        await wait(writes);
        check();
      }
      progress((n + 1) / (count + 1));
    }
    await wait(encoder.flush());
    await wait(writes);
    check();
    source.close();
    await wait(output.finalize());
    check();
    if (!target.buffer) throw new Error("视频封装未生成文件");
    if (transaction) {
      await transaction.writeBuffer(target.buffer);
      check();
      await transaction.commit();
    }
    progress(1);
    return new Blob([target.buffer], {
      type: settings.format === "mp4" ? "video/mp4" : "video/webm",
    });
  } catch (e) {
    closeEncoder();
    await output.cancel().catch(() => {});
    await transaction?.abort().catch(() => {});
    throw e;
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
}
