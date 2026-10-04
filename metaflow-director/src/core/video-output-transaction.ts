import type { StreamTargetChunk } from "mediabunny";

// StreamTarget.cancel() also closes its writer. Give it a proxy whose close is
// deliberately inert; only our final successful commit may replace the file.
class VideoOutputTransaction {
  readonly writable: WritableStream<StreamTargetChunk>;
  private stream: FileSystemWritableFileStream;
  private size = 0;
  private settled = false;

  constructor(stream: FileSystemWritableFileStream) {
    this.stream = stream;
    this.writable = new WritableStream<StreamTargetChunk>({
      write: async (chunk) => {
        if (this.settled) throw new Error("Video output transaction is closed");
        await stream.write(chunk);
        this.size = Math.max(this.size, chunk.position + chunk.data.byteLength);
      },
      close() {},
      abort() {},
    });
  }

  async writeBuffer(data: ArrayBuffer) {
    await this.stream.write({ type: "write", position: 0, data });
    this.size = data.byteLength;
  }

  async commit() {
    if (this.settled) throw new Error("Video output transaction is closed");
    await this.stream.truncate(this.size);
    await this.stream.close();
    this.settled = true;
  }

  async abort() {
    if (this.settled) return;
    this.settled = true;
    await this.stream.abort();
  }
}

export { VideoOutputTransaction };
