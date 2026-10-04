import {
  Texture,
  PIXELFORMAT_RGBA16F,
  PIXELFORMAT_RGBA32F,
  FILTER_NEAREST,
} from "playcanvas";

/** Pinned PC 2.22.4 attachment adapter. Preserve RenderTarget identities because
 * upstream passes and picker retain them; replace the shared scene attachment.
 * No mutation of engine prototypes, source archives or any other scene. */
export function setScenePrecision(camera: any, device: any, high: boolean) {
  const format = high ? PIXELFORMAT_RGBA32F : PIXELFORMAT_RGBA16F;
  const old = camera.colorTarget.colorBuffer;
  if (old.format === format) return;
  if (
    high &&
    (!device.textureFloatRenderable ||
      !device.textureFloatBlendable ||
      !device.wgpu.features.has("float32-filterable"))
  )
    throw Error("此 GPU 不支持 RGBA32F 渲染、混合与采样，摄影高精度不可用");
  const texture = new Texture(device, {
    name: "Director linear scene",
    width: old.width,
    height: old.height,
    format,
    mipmaps: false,
    minFilter: FILTER_NEAREST,
    magFilter: FILTER_NEAREST,
  });
  for (const rt of [
    camera.mainTarget,
    camera.splatTarget,
    camera.colorTarget,
  ]) {
    rt.destroyFrameBuffers();
    rt._colorBuffer = texture;
    rt._colorBuffers[0] = texture;
    rt.impl = device.createRenderTargetImpl(rt);
  }
  old.destroy();
}
