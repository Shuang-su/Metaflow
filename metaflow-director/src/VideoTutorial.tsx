// MF-62 209cd56c tutorial state presentation, adapted to the public camera targets.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MousePointer2 } from "lucide-react";
export type TutorialStep =
  | "start"
  | "end"
  | "adjust-end"
  | "playback"
  | "watch"
  | "operator"
  | "compose"
  | "interest"
  | "interest-area"
  | "final-compose"
  | null;
const steps: Partial<Record<NonNullable<TutorialStep>, [string, string]>> = {
  start: [".bottom-axis-buttons", "Set START position"],
  end: [
    '.director-filmstrip.is-selected .director-position[data-endpoint="end"]',
    "Click to set END position",
  ],
  "adjust-end": [".bottom-axis-buttons", "Set END position"],
  playback: [".timeline-play-button", "Press PLAY"],
  operator: [
    ".auto-motion-primary-island",
    "You can also use Operator for help",
  ],
  compose: [".auto-motion-primary-island", "Click Compose to generate a shot"],
  interest: [".auto-motion-focus-positions", "Tell Operator what to focus on"],
  "interest-area": [
    ".director-interest-overlay",
    "Click or drag to select interest points",
  ],
  "final-compose": [
    ".auto-motion-primary-island",
    "Click Compose to generate a shot",
  ],
};
export function VideoTutorial({
  step,
  onClose,
}: {
  step: TutorialStep;
  onClose: () => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null),
    [frame, setFrame] = useState<DOMRect | null>(null),
    [hover, setHover] = useState(false);
  const data = step ? steps[step] : null;
  useEffect(() => {
    if (!data) {
      setRect(null);
      return;
    }
    let id = 0;
    const update = () => {
      const target = document.querySelector(data[0]),
        scene = document.querySelector(".view-fit");
      const same = (a: DOMRect | null, b: DOMRect | null) =>
        a?.x === b?.x &&
        a?.y === b?.y &&
        a?.width === b?.width &&
        a?.height === b?.height;
      const r = target?.getBoundingClientRect() ?? null,
        f = scene?.getBoundingClientRect() ?? null;
      setRect((old) => (same(old, r) ? old : r));
      setFrame((old) => (same(old, f) ? old : f));
      id = requestAnimationFrame(update);
    };
    update();
    const allowed = `${data[0]}, .demo-tutorial-toggle, .view-fit, .auto-motion-overlay`;
    const block = (e: Event) => {
      const t = e.target;
      if (t instanceof Element && !t.closest(allowed)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    const hoverTarget = (e: PointerEvent) => {
      const r = document.querySelector(data[0])?.getBoundingClientRect();
      setHover(
        !!r &&
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom,
      );
    };
    document.addEventListener("pointermove", hoverTarget);
    document.addEventListener("pointerdown", block, true);
    document.addEventListener("click", block, true);
    document.addEventListener("keydown", key, true);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("pointermove", hoverTarget);
      document.removeEventListener("pointerdown", block, true);
      document.removeEventListener("click", block, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [step]);
  const x = rect
    ? Math.max(12, Math.min(innerWidth - 290, rect.x + rect.width + 14))
    : 0;
  const y = rect ? Math.max(80, Math.min(innerHeight - 90, rect.y - 50)) : 0;
  return (
    <>
      <AnimatePresence>
        {data && rect && (
          <motion.div
            className="director-tutorial-layer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <svg className="director-tutorial-mask">
              <defs>
                <mask id="director-tutorial-hole">
                  <rect width="100%" height="100%" fill="white" />
                  {frame && (
                    <rect
                      x={frame.x}
                      y={frame.y}
                      width={frame.width}
                      height={frame.height}
                      rx={16}
                      fill="black"
                    />
                  )}
                  <rect
                    x={rect.x - 4}
                    y={rect.y - 4}
                    width={rect.width + 8}
                    height={rect.height + 8}
                    rx={20}
                    fill="black"
                  />
                </mask>
              </defs>
              <rect
                width="100%"
                height="100%"
                fill="var(--demo-guide-overlay,#000000ad)"
                mask="url(#director-tutorial-hole)"
              />
            </svg>
            <div
              className="director-tutorial-outline"
              style={{
                left: rect.x - 4,
                top: rect.y - 4,
                width: rect.width + 8,
                height: rect.height + 8,
              }}
              onPointerEnter={() => setHover(true)}
              onPointerLeave={() => setHover(false)}
            />
            <motion.aside
              key={step}
              className="timeline-demo-helper director-tutorial-helper"
              role="status"
              aria-label={data[1]}
              style={{ left: x, top: y }}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 5, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="timeline-demo-helper-header">
                <span className="timeline-demo-helper-title">
                  {data[1]
                    .split(/(START|END|PLAY|Operator|Compose)/)
                    .map((part, i) =>
                      /^(START|END|PLAY|Operator|Compose)$/.test(part) ? (
                        <strong key={i}>{part}</strong>
                      ) : (
                        part
                      ),
                    )}
                </span>
              </div>
            </motion.aside>
            {!hover && step !== "start" && step !== "adjust-end" && (
              <span
                className="demo-guide-ghost-anchor"
                style={{
                  left: rect.x + rect.width * 0.7,
                  top: rect.y + rect.height * 0.6,
                }}
              >
                <span className="demo-guide-ghost is-clicking">
                  <MousePointer2
                    fill="#2f80ff"
                    color="#fff"
                    strokeWidth={1.8}
                  />
                  <span className="demo-guide-ghost-pulse" />
                </span>
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {step && (
        <button
          className="demo-tutorial-toggle is-close"
          aria-label="Close tutorial"
          onClick={onClose}
        >
          Close tutorial
        </button>
      )}
    </>
  );
}
