import audit from "../docs/region-audit-apms-2026.json";
import markers from "../apms-markers-42.mfstudio.json";
/** Actual browser/native Worker races. Call from the separate QA page, no camera writes. */
export async function runRace() {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    }),
    events: any[] = [];
  const observe = (predicate: (d: any) => boolean, ms = 20000) =>
    new Promise<any>((resolve, reject) => {
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
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  worker.addEventListener("message", ({ data }) =>
    events.push({ at: performance.now(), ...data }),
  );
  const goal = (session: number, index: number) => {
    const p = markers.experience.annotations[index].camera.initial.position;
    worker.postMessage({
      type: "goal",
      session,
      actual: audit.start,
      goal: { index, radius: 2, camera: { x: p[0], y: p[1], z: p[2] } },
    });
  };
  try {
    const manifest = await (
      await fetch("/navigation/apms-2026/manifest.json")
    ).json();
    const ready = observe((d) => d.type === "ready");
    worker.postMessage({
      type: "init",
      manifest,
      base: new URL("/navigation/apms-2026/", location.href).href,
    });
    await ready;
    worker.postMessage({ type: "pause", paused: true });
    goal(201, 41);
    await sleep(100);
    if (events.some((e) => e.session === 201 && e.type === "route"))
      throw Error("paused worker published route");
    const cancelled = observe(
      (d) => d.type === "cancelled" && d.session === 201,
    );
    worker.postMessage({ type: "cancel", session: 201 });
    await cancelled;
    worker.postMessage({ type: "pause", paused: false });
    await sleep(100);
    if (events.some((e) => e.session === 201 && e.type === "route"))
      throw Error("cancelled paused work revived");
    const rows: any[] = [{ test: "pause-cancel-resume", passed: true }];
    for (const delay of [0, 100, 500, 1500]) {
      const first = 300 + delay,
        second = first + 1;
      goal(first, 41);
      await sleep(delay);
      const ack = observe((d) => d.type === "cancelled" && d.session === first);
      worker.postMessage({ type: "cancel", session: first });
      const latest = observe(
        (d) =>
          d.session === second &&
          ["route", "error", "exhausted"].includes(d.type),
      );
      goal(second, 3);
      await ack;
      const ackAt = events.findIndex(
        (e) => e.type === "cancelled" && e.session === first,
      );
      const route = await latest;
      if (route.type !== "route") throw Error(route.message);
      await sleep(120);
      if (
        events
          .slice(ackAt + 1)
          .some((e) => e.session === first && e.type !== "cancelled")
      )
        throw Error("obsolete work wrote after ACK");
      rows.push({
        test: "replace-after-real-delay",
        delayMs: delay,
        oldSession: first,
        newSession: second,
        passed: true,
      });
    }
    return {
      rows,
      events: events.map(({ type, session, at, timing }) => ({
        type,
        session,
        at,
        timing,
      })),
    };
  } finally {
    worker.terminate();
  }
}
