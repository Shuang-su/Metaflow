// MF-62 CameraControls.tsx (209cd56c): preserve the accepted inline island,
// spring transitions, input state machine and compact layout. Public scope only.
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { SlidersHorizontal, Video } from "lucide-react";
import { RotationDial, LensRuler } from "./Dials";
import {
  blurLabel,
  zoomLabel,
  controlsFor,
  changeControls,
  manualFocusPatch,
  manualFocusValue,
} from "./core/camera-controls";
import { outputSize, type Pose, type Project } from "./core/model";
import { sound, endScrub } from "./core/sounds";

export const STUDIO_TRANSITION = {
  type: "spring" as const,
  bounce: 0.28,
  duration: 0.48,
};
const expandedIn = {
  opacity: 1,
  scale: 1,
  filter: "blur(0px)",
  transition: {
    type: "spring" as const,
    bounce: 0.22,
    duration: 0.4,
    delay: 0.05,
  },
};
const expandedOut = {
  opacity: 0,
  scale: 0.72,
  filter: "blur(4px)",
  transition: { duration: 0.16 },
};
const labels: Record<string, string> = {
  focus: "Focus mode",
  focusDistance: "Focus distance",
  blur: "Blur",
  zoom: "Zoom",
  perspective: "Field of View",
  original: "Original",
  ratio: "Aspect",
  record: "Output settings",
};
function ScanBoxIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g className="perspective-outer">
        <path d="M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M3 7V5a2 2 0 0 1 2-2h2M7 21H5a2 2 0 0 1-2-2v-2" />
      </g>
      <g className="perspective-inner">
        <path d="m7 9 5-3 5 3v6l-5 3-5-3Z M7 9l5 3 5-3M12 12v6" />
      </g>
    </svg>
  );
}
function CompareIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16" />
      <path
        d="M5 6h5v12H5z"
        fill="currentColor"
        fillOpacity=".3"
        stroke="none"
      />
    </svg>
  );
}
function AspectIcon({ ratio }: { ratio: string }) {
  const [a, b] = ratio.split(":").map(Number);
  const w = a >= b ? 14 : (14 * a) / b,
    h = b >= a ? 14 : (14 * b) / a;
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      aria-hidden="true"
    >
      <rect x={(16 - w) / 2} y={(16 - h) / 2} width={w} height={h} rx="1" />
    </svg>
  );
}
export type OutputSettings = {
  resolution: number;
  samples: number;
  fps: number;
  photoFormat: "png" | "jpeg";
  videoFormat: "mp4" | "webm";
};
export function CameraBar({
  operator,
  pose,
  project,
  mode,
  busy,
  ready,
  onMode,
  onPose,
  onProject,
  onBegin,
  onEnd,
  onCancel,
  onCapture,
  output,
  onOutput,
  onFocus,
  original,
  onOriginal,
  onPeaking,
}: {
  operator: ReactNode;
  pose: Pose;
  project: Project;
  mode: "photo" | "video";
  busy: boolean;
  ready: boolean;
  onMode: (m: "photo" | "video") => void;
  onPose: (p: Partial<Pose> | ((current: Pose) => Partial<Pose>)) => void;
  onProject: (p: Partial<Project>) => void;
  onBegin: () => void;
  onEnd: () => void;
  onCancel: () => void;
  onCapture: () => void;
  output: OutputSettings;
  onOutput: (patch: Partial<OutputSettings>) => void;
  onFocus: (manual: boolean) => void;
  original: boolean;
  onOriginal: () => void;
  onPeaking: (active: boolean) => void;
}) {
  const [active, setActive] = useState<string | null>(null),
    [compact, setCompact] = useState(() => innerWidth <= 760);
  const [helper, setHelper] = useState<{
    name: string;
    left: number;
    bottom: number;
  } | null>(null);
  const island = useRef<HTMLDivElement>(null),
    shell = useRef<HTMLDivElement>(null),
    interacting = useRef(false),
    trigger = useRef<string | null>(null);
  const [expandedWidth, setExpandedWidth] = useState(412);
  const c = controlsFor(pose),
    settings = Object.keys(labels),
    collapsedWidth = settings.length * 36 + 60;
  const close = (restoreFocus = false) => {
    onPeaking(false);
    setActive(null);
    if (restoreFocus)
      requestAnimationFrame(() =>
        island.current
          ?.querySelector<HTMLButtonElement>(
            `[data-setting="${trigger.current}"]`,
          )
          ?.focus({ preventScroll: true }),
      );
  };
  useEffect(() => {
    const resize = () => setCompact(innerWidth <= 760);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    // An expanded compact island owns the whole bottom row. Its measurements
    // must not survive moving the Operator back to the desktop header.
    if (interacting.current) {
      interacting.current = false;
      onCancel();
      endScrub();
    }
    close();
    setHelper(null);
  }, [compact]);
  useEffect(() => {
    close();
  }, [mode, busy]);
  useEffect(() => () => onPeaking(false), [onPeaking]);
  useEffect(() => {
    if (!active) return;
    const outside = (e: PointerEvent) => {
      if (!island.current?.contains(e.target as Node)) close();
    };
    const leave = (e: PointerEvent) => {
      if (
        compact ||
        e.pointerType === "touch" ||
        e.buttons ||
        interacting.current ||
        !["blur", "zoom", "perspective", "focusDistance"].includes(active)
      )
        return;
      const r = island.current?.getBoundingClientRect();
      if (
        r &&
        (e.clientX < r.left - 40 ||
          e.clientX > r.right + 40 ||
          e.clientY < r.top - 40 ||
          e.clientY > r.bottom + 40)
      )
        close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
        onCancel();
        endScrub();
      }
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("pointermove", leave);
    window.addEventListener("pointerup", leave);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("pointermove", leave);
      window.removeEventListener("pointerup", leave);
      window.removeEventListener("keydown", key);
    };
  }, [active, compact]);
  const setControl = (patch: Parameters<typeof changeControls>[1]) =>
    onPose((current) => changeControls(current, patch));
  const tip = (name: string, e: HTMLElement) => {
    const r = e.getBoundingClientRect();
    setHelper({
      name,
      left: r.left + r.width / 2,
      bottom: innerHeight - r.top + 8,
    });
  };
  const open = (name: string, anchor: HTMLButtonElement) => {
    if (name !== "focus") setHelper(null);
    sound("tick", 0.12);
    if (name === "focus") {
      onBegin();
      const manual = c.focusMode !== "manual";
      setControl({ focusMode: manual ? "manual" : "auto" });
      onEnd();
      onFocus(manual);
      sound("toggle", 0.3);
      return;
    }
    if (name === "original") {
      onOriginal();
      return;
    }
    trigger.current = name;
    setExpandedWidth(shell.current?.clientWidth ?? 412);
    setActive(name);
  };
  const value =
    active === "focusDistance"
      ? manualFocusValue(pose)
      : active === "blur"
        ? c.blurAmount
        : active === "zoom"
          ? c.zoom
          : c.perspective;
  const reading =
    active === "focusDistance"
      ? pose.focusInfinity
        ? "∞"
        : `${Number(pose.focus.toPrecision(4))}`
      : active === "blur"
        ? blurLabel(value)
        : active === "zoom"
          ? zoomLabel(value, c.zoomBaseline)
          : `${value > 0 ? "+" : ""}${value}`;
  const icon = (name: string) =>
    name === "focus" ? (
      <span className="island-focus-icon" aria-hidden="true">
        {c.focusMode === "manual" ? "MF" : "AF"}
      </span>
    ) : name === "focusDistance" ? (
      <span className="island-focus-distance-icon">
        {pose.focusInfinity ? "∞" : "↔"}
      </span>
    ) : name === "blur" ? (
      <span className="top-lens-icon top-lens-fstop">ƒ</span>
    ) : name === "zoom" ? (
      <span className="island-zoom-icon">{zoomLabel(c.zoom, c.zoomBaseline)}</span>
    ) : name === "perspective" ? (
      <ScanBoxIcon />
    ) : name === "original" ? (
      <CompareIcon />
    ) : name === "record" ? (
      mode === "video" ? (
        <Video size={16} strokeWidth={1.75} />
      ) : (
        <SlidersHorizontal size={16} strokeWidth={1.75} />
      )
    ) : (
      <span>{project.aspect}</span>
    );
  const capture = (
    <motion.span
      className={`pill-capture-wrap ${compact ? "is-axis-capture" : "is-settings-capture"} is-${mode}`}
      initial={false}
      animate={{
        opacity: active && !compact ? 0 : 1,
        maxWidth: active && !compact ? 0 : mode === "video" ? 78 : 70,
      }}
      transition={{ opacity: { duration: 0.18 }, maxWidth: STUDIO_TRANSITION }}
      style={{ pointerEvents: active && !compact ? "none" : "auto" }}
    >
      <motion.button
        type="button"
        className="pill-capture-button"
        aria-label={mode === "photo" ? "拍摄照片" : "导出视频"}
        data-tooltip={mode === "photo" ? "Capture" : "Record"}
        disabled={!ready || busy}
        whileTap={{ scale: 0.94 }}
        transition={{ type: "spring", stiffness: 460, damping: 28, mass: 0.42 }}
        onClick={() => {
          sound("press");
          onCapture();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setExpandedWidth(shell.current?.clientWidth ?? 412);
          setActive("record");
        }}
      >
        {mode === "photo" ? (
          <span className="pill-capture-shutter" />
        ) : (
          <span className="pill-capture-rec">
            <span /> REC
          </span>
        )}
      </motion.button>
    </motion.span>
  );
  const groups = [
    {
      name: "Resolution",
      value: String(output.resolution),
      values: ["720", "1080", "2160"],
      labels: ["720p", "1080p", "4K"],
      change: (v: string) => onOutput({ resolution: +v }),
    },
    ...(mode === "video"
      ? [
          {
            name: "FPS",
            value: String(output.fps),
            values: ["24", "30", "60"],
            labels: ["24", "30", "60"],
            change: (v: string) => onOutput({ fps: +v }),
          },
        ]
      : []),
    {
      name: "Detail",
      value: String(output.samples),
      values: ["128", "256", "512"],
      labels: ["128", "256", "512"],
      change: (v: string) => onOutput({ samples: +v }),
    },
    {
      name: "Format",
      value: mode === "photo" ? output.photoFormat : output.videoFormat,
      values: mode === "photo" ? ["png", "jpeg"] : ["mp4", "webm"],
      labels: mode === "photo" ? ["PNG", "JPEG"] : ["MP4", "WebM"],
      change: (v: string) =>
        onOutput(
          mode === "photo"
            ? { photoFormat: v as "png" | "jpeg" }
            : { videoFormat: v as "mp4" | "webm" },
        ),
    },
  ];
  return (
    <>
      {!compact && operator}
      <motion.div
        layout
        className="bottom-studio-controls reference-controls"
        transition={STUDIO_TRANSITION}
      >
        <div className="bottom-chrome-row">
          <motion.div
            layout="position"
            className="studio-mode-toggle"
            role="group"
            aria-label="摄影模式"
            transition={STUDIO_TRANSITION}
          >
            <motion.span
              className="studio-mode-highlight"
              aria-hidden="true"
              initial={false}
              animate={{ x: mode === "video" ? "100%" : "0%" }}
              transition={{ type: "spring", bounce: 0.28, duration: 0.46 }}
            />
            {(["photo", "video"] as const).map((m) => (
              <button
                key={m}
                className={m === mode ? "is-active" : ""}
                aria-pressed={m === mode}
                disabled={busy}
                onClick={() => {
                  close();
                  sound("toggle", 0.3);
                  onMode(m);
                }}
              >
                <span>{m.toUpperCase()}</span>
              </button>
            ))}
          </motion.div>
          <motion.div
            layout="position"
            className="bottom-axis-controls"
            aria-label="Rotation controls"
            transition={STUDIO_TRANSITION}
          >
            <div className="bottom-axis-buttons">
              {(["pitch", "yaw", "roll"] as const).map((key, i) => (
                <RotationDial
                  key={key}
                  axis={["X", "Y", "Z"][i]}
                  value={pose[key]}
                  disabled={!ready || busy}
                  onBegin={onBegin}
                  onEnd={onEnd}
                  onCancel={onCancel}
                  onChange={(n) =>
                    onPose({ [key]: n, continuousRotation: true })
                  }
                />
              ))}
            </div>
            {compact && capture}
          </motion.div>
        </div>
        <div className="mobile-camera-controls-row">
          {compact && operator}
          <motion.div
            ref={shell}
            layout
            className="topbar-utility-controls"
            transition={STUDIO_TRANSITION}
          >
            <div className="settings-island-scroll">
              <motion.div
                ref={island}
                className={`top-lens-island top-settings-island ${active ? "is-expanded" : ""}`}
                initial={false}
                animate={{
                  width: active ? expandedWidth : collapsedWidth,
                  height:
                    active === "record" ? (mode === "video" ? 132 : 106) : 40,
                }}
                transition={{
                  type: "spring",
                  bounce: active ? 0.22 : 0.28,
                  duration: active ? 0.48 : 0.42,
                }}
                style={
                  {
                    "--perspective-ring-rotation": `${(55 * c.perspective) / 100}deg`,
                    "--perspective-outer-scale":
                      1 - (0.08 * c.perspective) / 100,
                    "--perspective-inner-scale":
                      1 + (0.16 * c.perspective) / 100,
                  } as CSSProperties
                }
              >
                <AnimatePresence initial={false} mode="popLayout">
                  {active ? (
                    <motion.div
                      key={active}
                      className={`top-lens-expanded top-settings-expanded ${["blur", "zoom", "perspective", "focusDistance"].includes(active) ? "is-slider" : "is-choices"}`}
                      initial={{ opacity: 0, scale: 0.9, filter: "blur(5px)" }}
                      animate={expandedIn}
                      exit={expandedOut}
                    >
                      {active === "record" ? (
                        <div
                          className="island-record-controls"
                          aria-label="输出设置"
                        >
                          {groups.map((g) => (
                            <div className="island-record-group" key={g.name}>
                              <span className="island-record-label">
                                {g.name}
                              </span>
                              <div
                                className="island-device-choices"
                                role="group"
                                aria-label={g.name}
                                style={{
                                  gridTemplateColumns: `repeat(${g.values.length}, 1fr)`,
                                }}
                              >
                                <motion.span
                                  className="island-device-highlight"
                                  aria-hidden="true"
                                  style={{
                                    width: `calc((100% - 4px) / ${g.values.length})`,
                                  }}
                                  initial={false}
                                  animate={{
                                    x: `${100 * g.values.indexOf(g.value)}%`,
                                  }}
                                  transition={{
                                    type: "spring",
                                    bounce: 0.28,
                                    duration: 0.46,
                                  }}
                                />
                                {g.values.map((v, i) => (
                                  <button
                                    key={v}
                                    className={g.value === v ? "active" : ""}
                                    aria-pressed={g.value === v}
                                    disabled={busy}
                                    onClick={() => {
                                      sound("toggle", 0.3);
                                      g.change(v);
                                    }}
                                  >
                                    {g.labels[i]}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                          <span className="output-dimensions">
                            {outputSize(project.aspect, output.resolution).join(
                              " × ",
                            )}{" "}
                            · {output.samples} samples
                          </span>
                        </div>
                      ) : active === "ratio" ? (
                        <div
                          className="island-aspect-choices"
                          role="group"
                          aria-label="画幅比例"
                        >
                          {["16:9", "4:3", "1:1", "4:5", "9:16"].map((r) => (
                            <button
                              key={r}
                              aria-pressed={project.aspect === r}
                              className={project.aspect === r ? "active" : ""}
                              onClick={() => {
                                onProject({ aspect: r });
                                close(true);
                                sound("toggle", 0.3);
                              }}
                            >
                              <AspectIcon ratio={r} />
                              {r}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <>
                          <LensRuler
                            label={
                              active === "focusDistance"
                                ? "对焦距离"
                                : active === "blur"
                                  ? "光圈"
                                  : labels[active]
                            }
                            value={value}
                            min={
                              active === "zoom"
                                ? 50
                                : active === "perspective"
                                  ? -100
                                  : 0
                            }
                            max={active === "zoom" ? 500 : 100}
                            onBegin={() => {
                              interacting.current = true;
                              onBegin();
                              if (active === "blur") onPeaking(true);
                            }}
                            onEnd={() => {
                              interacting.current = false;
                              onPeaking(false);
                              onEnd();
                            }}
                            onCancel={() => {
                              interacting.current = false;
                              onPeaking(false);
                              onCancel();
                            }}
                            onChange={(n) =>
                              active === "focusDistance"
                                ? onPose((current) =>
                                    manualFocusPatch(current, n),
                                  )
                                : setControl(
                                    active === "blur"
                                      ? { blurAmount: n }
                                      : active === "zoom"
                                        ? { zoom: n }
                                        : { perspective: n },
                                  )
                            }
                          />
                          <output>
                            <small>{labels[active]}</small>
                            <strong>{reading}</strong>
                          </output>
                        </>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="idle"
                      className="top-lens-collapsed top-settings-collapsed"
                      style={{
                        gridTemplateColumns: `repeat(${settings.length}, 36px)`,
                      }}
                      initial={{ opacity: 0, scale: 0.9, filter: "blur(5px)" }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                        filter: "blur(0px)",
                        transition: {
                          type: "spring",
                          bounce: 0.28,
                          duration: 0.36,
                          delay: 0.05,
                        },
                      }}
                      exit={{
                        opacity: 0,
                        scale: 1.2,
                        filter: "blur(4px)",
                        transition: { duration: 0.16 },
                      }}
                    >
                      {settings.map((name) => (
                        <span
                          key={name}
                          className="top-setting-hit"
                          onMouseEnter={(e) => tip(name, e.currentTarget)}
                          onMouseLeave={() => setHelper(null)}
                        >
                          <motion.button
                            type="button"
                            data-setting={name}
                            whileTap={{ scale: 0.82 }}
                            disabled={!ready || busy}
                            onFocus={(e) => tip(name, e.currentTarget)}
                            onBlur={() => setHelper(null)}
                            onClick={(e) => open(name, e.currentTarget)}
                            aria-label={
                              {
                                focus: "切换自动与手动对焦",
                                focusDistance: "手动对焦距离",
                                blur: "光圈",
                                zoom: "Zoom",
                                perspective: "Field of View",
                                original: "切换原始画面对照",
                                ratio: "画幅比例",
                                record: "输出设置",
                              }[name]
                            }
                            aria-pressed={
                              name === "original" ? original : undefined
                            }
                          >
                            {icon(name)}
                          </motion.button>
                        </span>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>
            {!compact && capture}
          </motion.div>
        </div>
      </motion.div>
      {createPortal(
        <AnimatePresence>
          {!active && helper && !compact && (
            <motion.span
              key={helper.name}
              className="top-setting-helper"
              role="tooltip"
              style={{
                position: "fixed",
                zIndex: 250,
                bottom: helper.bottom,
                left: helper.left,
              }}
              initial={{ opacity: 0, y: -3, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -2, scale: 0.94 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
            >
              {helper.name === "focus"
                ? `Focus · ${c.focusMode === "manual" ? "Manual" : "Auto"}`
                : labels[helper.name]}
            </motion.span>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
