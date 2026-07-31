// [study:qr-example:start]
import { animate, type AnimationPlaybackControls } from 'motion';
import { useEffect, useMemo, useRef } from 'react';
import { generateLensMapPixels } from '../lens-map';
import { QrPainter } from '../qr-painter';
import { createQrRefraction } from '../qr-refraction';
import { createQrScene } from '../qr-scene';
import { DEFAULT_MATERIAL } from '../types';
import './example.css';

const QR_SIZE = 300;
const MAP_SIZE = 128;
const LAYER_COUNT = 5;
const HALF_SIZE_FROM = 4;
const HALF_SIZE_TO = 2.2 * 162;
const CLICK_COLORS = ['#9896FF', '#39D1F9', '#FFB400', '#FF3200'];

interface ExpandingLayer {
  halfSize: number;
  mapCanvas: HTMLCanvasElement;
  animation?: AnimationPlaybackControls;
}

/**
 * Combines all live click lenses into one map. The newest layer is drawn last;
 * each 128px map is scaled relative to the largest current lens, matching the
 * source renderer's five-slot ring buffer.
 */
function composeDisplacement(
  layers: ExpandingLayer[],
  activeLayer: number,
  composite: HTMLCanvasElement
) {
  const active = layers
    .map((layer, index) => ({ ...layer, index }))
    .filter(layer => layer.halfSize > 3);
  if (active.length === 0) return null;

  for (const layer of active) {
    generateLensMapPixels(
      {
        lensW: layer.halfSize,
        lensH: layer.halfSize,
        borderRadius: layer.halfSize,
        mapSize: MAP_SIZE
      },
      {
        ...DEFAULT_MATERIAL,
        depth: 30,
        sdfBoundary: true,
        edgeFalloff: true,
        splayAmount: 1
      },
      {
        transparentOutside: true,
        canvas: layer.mapCanvas
      }
    );
  }

  const largest = Math.max(...active.map(layer => layer.halfSize));
  let mapCanvas = active[0].mapCanvas;
  if (active.length > 1) {
    composite.width = MAP_SIZE;
    composite.height = MAP_SIZE;
    const context = composite.getContext('2d');
    if (!context) return null;
    context.globalCompositeOperation = 'source-over';
    context.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    context.fillStyle = 'rgb(128 128 128)';
    context.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    active
      .sort((left, right) => {
        const leftAge =
          (activeLayer - left.index + LAYER_COUNT) % LAYER_COUNT;
        const rightAge =
          (activeLayer - right.index + LAYER_COUNT) % LAYER_COUNT;
        return rightAge - leftAge;
      })
      .forEach(layer => {
        const size = (layer.halfSize / largest) * MAP_SIZE;
        context.drawImage(
          layer.mapCanvas,
          (MAP_SIZE - size) / 2,
          (MAP_SIZE - size) / 2,
          size,
          size
        );
      });
    mapCanvas = composite;
  }

  const lensExtent = Math.min((2 * largest) / QR_SIZE, 1);
  return {
    canvas: mapCanvas,
    lensOrigin: [
      0.5 - largest / QR_SIZE,
      0.5 - largest / QR_SIZE
    ] as [number, number],
    lensSize: [
      (2 * largest) / QR_SIZE,
      (2 * largest) / QR_SIZE
    ] as [number, number],
    scale: [0.08 * lensExtent, 0.08 * lensExtent] as [
      number,
      number
    ],
    chromaAmount: 1
  };
}

function AaveQrIcon() {
  const logoPath =
    'M21.541 20.4492C23.9418 20.0598 26.204 21.691 26.5938 24.0918C26.9832 26.4926 25.3529 28.7547 22.9521 29.1445C20.5512 29.5343 18.2883 27.9038 17.8984 25.5029C17.5087 23.1019 19.14 20.839 21.541 20.4492ZM33.0527 20.4492C35.4535 20.0598 37.7158 21.691 38.1055 24.0918C38.4949 26.4926 36.8646 28.7547 34.4639 29.1445C32.0629 29.5343 29.8 27.9038 29.4102 25.5029C29.0204 23.1019 30.6517 20.839 33.0527 20.4492ZM27.9951 6.61621C39.9527 6.61632 49.6486 16.4966 49.6465 28.6807H44.1152C44.1152 19.5497 36.9549 12.1466 27.9951 12.1465C19.0352 12.1465 11.875 19.5496 11.875 28.6807H6.34375C6.34063 16.4966 16.0364 6.61621 27.9951 6.61621Z';
  return (
    <svg viewBox="0 0 56 56" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="qr-icon-bg" x1="28" y1="0" x2="28" y2="56">
          <stop stopColor="#454445" />
          <stop offset="1" stopColor="#2b2b2b" />
        </linearGradient>
        <linearGradient id="qr-icon-mark" x1="28" y1="7" x2="28" y2="29">
          <stop stopColor="#fff" />
          <stop offset="1" stopColor="#b4b4b4" />
        </linearGradient>
      </defs>
      <rect width="56" height="56" rx="14" fill="url(#qr-icon-bg)" />
      <path d={logoPath} fill="url(#qr-icon-mark)" fillOpacity=".94" />
      <rect
        x=".5"
        y=".5"
        width="55"
        height="55"
        rx="13.5"
        fill="none"
        stroke="#fff"
        strokeOpacity=".06"
      />
    </svg>
  );
}

export function QRCanvasExample() {
  const scene = useMemo(() => createQrScene(), []);
  const rootRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLCanvasElement>(null);
  const paintingRef = useRef<HTMLCanvasElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const colorPainterRef = useRef<QrPainter | null>(null);
  const scalePainterRef = useRef<QrPainter | null>(null);
  const activeLayerRef = useRef(0);
  const clickEffectRef = useRef<{
    startedAt: number;
    previousClickAt: number;
    color: string | null;
    rapid: boolean;
  }>({
    startedAt: 0,
    previousClickAt: 0,
    color: null,
    rapid: false
  });
  const iconTurnsRef = useRef(0);
  const layersRef = useRef<ExpandingLayer[]>(
    Array.from({ length: LAYER_COUNT }, () => ({
      halfSize: 0,
      mapCanvas: document.createElement('canvas')
    }))
  );

  useEffect(() => {
    const root = rootRef.current;
    const output = outputRef.current;
    const painting = paintingRef.current;
    if (!root || !output || !painting) return;

    const renderer = createQrRefraction(output, scene);
    root.style.color = scene.dotColor;
    const resolvedDotColor = getComputedStyle(root).color;
    root.style.color = '';
    const dark = document.documentElement.classList.contains('dark');
    const painterSize = QR_SIZE / 22.2;
    const splashSpeed = 3000 / 300;
    const colorPainter = new QrPainter({
      canvas: painting,
      size: painterSize,
      maxAge: 240,
      radius: QR_SIZE / 333,
      intensityFactor: 0.8,
      useColor: true,
      clearColor: resolvedDotColor,
      splashSpeed,
      ringStart: dark ? 0.15 : 0.45,
      ringEnd: 0.9
    });
    const scalePainter = new QrPainter({
      size: painterSize,
      maxAge: 48,
      radius: QR_SIZE / 426,
      intensityFactor: 0.4,
      splashSpeed,
      ringStart: dark ? 0.15 : 0.45,
      ringEnd: 0.9
    });
    colorPainterRef.current = colorPainter;
    scalePainterRef.current = scalePainter;
    const composite = document.createElement('canvas');
    const currentEyeScale = [1, 1, 1];
    const targetEyeScale = [1, 1, 1];
    const currentEyeColor = Array.from({ length: 3 }, () => [0, 0, 0]);
    let hoveredEye = -1;
    let pointerMovedAt = 0;
    let frame = 0;
    let lastFrame = performance.now();
    let disposed = false;

    // Resolve CSS colors once into the normalized 0-1 values expected by GLSL.
    const resolveRgb = (color: string): [number, number, number] => {
      root.style.color = color;
      const resolved = getComputedStyle(root).color;
      root.style.color = '';
      const p3 = resolved.match(
        /color\(display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/
      );
      if (p3) {
        return [
          Number.parseFloat(p3[1]),
          Number.parseFloat(p3[2]),
          Number.parseFloat(p3[3])
        ];
      }
      const values = resolved.match(/\d+(?:\.\d+)?/g);
      return values
        ? [
            Number.parseFloat(values[0]) / 255,
            Number.parseFloat(values[1]) / 255,
            Number.parseFloat(values[2]) / 255
          ]
        : [1, 1, 1];
    };
    let defaultEyeColor = resolveRgb(scene.dotColor);
    currentEyeColor.forEach(color => color.splice(0, 3, ...defaultEyeColor));
    const firstHoverColor = resolveRgb(CLICK_COLORS[0]);

    const findEye = (clientX: number, clientY: number) => {
      const bounds = output.getBoundingClientRect();
      const x = ((clientX - bounds.left) / bounds.width) * QR_SIZE;
      const y = ((clientY - bounds.top) / bounds.height) * QR_SIZE;
      for (let group = 0; group < 3; group += 1) {
        const eye = scene.eyes[group * 3];
        if (
          x >= eye.x &&
          x <= eye.x + eye.width &&
          y >= eye.y &&
          y <= eye.y + eye.height
        ) {
          return group;
        }
      }
      return -1;
    };

    const setHoveredEye = (next: number) => {
      hoveredEye = next;
      for (let group = 0; group < 3; group += 1) {
        targetEyeScale[group] = group === next ? 0.92 : 1;
      }
    };
    const updatePointerTextures = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') {
        setHoveredEye(findEye(event.clientX, event.clientY));
      }
      const outputBounds = output.getBoundingClientRect();
      const pointer = {
        x: (event.clientX - outputBounds.left) / outputBounds.width,
        y: 1 - (event.clientY - outputBounds.top) / outputBounds.height
      };
      colorPainter.updateMousePosition(pointer);
      scalePainter.updateMousePosition(pointer);
      pointerMovedAt = performance.now();
    };
    const onTiltPointerMove = (event: PointerEvent) => {
      const bounds = root.getBoundingClientRect();
      const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5;
      const vertical = (event.clientY - bounds.top) / bounds.height - 0.5;
      root.style.setProperty('--qr-rotate-x', `${-12 * vertical}deg`);
      root.style.setProperty('--qr-rotate-y', `${12 * horizontal}deg`);
    };
    const onPointerLeave = () => {
      setHoveredEye(-1);
      root.style.setProperty('--qr-rotate-x', '0deg');
      root.style.setProperty('--qr-rotate-y', '0deg');
    };
    const onTouchPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        setHoveredEye(findEye(event.clientX, event.clientY));
      }
    };
    const onTouchPointerEnd = (event: PointerEvent) => {
      if (event.pointerType === 'touch') setHoveredEye(-1);
    };
    root.addEventListener('pointermove', onTiltPointerMove);
    root.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('pointermove', updatePointerTextures);
    window.addEventListener('pointerdown', onTouchPointerDown);
    window.addEventListener('pointerup', onTouchPointerEnd);
    window.addEventListener('pointercancel', onTouchPointerEnd);

    // Theme changes update both WebGL uniforms and the two painter textures.
    const applyTheme = () => {
      root.style.color = scene.dotColor;
      const dotColor = getComputedStyle(root).color;
      root.style.color = '';
      const isDark = document.documentElement.classList.contains('dark');
      colorPainter.updateClearColor(dotColor);
      colorPainter.updateRingStart(isDark ? 0.15 : 0.45);
      scalePainter.updateRingStart(isDark ? 0.15 : 0.45);
      colorPainter.updateRingEnd(0.9);
      scalePainter.updateRingEnd(0.9);
      renderer.updateBackgroundColor(scene.backgroundColor);
      defaultEyeColor = resolveRgb(scene.dotColor);
    };
    const themeObserver = new MutationObserver(applyTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    applyTheme();

    const render = (now: number) => {
      if (disposed) return;
      const delta = Math.min(((now - lastFrame) / 1000) * 100, 2);
      lastFrame = now;

      const recentPointer = now - pointerMovedAt < 1000;
      colorPainter.update(delta, recentPointer);
      scalePainter.update(delta, recentPointer);

      const click = clickEffectRef.current;
      const clickAge = click.color ? now - click.startedAt : Infinity;
      if (clickAge >= 2000) click.color = null;
      const clickColor =
        click.color &&
        clickAge >= (click.rapid ? 0 : 500)
          ? resolveRgb(click.color)
          : null;
      const hoverColor = click.color
        ? resolveRgb(
            CLICK_COLORS[
              (CLICK_COLORS.indexOf(click.color) + 1) %
                CLICK_COLORS.length
            ]
          )
        : firstHoverColor;
      const clickPress =
        Boolean(click.color) &&
        !click.rapid &&
        clickAge >= 300 &&
        clickAge < 450;

      for (let group = 0; group < 3; group += 1) {
        targetEyeScale[group] = clickPress
          ? 0.9
          : group === hoveredEye
            ? 0.92
            : 1;
        const multiplier =
          hoveredEye >= 0 ? 1 : click.color ? 0.5 : 0.125;
        const difference = targetEyeScale[group] - currentEyeScale[group];
        currentEyeScale[group] =
          Math.abs(difference) > 0.001
            ? currentEyeScale[group] + difference * 0.18 * multiplier
            : targetEyeScale[group];
        renderer.updateEyeScale(group, currentEyeScale[group]);
        const targetColor =
          group === hoveredEye
            ? hoverColor
            : clickColor ?? defaultEyeColor;
        for (let channel = 0; channel < 3; channel += 1) {
          const colorDifference =
            targetColor[channel] - currentEyeColor[group][channel];
          currentEyeColor[group][channel] =
            Math.abs(colorDifference) > 0.002
              ? currentEyeColor[group][channel] +
                colorDifference * 0.18 * multiplier
              : targetColor[channel];
        }
        renderer.updateEyeColor(
          group,
          currentEyeColor[group][0],
          currentEyeColor[group][1],
          currentEyeColor[group][2]
        );
      }

      renderer.updatePaintingScale(scalePainter.canvas);
      renderer.updatePaintingColor(painting);
      renderer.updateDisplacement(
        composeDisplacement(
          layersRef.current,
          activeLayerRef.current,
          composite
        )
      );
      renderer.draw();
      frame = requestAnimationFrame(render);
      void delta;
    };
    frame = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      root.removeEventListener('pointermove', onTiltPointerMove);
      root.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('pointermove', updatePointerTextures);
      window.removeEventListener('pointerdown', onTouchPointerDown);
      window.removeEventListener('pointerup', onTouchPointerEnd);
      window.removeEventListener('pointercancel', onTouchPointerEnd);
      themeObserver.disconnect();
      for (const layer of layersRef.current) layer.animation?.stop();
      colorPainter.dispose();
      scalePainter.dispose();
      colorPainterRef.current = null;
      scalePainterRef.current = null;
      renderer.dispose();
    };
  }, [scene]);

  const trigger = () => {
    const layerIndex = (activeLayerRef.current + 1) % LAYER_COUNT;
    activeLayerRef.current = layerIndex;
    const layer = layersRef.current[layerIndex];
    layer.animation?.stop();
    layer.halfSize = HALF_SIZE_FROM;
    layer.animation = animate(HALF_SIZE_FROM, HALF_SIZE_TO, {
      duration: 6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: value => {
        layer.halfSize = value;
      },
      onComplete: () => {
        layer.halfSize = 0;
      }
    });
    const now = performance.now();
    const click = clickEffectRef.current;
    const rapid = now - click.previousClickAt < 2000;
    const color =
      colorPainterRef.current?.onClick() ?? CLICK_COLORS[0];
    scalePainterRef.current?.onClick();
    clickEffectRef.current = {
      startedAt: now,
      previousClickAt: now,
      color,
      rapid
    };
    iconTurnsRef.current += 1;
    iconRef.current?.style.setProperty(
      '--qr-icon-turns',
      String(iconTurnsRef.current)
    );
  };

  return (
    <div
      ref={rootRef}
      className="readable-example readable-qr-perspective"
    >
      <div className="readable-qr-stage">
        <canvas
          ref={paintingRef}
          className="readable-qr-painting"
          aria-hidden="true"
        />
        <canvas
          ref={outputRef}
          className="readable-qr-output"
          aria-label="WebGL 二维码折射输出"
        />
        <button
          ref={iconRef}
          type="button"
          className="readable-qr-icon"
          onClick={trigger}
          aria-label="触发二维码玻璃扩散"
        >
          <span className="readable-qr-icon-rotator">
            <AaveQrIcon />
          </span>
        </button>
      </div>
    </div>
  );
}
// [study:qr-example:end]
