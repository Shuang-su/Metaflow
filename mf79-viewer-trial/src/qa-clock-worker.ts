import { CooperativeWork } from "./scheduler";
let session = 0;
const work = new CooperativeWork(
  (error) => postMessage({ type: "error", session, error: String(error) }),
  () => performance.now(),
  (f) => setTimeout(f, 24),
);
function* run(ms: number): Generator<void, void, unknown> {
  const start = performance.now();
  let progress = 0;
  while (performance.now() - start < ms) {
    progress++;
    yield;
  }
  postMessage({
    type: "complete",
    session,
    elapsed: performance.now() - start,
    progress,
    batches: work.batches,
  });
}
onmessage = ({ data }) => {
  if (data.type === "cancel") {
    work.replace(undefined);
    postMessage({ type: "cancelled", session: data.session });
    return;
  }
  if (data.type === "pause") {
    work.setPaused(data.paused);
    return;
  }
  if (data.type === "run") {
    session = data.session;
    work.replace(run(data.ms));
  }
};
