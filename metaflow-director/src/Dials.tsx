import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  Ref,
} from "react";
import { motion, useIsPresent } from "motion/react";
import { clamp } from "./core/model";
import { rotationFromDrag } from "./core/camera-controls";
import { sound, startScrub, scrubSound, endScrub } from "./core/sounds";
export function RotationDial({
  axis,
  value,
  onChange,
  onBegin,
  onEnd,
  onCancel,
  disabled,
}: {
  axis: string;
  value: number;
  onChange: (v: number) => void;
  onBegin: () => void;
  onEnd: () => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [liveValue, setLiveValue] = useState(value);
  const [scrubbing, setScrubbing] = useState(false),
    drag = useRef({ x: 0, value: 0, moved: false });
  const pending = useRef<number | null>(null),
    raf = useRef<number | null>(null),
    button = useRef<HTMLButtonElement>(null),
    pointerId = useRef<number | null>(null),
    keyboard = useRef(false),
    cancelDrag = useRef<() => void>(() => {});
  const latest = useRef({ onChange, onBegin, onEnd, onCancel });
  latest.current = { onChange, onBegin, onEnd, onCancel };
  const flush = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    const v = pending.current;
    pending.current = null;
    if (v !== null) latest.current.onChange(v);
  };
  useEffect(() => {
    const cancel = () => cancelDrag.current();
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("blur", cancel);
      cancel();
    };
  }, []);
  const paint = (n: number) => {
    const e = button.current;
    if (!e) return;
    e.style.setProperty("--axis-ring-rotation", `${n}deg`);
    e.style.setProperty("--axis-arc-start", `${Math.min(0, n)}deg`);
    e.style.setProperty("--axis-arc-sweep", `${Math.abs(n)}deg`);
    e.classList.toggle("is-changed", Math.abs(n) > 0.08);
    setLiveValue(n);
  };
  useLayoutEffect(() => {
    if (!scrubbing) paint(value);
  }, [value, scrubbing]);
  const cancel = () => {
    const id = pointerId.current;
    const active = id !== null || keyboard.current;
    pointerId.current = null;
    keyboard.current = false;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    pending.current = null;
    if (id !== null && button.current?.hasPointerCapture(id))
      button.current.releasePointerCapture(id);
    if (!active) return;
    paint(drag.current.value);
    setScrubbing(false);
    latest.current.onCancel();
    endScrub();
  };
  cancelDrag.current = cancel;
  useEffect(() => {
    if (disabled) cancel();
  }, [disabled]);
  const end = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    pointerId.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (drag.current.moved) {
      flush();
      latest.current.onEnd();
      endScrub();
    } else if (Math.abs(value) > 0.08) {
      latest.current.onBegin();
      paint(0);
      latest.current.onChange(0);
      latest.current.onEnd();
      sound("release", 0.13);
    }
    setScrubbing(false);
  };
  return (
    <button
      ref={button}
      type="button"
      className={`bottom-axis-button ${Math.abs(value) > 0.08 ? "is-changed" : ""} ${scrubbing ? "is-scrubbing" : ""}`}
      data-axis={axis.toLowerCase()}
      data-tooltip={`←  ${axis}-axis  →`}
      disabled={disabled}
      aria-label={`${axis} rotation ${Math.round(value)} degrees${Math.abs(value) > 0.08 ? ", adjusted" : ""}. Drag horizontally to adjust, hold Shift for 5 degree increments, or click to reset.`}
      style={
        {
          "--axis-ring-rotation": `${value}deg`,
          "--axis-arc-start": `${Math.min(0, value)}deg`,
          "--axis-arc-sweep": `${Math.abs(value)}deg`,
        } as CSSProperties
      }
      onPointerDown={(e) => {
        if (e.button !== 0 || disabled) return;
        drag.current = { x: e.clientX, value, moved: false };
        pointerId.current = e.pointerId;
        setScrubbing(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (
          pointerId.current !== e.pointerId ||
          !e.currentTarget.hasPointerCapture(e.pointerId)
        )
          return;
        const d = drag.current,
          dx = e.clientX - d.x;
        if (Math.abs(dx) > 2 && !d.moved) {
          d.moved = true;
          latest.current.onBegin();
          startScrub((d.value + 360) / 720);
        }
        if (!d.moved) return;
        const n = rotationFromDrag(d.value, dx, e.shiftKey);
        paint(n);
        pending.current = n;
        if (raf.current === null) raf.current = requestAnimationFrame(flush);
        scrubSound((n + 360) / 720);
      }}
      onPointerUp={end}
      onPointerCancel={cancel}
      onLostPointerCapture={() => {
        if (pointerId.current !== null) cancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && (scrubbing || keyboard.current)) {
          e.preventDefault();
          e.stopPropagation();
          cancel();
          return;
        }
        if (!["ArrowLeft", "ArrowRight", "Home", "Enter", " "].includes(e.key))
          return;
        e.preventDefault();
        if (!keyboard.current) {
          keyboard.current = true;
          drag.current.value = value;
          onBegin();
        }
        onChange(
          e.key === "ArrowLeft"
            ? Math.max(-360, value - (e.shiftKey ? 5 : 0.1))
            : e.key === "ArrowRight"
              ? Math.min(360, value + (e.shiftKey ? 5 : 0.1))
              : 0,
        );
      }}
      onKeyUp={(e) => {
        if (
          !keyboard.current ||
          !["ArrowLeft", "ArrowRight", "Home", "Enter", " "].includes(e.key)
        )
          return;
        keyboard.current = false;
        latest.current.onEnd();
        endScrub();
      }}
      onBlur={() => {
        if (keyboard.current) {
          keyboard.current = false;
          latest.current.onEnd();
          endScrub();
        }
      }}
    >
      <svg
        className="axis-compass-ring"
        viewBox="0 0 40 40"
        aria-hidden="true"
        shapeRendering="geometricPrecision"
      >
        {Array.from({ length: 30 }, (_, i) => (
          <line
            key={i}
            className={i === 0 ? "axis-zero-tick" : undefined}
            x1="20"
            y1="2"
            x2="20"
            y2="5"
            transform={`rotate(${12 * i} 20 20)`}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <span className="axis-label">{axis}</span>
      <strong key={scrubbing ? "dragging" : "rest"}>
        {Math.round(scrubbing ? liveValue : value)}°
      </strong>
      <span className="axis-scrub-hint" aria-hidden="true">
        ←&nbsp;&nbsp; {axis} &nbsp;&nbsp;→
      </span>
    </button>
  );
}
export type LensRulerHandle = { cancel: () => void };
export function LensRuler({
  ref,
  label,
  value,
  min,
  max,
  onChange,
  onBegin,
  onEnd,
  onCancel,
}: {
  ref?: Ref<LensRulerHandle>;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  onBegin: () => void;
  onEnd: () => void;
  onCancel: () => void;
}) {
  const [ticks, setTicks] = useState(() => Array(41).fill(0)),
    input = useRef<HTMLInputElement>(null),
    previous = useRef(value),
    drag = useRef({ active: false, x: 0, moved: false }),
    pointer = useRef<number | null>(null);
  const present = useIsPresent();
  const pending = useRef<number | null>(null),
    raf = useRef<number | null>(null),
    latest = useRef(onChange),
    keyboard = useRef(false);
  latest.current = onChange;
  const cancel = () => {
    const wasActive = drag.current.active || keyboard.current;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    pending.current = null;
    drag.current.active = false;
    keyboard.current = false;
    const id = pointer.current;
    pointer.current = null;
    if (id !== null && input.current?.hasPointerCapture(id))
      input.current.releasePointerCapture(id);
    if (wasActive) onCancel();
    endScrub();
  };
  useImperativeHandle(ref, () => ({ cancel }));
  useLayoutEffect(() => {
    if (!present) cancel();
  }, [present]);
  const flush = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    const v = pending.current;
    pending.current = null;
    if (v !== null && present) latest.current(v);
  };
  const schedule = (v: number) => {
    pending.current = v;
    if (raf.current === null) raf.current = requestAnimationFrame(flush);
  };
  useEffect(() => {
    if (!drag.current.active && input.current) {
      input.current.value = String(value);
      previous.current = value;
    }
  }, [value]);
  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    },
    [],
  );
  const pulse = (n: number) => {
    const index = (v: number) =>
      Math.round(40 * Math.max(0, Math.min(1, (v - min) / (max - min))));
    const from = index(previous.current),
      to = index(n);
    if (from !== to)
      setTicks((t) => {
        const next = [...t],
          direction = to > from ? 1 : -1;
        for (let i = from; i !== to; i += direction) next[i]++;
        return next;
      });
    scrubSound((n - min) / (max - min));
  };
  const at = (x: number, e: HTMLInputElement) => {
    const r = e.getBoundingClientRect();
    return Math.round(
      min +
        Math.max(0, Math.min(1, (x - r.left - 2) / Math.max(1, r.width - 4))) *
          (max - min),
    );
  };
  const end = (e: ReactPointerEvent<HTMLInputElement>) => {
    if (!drag.current.active) return;
    const n = drag.current.moved
      ? at(e.clientX, e.currentTarget)
      : previous.current;
    if (n !== previous.current) {
      pulse(n);
      e.currentTarget.value = String(n);
      schedule(n);
    }
    flush();
    drag.current.active = false;
    pointer.current = null;
    previous.current = n;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    onEnd();
    endScrub();
  };
  return (
    <div className="lens-tick-slider">
      <div className="lens-slider-ticks" aria-hidden="true">
        {ticks.map((t, i) => (
          <span
            key={`${i}-${t}`}
            className={`${i % 5 === 0 ? "is-step" : ""} ${t ? "is-pulsing" : ""}`}
          />
        ))}
      </div>
      <input
        ref={input}
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={1}
        defaultValue={value}
        disabled={!present}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
            return;
          }
          if (
            ![
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(e.key)
          )
            return;
          if (!keyboard.current) {
            keyboard.current = true;
            onBegin();
          }
        }}
        onKeyUp={() => {
          if (!keyboard.current) return;
          keyboard.current = false;
          onEnd();
          endScrub();
        }}
        onBlur={() => {
          if (!keyboard.current) return;
          keyboard.current = false;
          onEnd();
          endScrub();
        }}
        onChange={(e) => {
          if (!present || drag.current.active) return;
          const n = +e.target.value;
          pulse(n);
          previous.current = n;
          if (!keyboard.current) onBegin();
          onChange(n);
          if (!keyboard.current) onEnd();
        }}
        onPointerDown={(e) => {
          if (!present || e.button !== 0) return;
          e.preventDefault();
          const n = at(e.clientX, e.currentTarget);
          previous.current = n;
          drag.current = { active: true, x: e.clientX, moved: false };
          pointer.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          onBegin();
          startScrub((n - min) / (max - min));
          e.currentTarget.value = String(n);
          schedule(n);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (
            !present ||
            !d.active ||
            !e.currentTarget.hasPointerCapture(e.pointerId) ||
            (!d.moved && Math.abs(e.clientX - d.x) <= 3)
          )
            return;
          d.moved = true;
          const n = at(e.clientX, e.currentTarget);
          pulse(n);
          previous.current = n;
          e.currentTarget.value = String(n);
          schedule(n);
        }}
        onPointerUp={end}
        onLostPointerCapture={() => {
          if (!drag.current.active) return;
          cancel();
        }}
        onPointerCancel={cancel}
        onClick={(e) => e.preventDefault()}
      />
    </div>
  );
}
