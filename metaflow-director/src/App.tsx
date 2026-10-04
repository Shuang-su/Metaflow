import { useEffect, useRef, useState, type PointerEvent as PE } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Sun,
  Moon,
  HelpCircle,
  Target,
  Focus,
  SlidersHorizontal,
  Scan,
  Shuffle,
  Maximize,
  Eye,
  Camera,
  Video,
  X,
  Volume2,
  VolumeX,
  Plus,
} from "lucide-react";
import { ResourceRuntime, type FrameState } from "./render/runtime";
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
  outputSize,
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
  manualFocusValue,
  manualFocusPatch,
  blurLabel,
  zoomLabel,
} from "./core/camera-controls";
import { composeViewPose } from "./core/compose-view";
import { exportVideo, preflight } from "./core/encoder";
import { RotationDial, LensRuler } from "./Dials";
import { VideoTimeline } from "./VideoTimeline";
import { InterestSelector, type InterestArea } from "./InterestSelector";
import { setSoundMuted } from "./core/sounds";
type Snapshot = { pose: Pose; project: Project };
const initial: Snapshot = {
  pose: structuredClone(DEFAULT_POSE),
  project: createProject(),
};
const buttonMotion = {
  initial: { opacity: 0, scale: 0.85, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.9, y: 6 },
  transition: { duration: 0.18 },
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
  const [resource, setResource] = useState<ResourceScene | null>(null),
    [status, setStatus] = useState("正在准备摄影页面…"),
    [ready, setReady] = useState(false),
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
    [panel, setPanel] = useState<string | null>(null),
    [muted, setMute] = useState(true);
  const [resolution, setResolution] = useState(1080),
    [fps, setFps] = useState(30),
    [photoFormat, setPhotoFormat] = useState<"png" | "jpeg">("png"),
    [videoFormat, setVideoFormat] = useState<"mp4" | "webm">("mp4");
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [dirty, setDirty] = useState(false),
    [tutorial, setTutorial] = useState(true),
    [help, setHelp] = useState(false);
  const [focusMark, setFocusMark] = useState<{
      x: number;
      y: number;
      id: number;
    } | null>(null),
    [selectInterest, setSelectInterest] = useState(false),
    [transition, setTransition] = useState<{
      id: string;
      edge: "in" | "out";
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
    wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  });
  current.current = { mode, time, playing, live, size, samples, busy, ready };
  const commit = (next: Snapshot) => {
    ref.current = next;
    setSnapshot(next);
    setDirty(true);
  };
  const stopMotion = () => {
    intent.current++;
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
    setPlaying(false);
  };
  const begin = () => {
    stopMotion();
    if (!gesture.current) gesture.current = structuredClone(ref.current);
  };
  const end = () => {
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
  const patchPose = (patch: Partial<Pose>) =>
    updatePose({ ...ref.current.pose, ...patch });
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
    pose: structuredClone(ref.current.pose),
    time: current.current.time,
    video: current.current.mode === "video" && !current.current.live,
    width: current.current.size[0],
    height: current.current.size[1],
    samples: current.current.samples,
    playing: current.current.playing,
    ...options,
  });
  const resume = () => {
    if (
      runtime.current &&
      current.current.ready &&
      !current.current.busy &&
      !document.hidden
    )
      runtime.current.request(frame());
  };
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
      const p = createProject();
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
      p.shots = [makeShot(loaded.resource.id, loaded.pose, "镜头 1")];
      owned = await ResourceRuntime.create(
        canvas.current!,
        loaded.assets,
        loaded.pose,
        loaded.background,
        (_s, n) => setCount(n),
        (e) => {
          setError((e as Error).message);
          setPlaying(false);
        },
      );
      if (controller.signal.aborted) {
        await owned.dispose();
        return;
      }
      runtime.current = owned;
      loaded.assets = [];
      setResource(loaded);
      const next = { pose: loaded.pose, project: p };
      ref.current = next;
      setSnapshot(next);
      setSelected(p.shots[0].id);
      setReady(true);
      setDirty(false);
      setStatus(
        loaded.cameraSource === "viewer"
          ? "已承接 Viewer 当前机位"
          : "已载入资源 JSON 初始机位",
      );
    })().catch((e) => {
      if (e.name !== "AbortError") setError(e.message);
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
    if (ready && !busy && runtime.current) runtime.current.request(frame());
  }, [snapshot, time, live, playing, size, samples, ready, busy, mode]);
  useEffect(() => {
    if (!playing) return;
    const start = performance.now(),
      offset = time;
    let id = 0;
    const tick = (now: number) => {
      const t = offset + (now - start) / 1000,
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
        cancelGesture();
        setPanel(null);
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
        setLive(false);
        setPlaying((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
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
    stopMotion();
    const request = ++intent.current;
    setFocusMark({ x, y, id: request });
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
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (request <= intent.current) resume();
      setTimeout(
        () => setFocusMark((m) => (m?.id === request ? null : m)),
        850,
      );
    }
  };
  const pointerDown = (e: PE<HTMLDivElement>) => {
    if (!ready || busy || selectInterest) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (!pointers.current.size) {
      begin();
      drag.current = { x: e.clientX, y: e.clientY, moved: false, pinch: false };
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
      begin();
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
  const compose = () => {
    if (!shot || busy) return;
    begin();
    const start = structuredClone(ref.current.pose),
      index = composeIndex.current++,
      points = shot.interestPoints ?? [],
      base = points.length
        ? { ...start, focusPoint: points[index % points.length] }
        : start,
      target = composeViewPose(base, index);
    const started = performance.now(),
      version = intent.current;
    const tick = (now: number) => {
      if (intent.current !== version) return;
      const t = clamp((now - started) / 600, 0, 1),
        ease = 1 - (1 - t) ** 3;
      commit({ ...ref.current, pose: interpolatePose(start, target, ease) });
      setLive(true);
      if (t < 1) animation.current = requestAnimationFrame(tick);
      else {
        animation.current = null;
        end();
      }
    };
    animation.current = requestAnimationFrame(tick);
  };
  const interest = async (area: InterestArea, index: number) => {
    const request = ++intent.current;
    const hit = await runtime.current?.pick(
      area.x + area.width / 2,
      area.y + area.height / 2,
    );
    if (request !== intent.current || !hit) {
      resume();
      return false;
    }
    edit((s) => {
      const shot = s.project.shots.find((v) => v.id === selected)!;
      shot.interestAreas ??= [];
      shot.interestPoints ??= [];
      shot.interestAreas[index] = area;
      shot.interestPoints[index] = hit.point as Pose["target"];
    });
    resume();
    return true;
  };
  const save = async () => {
    if (!runtime.current || busy) return;
    stopMotion();
    setPanel(null);
    setBusy(true);
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
        if (!(await preflight(settings)))
          throw Error("当前设备不支持所选视频尺寸、帧率或编码，请选择可用组合");
        const blob = await exportVideo(
          settings,
          totalDuration(project.shots),
          (t) =>
            runtime.current!.capture(
              { ...base, time: t, video: true },
              controller.signal,
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
        .filter((k) => !thumbnails[k.id + JSON.stringify(k.pose)]);
    if (!pending.length) return;
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
                  width: 160,
                  height: 90,
                  samples: 4,
                  playing: false,
                }),
                controller.signal,
              );
              images[k.id + JSON.stringify(k.pose)] = image.toDataURL(
                "image/jpeg",
                0.75,
              );
            }
            if (!controller.signal.aborted)
              setThumbnails((t) => ({ ...t, ...images }));
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
    };
  }, [mode, ready, busy, playing, count, samples, project, pose]);
  const showPanel = (name: string) =>
    setPanel((v) => (v === name ? null : name));
  const switchMode = (value: "photo" | "video") => {
    stopMotion();
    setMode(value);
    setPanel(null);
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
          <span className="brand-bars" />
          Metaflow
        </a>
        <div className="resource-title">
          <strong>{resource?.resource.title ?? "资源摄影"}</strong>
          <span>Director 实验版</span>
        </div>
        <nav>
          <button
            title="撤销 ⌘Z"
            aria-label="撤销"
            disabled={busy || !undo.current.length}
            onClick={() => restore(true)}
          >
            <Undo2 size={18} />
          </button>
          <button
            title="重做 ⇧⌘Z"
            aria-label="重做"
            disabled={busy || !redo.current.length}
            onClick={() => restore(false)}
          >
            <Redo2 size={18} />
          </button>
          <button
            aria-label={muted ? "开启控件声音" : "静音"}
            onClick={() => setMute(!muted)}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button
            aria-label="切换明暗主题"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          <button aria-label="摄影帮助" onClick={() => setHelp(true)}>
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
        <div
          className="view-fit"
          style={{
            aspectRatio: project.aspect.replace(":", " / "),
            width: `min(100%,calc((100dvh - ${mode === "video" ? (compact ? "490px" : "420px") : compact ? "330px" : "250px"}) * ${a / b}))`,
          }}
          ref={stage}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={(e) => {
            pointers.current.clear();
            cancelGesture();
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <canvas ref={canvas} aria-label="资源摄影取景框" />
          {!ready && !error && (
            <div className="loading">
              <span className="spinner" />
              {status}
            </div>
          )}
          {ready && (
            <span className="render-status" aria-live="off">
              {count >= samples ? "已收敛" : "渐进成片"} ·{" "}
              {Math.min(count, samples)}/{samples}
            </span>
          )}
          <AnimatePresence>
            {focusMark && (
              <motion.div
                key={focusMark.id}
                className="focus-marker"
                style={{
                  left: focusMark.x * 100 + "%",
                  top: focusMark.y * 100 + "%",
                }}
                initial={{ scale: 1.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.22 }}
              >
                <Focus size={36} />
              </motion.div>
            )}
          </AnimatePresence>
          {selectInterest && (
            <InterestSelector
              selections={shot?.interestAreas ?? []}
              onSelect={interest}
              onCancel={() => setSelectInterest(false)}
            />
          )}
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
                setError("");
                resume();
              }}
            >
              重试当前画面
            </button>
          )}
          <a href={directorBasePath(location.pathname) ?? "/"}>返回 Viewer</a>
        </div>
      )}
      {ready && (
        <div className="compose-tools">
          <button disabled={busy || !shot} onClick={compose}>
            <Shuffle size={16} />
            构图
          </button>
          <button
            className={selectInterest ? "active" : ""}
            disabled={busy || !shot}
            onClick={() => {
              stopMotion();
              setSelectInterest(!selectInterest);
            }}
          >
            <Scan size={17} />
            兴趣区域
            {shot?.interestPoints?.length
              ? ` · ${shot.interestPoints.length}`
              : ""}
          </button>
          {selectInterest && (
            <>
              <button
                onClick={() =>
                  edit((s) => {
                    const sh = s.project.shots.find((v) => v.id === selected)!;
                    sh.interestAreas = [];
                    sh.interestPoints = [];
                  })
                }
              >
                清除
              </button>
              <button onClick={() => setSelectInterest(false)}>完成</button>
            </>
          )}
        </div>
      )}
      <AnimatePresence>
        {mode === "video" && ready && (
          <VideoTimeline
            project={project}
            workingPose={pose}
            selected={selected}
            time={time}
            playing={playing}
            busy={busy}
            thumbnail={(k) => thumbnails[k.id + JSON.stringify(k.pose)]}
            onSelect={(id, t) => seek(t, id)}
            onDeselect={() => setSelected("")}
            onTime={(t) => seek(t)}
            onPlay={() => {
              setLive(false);
              if (time >= totalDuration(project.shots)) setTime(0);
              setPlaying((v) => !v);
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
            onAdd={() =>
              edit((s) => {
                const added = makeShot(
                  resource!.resource.id,
                  s.pose,
                  `镜头 ${s.project.shots.length + 1}`,
                );
                s.project.shots.push(added);
                setSelected(added.id);
              })
            }
            onTransition={(s, edge) => setTransition({ id: s.id, edge })}
          />
        )}
      </AnimatePresence>
      <footer>
        <div className="mode-controls">
          <div className="mode-switch">
            <button
              className={mode === "photo" ? "active" : ""}
              disabled={busy}
              onClick={() => switchMode("photo")}
            >
              PHOTO
            </button>
            <button
              className={mode === "video" ? "active" : ""}
              disabled={busy}
              onClick={() => switchMode("video")}
            >
              VIDEO
            </button>
          </div>
          <div className="axes">
            {(["X", "Y", "Z"] as const).map((axis, i) => (
              <RotationDial
                key={axis}
                axis={axis}
                value={pose[(["pitch", "yaw", "roll"] as const)[i]]}
                disabled={!ready || busy}
                onBegin={begin}
                onEnd={end}
                onChange={(v) =>
                  patchPose({
                    [(["pitch", "yaw", "roll"] as const)[i]]: v,
                    continuousRotation: true,
                  })
                }
              />
            ))}
          </div>
        </div>
        <div className="photography-controls" aria-label="摄影控制条">
          <button
            disabled={!ready || busy}
            title="AF / MF"
            aria-label="切换自动与手动对焦"
            onClick={() => {
              edit((s) => {
                s.pose = changeControls(s.pose, {
                  focusMode: c.focusMode === "auto" ? "manual" : "auto",
                });
                s.pose.focusInfinity = false;
              });
              setLive(true);
              setStatus(
                c.focusMode === "auto"
                  ? "点击画面选择焦点"
                  : "自动对焦到取景目标",
              );
            }}
          >
            <AnimatePresence mode="wait">
              <motion.b
                key={c.focusMode}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
              >
                {c.focusMode === "manual" ? "MF" : "AF"}
              </motion.b>
            </AnimatePresence>
          </button>
          <button
            disabled={!ready || busy}
            title="手动对焦 · 最近至无穷远"
            aria-label="手动对焦距离"
            className={panel === "focus" ? "active" : ""}
            onClick={() => showPanel("focus")}
          >
            <Focus size={21} />
          </button>
          <button
            disabled={!ready || busy}
            title="光圈"
            aria-label="光圈"
            className={panel === "aperture" ? "active" : ""}
            onClick={() => showPanel("aperture")}
          >
            <i className="aperture-glyph">ƒ</i>
          </button>
          <button
            disabled={!ready || busy}
            title="Zoom"
            aria-label="Zoom"
            className={panel === "zoom" ? "active" : ""}
            onClick={() => showPanel("zoom")}
          >
            {zoomLabel(c.zoom, c.zoomBaseline)}
          </button>
          <button
            disabled={!ready || busy}
            title="视角"
            aria-label="Field of View"
            className={panel === "fov" ? "active" : ""}
            onClick={() => showPanel("fov")}
          >
            <Maximize size={21} />
          </button>
          <button
            disabled={!ready || busy}
            title="原始清晰画面对照"
            aria-label="切换原始画面对照"
            className={!pose.dof ? "active" : ""}
            onClick={() => {
              edit((s) => {
                s.pose.dof = !s.pose.dof;
              });
              setLive(true);
            }}
          >
            <Eye size={21} />
          </button>
          <button
            disabled={busy}
            title="画幅"
            aria-label="画幅比例"
            className={panel === "aspect" ? "active" : ""}
            onClick={() => showPanel("aspect")}
          >
            {project.aspect}
          </button>
          <button
            disabled={busy}
            title="输出设置"
            aria-label="输出设置"
            className={panel === "output" ? "active" : ""}
            onClick={() => showPanel("output")}
          >
            <SlidersHorizontal size={20} />
          </button>
          <button
            className={`shutter ${mode}`}
            disabled={!ready || busy || !!error}
            onClick={save}
            aria-label={mode === "photo" ? "拍摄照片" : "导出视频"}
          >
            {mode === "photo" ? (
              <Camera size={23} />
            ) : (
              <>
                <span />
                REC
              </>
            )}
          </button>
        </div>
        <AnimatePresence>
          {panel && (
            <motion.div
              className="settings-popover"
              role="dialog"
              aria-label={panel}
              {...buttonMotion}
            >
              <div className="popover-title">
                <strong>
                  {
                    {
                      focus: "手动对焦",
                      aperture: "光圈",
                      zoom: "Zoom",
                      fov: "Field of View",
                      aspect: "画幅比例",
                      output: "输出设置",
                    }[panel]
                  }
                </strong>
                <button aria-label="关闭设置" onClick={() => setPanel(null)}>
                  <X size={16} />
                </button>
              </div>
              {["focus", "aperture", "zoom", "fov"].includes(panel) && (
                <>
                  <output>
                    {panel === "aperture"
                      ? blurLabel(c.blurAmount)
                      : panel === "zoom"
                        ? zoomLabel(c.zoom, c.zoomBaseline)
                        : panel === "fov"
                          ? `${c.perspective > 0 ? "+" : ""}${Math.round(c.perspective)}`
                          : pose.focusInfinity
                            ? "∞"
                            : pose.focus.toPrecision(3) + " 场景单位"}
                  </output>
                  <LensRuler
                    key={panel}
                    label={
                      {
                        focus: "对焦距离",
                        aperture: "光圈",
                        zoom: "Zoom",
                        fov: "Field of View",
                      }[panel]
                    }
                    value={
                      panel === "focus"
                        ? manualFocusValue(pose)
                        : panel === "aperture"
                          ? c.blurAmount
                          : panel === "zoom"
                            ? c.zoom
                            : c.perspective
                    }
                    min={panel === "zoom" ? 50 : panel === "fov" ? -100 : 0}
                    max={panel === "zoom" ? 500 : 100}
                    onBegin={begin}
                    onEnd={end}
                    onChange={(v) => {
                      if (panel === "focus")
                        patchPose(manualFocusPatch(ref.current.pose, v));
                      else
                        control({
                          [panel === "aperture"
                            ? "blurAmount"
                            : panel === "zoom"
                              ? "zoom"
                              : "perspective"]: v,
                        });
                    }}
                  />
                  {panel === "focus" && (
                    <div className="scale-labels">
                      <span>最近</span>
                      <span>∞</span>
                    </div>
                  )}
                </>
              )}
              {panel === "aspect" && (
                <div className="choices">
                  {["16:9", "9:16", "4:3", "4:5", "1:1"].map((v) => (
                    <button
                      key={v}
                      className={project.aspect === v ? "active" : ""}
                      onClick={() =>
                        edit((s) => {
                          s.project.aspect = v;
                        })
                      }
                    >
                      {v}
                    </button>
                  ))}
                </div>
              )}
              {panel === "output" && (
                <>
                  <label>
                    分辨率
                    <select
                      value={resolution}
                      onChange={(e) => setResolution(+e.target.value)}
                    >
                      {[720, 1080, 2160].map((v) => (
                        <option key={v} value={v}>
                          {v === 2160 ? "4K" : v + "p"} ·{" "}
                          {outputSize(project.aspect, v).join(" × ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    精细度
                    <select
                      value={samples}
                      onChange={(e) => setSamples(+e.target.value)}
                    >
                      {[128, 256, 512].map((v) => (
                        <option key={v} value={v}>
                          {v} 孔径样本
                        </option>
                      ))}
                    </select>
                  </label>
                  {mode === "photo" ? (
                    <label>
                      照片格式
                      <select
                        value={photoFormat}
                        onChange={(e) => setPhotoFormat(e.target.value as any)}
                      >
                        <option value="png">PNG</option>
                        <option value="jpeg">JPEG</option>
                      </select>
                    </label>
                  ) : (
                    <>
                      <label>
                        帧率
                        <select
                          value={fps}
                          onChange={(e) => setFps(+e.target.value)}
                        >
                          {[24, 30, 60].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        视频格式
                        <select
                          value={videoFormat}
                          onChange={(e) =>
                            setVideoFormat(e.target.value as any)
                          }
                        >
                          <option value="mp4">MP4 / H.264</option>
                          <option value="webm">WebM / VP9</option>
                        </select>
                      </label>
                    </>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </footer>
      <p className="status-note" role="status">
        {status}
      </p>
      {tutorial && ready && (
        <aside className="tutorial">
          <strong>把三维场景带回来重新摄影</strong>
          <p>拖动环绕 · ⇧拖动平移 · 滚轮移动机位 · 双指缩放</p>
          <p>
            点击画面对焦，调节 ƒ 控制虚化。视频模式中保存机位，再导出镜头运动。
          </p>
          <button onClick={() => setTutorial(false)}>知道了，关闭教程</button>
        </aside>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section className="modal" onClick={(e) => e.stopPropagation()}>
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
              操作中先显示 4
              个孔径样本，停下后收敛到所选精细度。照片与视频逐帧使用完整采样，复杂场景可能需要较长时间。
            </p>
            <p>
              视频：添加镜头、保存机位、拖动调整时长，点击镜头间的小方块设置转场。␣
              播放 / 暂停，⌘Z 撤销。
            </p>
            <p>
              刷新会重新载入资源，页面内镜头不会保存为工程。原资源文件不会被修改。
            </p>
          </section>
        </div>
      )}
      {transition && (
        <div className="modal-backdrop" onClick={() => setTransition(null)}>
          <section
            className="modal"
            role="dialog"
            aria-label="镜头转场"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="关闭转场"
              onClick={() => setTransition(null)}
            >
              <X />
            </button>
            <h2>{transition.edge === "in" ? "入场" : "出场"}转场</h2>
            {(() => {
              const sh = project.shots.find((s) => s.id === transition.id)!;
              const value =
                transition.edge === "in"
                  ? sh.transition
                  : (sh.exitTransition ?? { kind: "cut", duration: 0.5 });
              const change = (patch: Partial<Transition>) =>
                edit((s) => {
                  const sh = s.project.shots.find(
                    (v) => v.id === transition.id,
                  )!;
                  const k =
                    transition.edge === "in" ? "transition" : "exitTransition";
                  sh[k] = { ...value, ...patch };
                });
              return (
                <>
                  <div className="choices">
                    {(["cut", "fade", "push", "zoom"] as const).map((kind) => (
                      <button
                        key={kind}
                        className={value.kind === kind ? "active" : ""}
                        onClick={() => change({ kind })}
                      >
                        {kind.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <div className={`transition-preview ${value.kind}`}>
                    <span>A</span>
                    <span>B</span>
                  </div>
                  <label>
                    时长（秒）
                    <input
                      aria-label="转场时长"
                      type="number"
                      min="0"
                      max={sh.duration / 2}
                      step="0.1"
                      value={value.duration}
                      onChange={(e) =>
                        change({
                          duration: clamp(+e.target.value, 0, sh.duration / 2),
                        })
                      }
                    />
                  </label>
                  {["push", "zoom"].includes(value.kind) && (
                    <label>
                      方向
                      <select
                        value={
                          value.direction ??
                          (value.kind === "push" ? "left" : "in")
                        }
                        onChange={(e) =>
                          change({ direction: e.target.value as any })
                        }
                      >
                        {(value.kind === "push"
                          ? ["left", "right", "up", "down"]
                          : ["in", "out"]
                        ).map((d) => (
                          <option key={d}>{d}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
              );
            })()}
          </section>
        </div>
      )}
      {busy && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-label="正在导出">
            <span className="spinner" />
            <h2>正在生成成片</h2>
            <p>{progress}</p>
            <p>保持此页面打开；每帧使用完整的 {samples} 个孔径样本。</p>
            <button onClick={() => abort.current?.abort()}>取消导出</button>
          </section>
        </div>
      )}
    </main>
  );
}
