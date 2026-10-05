// MF-62 209cd56c transition menu; render through the public shared capture queue.
import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { layoutShots, type Project, type Transition } from "./core/model";
export function TransitionMenu({
  project,
  shotId,
  edge,
  renderFrame,
  anchor,
  onChange,
  onClose,
}: {
  project: Project;
  shotId: string;
  edge: "in" | "out";
  renderFrame: (
    time: number,
    signal: AbortSignal,
  ) => Promise<HTMLCanvasElement>;
  anchor: { x: number; y: number };
  onChange: (transition: Transition) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const latestRender = useRef(renderFrame);
  latestRender.current = renderFrame;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    panel.current?.focus({ preventScroll: true });
    const outside = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      previous?.focus({ preventScroll: true });
    };
  }, []);
  const canvas = useRef<HTMLCanvasElement>(null),
    shot = project.shots.find((s) => s.id === shotId)!,
    entry = layoutShots(project.shots).find((s) => s.shot.id === shotId)!,
    value =
      edge === "in"
        ? shot.transition
        : (shot.exitTransition ?? { kind: "cut", duration: 0.5 });
  useEffect(() => {
    const controller = new AbortController();
    let timer = 0;
    const start = performance.now();
    async function tick() {
      try {
        const local = ((performance.now() - start) / 1000) % 2,
          span = Math.max(0.2, Math.min(value.duration, shot.duration / 2)),
          position =
            edge === "in"
              ? entry.start + Math.min(span, local * span)
              : entry.end - span + Math.min(span, local * span);
        const frame = await latestRender.current(position, controller.signal);
        if (!controller.signal.aborted) {
          canvas.current?.getContext("2d")?.drawImage(frame, 0, 0);
          timer = requestAnimationFrame(tick);
        }
      } catch (e) {
        if (!controller.signal.aborted) console.warn("Transition preview:", e);
      }
    }
    void tick();
    return () => {
      controller.abort();
      cancelAnimationFrame(timer);
    };
  }, [project, shotId, edge]);
  return (
    <motion.aside
      role="dialog"
      aria-label={`${edge === "out" ? "Exit transition for" : "Transition into"} ${shot.name}`}
      className="shot-transition-menu director-transition-menu"
      style={{
        left: Math.max(8, Math.min(window.innerWidth - 284, anchor.x - 138)),
        bottom: Math.max(
          12,
          Math.min(window.innerHeight - 300, window.innerHeight - anchor.y + 8),
        ),
      }}
      tabIndex={-1}
      ref={panel}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="shot-transition-preview">
        <div
          className="shot-transition-preview-viewport"
          style={{ width: 260, height: 146 }}
        >
          <canvas ref={canvas} width={260} height={146} />
        </div>
      </div>
      <div className="shot-transition-types">
        {(["cut", "fade", "push", "zoom"] as const).map((kind) => (
          <button
            key={kind}
            className={value.kind === kind ? "is-active" : ""}
            aria-pressed={value.kind === kind}
            onClick={() =>
              onChange({
                ...value,
                kind,
                direction:
                  kind === "push" ? "left" : kind === "zoom" ? "in" : undefined,
              })
            }
          >
            {kind[0].toUpperCase() + kind.slice(1)}
          </button>
        ))}
      </div>
      {value.kind === "push" && (
        <div className="shot-transition-directions" aria-label="Push direction">
          {(["left", "right", "up", "down"] as const).map((direction, i) => (
            <button
              key={direction}
              aria-label={`Push ${direction}`}
              className={
                (value.direction ?? "left") === direction ? "is-active" : ""
              }
              aria-pressed={(value.direction ?? "left") === direction}
              onClick={() => onChange({ ...value, direction })}
            >
              {["←", "→", "↑", "↓"][i]}
            </button>
          ))}
        </div>
      )}
      {value.kind === "zoom" && (
        <div
          className="shot-transition-zoom-options"
          aria-label="Zoom direction"
        >
          {(["in", "out"] as const).map((direction) => (
            <button
              key={direction}
              className={
                (value.direction ?? "in") === direction ? "is-active" : ""
              }
              aria-pressed={(value.direction ?? "in") === direction}
              onClick={() => onChange({ ...value, direction })}
            >
              Zoom {direction}
            </button>
          ))}
        </div>
      )}
      <label className="director-transition-duration">
        Duration{" "}
        <input
          aria-label="Transition duration"
          type="range"
          min={0}
          max={shot.duration / 2}
          step={0.05}
          value={value.duration}
          onChange={(e) => onChange({ ...value, duration: +e.target.value })}
        />
        <output>{value.duration.toFixed(2)}s</output>
      </label>
    </motion.aside>
  );
}
