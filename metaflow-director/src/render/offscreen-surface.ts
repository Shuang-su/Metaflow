/** Engine frame bookkeeping must not acquire/clear the browser swapchain for
 * auxiliary or aperture renders. Only the final compositor presents a canvas. */
export class OffscreenSurface {
  private texture: GPUTexture | null = null;
  private width = 0;
  private height = 0;
  constructor(private device: any) {}
  run<T>(render: () => T): T {
    const context = this.device.gpuContext;
    if (!context) return render();
    const width = Math.max(1, this.device.width),
      height = Math.max(1, this.device.height);
    if (!this.texture || width !== this.width || height !== this.height) {
      if (this.texture) this.device.deferDestroy(this.texture);
      const config = this.device.canvasConfig;
      this.texture = this.device.wgpu.createTexture({
        label: "Director offscreen frame surface",
        size: [width, height],
        format: config.format,
        usage: config.usage,
        viewFormats: config.viewFormats,
      });
      this.width = width;
      this.height = height;
    }
    const texture = this.texture;
    this.device.gpuContext = new Proxy(context, {
      get(target, key) {
        if (key === "getCurrentTexture") return () => texture;
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    try {
      return render();
    } finally {
      this.device.gpuContext = context;
    }
  }
  destroy() {
    if (this.texture) this.device.deferDestroy(this.texture);
    this.texture = null;
  }
}
