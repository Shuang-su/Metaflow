// [study:video-example:start]
import { useCallback, useEffect, useRef, useState } from 'react';
import { createWebGlRefraction } from '../webgl-refraction';
import {
  DEFAULT_MATERIAL,
  type GlassMaterial,
  type WebGlLens,
  type WebGlRefractionController
} from '../types';
import './example.css';

const PLAY_SIZE = 111;
const SIDE_SIZE = 65;
const CONTROL_GAP = 24;
const BAR_HEIGHT = 30;
const BAR_MARGIN = 24;
const BAR_TRACK_PADDING = 14;
const SKIP_SECONDS = 5;

function PlayIcon() {
  return (
    <svg viewBox="-9.86 -5.5 52 52" fill="currentColor" aria-hidden="true">
      <path d="M35.25 24.3575C37.9167 22.8179 37.9167 18.9689 35.25 17.4293L6.00001 0.541836C3.33334 -0.997765 0 0.926732 0 4.00593V37.7809C0 40.8601 3.33334 42.7846 6 41.245L35.25 24.3575Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="5.25" y="2.625" width="4.5" height="18.75" rx="1.125" />
      <rect x="14.25" y="2.625" width="4.5" height="18.75" rx="1.125" />
    </svg>
  );
}

function SkipIcon({ direction }: { direction: 'back' | 'forward' }) {
  return (
    <svg
      className={`readable-video-skip-icon is-${direction}`}
      viewBox="0 0 47 45"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={
          direction === 'back'
            ? 'M6.6 17.4A18 18 0 1 1 19.3 39.4'
            : 'M39.4 17.4A18 18 0 1 0 26.7 39.4'
        }
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d={
          direction === 'back'
            ? 'M5.63 24.55a1 1 0 0 0 1.74 0l3.9-6.75a1 1 0 0 0-.87-1.5H2.6a1 1 0 0 0-.87 1.5l3.9 6.75Z'
            : 'M40.41 24.55a1 1 0 0 1-1.73 0l-3.9-6.75a1 1 0 0 1 .87-1.5h7.79a1 1 0 0 1 .87 1.5l-3.9 6.75Z'
        }
        fill="currentColor"
      />
      <text
        x={direction === 'back' ? 24 : 22}
        y="28.5"
        fill="currentColor"
        fontSize="16"
        fontWeight="500"
        textAnchor="middle"
      >
        15
      </text>
    </svg>
  );
}

function material(
  kind: 'main' | 'side' | 'bar',
  scale: number
): GlassMaterial {
  const values =
    kind === 'main'
      ? {
          depth: 0.16,
          domeDepth: 35,
          edgeStrength: 0.5,
          edgeWidth: 2.5
        }
      : kind === 'side'
        ? {
            depth: 0.14,
            domeDepth: 40,
            edgeStrength: 0.49,
            edgeWidth: 2
          }
        : {
            depth: 0.5,
            domeDepth: 35,
            edgeStrength: 0.25,
            edgeWidth: 2
          };

  return {
    ...DEFAULT_MATERIAL,
    ...values,
    scaleX: scale,
    scaleY: scale,
    chromaAmount: 0,
    blurAmount: 0.3,
    tint: 0.4,
    specularStrength: 1,
    specularRotation: 30,
    glowStrength: 0,
    glowSpread: 0.5,
    glowExponent: 1.5,
    edgeExponent: 1.5
  };
}

function createLenses(
  width: number,
  height: number,
  mobile: boolean,
  pressScales: [number, number, number],
  barStretch = 0
): WebGlLens[] {
  const sizeScale = mobile ? 0.75 : 1;
  const marginScale = mobile ? 0.5 : 1;
  const mainRadius = (PLAY_SIZE * sizeScale) / 2;
  const sideRadius = (SIDE_SIZE * sizeScale) / 2;
  const centerX = width / 2;
  const centerY = height / 2;
  const margin = BAR_MARGIN * marginScale;
  const barWidth = Math.max(0, width - 2 * margin + Math.abs(barStretch));

  const circle = (
    id: string,
    x: number,
    radius: number,
    kind: 'main' | 'side',
    pressScale: number
  ): WebGlLens => ({
    id,
    x,
    y: centerY,
    geometry: {
      lensW: radius,
      lensH: radius,
      borderRadius: radius,
      mapSize: 128
    },
    material: material(kind, kind === 'main' ? 0.07 : 0.04),
    pressScale
  });

  return [
    circle(
      'rewind',
      centerX - mainRadius - CONTROL_GAP - sideRadius,
      sideRadius,
      'side',
      pressScales[0]
    ),
    circle('play', centerX, mainRadius, 'main', pressScales[1]),
    circle(
      'forward',
      centerX + mainRadius + CONTROL_GAP + sideRadius,
      sideRadius,
      'side',
      pressScales[2]
    ),
    {
      id: 'progress',
      shape: 'bar',
      x: centerX + barStretch / 2,
      y: height - margin - BAR_HEIGHT / 2,
      geometry: {
        lensW: barWidth / 2,
        lensH: BAR_HEIGHT / 2,
        borderRadius: BAR_HEIGHT / 2,
        mapSize: 128
      },
      material: material('bar', 0.04)
    }
  ];
}

export function VideoControlsExample() {
  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGlRefractionController | null>(null);
  const pressScalesRef = useRef<[number, number, number]>([1, 1, 1]);
  const draggingRef = useRef(false);
  const resumeAfterSeekRef = useRef(false);
  const firstHoverRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [mobile, setMobile] = useState(false);

  const updateLenses = useCallback(() => {
    const player = playerRef.current;
    const renderer = rendererRef.current;
    if (!player || !renderer) return;
    renderer.updateLenses(
      createLenses(
        player.clientWidth,
        player.clientHeight,
        mobile,
        pressScalesRef.current
      )
    );
  }, [mobile]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!player || !video || !canvas) return;

    const initialise = () => {
      rendererRef.current?.dispose();
      rendererRef.current = createWebGlRefraction({
        canvas,
        source: video,
        lenses: createLenses(
          player.clientWidth,
          player.clientHeight,
          mobile,
          pressScalesRef.current
        ),
        blurAmount: 0.3,
        canvasScale: 1.25,
        adaptStrength: 0.2,
        specLumaLow: 0.3,
        specLumaHigh: 0.7
      });
      rendererRef.current.render();
      setReady(true);
      if (!video.paused) rendererRef.current.start();
    };
    const onLoaded = () => {
      initialise();
      video.muted = true;
      void video.play().catch(() => undefined);
    };
    const onPlay = () => {
      setPlaying(true);
      rendererRef.current?.start();
    };
    const onPause = () => {
      if (!draggingRef.current) {
        setPlaying(false);
        rendererRef.current?.stop();
      }
    };
    const onTime = () => {
      if (!draggingRef.current && Number.isFinite(video.duration)) {
        setProgress(
          video.duration > 0 ? video.currentTime / video.duration : 0
        );
      }
    };
    const resize = new ResizeObserver(() => {
      rendererRef.current?.resize();
      updateLenses();
    });
    resize.observe(player);
    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTime);
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) onLoaded();

    return () => {
      resize.disconnect();
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTime);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [mobile, updateLenses]);

  useEffect(() => {
    updateLenses();
  }, [updateLenses]);

  const press = (index: number, scale: number) => {
    pressScalesRef.current[index] = scale;
    updateLenses();
  };
  const seekBy = (seconds: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(
      0,
      Math.min(video.duration, video.currentTime + seconds)
    );
    rendererRef.current?.render();
  };
  const seekAt = (clientX: number) => {
    const player = playerRef.current;
    const video = videoRef.current;
    if (!player || !video || !Number.isFinite(video.duration)) return;
    const bounds = player.getBoundingClientRect();
    const margin = BAR_MARGIN * (mobile ? 0.5 : 1);
    const start = bounds.left + margin + BAR_TRACK_PADDING;
    const width =
      bounds.width - 2 * margin - 2 * BAR_TRACK_PADDING;
    const next = Math.max(0, Math.min(1, (clientX - start) / width));
    setProgress(next);
    video.currentTime = next * video.duration;
    rendererRef.current?.render();
  };

  const controlsVisible =
    ready && (!firstHoverRef.current || hovered || focused);
  const sizeScale = mobile ? 0.75 : 1;
  const marginScale = mobile ? 0.5 : 1;

  return (
    <div
      ref={playerRef}
      className="readable-example readable-video-stage"
      onMouseEnter={() => {
        firstHoverRef.current = true;
        setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
      onFocus={event => {
        if (event.target instanceof HTMLElement) setFocused(true);
      }}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false);
        }
      }}
    >
      <img
        className="readable-video-placeholder"
        src="/design/demo/videos/cosmos-flowers-in-the-field-18491376/placeholder.webp"
        alt=""
      />
      <video
        ref={videoRef}
        className="readable-video-source"
        src="/design/demo/videos/cosmos-flowers-in-the-field-18491376/video.mp4"
        muted
        autoPlay
        playsInline
        loop
        preload="auto"
      />
      <canvas
        ref={canvasRef}
        className="readable-video-output"
        aria-label="WebGL 视频折射输出"
      />
      <div
        className="readable-video-controls"
        data-visible={controlsVisible}
        style={{ gap: CONTROL_GAP }}
      >
        <button
          type="button"
          className="is-side"
          aria-label={`Rewind ${SKIP_SECONDS} seconds`}
          style={{
            width: SIDE_SIZE * sizeScale,
            height: SIDE_SIZE * sizeScale
          }}
          onPointerDown={() => press(0, 0.8)}
          onPointerUp={() => press(0, 1)}
          onPointerCancel={() => press(0, 1)}
          onClick={() => seekBy(-SKIP_SECONDS)}
        >
          <SkipIcon direction="back" />
        </button>
        <button
          type="button"
          className="is-main"
          aria-label={playing ? 'Pause' : 'Play'}
          style={{
            width: PLAY_SIZE * sizeScale,
            height: PLAY_SIZE * sizeScale
          }}
          onPointerDown={() => press(1, 0.8)}
          onPointerUp={() => press(1, 1)}
          onPointerCancel={() => press(1, 1)}
          onClick={() => {
            const video = videoRef.current;
            if (!video) return;
            if (video.paused) void video.play();
            else video.pause();
          }}
        >
          <span className="readable-video-play-pause">
            {playing ? <PauseIcon /> : <PlayIcon />}
          </span>
        </button>
        <button
          type="button"
          className="is-side"
          aria-label={`Forward ${SKIP_SECONDS} seconds`}
          style={{
            width: SIDE_SIZE * sizeScale,
            height: SIDE_SIZE * sizeScale
          }}
          onPointerDown={() => press(2, 0.8)}
          onPointerUp={() => press(2, 1)}
          onPointerCancel={() => press(2, 1)}
          onClick={() => seekBy(SKIP_SECONDS)}
        >
          <SkipIcon direction="forward" />
        </button>
      </div>
      <div
        className="readable-video-bar"
        data-visible={controlsVisible}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        tabIndex={0}
        style={{
          right: BAR_MARGIN * marginScale,
          bottom: BAR_MARGIN * marginScale,
          left: BAR_MARGIN * marginScale,
          height: BAR_HEIGHT,
          paddingInline: BAR_TRACK_PADDING
        }}
        onPointerDown={event => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          draggingRef.current = true;
          const video = videoRef.current;
          resumeAfterSeekRef.current = Boolean(video && !video.paused);
          video?.pause();
          rendererRef.current?.start();
          seekAt(event.clientX);
        }}
        onPointerMove={event => {
          if (draggingRef.current) seekAt(event.clientX);
        }}
        onPointerUp={event => {
          if (!draggingRef.current) return;
          draggingRef.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
          if (resumeAfterSeekRef.current) {
            void videoRef.current?.play();
          } else {
            rendererRef.current?.stop();
          }
          resumeAfterSeekRef.current = false;
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
          resumeAfterSeekRef.current = false;
          rendererRef.current?.stop();
        }}
        onKeyDown={event => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
            return;
          }
          event.preventDefault();
          seekBy(event.key === 'ArrowLeft' ? -5 : 5);
        }}
      >
        <div className="readable-video-track">
          <div
            className="readable-video-progress"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
// [study:video-example:end]
