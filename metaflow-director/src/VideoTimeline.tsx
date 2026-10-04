import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import {
  Camera,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Save,
  CirclePlus,
  CircleMinus,
  Crop,
  RotateCcw,
  Trash2,
  Spline,
  Plus,
  Copy,
  X,
} from "lucide-react";
import {
  clamp,
  layoutShots,
  totalDuration,
  poseAt,
  resizeShot,
  moveShotBefore,
  uid,
  type Project,
  type Pose,
  type Shot,
  type Keyframe,
} from "./core/model";

type Props = {
  project: Project;
  workingPose?: Pose;
  selected: string;
  time: number;
  playing: boolean;
  busy: boolean;
  thumbnail: (key: Keyframe) => string | undefined;
  onSelect: (id: string, time: number) => void;
  onDeselect: () => void;
  onTime: (time: number) => void;
  onPlay: () => void;
  onUpdate: (fn: (p: Project) => void) => void;
  onBegin: () => void;
  onEnd: () => void;
  onCancel: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAdd: () => void;
  onTransition: (
    shot: Shot,
    edge: "in" | "out",
    anchor: { x: number; y: number },
  ) => void;
  onEndpoint?: (endpoint: "start" | "end") => void;
};
const presets: [string, Shot["easing"]][] = [
  ["Linear", [0, 0, 1, 1]],
  ["Ease", [0.25, 0.1, 0.25, 1]],
  ["Ease in", [0.42, 0, 1, 1]],
  ["Ease out", [0, 0, 0.58, 1]],
  ["Ease in out", [0.42, 0, 0.58, 1]],
  ["Smooth", [0.22, 1, 0.36, 1]],
];
const path = (c: Shot["easing"]) =>
  `M8 56 C${8 + c[0] * 84} ${56 - c[1] * 48}, ${8 + c[2] * 84} ${56 - c[3] * 48}, 92 8`;
function ShotTools({ name, children }: { name: string; children: ReactNode }) {
  const present = useIsPresent();
  return (
    <motion.div
      className="timeline-shot-tools-motion"
      aria-label={`Selected scene, ${name}`}
      aria-hidden={!present}
      inert={!present}
      initial={{ opacity: 0, x: -10, scale: 0.82 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -8, scale: 0.78 }}
      transition={{ type: "spring", bounce: 0.34, duration: 0.38 }}
    >
      {children}
    </motion.div>
  );
}

export function VideoTimeline(p: Props) {
  const rows = layoutShots(p.project.shots),
    duration = totalDuration(p.project.shots);
  const shot = p.project.shots.find((s) => s.id === p.selected);
  const selectedRow = rows.find((r) => r.shot.id === shot?.id);
  const local = clamp(
    p.time - (selectedRow?.start ?? 0),
    0,
    shot?.duration ?? 0,
  );
  const [panel, setPanel] = useState<"easing" | "context" | null>(null);
  const [size, setSize] = useState(1000);
  const root = useRef<HTMLElement>(null),
    scroll = useRef<HTMLDivElement>(null);
  const finishDrag = useRef<(() => void) | null>(null);
  const keyboardResize = useRef(false);
  const present = useIsPresent();
  useEffect(() => {
    if (!present || p.busy) finishDrag.current?.();
  }, [present, p.busy]);
  useEffect(() => () => finishDrag.current?.(), []);
  useEffect(() => {
    const o = new ResizeObserver((es) => setSize(es[0].contentRect.width));
    if (scroll.current) o.observe(scroll.current);
    return () => o.disconnect();
  }, []);
  useEffect(() => {
    setPanel((current) => (current === "context" ? current : null));
  }, [p.selected]);
  useEffect(() => {
    if (!panel) return;
    const trigger = document.activeElement as HTMLElement | null;
    const outside = (e: PointerEvent) => {
      if (
        !(e.target as Element).closest(
          ".shot-easing-menu,.timeline-easing-button,.director-scene-context",
        )
      )
        setPanel(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPanel(null);
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      }
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", key);
    };
  }, [panel]);
  const visibleDuration = Math.max(14, duration + 2),
    scale = Math.max(20, (size - 64) / visibleDuration);
  const update = (fn: (s: Shot) => void) =>
    p.onUpdate((project) => {
      const s = project.shots.find((s) => s.id === shot?.id);
      if (s) fn(s);
    });
  const seek = (t: number) => p.onTime(clamp(t, 0, duration));
  const drag = (
    e: React.PointerEvent,
    move: (dx: number, dy: number) => void,
  ) => {
    if (p.busy || e.button !== 0 || finishDrag.current) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    p.onBegin();
    const x = e.clientX,
      y = e.clientY,
      target = e.currentTarget;
    const onMove = (ev: Event) => {
      const v = ev as PointerEvent;
      if (v.pointerId !== e.pointerId) return;
      move(v.clientX - x, v.clientY - y);
    };
    const end = (event?: Event) => {
      if (event && (event as PointerEvent).pointerId !== e.pointerId) return;
      if (finishDrag.current !== end) return;
      finishDrag.current = null;
      if (event?.type === "pointerup") p.onEnd();
      else p.onCancel();
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cancelled);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
      target.removeEventListener("lostpointercapture", end);
      if (target.hasPointerCapture(e.pointerId))
        target.releasePointerCapture(e.pointerId);
    };
    const cancelled = () => end();
    const key = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        end();
      }
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", cancelled);
    finishDrag.current = end;
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
    target.addEventListener("lostpointercapture", end);
  };
  return (
    <motion.section
      ref={root}
      className="tracks-timeline is-scene-focused director-video-timeline"
      aria-label="Animation timeline"
      aria-busy={p.busy}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 164 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="timeline-toolbar">
        <div className="timeline-toolbar-left">
          <div className="timeline-tool-swap-slot">
            <AnimatePresence initial={false}>
              {shot && (
                <ShotTools key={shot.id} name={shot.name}>
                  <span className="timeline-track-tools-divider" />
                  <div className="timeline-project-wrap timeline-selected-easing-wrap">
                    <button
                      className="timeline-selected-shot-action timeline-easing-button"
                      aria-label="Easing"
                      aria-expanded={panel === "easing"}
                      onClick={() =>
                        setPanel(panel === "easing" ? null : "easing")
                      }
                    >
                      <Spline size={18} />
                      <span className="timeline-track-tool-label">Easing</span>
                    </button>
                    <AnimatePresence>
                      {panel === "easing" && (
                        <motion.div
                          className="shot-easing-menu"
                          role="dialog"
                          aria-label={`Easing for ${shot.name}`}
                          initial={{ opacity: 0, y: 6, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 4, scale: 0.98 }}
                        >
                          <div className="shot-easing-preview">
                            {[
                              "is-horizontal-one",
                              "is-horizontal-two",
                              "is-vertical-one",
                              "is-vertical-two",
                            ].map((c) => (
                              <span key={c} className={`is-grid-line ${c}`} />
                            ))}
                            <svg
                              className="easing-curve-editor"
                              viewBox="0 0 100 64"
                              aria-label="Custom easing curve"
                            >
                              <line
                                className="easing-control-line"
                                x1={8}
                                y1={56}
                                x2={8 + shot.easing[0] * 84}
                                y2={56 - shot.easing[1] * 48}
                              />
                              <line
                                className="easing-control-line"
                                x1={92}
                                y1={8}
                                x2={8 + shot.easing[2] * 84}
                                y2={56 - shot.easing[3] * 48}
                              />
                              <path
                                className="easing-curve-line"
                                d={path(shot.easing)}
                              />
                              <circle
                                className="easing-curve-point"
                                cx={8}
                                cy={56}
                                r={3}
                              />
                              <circle
                                className="easing-curve-point"
                                cx={92}
                                cy={8}
                                r={3}
                              />
                              {[0, 2].map((i) => (
                                <circle
                                  key={i}
                                  className="easing-control-handle"
                                  cx={8 + shot.easing[i] * 84}
                                  cy={56 - shot.easing[i + 1] * 48}
                                  r={2}
                                  onPointerDown={(e) => {
                                    const rect =
                                        e.currentTarget.ownerSVGElement!.getBoundingClientRect(),
                                      old = [...shot.easing];
                                    drag(e, (dx, dy) =>
                                      update((s) => {
                                        s.easing[i] = clamp(
                                          old[i] +
                                            ((dx / rect.width) * 100) / 84,
                                          0,
                                          1,
                                        );
                                        s.easing[i + 1] = clamp(
                                          old[i + 1] -
                                            ((dy / rect.height) * 64) / 48,
                                          0,
                                          1,
                                        );
                                      }),
                                    );
                                  }}
                                />
                              ))}
                            </svg>
                          </div>
                          <div className="shot-easing-curve-values">
                            {["X1", "Y1", "X2", "Y2"].map((label, i) => (
                              <input
                                key={label}
                                className="shot-easing-value-input"
                                aria-label={`Cubic Bézier ${label}`}
                                type="number"
                                min={0}
                                max={1}
                                step={0.01}
                                value={Number(shot.easing[i].toFixed(2))}
                                onChange={(e) =>
                                  update((s) => {
                                    s.easing[i] = clamp(
                                      Number(e.target.value),
                                      0,
                                      1,
                                    );
                                  })
                                }
                              />
                            ))}
                          </div>
                          <small>Presets</small>
                          <div className="shot-easing-presets">
                            {presets.map(([name, curve]) => (
                              <button
                                key={name}
                                aria-label={`${name} easing`}
                                aria-pressed={curve.every(
                                  (v, i) => v === shot.easing[i],
                                )}
                                className={
                                  curve.every((v, i) => v === shot.easing[i])
                                    ? "is-active"
                                    : ""
                                }
                                onClick={() =>
                                  update((s) => {
                                    s.easing = [...curve];
                                  })
                                }
                              >
                                <span className="shot-easing-preset-curve">
                                  <svg viewBox="0 0 100 64">
                                    <path
                                      className="easing-curve-line"
                                      d={path(curve)}
                                    />
                                    <circle
                                      className="easing-curve-point"
                                      cx={8}
                                      cy={56}
                                      r={3}
                                    />
                                    <circle
                                      className="easing-curve-point"
                                      cx={92}
                                      cy={8}
                                      r={3}
                                    />
                                  </svg>
                                </span>
                                <span>{name}</span>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <span className="timeline-track-tools-divider" />
                  <button
                    className="timeline-selected-shot-action"
                    aria-label="保存当前机位"
                    onClick={() =>
                      update((s) => {
                        const nearest = s.keys.reduce((a, b) =>
                          Math.abs(a.time - local) < Math.abs(b.time - local)
                            ? a
                            : b,
                        );
                        nearest.pose = structuredClone(
                          p.workingPose ?? poseAt(s, local),
                        );
                      })
                    }
                  >
                    <Save size={16} />
                    <span className="timeline-track-tool-label">保存机位</span>
                  </button>
                  <button
                    className="timeline-selected-shot-action"
                    aria-label={`Add camera position to ${shot.name}`}
                    onClick={() => {
                      let t = local;
                      if (shot.keys.some((k) => Math.abs(k.time - t) < 0.015)) {
                        let gaps = shot.keys
                          .slice(1)
                          .map((k, i) => [shot.keys[i].time, k.time])
                          .sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
                        t = (gaps[0][0] + gaps[0][1]) / 2;
                      }
                      update((s) => {
                        s.keys.push({
                          id: uid(),
                          time: t,
                          pose: structuredClone(p.workingPose ?? poseAt(s, t)),
                        });
                        s.keys.sort((a, b) => a.time - b.time);
                      });
                      p.onSelect(shot.id, (selectedRow?.start ?? 0) + t);
                    }}
                  >
                    <CirclePlus size={17} />
                    <span className="timeline-track-tool-label">
                      Add position
                    </span>
                  </button>
                  {shot.keys.some(
                    (k, i) =>
                      i > 0 &&
                      i < shot.keys.length - 1 &&
                      Math.abs(k.time - local) < 0.015,
                  ) && (
                    <button
                      className="timeline-selected-shot-action"
                      aria-label="Remove position"
                      onClick={() =>
                        update((s) => {
                          s.keys = s.keys.filter(
                            (k, i) =>
                              i === 0 ||
                              i === s.keys.length - 1 ||
                              Math.abs(k.time - local) > 0.015,
                          );
                        })
                      }
                    >
                      <CircleMinus size={17} />
                      <span className="timeline-track-tool-label">
                        Remove position
                      </span>
                    </button>
                  )}
                  <span className="timeline-track-tools-divider" />
                  <button
                    className="timeline-selected-shot-action"
                    aria-label="Reset scene"
                    data-tooltip="Reset scene"
                    onClick={() =>
                      update((s) => {
                        const first = structuredClone(s.keys[0].pose);
                        s.keys = [
                          { id: uid(), time: 0, pose: first },
                          {
                            id: uid(),
                            time: s.duration,
                            pose: structuredClone(first),
                          },
                        ];
                      })
                    }
                  >
                    <RotateCcw size={16} />
                  </button>
                  <button
                    className="timeline-selected-shot-action is-danger"
                    aria-label="Delete selected scene"
                    data-tooltip="Delete scene"
                    onClick={p.onDelete}
                  >
                    <Trash2 size={16} />
                  </button>
                </ShotTools>
              )}
            </AnimatePresence>
          </div>
        </div>
        <div className="timeline-transport">
          <button
            className="timeline-transport-button"
            aria-label="Jump to project start"
            onClick={() => seek(0)}
          >
            <SkipBack size={19} />
          </button>
          <motion.button
            className="timeline-play-button"
            aria-label={p.playing ? "Pause timeline" : "Play timeline"}
            disabled={p.busy || !rows.length}
            onClick={p.onPlay}
            whileTap={{ scale: 0.78 }}
            transition={{ type: "spring", stiffness: 520, damping: 28 }}
          >
            <span className="timeline-play-button-face">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={p.playing ? "pause" : "play"}
                  className={`timeline-play-glyph ${p.playing ? "is-pause" : "is-play"}`}
                  aria-hidden="true"
                  initial={{ opacity: 0, scale: 0.55, filter: "blur(3px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 1.25, filter: "blur(3px)" }}
                  transition={{ type: "spring", bounce: 0.25, duration: 0.24 }}
                >
                  {p.playing ? <Pause size={19} /> : <Play size={19} />}
                </motion.span>
              </AnimatePresence>
            </span>
          </motion.button>
          <button
            className="timeline-transport-button"
            aria-label="Jump to project end"
            onClick={() => seek(duration)}
          >
            <SkipForward size={19} />
          </button>
        </div>
      </div>
      <div className="director-video-scroll" ref={scroll}>
        <div
          className="director-video-lane"
          style={{ width: Math.max(size, visibleDuration * scale + 64) }}
        >
          <div
            className="director-ruler"
            role="group"
            aria-label="Timeline ruler"
            onPointerDown={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              seek((e.clientX - r.x - 32) / scale);
              drag(e, (dx) => seek((e.clientX - r.x - 32 + dx) / scale));
            }}
          >
            {Array.from(
              { length: Math.ceil(visibleDuration * 10) + 1 },
              (_, i) => (
                <i
                  key={i}
                  className={i % 10 === 0 ? "major" : ""}
                  style={{ left: 32 + (i / 10) * scale }}
                >
                  {i % 10 === 0 ? <span>{i / 10}</span> : null}
                </i>
              ),
            )}
          </div>
          <div
            className="director-video-clips"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget && !p.busy) {
                setPanel(null);
                p.onDeselect();
              }
            }}
          >
            {rows.map(({ shot: s, start }, index) => (
              <div
                key={s.id}
                className={`timeline-clip is-shot director-filmstrip ${s.id === p.selected ? "is-selected" : ""}`}
                style={{
                  left: 32 + start * scale,
                  width: Math.max(40, s.duration * scale - 4),
                }}
                data-timeline-clip-id={s.id}
                role="group"
                aria-label={s.name}
                draggable={!p.busy}
                onDragStart={(e) =>
                  e.dataTransfer.setData("director/shot", s.id)
                }
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (p.busy) return;
                  const id = e.dataTransfer.getData("director/shot");
                  if (id && id !== s.id)
                    p.onUpdate((project) =>
                      moveShotBefore(project.shots, id, s.id),
                    );
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (p.busy) return;
                  const position = (e.target as Element).closest(
                    "[data-key-time]",
                  );
                  const at = position
                    ? Number(position.getAttribute("data-key-time"))
                    : s.id === p.selected
                      ? local
                      : 0;
                  p.onSelect(s.id, start + at);
                  setPanel("context");
                }}
              >
                <button
                  className="director-transition-slot transition-chip"
                  aria-label={`Add transition into ${s.name}`}
                  data-tooltip={
                    s.transition.kind === "cut"
                      ? "Add transition"
                      : s.transition.kind
                  }
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    p.onTransition(s, "in", { x: r.x + r.width / 2, y: r.y });
                  }}
                >
                  <Spline size={12} />
                </button>
                <div
                  className="timeline-filmstrip-frames is-position-frames"
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${s.keys.length},minmax(0,1fr))`,
                  }}
                >
                  {s.keys.map((k, i) => (
                    <button
                      className={`director-position position-thumb ${s.id === p.selected && Math.abs(local - k.time) < 0.015 ? "active" : ""}`}
                      key={k.id}
                      data-key-time={k.time}
                      aria-label={`${s.name} ${i === 0 ? "开始" : i === s.keys.length - 1 ? "结束" : `中间${i}`}机位`}
                      data-endpoint={
                        i === 0
                          ? "start"
                          : i === s.keys.length - 1
                            ? "end"
                            : "middle"
                      }
                      data-tooltip={`P${String(i + 1).padStart(2, "0")} · ${k.time.toFixed(1)}s`}
                      onClick={() => {
                        p.onSelect(s.id, start + k.time);
                        if (i === 0 || i === s.keys.length - 1)
                          p.onEndpoint?.(i === 0 ? "start" : "end");
                      }}
                    >
                      {p.thumbnail(k) ? (
                        <img src={p.thumbnail(k)} alt="" draggable={false} />
                      ) : (
                        <span
                          className="timeline-position-pending"
                          aria-hidden="true"
                        />
                      )}
                      {i < s.keys.length - 1 && (
                        <span
                          className="composer-position-notch"
                          aria-hidden="true"
                        />
                      )}
                      <span
                        className="director-position-tag"
                        data-camera-position-tag={`P${String(i + 1).padStart(2, "0")}`}
                      >
                        <span
                          className="director-position-tag-shape"
                          aria-hidden="true"
                        />
                        <span className="director-position-tag-number">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
                {(["start", "end"] as const).map((edge) => (
                  <span
                    key={edge}
                    role="separator"
                    tabIndex={0}
                    aria-label={`Resize ${edge} of ${s.name}`}
                    className={`timeline-clip-handle ${edge === "start" ? "is-left" : "is-right"}`}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                        e.preventDefault();
                        e.stopPropagation();
                        if (p.busy) return;
                        if (!keyboardResize.current) {
                          keyboardResize.current = true;
                          p.onBegin();
                        }
                        const delta =
                          (e.key === "ArrowRight" ? 1 : -1) *
                          0.1 *
                          (edge === "start" ? -1 : 1);
                        p.onUpdate((pr) => {
                          const i = pr.shots.findIndex((x) => x.id === s.id);
                          pr.shots[i] = resizeShot(
                            pr.shots[i],
                            s.duration + delta,
                          );
                        });
                      }
                    }}
                    onKeyUp={(e) => {
                      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                        e.stopPropagation();
                        if (keyboardResize.current) {
                          keyboardResize.current = false;
                          p.onEnd();
                        }
                      }
                    }}
                    onBlur={() => {
                      if (keyboardResize.current) {
                        keyboardResize.current = false;
                        p.onEnd();
                      }
                    }}
                    onPointerDown={(e) =>
                      drag(e, (dx) =>
                        p.onUpdate((pr) => {
                          const i = pr.shots.findIndex((x) => x.id === s.id);
                          pr.shots[i] = resizeShot(
                            s,
                            s.duration +
                              (dx / scale) * (edge === "start" ? -1 : 1),
                          );
                        }),
                      )
                    }
                  />
                ))}
                {index === rows.length - 1 && (
                  <button
                    className="director-transition-slot exit-transition-chip"
                    aria-label={`Exit transition for ${s.name}`}
                    data-tooltip="Exit transition"
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      p.onTransition(s, "out", {
                        x: r.x + r.width / 2,
                        y: r.y,
                      });
                    }}
                  >
                    <Spline size={12} />
                  </button>
                )}
              </div>
            ))}
            <button
              className="timeline-add-shot-button director-add-scene"
              aria-label="Add scene"
              style={{ left: 32 + duration * scale + 18 }}
              onClick={p.onAdd}
            >
              <Plus size={18} />
            </button>
          </div>
          <div
            className="director-playhead"
            style={{ left: 32 + Math.min(p.time, duration) * scale }}
          >
            <input
              aria-label="Timeline playhead"
              type="range"
              min={0}
              max={duration || 1}
              step={0.01}
              value={Math.min(p.time, duration)}
              onChange={(e) => seek(+e.target.value)}
              onPointerDown={(e) => drag(e, (dx) => seek(p.time + dx / scale))}
            />
            <span>{p.time.toFixed(1)}</span>
          </div>
        </div>
      </div>
      {panel === "context" && (
        <div className="director-scene-context" role="menu">
          {shot && (
            <label>
              镜头时长（秒）
              <input
                aria-label="镜头时长"
                type="number"
                min="0.25"
                step="0.25"
                value={shot.duration}
                onFocus={p.onBegin}
                onBlur={p.onEnd}
                onChange={(e) =>
                  p.onUpdate((pr) => {
                    const i = pr.shots.findIndex((s) => s.id === shot.id);
                    pr.shots[i] = resizeShot(
                      pr.shots[i],
                      Math.max(0.25, Number(e.target.value)),
                    );
                  })
                }
              />
            </label>
          )}
          <button
            role="menuitem"
            onClick={() => {
              p.onDuplicate();
              setPanel(null);
            }}
          >
            <Copy size={14} />
            Duplicate scene
          </button>
          {shot?.keys.some(
            (k, i) =>
              i > 0 &&
              i < shot.keys.length - 1 &&
              Math.abs(k.time - local) < 0.015,
          ) && (
            <button
              role="menuitem"
              onClick={() => {
                update((s) => {
                  s.keys = s.keys.filter(
                    (k, i) =>
                      i === 0 ||
                      i === s.keys.length - 1 ||
                      Math.abs(k.time - local) > 0.015,
                  );
                });
                setPanel(null);
              }}
            >
              <X size={14} />
              Delete position
            </button>
          )}
          <button
            role="menuitem"
            onClick={() => {
              p.onDelete();
              setPanel(null);
            }}
          >
            <Trash2 size={14} />
            Delete scene
          </button>
        </div>
      )}
    </motion.section>
  );
}
