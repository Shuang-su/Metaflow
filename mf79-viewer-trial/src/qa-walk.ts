/** QA only: follow the first route through the public joystick input API.
 * This is automated native input in the real renderer, NOT keyboard/manual acceptance.
 * Never writes position/orientation and is not imported by the Viewer/preview.
 */
export function startWalk(viewer: any, goals: number[]) {
  const rows: any[] = [];
  let index = 0,
    path: any[] | null = null,
    cursor = 0,
    latest: any,
    tickCount = 0;
  const started = performance.now();
  let ended = false;
  const finish = (reason: string) => {
    if (ended) return;
    ended = true;
    viewer.setMoveInput(0, 0);
    subs.forEach((s) => s.off());
    clearTimeout(timer);
    rows.push({ type: "end", reason, elapsed: performance.now() - started });
  };
  const select = () => {
    path = null;
    cursor = 0;
    viewer.setMoveInput(0, 0);
    viewer.events.fire("guidance:select", goals[index]);
  };
  const subs = [
    viewer.events.on("guidance:diagnostic", (e: any) => {
      if (e.type === "route" && !path) {
        path = e.route.points;
        cursor = 1;
        rows.push({
          type: "route",
          goal: goals[index] + 1,
          points: path?.length,
          at: performance.now() - started,
        });
      }
      if (e.type === "error") rows.push({ type: "error", message: e.message });
    }),
    viewer.events.on("walk:physics", (s: any) => {
      latest = s;
      if (++tickCount % 6 === 0)
        rows.push({
          type: "pose",
          tick: s.tick,
          p: s.position,
          grounded: s.grounded,
        });
      if (!path || ended) return;
      while (
        cursor < path.length &&
        Math.hypot(
          path[cursor].x - s.position.x,
          path[cursor].z - s.position.z,
        ) < 0.07
      )
        cursor++;
      if (cursor === path.length) {
        viewer.setMoveInput(0, 0);
        return;
      }
      const target = path[cursor],
        dx = target.x - s.position.x,
        dz = target.z - s.position.z,
        n = Math.hypot(dx, dz),
        angle = (s.yaw * Math.PI) / 180;
      viewer.setMoveInput(
        ((dx * Math.cos(angle) - dz * Math.sin(angle)) / n) * 0.25,
        ((-dx * Math.sin(angle) - dz * Math.cos(angle)) / n) * 0.25,
      );
    }),
    viewer.events.on("guidance:arrived", (e: any) => {
      rows.push({
        type: "arrived",
        ...e,
        position: latest?.position,
        elapsed: performance.now() - started,
      });
      if (++index >= goals.length) finish("completed");
      else setTimeout(select, 0);
    }),
  ];
  const timer = setTimeout(
    () => finish("QA observation deadline (not planner verdict)"),
    240000,
  );
  select();
  return { rows, stop: () => finish("manual stop") };
}
