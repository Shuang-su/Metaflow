// [study:video-example:start]
import { AnimatePresence, animate, motion } from 'motion/react';
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
const MAIN_PRESS_TRANSITION = {
  type: 'spring',
  stiffness: 500,
  damping: 32
} as const;
const SIDE_PRESS_TRANSITION = {
  type: 'spring',
  stiffness: 1000,
  damping: 40,
  mass: 1.5
} as const;
const ICON_TRANSITION = {
  type: 'spring',
  mass: 0.02,
  stiffness: 10,
  damping: 0.5,
  velocity: 1
} as const;

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
  const back = direction === 'back';
  return (
    <svg
      className={`readable-video-skip-icon is-${direction}`}
      viewBox="0 0 47 45"
      fill="none"
      style={{ transform: `translate(${back ? -1 : 1}px, 1px)` }}
      aria-hidden="true"
    >
      <path
        d={back
          ? 'M17.7049 17.1654L13.5649 20.2254V18.1454L17.8649 14.9454H19.5449V29.0454H17.7049V17.1654ZM27.2205 29.3454C26.1805 29.3454 25.2939 29.1454 24.5605 28.7454C23.8405 28.3321 23.2939 27.7854 22.9205 27.1054C22.5472 26.4254 22.3605 25.6721 22.3605 24.8454H24.2405C24.2672 25.4321 24.4072 25.9454 24.6605 26.3854C24.9139 26.8121 25.2605 27.1454 25.7005 27.3854C26.1405 27.6121 26.6339 27.7254 27.1805 27.7254C27.8339 27.7254 28.3939 27.5921 28.8605 27.3254C29.3405 27.0587 29.7072 26.6854 29.9605 26.2054C30.2139 25.7121 30.3405 25.1387 30.3405 24.4854C30.3405 23.8587 30.2072 23.3121 29.9405 22.8454C29.6739 22.3787 29.3005 22.0187 28.8205 21.7654C28.3539 21.4987 27.8272 21.3654 27.2405 21.3654C26.6139 21.3654 26.0539 21.5187 25.5605 21.8254C25.0672 22.1187 24.7139 22.5254 24.5005 23.0454H22.5005L23.2605 14.9454H31.7405V16.6054H24.8605L24.4405 21.0654C24.7339 20.6921 25.1339 20.3854 25.6405 20.1454C26.1605 19.8921 26.7939 19.7654 27.5405 19.7654C28.3805 19.7654 29.1605 19.9587 29.8805 20.3454C30.6005 20.7321 31.1805 21.2854 31.6205 22.0054C32.0605 22.7121 32.2805 23.5387 32.2805 24.4854C32.2805 25.4587 32.0605 26.3187 31.6205 27.0654C31.1805 27.7987 30.5739 28.3654 29.8005 28.7654C29.0405 29.1521 28.1805 29.3454 27.2205 29.3454Z'
          : 'M15.7049 17.1654L11.5649 20.2254V18.1454L15.8649 14.9454H17.5449V29.0454H15.7049V17.1654ZM25.2205 29.3454C24.1805 29.3454 23.2939 29.1454 22.5605 28.7454C21.8405 28.3321 21.2939 27.7854 20.9205 27.1054C20.5472 26.4254 20.3605 25.6721 20.3605 24.8454H22.2405C22.2672 25.4321 22.4072 25.9454 22.6605 26.3854C22.9139 26.8121 23.2605 27.1454 23.7005 27.3854C24.1405 27.6121 24.6339 27.7254 25.1805 27.7254C25.8339 27.7254 26.3939 27.5921 26.8605 27.3254C27.3405 27.0587 27.7072 26.6854 27.9605 26.2054C28.2139 25.7121 28.3405 25.1387 28.3405 24.4854C28.3405 23.8587 28.2072 23.3121 27.9405 22.8454C27.6739 22.3787 27.3005 22.0187 26.8205 21.7654C26.3539 21.4987 25.8272 21.3654 25.2405 21.3654C24.6139 21.3654 24.0539 21.5187 23.5605 21.8254C23.0672 22.1187 22.7139 22.5254 22.5005 23.0454H20.5005L21.2605 14.9454H29.7405V16.6054H22.8605L22.4405 21.0654C22.7339 20.6921 23.1339 20.3854 23.6405 20.1454C24.1605 19.8921 24.7939 19.7654 25.5405 19.7654C26.3805 19.7654 27.1605 19.9587 27.8805 20.3454C28.6005 20.7321 29.1805 21.2854 29.6205 22.0054C30.0605 22.7121 30.2805 23.5387 30.2805 24.4854C30.2805 25.4587 30.0605 26.3187 29.6205 27.0654C29.1805 27.7987 28.5739 28.3654 27.8005 28.7654C27.0405 29.1521 26.1805 29.3454 25.2205 29.3454Z'}
        fill="currentColor"
      />
      <path
        d={back
          ? 'M5.63397 24.5454C6.01888 25.2121 6.98113 25.2121 7.36603 24.5454L11.2631 17.7954C11.648 17.1287 11.1669 16.2954 10.3971 16.2954L2.60288 16.2954C1.83308 16.2954 1.35196 17.1287 1.73686 17.7954L5.63397 24.5454Z'
          : 'M40.4109 24.5454C40.026 25.2121 39.0638 25.2121 38.6789 24.5454L34.7818 17.7954C34.3969 17.1287 34.878 16.2954 35.6478 16.2954L43.442 16.2954C44.2118 16.2954 44.693 17.1287 44.3081 17.7954L40.4109 24.5454Z'}
        fill="currentColor"
      />
      <path
        d={back
          ? 'M6.61285 17.3867C7.53426 13.9479 9.45469 10.8596 12.1313 8.51231C14.8079 6.165 18.1204 4.6641 21.65 4.19942C25.1796 3.73474 28.7678 4.32714 31.9607 5.90172C35.1536 7.47629 37.8079 9.96232 39.588 13.0454C41.368 16.1285 42.1938 19.6702 41.961 23.2227C41.7281 26.7751 40.4471 30.1787 38.2799 33.0031C36.1126 35.8275 33.1566 37.9458 29.7854 39.0902C26.4143 40.2345 22.7795 40.3535 19.3408 39.4321'
          : 'M39.4321 17.3867C38.5107 13.9479 36.5902 10.8596 33.9136 8.51231C31.237 6.165 27.9245 4.6641 24.3949 4.19942C20.8653 3.73474 17.2771 4.32714 14.0842 5.90172C10.8913 7.47629 8.23698 9.96232 6.45695 13.0454C4.67692 16.1285 3.85111 19.6702 4.08395 23.2227C4.31679 26.7751 5.59782 30.1787 7.76505 33.0031C9.93228 35.8275 12.8884 37.9458 16.2595 39.0902C19.6306 40.2345 23.2654 40.3535 26.7042 39.4321'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
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
  const pressAnimationsRef = useRef<Array<{ stop(): void } | undefined>>([]);
  const visibilityRef = useRef(0);
  const visibilityAnimationRef = useRef<{ stop(): void } | undefined>(
    undefined
  );
  const draggingRef = useRef(false);
  const resumeAfterSeekRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
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
      rendererRef.current.setEffectStrength(visibilityRef.current);
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
      visibilityAnimationRef.current?.stop();
      pressAnimationsRef.current.forEach(control => control?.stop());
    };
  }, [mobile, updateLenses]);

  useEffect(() => {
    updateLenses();
  }, [updateLenses]);

  const press = (index: number, scale: number) => {
    pressAnimationsRef.current[index]?.stop();
    pressAnimationsRef.current[index] = animate(
      pressScalesRef.current[index],
      scale,
      {
        ...(index === 1
          ? MAIN_PRESS_TRANSITION
          : SIDE_PRESS_TRANSITION),
        onUpdate: value => {
          pressScalesRef.current[index] = value;
          updateLenses();
        }
      }
    );
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

  const controlsVisible = ready && (!hasInteracted || hovered || focused);
  const showControls = () => {
    setHasInteracted(true);
    setHovered(true);
  };
  const hideControls = () => setHovered(false);

  useEffect(() => {
    visibilityAnimationRef.current?.stop();
    visibilityAnimationRef.current = animate(
      visibilityRef.current,
      controlsVisible ? 1 : 0,
      {
        type: 'spring',
        stiffness: 300,
        damping: 30,
        onUpdate: value => {
          visibilityRef.current = value;
          rendererRef.current?.setEffectStrength(value);
        }
      }
    );
    return () => visibilityAnimationRef.current?.stop();
  }, [controlsVisible]);

  const sizeScale = mobile ? 0.75 : 1;
  const marginScale = mobile ? 0.5 : 1;

  return (
    <div className="readable-example readable-video-example">
      <div
        ref={playerRef}
        className="readable-video-stage"
        onMouseEnter={showControls}
        onMouseLeave={hideControls}
        onFocus={event => {
          if (
            event.target instanceof HTMLElement &&
            event.target.matches(':focus-visible')
          ) {
            setFocused(true);
          }
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
            <motion.button
              type="button"
              className="is-side"
              aria-label={`Rewind ${SKIP_SECONDS} seconds`}
              style={{
                width: SIDE_SIZE * sizeScale,
                height: SIDE_SIZE * sizeScale
              }}
              initial={false}
              whileTap={{ scale: 0.8 }}
              transition={SIDE_PRESS_TRANSITION}
              onTapStart={() => press(0, 0.8)}
              onTap={() => press(0, 1)}
              onTapCancel={() => press(0, 1)}
              onClick={() => seekBy(-SKIP_SECONDS)}
            >
              <SkipIcon direction="back" />
            </motion.button>
            <motion.button
              type="button"
              className="is-main"
              aria-label={playing ? 'Pause' : 'Play'}
              style={{
                width: PLAY_SIZE * sizeScale,
                height: PLAY_SIZE * sizeScale
              }}
              initial={false}
              whileTap={{ scale: 0.8 }}
              transition={MAIN_PRESS_TRANSITION}
              onTapStart={() => press(1, 0.8)}
              onTap={() => press(1, 1)}
              onTapCancel={() => press(1, 1)}
              onClick={() => {
                const video = videoRef.current;
                if (!video) return;
                if (video.paused) void video.play();
                else video.pause();
              }}
            >
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={playing ? 'pause' : 'play'}
                  className="readable-video-play-pause"
                  initial={{ scale: 0.5, filter: 'blur(2px)', opacity: 0 }}
                  animate={{ scale: 1, filter: 'blur(0)', opacity: 1 }}
                  exit={{ scale: 0.5, filter: 'blur(2px)', opacity: 0 }}
                  transition={ICON_TRANSITION}
                >
                  {playing ? <PauseIcon /> : <PlayIcon />}
                </motion.span>
              </AnimatePresence>
            </motion.button>
            <motion.button
              type="button"
              className="is-side"
              aria-label={`Forward ${SKIP_SECONDS} seconds`}
              style={{
                width: SIDE_SIZE * sizeScale,
                height: SIDE_SIZE * sizeScale
              }}
              initial={false}
              whileTap={{ scale: 0.8 }}
              transition={SIDE_PRESS_TRANSITION}
              onTapStart={() => press(2, 0.8)}
              onTap={() => press(2, 1)}
              onTapCancel={() => press(2, 1)}
              onClick={() => seekBy(SKIP_SECONDS)}
            >
              <SkipIcon direction="forward" />
            </motion.button>
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
    </div>
  );
}
// [study:video-example:end]
