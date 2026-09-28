import { NavigationTask } from "../../metaflow-viewer/src/navigation/task-state";
import audit from "../docs/region-audit-apms-2026.json";
import markers from "../apms-markers-42.mfstudio.json";
const out = document.querySelector("#out")!;
const rows: object[] = [];
const log = (row: object) => {
  rows.push(row);
  out.textContent = JSON.stringify(rows, null, 2);
};
(window as any).qa = { rows };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function wait(
  worker: Worker,
  predicate: (data: any) => boolean,
  ms = 60000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.removeEventListener("message", on);
      reject(Error("QA observation deadline"));
    }, ms);
    const on = ({ data }: MessageEvent) => {
      if (predicate(data)) {
        clearTimeout(timer);
        worker.removeEventListener("message", on);
        resolve(data);
      }
    };
    worker.addEventListener("message", on);
  });
}
document.querySelector<HTMLButtonElement>("#run")!.onclick = async function (
  this: HTMLButtonElement,
) {
  this.disabled = true;
  const clock = new Worker(new URL("./qa-clock-worker.ts", import.meta.url), {
    type: "module",
  });
  const worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });
  try {
    for (const ms of [5100, 15100, 30100]) {
      const task = new NavigationTask();
      task.set("computing", "计算中");
      const done = wait(
        clock,
        (d) => d.type === "complete" && d.session === ms,
      );
      clock.postMessage({ type: "run", session: ms, ms });
      await sleep(5050);
      if (!task.text().includes("仍在计算"))
        throw Error("long task state overwritten");
      const result = await done;
      if (result.elapsed < ms || !result.progress) throw Error("progress lost");
      log({ test: "wall-clock-long-task", ...result });
    }
    const cancelled = wait(
      clock,
      (d) => d.type === "cancelled" && d.session === 99,
    );
    clock.postMessage({ type: "run", session: 99, ms: 30000 });
    await sleep(100);
    const cancelAt = performance.now();
    clock.postMessage({ type: "cancel", session: 99 });
    await cancelled;
    log({ test: "long-task-cancel", ackMs: performance.now() - cancelAt });
    const m = await (await fetch("/navigation/apms-2026/manifest.json")).json();
    const ready = wait(worker, (d) => d.type === "ready");
    worker.postMessage({
      type: "init",
      manifest: m,
      base: new URL("/navigation/apms-2026/", location.href).href,
    });
    await ready;
    let routeCount = 0,
      ackMax = 0;
    const bootAt = performance.now();
    for (let session = 1; session <= 110; session++) {
      const index = [3, 12, 20, 26, 34, 41][session % 6],
        xyz = markers.experience.annotations[index].camera.initial.position;
      const route = wait(
        worker,
        (d) =>
          d.session === session &&
          ["route", "exhausted", "error"].includes(d.type),
      );
      worker.postMessage({
        type: "goal",
        session,
        actual: audit.start,
        goal: { index, radius: 2, camera: { x: xyz[0], y: xyz[1], z: xyz[2] } },
      });
      const result = await route;
      if (result.type !== "route") throw Error(JSON.stringify(result));
      routeCount++;
      const ack = wait(
          worker,
          (d) => d.type === "cancelled" && d.session === session,
        ),
        at = performance.now();
      worker.postMessage({ type: "cancel", session });
      await ack;
      ackMax = Math.max(ackMax, performance.now() - at);
      if (session % 10 === 0)
        log({
          test: "same-worker-requery",
          routeCount,
          elapsed: performance.now() - bootAt,
          ackMax,
          cacheHits: result.timing?.candidateCacheHits,
        });
    }
    log({ test: "complete", passed: true, queries: routeCount });
  } catch (error) {
    log({ test: "failed", error: String(error) });
  } finally {
    clock.terminate();
    worker.terminate();
    this.disabled = false;
  }
};
