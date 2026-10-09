// Ported from the accepted MF-62 candidate 209cd56c.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { GalleryHorizontalEnd, Shuffle, Focus, Trash2 } from "lucide-react";

export function Operator({
  active,
  selecting,
  disabled,
  onPrimary,
  onInterest,
  onClose,
  interestCount,
  onClearInterest,
}: {
  interestCount: number;
  onClearInterest: () => void;
  active: boolean;
  selecting: boolean;
  disabled: boolean;
  onPrimary: () => void;
  onInterest: () => void;
  onClose: () => void;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const latestClose = useRef(onClose);
  latestClose.current = onClose;
  // Moving between the header and compact row remounts this component. With
  // initial={false}, an already-open island has no enter animation to complete.
  const [settled, setSettled] = useState(active);
  const interestLabel =
    interestCount > 0 ? "Interest points" : "Set interest points";
  useEffect(() => {
    if (!active || selecting) return;
    const outside = (e: PointerEvent) => {
      if (!anchor.current?.contains(e.target as Node)) latestClose.current();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [active, selecting]);
  return (
    <div
      ref={anchor}
      className="director-operator reference-operator auto-motion-actions-anchor"
      onKeyDown={(e) => {
        if (e.key === "Escape" && active) {
          e.preventDefault();
          e.stopPropagation();
          latestClose.current();
          requestAnimationFrame(() =>
            anchor.current
              ?.querySelector<HTMLButtonElement>(".auto-motion-primary-island")
              ?.focus({ preventScroll: true }),
          );
        }
      }}
    >
      <div
        className={`auto-motion-actions is-stage-floating ${active ? "is-generating" : "is-idle"}`}
      >
        <motion.button
          type="button"
          className={`auto-motion-primary-island ${active ? "is-generate" : "is-operator"}`}
          aria-label={
            active ? "Compose Operator motion" : "Let Operator take over"
          }
          disabled={disabled}
          onClick={onPrimary}
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={active ? "generate" : "operator"}
              layout="position"
              className="auto-motion-primary-content"
              initial={{ opacity: 0, scale: 0.76, filter: "blur(7px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 1.12, filter: "blur(7px)" }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {active ? (
                <Shuffle size={13} strokeWidth={1.9} />
              ) : (
                <GalleryHorizontalEnd size={14} strokeWidth={1.8} />
              )}
              <span>{active ? "Compose" : "Operator"}</span>
            </motion.span>
          </AnimatePresence>
        </motion.button>
        <motion.div
          className="auto-motion-island-state"
          initial={false}
          animate={{ width: active ? "auto" : 0, opacity: active ? 1 : 0 }}
          transition={{
            width: { type: "spring", bounce: 0.12, duration: 0.38 },
            opacity: { duration: 0.1, delay: active ? 0.02 : 0 },
          }}
          onAnimationStart={() => setSettled(false)}
          onAnimationComplete={() => setSettled(active)}
          style={{
            overflow: active && settled ? "visible" : "hidden",
            pointerEvents: active ? "auto" : "none",
          }}
          aria-hidden={!active}
        >
          <button
            type="button"
            className={`auto-motion-icon-button auto-motion-focus-positions ${selecting ? "is-selecting" : ""}`}
            aria-label={interestLabel}
            data-tooltip={interestLabel}
            disabled={!active || disabled}
            onClick={onInterest}
          >
            <Focus size={18} strokeWidth={1.9} />
            {active && interestCount > 0 && (
              <span className="auto-motion-position-badge" aria-hidden="true">
                {Math.min(99, interestCount)}
              </span>
            )}
          </button>
          <AnimatePresence initial={false}>
            {interestCount > 0 && (
              <motion.button
                key="clear-interest"
                layout
                type="button"
                className="auto-motion-icon-button"
                aria-label="Clear interest points"
                data-tooltip="Clear interest points"
                disabled={!active || disabled}
                initial={{ opacity: 0, scale: 0.72, width: 0 }}
                animate={{ opacity: 1, scale: 1, width: 28 }}
                exit={{ opacity: 0, scale: 0.72, width: 0 }}
                transition={{ type: "spring", bounce: 0.08, duration: 0.28 }}
                onClick={onClearInterest}
              >
                <Trash2 size={18} strokeWidth={1.9} />
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
