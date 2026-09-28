/** Browser-only test driver: selection/display stress, never movement or camera injection. */
export function startSoak(viewer: any, durationMs = 30 * 60 * 1000) {
  const rows: any[] = [],
    begin = performance.now();
  let selections = 0,
    errors = 0;
  const diag = viewer.events.on("guidance:diagnostic", (e: any) => {
    if (e.type === "error") errors++;
  });
  const sample = () => {
    const app = viewer.app,
      cam = app.root.findComponents("camera")[0];
    rows.push({
      elapsed: performance.now() - begin,
      selections,
      errors,
      status: viewer.state.guidanceStatus,
      heap: (performance as any).memory?.usedJSHeapSize,
      depthBytes: cam.camera.sceneDepthMap
        ? cam.camera.sceneDepthMap.width * cam.camera.sceneDepthMap.height * 4
        : 0,
      routeMeshes: app.scene.layers.layerList.find(
        (l: any) => l.name === "Navigation with Gaussian depth",
      )?.meshInstances.length,
      resources: performance
        .getEntriesByType("resource")
        .filter((r: any) => r.name.includes("/navigation/")).length,
    });
  };
  viewer.state.guidanceMode = true;
  sample();
  const timer = setInterval(() => {
    viewer.events.fire(
      "guidance:select",
      [3, 12, 20, 26, 34, 41][selections++ % 6],
    );
    viewer.state.guidanceRouteDisplay = selections % 2 ? "full" : "near";
    sample();
    if (performance.now() - begin >= durationMs) stop();
  }, 10000);
  const stop = () => {
    clearInterval(timer);
    diag.off();
    sample();
    return {
      rows,
      duration: performance.now() - begin,
      completed: performance.now() - begin >= durationMs,
    };
  };
  return { rows, stop };
}
