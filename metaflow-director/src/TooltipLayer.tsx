// Ported from the accepted MF-62 candidate 209cd56c.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";

/** One overlay avoids clipping tooltips inside horizontally scrolling shots. */
export function TooltipLayer() {
  const [tip, setTip] = useState<{
    text: string;
    x: number;
    y: number;
    below: boolean;
  } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active: Element | null = null;
    const hide = () => {
      clearTimeout(timer);
      active = null;
      setTip(null);
    };
    const show = (event: Event) => {
      if (event instanceof PointerEvent && event.pointerType === "touch")
        return;
      const element = (event.target as Element)?.closest?.("[data-tooltip]");
      if (!element || element.closest(".reference-controls")) {
        hide();
        return;
      }
      if (element === active) return;
      hide();
      active = element;
      timer = setTimeout(() => {
        if (!element.isConnected) return;
        const text = element.getAttribute("data-tooltip") || "",
          r = element.getBoundingClientRect();
        const half = Math.min(150, text.length * 4 + 14),
          below = r.top < 120;
        setTip({
          text,
          x: Math.max(
            half + 8,
            Math.min(innerWidth - half - 8, r.x + r.width / 2),
          ),
          y: below ? r.bottom + 8 : r.top - 8,
          below,
        });
      }, 0);
    };
    const out = (e: PointerEvent) => {
      if (
        !(e.relatedTarget instanceof Node) ||
        !active?.contains(e.relatedTarget)
      )
        hide();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("pointerover", show);
    window.addEventListener("pointerout", out);
    window.addEventListener("focusin", show);
    window.addEventListener("focusout", hide);
    window.addEventListener("pointerdown", hide);
    window.addEventListener("blur", hide);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("keydown", key);
    return () => {
      hide();
      window.removeEventListener("pointerover", show);
      window.removeEventListener("pointerout", out);
      window.removeEventListener("focusin", show);
      window.removeEventListener("focusout", hide);
      window.removeEventListener("pointerdown", hide);
      window.removeEventListener("blur", hide);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("keydown", key);
    };
  }, []);
  return createPortal(
    <AnimatePresence>
      {tip && (
        <motion.div
          key={tip.text}
          role="tooltip"
          className={`director-tooltip ${tip.below ? "below" : ""}`}
          style={{ left: tip.x, top: tip.y }}
          initial={{ opacity: 0, y: tip.below ? -3 : 3, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -2, scale: 0.94 }}
          transition={{ duration: 0.14, ease: "easeOut" }}
        >
          {tip.text}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
