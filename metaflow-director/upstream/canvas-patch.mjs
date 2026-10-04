/** Container isolation for the pinned upstream bootstrap; the archive stays immutable. */
export function canvasPatch(code, id) {
  if (id.endsWith("/camera.ts")) {
    const before =
      "const target = document.getElementById('canvas-container');";
    if (!code.includes(before))
      throw Error("Camera container patch no longer matches");
    code = code.replace(before, "const target = scene.canvas.parentElement;");
  }
  if (id.endsWith("/scene.ts")) {
    const replaceRequired = (before, after) => {
      if (!code.includes(before))
        throw Error(`Shared canvas patch no longer matches: ${before}`);
      code = code.replace(before, after);
    };
    replaceRequired(
      "const canvasContainer = window.document.getElementById('canvas-container');",
      "const canvasContainer = canvas.parentElement;",
    );
    // The observer still tracks Studio's container while the canvas is in
    // Director. Never let that hidden viewport resize a photography frame.
    replaceRequired(
      "if (this.canvasResize) {",
      "if (this.canvasResize && this.events.functions.get('workbench.mode')?.() !== 'director') {",
    );
    replaceRequired(
      "this.canvas.width = this.canvasResize.width;\n            this.canvas.height = this.canvasResize.height;",
      "this.app.graphicsDevice.setResolution(this.canvasResize.width, this.canvasResize.height);",
    );
    // Camera targets and the GPU splat projector must use the same dimensions,
    // including thumbnails/exports whose aspect differs from the visible canvas.
    replaceRequired(
      "this.targetSize.width = Math.ceil(this.app.graphicsDevice.width / this.config.camera.pixelScale);\n        this.targetSize.height = Math.ceil(this.app.graphicsDevice.height / this.config.camera.pixelScale);",
      "this.targetSize.width = this.camera.targetSizeOverride?.width ?? Math.ceil(this.app.graphicsDevice.width / this.config.camera.pixelScale);\n        this.targetSize.height = this.camera.targetSizeOverride?.height ?? Math.ceil(this.app.graphicsDevice.height / this.config.camera.pixelScale);",
    );
  }
  return code;
}
