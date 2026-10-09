import { isSelectionView } from "./render/selection-view";
import { useEffect, useRef, useState, type PointerEvent as PE } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Sun,
  Moon,
  HelpCircle,
  Focus,
  X,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  ResourceRuntime,
  isFastPreview,
  type FrameState,
} from "./render/runtime";
import { loadResource, type ResourceScene } from "./resource";
import { directorBasePath } from "../../metaflow-viewer/src/director-handoff";
import {
  DEFAULT_POSE,
  createProject,
  makeShot,
  uid,
  evaluate,
  totalDuration,
  layoutShots,
  interpolatePose,
  cubicBezier,
  outputSize,
  frameCount,
  clamp,
  type Pose,
  type Project,
  type Shot,
  type Transition,
} from "./core/model";
import {
  controlsFor,
  changeControls,
  rebaseControls,
} from "./core/camera-controls";
import { composeViewPose } from "./core/compose-view";
import { viewPose, thumbnailKey, thumbnailSize } from "./core/view-state";
import { exportVideo, preflight } from "./core/encoder";
import { CameraBar } from "./CameraBar";
import { Operator } from "./Operator";
import { TooltipLayer } from "./TooltipLayer";
import logo from "../../metaflow-viewer/src/assets/metaflow.svg";
import { VideoTimeline } from "./VideoTimeline";
import { Modal } from "./Modal";
import { VideoTutorial, type TutorialStep } from "./VideoTutorial";
import { TransitionMenu } from "./TransitionMenu";
import { InterestSelector, type InterestArea } from "./InterestSelector";
import { setSoundMuted } from "./core/sounds";
type Snapshot = { pose: Pose; project: Project };
const initial: Snapshot = {
  pose: structuredClone(DEFAULT_POSE),
  project: createProject(),
};
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const toBlob = (c: HTMLCanvasElement, type: string) =>
  new Promise<Blob>((resolve, reject) =>
    c.toBlob(
      (b) => (b ? resolve(b) : reject(Error("照片编码失败"))),
      type,
      0.95,
    ),
  );
export function App() {
  const canvas = useRef<HTMLCanvasElement>(null),
    stage = useRef<HTMLDivElement>(null),
    runtime = useRef<ResourceRuntime | null>(null);
  const [snapshot, setSnapshot] = useState(initial),
    ref = useRef(snapshot);
  ref.current = snapshot;
  const recovery = useRef<{
    resourceId: string;
    files: string;
    snapshot: Snapshot;
    selected: string;
    dirty: boolean;
  } | null>(null);
  const [resource, setResource] = useState<ResourceScene | null>(null),
    [status, setStatus] = useState("正在准备摄影页面…"),
    [ready, setReady] = useState(false),
    [deviceSlow, setDeviceSlow] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const [mode, setMode] = useState<"photo" | "video">("photo"),
    [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [selected, setSelected] = useState(""),
    [live, setLive] = useState(true);
  const [samples, setSamples] = useState(() => {
    try {
      return [128, 256, 512].includes(+localStorage.directorSamples)
        ? +localStorage.directorSamples
        : 128;
    } catch {
      return 128;
    }
  });
  const [compact, setCompact] = useState(innerWidth <= 760);
  const [size, setSize] = useState<[number, number]>([960, 540]),
    [count, setCount] = useState(0),
    [theme, setTheme] = useState<"dark" | "light">("dark"),
    [muted, setMute] = useState(true);
  const [operatorActive, setOperatorActive] = useState(false),
    [focusHint, setFocusHint] = useState("");
  const [original, setOriginal] = useState(false),
    [peaking, setPeaking] = useState(false),
    [adjusting, setAdjusting] = useState(false),
    [displayedFast, setDisplayedFast] = useState(false);
  const [resolution, setResolution] = useState(1080),
    [fps, setFps] = useState(30),
    [photoFormat, setPhotoFormat] = useState<"png" | "jpeg">("png"),
    [videoFormat, setVideoFormat] = useState<"mp4" | "webm">("mp4");
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [dirty, setDirty] = useState(false),
    [help, setHelp] = useState(false);
  const [tutorial, setTutorial] = useState<TutorialStep>(null);
  const tutorialDismissed = useRef(false);
  const tutorialEndpoint = useRef<"start" | "end" | null>(null);
  const tutorialAfterPlay = useRef<TutorialStep>("operator");
  const [focusMark, setFocusMark] = useState<{
      x: number;
      y: number;
      id: number;
    } | null>(null),
    [selectInterest, setSelectInterest] = useState(false),
    [selectionReady, setSelectionReady] = useState(false),
    [transition, setTransition] = useState<{
      id: string;
      edge: "in" | "out";
      anchor: { x: number; y: number };
    } | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0),
    [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const undo = useRef<Snapshot[]>([]),
    redo = useRef<Snapshot[]>([]),
    gesture = useRef<Snapshot | null>(null),
    intent = useRef(0),
    animation = useRef<number | null>(null),
    composeIndex = useRef(0),
    abort = useRef<AbortController | null>(null),
    thumbnailAbort = useRef<AbortController | null>(null),
    wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [temporaryPose, setTemporaryPose] = useState<Pose | null>(null);
  const temporary = useRef<Pose | null>(null),
    selectionBase = useRef<Pose | null>(null),
    selectionTarget = useRef<Pose | null>(null),
    selectionCanPick = useRef(false),
    selectionPick = useRef(0),
    operatorBase = useRef<Pose | null>(null);
  const setViewOnly = (p: Pose | null) => {
    temporary.current = p;
    setTemporaryPose(p);
  };
  const pointers = useRef(new Map<number, { x: number; y: number }>()),
    drag = useRef({ x: 0, y: 0, moved: false, pinch: false });
  const { pose, project } = snapshot,
    c = controlsFor(pose),
    shot = project.shots.find((s) => s.id === selected);
  const current = useRef({
    mode,
    time,
    playing,
    live,
    size,
    samples,
    busy,
    ready,
    original,
    peaking,
    adjusting,
  });
  current.current = {
    mode,
    time,
    playing,
    live,
    size,
    samples,
    busy,
    ready,
    original,
    peaking,
    adjusting,
  };
  const commit = (next: Snapshot) => {
    ref.current = next;
    setSnapshot(next);
    setTime((t) => clamp(t, 0, totalDuration(next.project.shots)));
    setDirty(true);
  };
  const togglePlayback = () => {
    const state = current.current;
    if (!state.ready || state.busy) return;
    if (
      !state.playing &&
      state.time >= totalDuration(ref.current.project.shots)
    )
      setTime(0);
    setLive(false);
    setPlaying(!state.playing);
  };
  const stopMotion = () => {
    current.current.adjusting = false;
    setAdjusting(false);
    intent.current++;
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
    setViewOnly(null);
    selectionBase.current = null;
    selectionTarget.current = null;
    selectionCanPick.current = false;
    setSelectionReady(false);
    setSelectInterest(false);
    setPlaying(false);
  };
  const begin = () => {
    stopMotion();
    if (!gesture.current) gesture.current = structuredClone(ref.current);
  };
  const materializeCamera = () => {
    if (current.current.mode !== "video" || current.current.live) return;
    // Use the completed batch's time rather than an undrawn navigation target.
    const displayed = runtime.current?.displayed;
    const p = displayed
      ? viewPose(
          displayed.pose,
          displayed.project,
          displayed.time,
          displayed.video,
        )
      : viewPose(
          ref.current.pose,
          ref.current.project,
          current.current.time,
          true,
        );
    const next = { ...ref.current, pose: structuredClone(p) };
    ref.current = next;
    setSnapshot(next);
    current.current.live = true;
    setLive(true);
  };
  const beginCamera = () => {
    materializeCamera();
    begin();
    current.current.adjusting = true;
    setAdjusting(true);
  };
  const end = () => {
    current.current.adjusting = false;
    setAdjusting(false);
    if (tutorialEndpoint.current) {
      const next = structuredClone(ref.current);
      const sh = next.project.shots.find((s) => s.id === selected);
      const key =
        tutorialEndpoint.current === "start" ? sh?.keys[0] : sh?.keys.at(-1);
      if (key) key.pose = structuredClone(next.pose);
      commit(next);
      setTutorial(tutorialEndpoint.current === "start" ? "end" : "playback");
      tutorialEndpoint.current = null;
    }
    if (
      gesture.current &&
      JSON.stringify(gesture.current) !== JSON.stringify(ref.current)
    ) {
      undo.current.push(gesture.current);
      if (undo.current.length > 80) undo.current.shift();
      redo.current = [];
      setHistoryVersion((v) => v + 1);
    }
    gesture.current = null;
  };
  const cancelGesture = () => {
    current.current.adjusting = false;
    setAdjusting(false);
    pointers.current.clear();
    if (wheelTimer.current) clearTimeout(wheelTimer.current);
    wheelTimer.current = null;
    tutorialEndpoint.current = null;
    stopMotion();
    if (gesture.current) {
      const previous = gesture.current;
      gesture.current = null;
      commit(previous);
    }
  };
  const edit = (fn: (s: Snapshot) => void) => {
    begin();
    const next = structuredClone(ref.current);
    fn(next);
    commit(next);
    end();
  };
  const updatePose = (next: Pose) => {
    intent.current++;
    commit({ ...ref.current, pose: next });
    setLive(true);
  };
  const patchPose = (
    patch: Partial<Pose> | ((current: Pose) => Partial<Pose>),
  ) => {
    const base = ref.current.pose;
    updatePose({
      ...base,
      ...(typeof patch === "function" ? patch(base) : patch),
    });
    if (tutorial === "start" || tutorial === "adjust-end")
      tutorialEndpoint.current = tutorial === "start" ? "start" : "end";
  };
  const control = (patch: Parameters<typeof changeControls>[1]) =>
    updatePose(changeControls(ref.current.pose, patch));
  const restore = (back: boolean) => {
    stopMotion();
    const from = back ? undo.current : redo.current,
      to = back ? redo.current : undo.current;
    if (!from.length) return;
    to.push(structuredClone(ref.current));
    commit(from.pop()!);
    setLive(true);
    setHistoryVersion((v) => v + 1);
  };
  const frame = (options: Partial<FrameState> = {}): FrameState => ({
    project: structuredClone(ref.current.project),
    pose: structuredClone(temporary.current ?? ref.current.pose),
    time: current.current.time,
    video:
      !temporary.current &&
      current.current.mode === "video" &&
      !current.current.live,
    width: current.current.size[0],
    height: current.current.size[1],
    samples: current.current.samples,
    playing: current.current.playing,
    original: current.current.original,
    peaking: current.current.peaking,
    adjusting: current.current.adjusting || animation.current !== null,
    viewRevision: intent.current,
    ...options,
  });
  const resume = () => {
    if (
      runtime.current &&
      current.current.ready &&
      !current.current.busy &&
      !runtime.current.needsDeviceRecovery &&
      !document.hidden
    )
      runtime.current.request(frame());
  };
  useEffect(() => {
    if (tutorial === "watch" && !playing) {
      setTutorial(tutorialAfterPlay.current);
      if (!tutorialAfterPlay.current) tutorialDismissed.current = true;
    }
  }, [playing, tutorial]);
  useEffect(() => {
    document.documentElement.dataset.directorTheme = theme;
    return () => {
      delete document.documentElement.dataset.directorTheme;
    };
  }, [theme]);
  useEffect(() => {
    if (!focusHint) return;
    const timer = setTimeout(() => setFocusHint(""), 2600);
    return () => clearTimeout(timer);
  }, [focusHint]);
  useEffect(() => {
    setSoundMuted(muted);
  }, [muted]);
  useEffect(() => {
    const query = matchMedia("(max-width:760px)");
    const update = () => setCompact(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    try {
      localStorage.directorSamples = String(samples);
    } catch {}
  }, [samples]);
  useEffect(() => {
    const controller = new AbortController();
    let owned: ResourceRuntime | null = null;
    setReady(false);
    setDeviceSlow(false);
    setError("");
    (async () => {
      if (!navigator.gpu)
        throw Error(
          "当前浏览器未提供 WebGPU。请使用支持 WebGPU 的浏览器，或返回 Viewer 浏览。",
        );
      const loaded = await loadResource(
        location.pathname,
        controller.signal,
        setStatus,
      );
      controller.signal.throwIfAborted();
      setStatus("模型已下载，正在创建摄影场景…");
      const saved = recovery.current;
      const restoring =
        saved?.resourceId === loaded.resource.id &&
        saved.files === JSON.stringify(loaded.resource.files);
      const workingPose = restoring ? saved.snapshot.pose : loaded.pose;
      const p = restoring ? saved.snapshot.project : createProject();
      p.name = loaded.resource.title ?? loaded.resource.id;
      p.backdrop = loaded.background;
      p.mobileCanvasFill = false;
      p.assets = [
        {
          id: loaded.resource.id,
          name: p.name,
          format: loaded.resource.files.model!.endsWith(".ply") ? "ply" : "sog",
          size: loaded.assets.reduce((n, a) => n + a.bytes.byteLength, 0),
          hash: loaded.resource.id,
        },
      ];
      if (!restoring)
        p.shots = [makeShot(loaded.resource.id, loaded.pose, "镜头 1")];
      owned = await ResourceRuntime.create(
        canvas.current!,
        loaded.assets,
        workingPose,
        loaded.background,
        (_s, n) => {
          if (controller.signal.aborted) return;
          setCount(n);
          setDisplayedFast(isFastPreview(_s));
          // Re-entry must not accept an old flat batch; a later non-flat
          // display also closes picking until this view is fully ready again.
          const canPick =
            !!selectionBase.current &&
            isSelectionView(
              _s,
              selectionTarget.current,
              intent.current,
              current.current.size,
            );
          selectionCanPick.current = canPick;
          setSelectionReady(canPick);
          if (canvas.current && owned) {
            canvas.current.dataset.apertureBatches = String(
              owned.metrics.batches,
            );
            canvas.current.dataset.previewCacheHits = String(
              owned.metrics.cacheHits,
            );
            canvas.current.dataset.apertureSamples = String(
              isFastPreview(_s) ? 0 : n,
            );
            canvas.current.dataset.previewMode = isFastPreview(_s)
              ? "fast"
              : "aperture";
            canvas.current.dataset.peaking = String(
              !!_s.peaking && !_s.original,
            );
          }
        },
        (e) => {
          if (controller.signal.aborted) return;
          abort.current?.abort();
          thumbnailAbort.current?.abort();
          cancelGesture();
          setError((e as Error).message);
        },
        {
          signal: controller.signal,
          onSlow: () => {
            if (controller.signal.aborted) return;
            setDeviceSlow(true);
            setStatus("浏览器准备图形设备较慢，仍在等待响应…");
          },
        },
      );
      if (controller.signal.aborted) {
        await owned.dispose();
        return;
      }
      runtime.current = owned;
      loaded.assets = [];
      setResource(loaded);
      const next = { pose: workingPose, project: p };
      ref.current = next;
      setSnapshot(next);
      setSelected(restoring ? saved.selected : p.shots[0].id);
      setReady(true);
      setDeviceSlow(false);
      setDirty(restoring ? saved.dirty : false);
      recovery.current = null;
      setStatus(
        restoring
          ? "已重新创建图形设备，保留当前取景与镜头编辑"
          : loaded.cameraSource === "viewer"
            ? "已承接 Viewer 当前机位"
            : "已载入资源 JSON 初始机位",
      );
    })().catch((e) => {
      if (!controller.signal.aborted && e.name !== "AbortError") {
        setDeviceSlow(false);
        setStatus("摄影初始化未完成，可重新加载");
        setError(e.message);
      }
    });
    return () => {
      controller.abort();
      intent.current++;
      if (animation.current !== null) cancelAnimationFrame(animation.current);
      runtime.current = null;
      void owned?.dispose();
    };
  }, [retry]);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const r = element.getBoundingClientRect(),
        dpr = devicePixelRatio || 1;
      if (r.width > 1 && r.height > 1)
        setSize([
          Math.max(2, Math.round((r.width * dpr) / 2) * 2),
          Math.max(2, Math.round((r.height * dpr) / 2) * 2),
        ]);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ready, project.aspect, mode]);
  useEffect(() => {
    if (
      ready &&
      !busy &&
      runtime.current &&
      !runtime.current.needsDeviceRecovery
    )
      runtime.current.request(frame());
  }, [
    snapshot,
    temporaryPose,
    time,
    live,
    playing,
    size,
    samples,
    ready,
    busy,
    mode,
    original,
    peaking,
    adjusting,
  ]);
  useEffect(() => {
    if (!playing) return;
    const start = performance.now(),
      offset = time;
    let id = 0;
    const tick = (now: number) => {
      const t = offset + Math.max(0, now - start) / 1000,
        end = totalDuration(ref.current.project.shots);
      setLive(false);
      if (t >= end) {
        setTime(end);
        setPlaying(false);
        return;
      }
      setTime(t);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty || busy) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty, busy]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (e.key === "Escape") {
        if (busy) {
          abort.current?.abort();
          return;
        }
        if (selectionBase.current) closeSelection();
        else cancelGesture();
        setTransition(null);
        setSelectInterest(false);
        setHelp(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (!busy) restore(!e.shiftKey);
      }
      if (e.code === "Space" && mode === "video" && ready && !busy) {
        e.preventDefault();
        togglePlayback();
      }
    };
    window.addEventListener("keydown", key);
    const blur = () => {
      if (pointers.current.size || wheelTimer.current) cancelGesture();
    };
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", blur);
    };
  }, [busy, ready, mode]);
  useEffect(() => {
    const onVisible = () => {
      if (document.hidden) {
        setPlaying(false);
        void runtime.current?.stop();
      } else resume();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  const focus = async (x: number, y: number) => {
    if (!runtime.current || busy) return;
    materializeCamera();
    stopMotion();
    const request = ++intent.current;
    setFocusMark({ x, y, id: request });
    // The marker lifetime starts at input, independently of asynchronous picking.
    setTimeout(() => setFocusMark((m) => (m?.id === request ? null : m)), 1850);
    try {
      const hit = await runtime.current.pick(x, y);
      if (request !== intent.current) return;
      if (hit) {
        edit((s) => {
          s.pose = {
            ...s.pose,
            focusPoint: hit.point as Pose["target"],
            focus: hit.distance,
            focusInfinity: false,
            controls: { ...controlsFor(s.pose), focusMode: "manual" },
          };
        });
        setLive(true);
        setStatus("已对焦到点击位置 · MF");
      }
    } catch (e) {
      if (request === intent.current && (e as Error).name !== "AbortError")
        setError((e as Error).message);
    } finally {
      if (request <= intent.current) resume();
    }
  };
  const pointerDown = (e: PE<HTMLDivElement>) => {
    if (!ready || busy || selectInterest) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (!pointers.current.size) {
      beginCamera();
      drag.current = {
        x: e.clientX,
        y: e.clientY,
        moved: false,
        pinch: e.button !== 0,
      };
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size > 1) {
      drag.current.pinch = true;
      drag.current.moved = true;
    }
  };
  const pointerMove = (e: PE<HTMLDivElement>) => {
    const previous = pointers.current.get(e.pointerId);
    if (!previous) return;
    const dx = e.clientX - previous.x,
      dy = e.clientY - previous.y;
    if (pointers.current.size > 1) {
      const other = [...pointers.current.entries()].find(
          ([id]) => id !== e.pointerId,
        )![1],
        before = Math.hypot(previous.x - other.x, previous.y - other.y),
        after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      control({
        zoom: clamp(
          (controlsFor(ref.current.pose).zoom * after) / Math.max(1, before),
          50,
          500,
        ),
      });
    } else if (
      Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y) > 3 ||
      drag.current.moved
    ) {
      drag.current.moved = true;
      const p = ref.current.pose;
      if (e.shiftKey || e.buttons === 2) {
        const yaw = (p.yaw * Math.PI) / 180,
          pitch = (p.pitch * Math.PI) / 180,
          scale = p.distance * 0.0015;
        patchPose({
          target: [
            p.target[0] +
              (-Math.cos(yaw) * dx - Math.sin(yaw) * Math.sin(pitch) * dy) *
                scale,
            p.target[1] + Math.cos(pitch) * dy * scale,
            p.target[2] +
              (Math.sin(yaw) * dx - Math.cos(yaw) * Math.sin(pitch) * dy) *
                scale,
          ],
        });
      } else
        patchPose({
          yaw: clamp(p.yaw - dx * 0.25, -360, 360),
          pitch: clamp(p.pitch + dy * 0.25, -360, 360),
          continuousRotation: true,
        });
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const pointerUp = (e: PE<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (pointers.current.size) return;
    const d = drag.current;
    end();
    if (!d.moved && !d.pinch) {
      const r = e.currentTarget.getBoundingClientRect();
      void focus(
        (e.clientX - r.left) / r.width,
        (e.clientY - r.top) / r.height,
      );
    }
  };
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!current.current.ready || current.current.busy) return;
      e.preventDefault();
      beginCamera();
      if (e.ctrlKey)
        control({
          zoom: clamp(
            controlsFor(ref.current.pose).zoom * Math.exp(-e.deltaY * 0.01),
            50,
            500,
          ),
        });
      else
        updatePose(
          rebaseControls({
            ...ref.current.pose,
            distance: Math.max(
              0.00001,
              ref.current.pose.distance * Math.exp(e.deltaY * 0.001),
            ),
          }),
        );
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(end, 180);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  const seek = (t: number, id?: string) => {
    stopMotion();
    setTime(t);
    setLive(false);
    const state = evaluate(ref.current.project.shots, t);
    if (state) {
      setSelected(id ?? state.shot.id);
      const next = { ...ref.current, pose: structuredClone(state.pose) };
      ref.current = next;
      setSnapshot(next);
    }
  };
  // MF-62 view-only camera tween. Temporary flattening never enters project history.
  const animateCamera = (
    from: Pose,
    to: Pose,
    keep = false,
    complete?: () => void,
    duration = 220,
  ) => {
    const started = performance.now(),
      version = intent.current;
    setViewOnly(structuredClone(from));
    const tick = (now: number) => {
      if (intent.current !== version) return;
      const t = clamp((now - started) / duration, 0, 1);
      setViewOnly(
        t === 1
          ? keep
            ? structuredClone(to)
            : null
          : interpolatePose(from, to, cubicBezier(t, [0.2, 0.8, 0.2, 1])),
      );
      if (t < 1) animation.current = requestAnimationFrame(tick);
      else {
        animation.current = null;
        complete?.();
      }
    };
    animation.current = requestAnimationFrame(tick);
  };
  const closeSelection = () => {
    const back = selectionBase.current,
      from = temporary.current;
    stopMotion();
    if (back && from) animateCamera(from, back);
  };
  const enterSelection = () => {
    if (selectionBase.current) {
      closeSelection();
      return;
    }
    materializeCamera();
    const from = temporary.current ?? ref.current.pose;
    stopMotion();
    selectionBase.current = structuredClone(ref.current.pose);
    setSelectInterest(true);
    const flat = changeControls(
      rebaseControls({
        ...structuredClone(from),
        yaw: 0,
        pitch: 0,
        roll: 0,
        dof: false,
        blur: 0,
        focusPoint: null,
        controls: {
          ...controlsFor(from),
          blurAmount: 0,
          focusMode: "auto",
        },
      }),
      { zoom: 70 },
    );
    selectionTarget.current = structuredClone(flat);
    animateCamera(from, flat, true);
  };
  const compose = () => {
    if (!shot || busy) return;
    const from = temporary.current ?? ref.current.pose;
    begin();
    const base = structuredClone(operatorBase.current ?? ref.current.pose),
      index = composeIndex.current++,
      points = shot.interestPoints ?? [];
    if (points.length) base.focusPoint = points[index % points.length];
    const nextPose = composeViewPose(base, index),
      next = structuredClone(ref.current);
    let target = nextPose;
    if (mode === "video") {
      const sh = next.project.shots.find((s) => s.id === shot.id)!;
      const poses =
        points.length > 1
          ? points.map((point, i) =>
              composeViewPose({ ...base, focusPoint: point }, i),
            )
          : [structuredClone(base), nextPose];
      sh.keys = poses.map((pose, i) => ({
        id: uid(),
        time: (sh.duration * i) / (poses.length - 1),
        pose,
      }));
      target = poses[0];
      setTime(
        layoutShots(next.project.shots).find((s) => s.shot.id === shot.id)!
          .start,
      );
    }
    next.pose = target;
    commit(next);
    end();
    setLive(true);
    if (mode === "video") {
      // The reference starts the generated sequence immediately. Its 240ms
      // camera-moving flag is not an additional camera animation or delay.
      setLive(false);
      setPlaying(true);
      if (tutorial === "compose" || tutorial === "final-compose")
        setTutorial("watch");
    } else {
      // Match the observed frame transform's 220ms cubic-bezier transition.
      animateCamera(from, target);
    }
    setStatus("Compose");
  };
  const interest = async (area: InterestArea, index: number) => {
    if (
      !selectionCanPick.current ||
      !isSelectionView(
        runtime.current?.displayed ?? null,
        selectionTarget.current,
        intent.current,
        current.current.size,
      )
    )
      return false;
    const request = ++selectionPick.current,
      viewVersion = intent.current;
    const hit = await runtime.current?.pick(
      area.x + area.width / 2,
      area.y + area.height / 2,
    );
    if (
      request !== selectionPick.current ||
      viewVersion !== intent.current ||
      !selectionCanPick.current ||
      !hit
    ) {
      resume();
      return false;
    }
    // A confirmed selection is one edit; do not cancel the temporary selection view.
    const previous = structuredClone(ref.current),
      next = structuredClone(ref.current);
    const sh = next.project.shots.find((v) => v.id === selected)!;
    sh.interestAreas ??= [];
    sh.interestPoints ??= [];
    sh.interestAreas[index] = area;
    sh.interestPoints[index] = hit.point as Pose["target"];
    undo.current.push(previous);
    redo.current = [];
    setHistoryVersion((v) => v + 1);
    commit(next);
    if (tutorial === "interest-area") setTutorial("final-compose");
    resume();
    return true;
  };
  const save = async () => {
    if (!runtime.current || current.current.busy) return;
    current.current.busy = true;
    thumbnailAbort.current?.abort();
    stopMotion();
    setBusy(true);
    setTransition(null);
    setError("");
    const controller = new AbortController();
    abort.current = controller;
    const [width, height] = outputSize(project.aspect, resolution),
      base = frame({
        width,
        height,
        samples,
        playing: false,
        video: mode === "video",
      }),
      name = (resource?.resource.title ?? "Metaflow").replace(
        /[\\/:*?"<>|]/g,
        "-",
      );
    try {
      if (mode === "photo") {
        setProgress("准备照片…");
        const image = await runtime.current.capture(
          { ...base, video: false },
          controller.signal,
          (n) =>
            setProgress(`照片 · ${Math.round(n * 100)}% · ${samples} 孔径样本`),
        );
        controller.signal.throwIfAborted();
        const blob = await toBlob(image, `image/${photoFormat}`);
        controller.signal.throwIfAborted();
        download(blob, `${name}.${photoFormat}`);
      } else {
        if (!project.shots.length) throw Error("请先添加一个镜头");
        const settings = { width, height, fps, format: videoFormat };
        setProgress("正在核验编码能力…");
        if (!(await preflight(settings)))
          throw Error("当前设备不支持所选视频尺寸、帧率或编码，请选择可用组合");
        const frames = frameCount(totalDuration(project.shots), fps);
        const blob = await exportVideo(
          settings,
          totalDuration(project.shots),
          (t) =>
            runtime.current!.capture(
              { ...base, time: t, video: true },
              controller.signal,
              (n) =>
                setProgress(
                  `视频 · 第 ${Math.round(t * fps) + 1}/${frames} 帧 · 孔径 ${Math.round(n * samples)}/${samples}`,
                ),
            ),
          controller.signal,
          (n) =>
            setProgress(
              `视频 · ${Math.round(n * 100)}% · ${samples} 孔径样本/帧`,
            ),
        );
        download(blob, `${name}.${videoFormat}`);
      }
      setStatus("编码与封装完成，文件已交给浏览器保存");
      setDirty(false);
    } catch (e) {
      if ((e as Error).name === "AbortError")
        setStatus("导出已取消，可以继续摄影或重试");
      else setError((e as Error).message);
    } finally {
      await runtime.current?.stop();
      abort.current = null;
      current.current.busy = false;
      setBusy(false);
      setProgress("");
      resume();
    }
  };
  // Bind thumbnails to keyframe parameters, not IDs that survive an edit or undo.
  useEffect(() => {
    if (
      mode !== "video" ||
      !ready ||
      busy ||
      playing ||
      count < samples ||
      !runtime.current
    )
      return;
    const rt = runtime.current,
      controller = new AbortController(),
      pending = project.shots
        .flatMap((s) => s.keys)
        .filter((k) => !thumbnails[thumbnailKey(project, k)]);
    if (!pending.length) return;
    thumbnailAbort.current = controller;
    const timer = setTimeout(
      () =>
        void (async () => {
          const images: Record<string, string> = {};
          try {
            for (const k of pending) {
              controller.signal.throwIfAborted();
              const image = await rt.capture(
                frame({
                  pose: k.pose,
                  video: false,
                  width: thumbnailSize(project.aspect)[0],
                  height: thumbnailSize(project.aspect)[1],
                  samples: 4,
                  playing: false,
                }),
                controller.signal,
              );
              images[thumbnailKey(project, k)] = image.toDataURL(
                "image/jpeg",
                0.75,
              );
            }
            if (!controller.signal.aborted)
              setThumbnails((t) =>
                Object.fromEntries(
                  project.shots
                    .flatMap((s) => s.keys)
                    .map((k) => {
                      const key = thumbnailKey(project, k);
                      return [key, images[key] ?? t[key]];
                    })
                    .filter(([, image]) => image),
                ),
              );
          } catch (e) {
            if ((e as Error).name !== "AbortError")
              setStatus("缩略图尚未就绪，可继续摄影");
          } finally {
            if (runtime.current === rt) resume();
          }
        })(),
      150,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (thumbnailAbort.current === controller) thumbnailAbort.current = null;
    };
  }, [mode, ready, busy, playing, count, samples, project, pose]);
  const switchMode = (value: "photo" | "video") => {
    materializeCamera();
    stopMotion();
    setMode(value);
    setSelectInterest(false);
    if (value === "video") seek(time);
    else setLive(true);
  };
  const [a, b] = project.aspect.split(":").map(Number);
  return (
    <main className={`director ${theme} ${mode}`}>
      <header>
        <a
          className="brand"
          href={directorBasePath(location.pathname) ?? "/"}
          aria-label="返回资源 Viewer"
        >
          <img className="brand-lockup" src={logo} alt="Metaflow" />
        </a>
        <span className="brand-beta">beta</span>
        <nav>
          <button
            data-tooltip="Undo · ⌘Z"
            aria-label="撤销"
            disabled={busy || !undo.current.length}
            onClick={() => restore(true)}
          >
            <Undo2 size={18} />
          </button>
          <button
            data-tooltip="Redo · ⇧⌘Z"
            aria-label="重做"
            disabled={busy || !redo.current.length}
            onClick={() => restore(false)}
          >
            <Redo2 size={18} />
          </button>
          <button
            data-tooltip={muted ? "Sound on" : "Mute"}
            aria-label={muted ? "开启控件声音" : "静音"}
            onClick={() => setMute(!muted)}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button
            data-tooltip="Appearance"
            aria-label="切换明暗主题"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          <button
            data-tooltip="Help"
            aria-label="摄影帮助"
            onClick={() => setHelp(true)}
          >
            <HelpCircle size={19} />
          </button>
          <a
            className="viewer-link"
            href={directorBasePath(location.pathname) ?? "/"}
          >
            <ArrowLeft size={16} />
            返回 Viewer
          </a>
        </nav>
      </header>
      <section className="view-area">
        <div className="view-scene">
          <div
            className="view-frame"
            style={{
              aspectRatio: project.aspect.replace(":", " / "),
              width: `min(100cqw, calc((100cqh - 34px) * ${a / b}))`,
            }}
          >
            <div
              className="view-fit"
              ref={stage}
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={pointerUp}
              onPointerCancel={(e) => {
                pointers.current.clear();
                cancelGesture();
              }}
              onLostPointerCapture={(e) => {
                if (pointers.current.has(e.pointerId)) cancelGesture();
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              <canvas ref={canvas} aria-label="资源摄影取景框" />
              {!ready && !error && (
                <div className="loading">
                  <span className="spinner" />
                  {status}
                  {deviceSlow && (
                    <div className="startup-actions">
                      <button onClick={() => setRetry((v) => v + 1)}>
                        重新尝试
                      </button>
                      <a href={directorBasePath(location.pathname) ?? "/"}>
                        返回 Viewer
                      </a>
                    </div>
                  )}
                </div>
              )}
              {focusMark && (
                <span
                  key={focusMark.id}
                  className="focus-reticle source-focus-reticle"
                  style={{
                    left: `${focusMark.x * 100}%`,
                    top: `${focusMark.y * 100}%`,
                  }}
                >
                  {["top-left", "top-right", "bottom-right", "bottom-left"].map(
                    (c) => (
                      <span
                        key={c}
                        className={`focus-reticle-corner is-${c}`}
                      />
                    ),
                  )}
                  <span className="focus-reticle-circle" />
                  <span className="focus-reticle-cross" />
                </span>
              )}
              {selectInterest && (
                <InterestSelector
                  ready={selectionReady}
                  selections={shot?.interestAreas ?? []}
                  onSelect={interest}
                  onCancel={closeSelection}
                />
              )}
            </div>
            <div className="view-feedback" aria-live="polite">
              <AnimatePresence>
                {focusHint && !selectInterest && (
                  <motion.div
                    className="focus-instruction"
                    initial={{ opacity: 0, y: 5, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.94 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Focus size={12} />
                    {focusHint}
                  </motion.div>
                )}
              </AnimatePresence>
              {ready && (
                <span className="render-status" aria-live="off">
                  {error
                    ? "画面已暂停"
                    : original
                      ? "原图对照"
                      : displayedFast
                        ? "调整预览"
                        : `${count >= samples ? "已收敛" : "渐进成片"} · ${Math.min(count, samples)}/${samples}`}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>
      {error && (
        <div className="error" role="alert">
          <strong>摄影暂不可用</strong>
          <p>{error}</p>
          {!ready ? (
            <button onClick={() => setRetry((v) => v + 1)}>重新加载</button>
          ) : (
            <button
              onClick={() => {
                if (runtime.current?.needsDeviceRecovery && resource) {
                  end();
                  stopMotion();
                  recovery.current = {
                    resourceId: resource.resource.id,
                    files: JSON.stringify(resource.resource.files),
                    snapshot: structuredClone(ref.current),
                    selected,
                    dirty,
                  };
                  setCount(0);
                  setRetry((v) => v + 1);
                } else {
                  setError("");
                  resume();
                }
              }}
            >
              {runtime.current?.needsDeviceRecovery
                ? "重新创建图形设备"
                : "重试当前画面"}
            </button>
          )}
          <a href={directorBasePath(location.pathname) ?? "/"}>返回 Viewer</a>
        </div>
      )}
      <AnimatePresence>
        {mode === "video" && ready && (
          <VideoTimeline
            project={project}
            workingPose={viewPose(
              pose,
              project,
              time,
              mode === "video" && !live,
              temporaryPose,
            )}
            selected={selected}
            time={time}
            playing={playing}
            busy={busy || !!error}
            thumbnail={(k) => thumbnails[thumbnailKey(project, k)]}
            onSelect={(id, t) => seek(t, id)}
            onDeselect={() => setSelected("")}
            onTime={(t) => seek(t)}
            onPlay={() => {
              togglePlayback();
              if (tutorial === "playback") setTutorial("watch");
            }}
            onUpdate={(fn) => {
              const inGesture = !!gesture.current;
              if (!inGesture) begin();
              const next = structuredClone(ref.current);
              fn(next.project);
              commit(next);
              if (!inGesture) end();
            }}
            onBegin={begin}
            onEnd={end}
            onCancel={cancelGesture}
            onDuplicate={() => {
              if (!shot) return;
              edit((s) => {
                const copy = structuredClone(shot);
                copy.id = uid();
                copy.name += " 副本";
                copy.keys.forEach((k) => (k.id = uid()));
                s.project.shots.splice(
                  s.project.shots.findIndex((v) => v.id === shot.id) + 1,
                  0,
                  copy,
                );
                setSelected(copy.id);
              });
            }}
            onDelete={() => {
              if (!shot) return;
              edit((s) => {
                s.project.shots = s.project.shots.filter(
                  (v) => v.id !== shot.id,
                );
                setSelected(s.project.shots[0]?.id ?? "");
              });
              setTime(0);
              setLive(true);
            }}
            onAdd={() => {
              materializeCamera();
              edit((s) => {
                const added = makeShot(
                  resource!.resource.id,
                  s.pose,
                  `镜头 ${s.project.shots.length + 1}`,
                );
                s.project.shots.push(added);
                setSelected(added.id);
              });
            }}
            onEndpoint={(edge) => {
              if (tutorial === "end" && edge === "end")
                setTutorial("adjust-end");
            }}
            onTransition={(s, edge, anchor) => {
              stopMotion();
              setTransition({ id: s.id, edge, anchor });
            }}
          />
        )}
      </AnimatePresence>
      <footer>
        <CameraBar
          operator={
            <Operator
              active={operatorActive}
              selecting={selectInterest}
              disabled={!ready || busy || !!error || !shot}
              interestCount={shot?.interestPoints?.length ?? 0}
              onPrimary={() => {
                if (!operatorActive) {
                  materializeCamera();
                  operatorBase.current = structuredClone(ref.current.pose);
                  setOperatorActive(true);
                  if (tutorial === "operator") setTutorial("compose");
                } else {
                  compose();
                  if (tutorial === "compose" || tutorial === "final-compose") {
                    tutorialAfterPlay.current =
                      tutorial === "compose" ? "interest" : null;
                    setTutorial(null);
                  }
                }
              }}
              onInterest={() => {
                enterSelection();
                if (tutorial === "interest") setTutorial("interest-area");
              }}
              onClose={() => {
                closeSelection();
                setOperatorActive(false);
              }}
              onClearInterest={() => {
                const clear = (s: Snapshot) => {
                  const sh = s.project.shots.find((v) => v.id === selected);
                  if (sh) {
                    sh.interestPoints = [];
                    sh.interestAreas = [];
                  }
                };
                if (selectionBase.current) {
                  selectionPick.current++;
                  undo.current.push(structuredClone(ref.current));
                  redo.current = [];
                  const next = structuredClone(ref.current);
                  clear(next);
                  commit(next);
                  setHistoryVersion((v) => v + 1);
                } else edit(clear);
              }}
            />
          }
          pose={viewPose(
            pose,
            project,
            time,
            mode === "video" && !live,
            temporaryPose,
          )}
          project={project}
          mode={mode}
          busy={busy}
          ready={ready && !error}
          original={original}
          onOriginal={() => setOriginal((v) => !v)}
          onPeaking={setPeaking}
          onMode={(m) => {
            switchMode(m);
            setTutorial(
              m === "video" && !tutorialDismissed.current ? "start" : null,
            );
          }}
          onPose={patchPose}
          onProject={(patch) => edit((s) => Object.assign(s.project, patch))}
          onBegin={beginCamera}
          onEnd={end}
          onCancel={cancelGesture}
          onCapture={save}
          onFocus={(manual) => {
            setFocusHint(manual ? "Click to set focus" : "");
            if (manual) setFocusMark(null);
          }}
          output={{ resolution, fps, samples, photoFormat, videoFormat }}
          onOutput={(patch) => {
            if (patch.resolution !== undefined) setResolution(patch.resolution);
            if (patch.fps !== undefined) setFps(patch.fps);
            if (patch.samples !== undefined) setSamples(patch.samples);
            if (patch.photoFormat) setPhotoFormat(patch.photoFormat);
            if (patch.videoFormat) setVideoFormat(patch.videoFormat);
          }}
        />
      </footer>
      <TooltipLayer />
      <p className="status-note" role="status">
        {status}
      </p>
      {mode === "video" && ready && (
        <VideoTutorial
          step={tutorial}
          onClose={() => {
            setTutorial(null);
            if (gesture.current) cancelGesture();
            else closeSelection();
            tutorialDismissed.current = true;
          }}
        />
      )}
      {help && (
        <Modal label="摄影帮助" onDismiss={() => setHelp(false)}>
          <button
            className="close"
            aria-label="关闭帮助"
            onClick={() => setHelp(false)}
          >
            <X />
          </button>
          <h2>资源摄影</h2>
          <p>
            此页面只使用当前资源及其环境。点击画面对焦会切换为
            MF；手动对焦可从近端连续调整到 ∞。
          </p>
          <p>
            调整时使用快速高斯预览及红色光学参考，停下后以圆孔径累积收敛到所选精细度。两者焦外形状可能有差别；照片与视频逐帧使用完整采样，复杂场景可能需要较长时间。
          </p>
          <p>
            视频：添加镜头、保存机位、拖动调整时长，点击镜头间的小方块设置转场。␣
            播放 / 暂停，⌘Z 撤销。
          </p>
          <p>
            刷新会重新载入资源，页面内镜头不会保存为工程。原资源文件不会被修改。
          </p>
        </Modal>
      )}
      <AnimatePresence>
        {transition &&
          runtime.current &&
          project.shots.some((s) => s.id === transition.id) && (
            <TransitionMenu
              key={`${transition.id}-${transition.edge}`}
              project={project}
              shotId={transition.id}
              edge={transition.edge}
              anchor={transition.anchor}
              renderFrame={(t, signal) =>
                runtime.current!.capture(
                  frame({
                    time: t,
                    video: true,
                    width: 260,
                    height: 146,
                    samples: 4,
                    playing: false,
                  }),
                  signal,
                )
              }
              onBegin={begin}
              onEnd={end}
              onCancel={cancelGesture}
              onChange={(value) => {
                const inGesture = !!gesture.current;
                if (!inGesture) begin();
                const s = structuredClone(ref.current);
                const sh = s.project.shots.find((v) => v.id === transition.id)!;
                if (transition.edge === "in") sh.transition = value;
                else sh.exitTransition = value;
                commit(s);
                if (!inGesture) end();
              }}
              onClose={() => {
                setTransition(null);
                resume();
              }}
            />
          )}
      </AnimatePresence>
      {busy && (
        <Modal
          label="正在导出"
          dismissOutside={false}
          onDismiss={() => abort.current?.abort()}
        >
          <span className="spinner" />
          <h2>正在生成成片</h2>
          <p>{progress}</p>
          <p>保持此页面打开；每帧使用完整的 {samples} 个孔径样本。</p>
          <button onClick={() => abort.current?.abort()}>取消导出</button>
        </Modal>
      )}
    </main>
  );
}
