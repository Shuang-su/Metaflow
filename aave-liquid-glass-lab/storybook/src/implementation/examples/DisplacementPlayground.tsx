import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { AaveGlass } from '../react/AaveGlass';
import { DEFAULT_MATERIAL } from '../types';
import './example.css';

interface RangeControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange(value: number): void;
}

function RangeControl({
  label,
  value,
  min,
  max,
  step = 1,
  onChange
}: RangeControlProps) {
  return (
    <label className="readable-range-control">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={event => onChange(event.currentTarget.valueAsNumber)}
      />
      <output>{value.toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0)}</output>
    </label>
  );
}

interface PlaygroundParticle {
  x: number;
  y: number;
  xv: number;
  yv: number;
  angle: number;
  scale: number;
  opacity: number;
  life: number;
  maxLife: number;
  emoji: string;
  flipH: boolean;
  fontSize: number;
  radius: number;
}

const PARTICLE_OPTIONS = [
  ...Array.from({ length: 3 }, () => ({ emoji: '👻', canFlip: true })),
  ...Array.from({ length: 2 }, () => ({ emoji: '💜', canFlip: false })),
  { emoji: '👀', canFlip: true },
  ...Array.from({ length: 3 }, () => ({ emoji: '🛹', canFlip: true }))
];
const particleSpriteCache = new Map<string, HTMLCanvasElement>();

function createParticleSprite(emoji: string, dpr: number): HTMLCanvasElement {
  const cacheKey = `${emoji}@${dpr}`;
  const cached = particleSpriteCache.get(cacheKey);
  if (cached) return cached;

  const fontSize = Math.ceil(64 * dpr);
  const size = Math.ceil(1.5 * fontSize);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = size;
  canvas.height = size;
  if (context) {
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `${fontSize}px serif`;
    context.fillText(emoji, size / 2, size / 2);
  }
  particleSpriteCache.set(cacheKey, canvas);
  return canvas;
}

function resolveParticleCollisions(particles: PlaygroundParticle[]) {
  for (let leftIndex = 0; leftIndex < particles.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < particles.length;
      rightIndex += 1
    ) {
      const left = particles[leftIndex];
      const right = particles[rightIndex];
      const dx = right.x - left.x;
      const dy = right.y - left.y;
      const distanceSquared = dx * dx + dy * dy;
      const minimumDistance = left.radius + right.radius;
      if (
        distanceSquared >= minimumDistance * minimumDistance ||
        distanceSquared <= 1e-4
      ) {
        continue;
      }

      const distance = Math.sqrt(distanceSquared);
      const normalX = dx / distance;
      const normalY = dy / distance;
      const overlap = 0.5 * (minimumDistance - distance);
      left.x -= normalX * overlap;
      left.y -= normalY * overlap;
      right.x += normalX * overlap;
      right.y += normalY * overlap;

      const closingVelocity =
        (left.xv - right.xv) * normalX +
        (left.yv - right.yv) * normalY;
      if (closingVelocity > 0) {
        const impulse = 0.5 * closingVelocity;
        left.xv -= impulse * normalX;
        left.yv -= impulse * normalY;
        right.xv += impulse * normalX;
        right.yv += impulse * normalY;
      }
    }
  }
}

// [study:playground-example:start]
export function DisplacementPlayground() {
  const resultRef = useRef<HTMLDivElement>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<PlaygroundParticle[]>([]);
  const particleFrameRef = useRef<number | null>(null);
  const lastParticleSpawnRef = useRef(0);
  const parameterEffectReadyRef = useRef(false);
  const dragRef = useRef({ active: false, offsetX: 0, offsetY: 0 });
  const [stageSize, setStageSize] = useState({ width: 340, height: 320 });
  const [position, setPosition] = useState({ x: 0.5, y: 0.5 });
  const stageSizeRef = useRef(stageSize);
  const positionRef = useRef(position);
  const [width, setWidth] = useState(70);
  const [height, setHeight] = useState(60);
  const [borderRadius, setBorderRadius] = useState(28);
  const [scale, setScale] = useState(0.1);
  const [depth, setDepth] = useState(10);
  const [curvature, setCurvature] = useState(40);
  const [splay, setSplay] = useState(1);
  const [chroma, setChroma] = useState(0.2);
  const [blur, setBlur] = useState(0);
  const [glow, setGlow] = useState(0.1);
  const [edge, setEdge] = useState(0.25);
  const [specularAngle, setSpecularAngle] = useState(45);
  const [mapUrl, setMapUrl] = useState('');
  const [generationTime, setGenerationTime] = useState(0);

  useEffect(() => {
    const stage = resultRef.current;
    if (!stage) return;
    const update = () => {
      const rect = stage.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageSize({ width: rect.width, height: rect.height });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const drawParticles = useCallback(() => {
    if (particleFrameRef.current !== null) return;

    const animateParticles = () => {
      const canvas = particleCanvasRef.current;
      const context = canvas?.getContext('2d');
      const stage = resultRef.current;
      if (!canvas || !context || !stage) {
        particleFrameRef.current = null;
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      const bounds = stage.getBoundingClientRect();
      const drawingWidth = Math.max(1, Math.round(bounds.width * dpr));
      const drawingHeight = Math.max(1, Math.round(bounds.height * dpr));
      if (canvas.width !== drawingWidth || canvas.height !== drawingHeight) {
        canvas.width = drawingWidth;
        canvas.height = drawingHeight;
      }

      const particles = particlesRef.current;
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        particle.angle += 0.2 * particle.xv;
        particle.x += particle.xv;
        particle.y += particle.yv;
        particle.scale += (1 - particle.scale) * 0.3;
        particle.radius = particle.fontSize * particle.scale * 0.5;

        const radius = particle.radius;
        if (particle.x - radius < 0) {
          particle.x = radius;
          particle.xv = 0.82 * Math.abs(particle.xv);
        } else if (particle.x + radius > bounds.width) {
          particle.x = bounds.width - radius;
          particle.xv = -0.82 * Math.abs(particle.xv);
        }
        if (particle.y - radius < 0) {
          particle.y = radius;
          particle.yv = 0.82 * Math.abs(particle.yv);
        } else if (particle.y + radius > bounds.height) {
          particle.y = bounds.height - radius;
          particle.yv = -0.82 * Math.abs(particle.yv);
        }

        particle.life -= 1;
        const remaining = particle.life / particle.maxLife;
        if (remaining < 0.25) particle.opacity = remaining / 0.25;
        if (particle.life <= 0 || particle.opacity <= 0.01) {
          particles[index] = particles[particles.length - 1];
          particles.pop();
        }
      }
      resolveParticleCollisions(particles);

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.globalAlpha = 1;
      // Draw opaque particles first and fading particles second, preserving the
      // same overlap order as the locked runtime.
      for (let pass = 0; pass < 2; pass += 1) {
        for (const particle of particles) {
          const fading = particle.opacity < 1;
          if ((pass === 0 && fading) || (pass === 1 && !fading)) continue;
          context.globalAlpha = pass === 1 ? particle.opacity : 1;
          const sprite = createParticleSprite(particle.emoji, dpr);
          const size = particle.fontSize * particle.scale * 1.5;
          const half = size / 2;
          const radians = (particle.angle * Math.PI) / 180;
          const cosine = Math.cos(radians) * dpr;
          const sine = Math.sin(radians) * dpr;
          const flip = particle.flipH ? -1 : 1;
          context.setTransform(
            cosine * flip,
            sine * flip,
            -sine,
            cosine,
            particle.x * dpr,
            particle.y * dpr
          );
          context.drawImage(sprite, -half, -half, size, size);
        }
      }
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = 1;

      if (particles.length === 0) {
        particleFrameRef.current = null;
        return;
      }
      particleFrameRef.current = requestAnimationFrame(animateParticles);
    };

    particleFrameRef.current = requestAnimationFrame(animateParticles);
  }, []);

  const spawnParticles = useCallback(() => {
    const now = performance.now();
    if (now - lastParticleSpawnRef.current < 90) return;
    lastParticleSpawnRef.current = now;
    if (particlesRef.current.length + 3 > 100) return;

    const currentPosition = positionRef.current;
    const currentStageSize = stageSizeRef.current;
    for (let index = 0; index < 3; index += 1) {
      const option =
        PARTICLE_OPTIONS[
          Math.floor(Math.random() * PARTICLE_OPTIONS.length)
        ];
      particlesRef.current.push({
        x: currentPosition.x * currentStageSize.width,
        y: currentPosition.y * currentStageSize.height,
        xv: 16 * Math.random() - 8,
        yv: (index === 0 ? 4 : index === 1 ? 8 : 16) *
          (0.25 + 0.25 * Math.random()),
        angle: 0,
        scale: 0.2,
        opacity: 1,
        life: 200,
        maxLife: 200,
        emoji: option?.emoji ?? '✨',
        flipH: Boolean(option?.canFlip && Math.random() < 0.5),
        fontSize: 30 + Math.ceil(40 * Math.random()),
        radius: 0
      });
    }
    drawParticles();
  }, [drawParticles]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    stageSizeRef.current = stageSize;
  }, [stageSize]);

  useEffect(() => {
    if (!parameterEffectReadyRef.current) {
      parameterEffectReadyRef.current = true;
      return;
    }
    spawnParticles();
  }, [
    width,
    height,
    borderRadius,
    scale,
    depth,
    curvature,
    splay,
    chroma,
    blur,
    glow,
    edge,
    specularAngle,
    spawnParticles
  ]);

  useEffect(
    () => () => {
      if (particleFrameRef.current !== null) {
        cancelAnimationFrame(particleFrameRef.current);
      }
    },
    []
  );

  const geometry = useMemo(
    () => ({ lensW: width, lensH: height, borderRadius, mapSize: 512 }),
    [width, height, borderRadius]
  );
  const material = useMemo(
    () => ({
      ...DEFAULT_MATERIAL,
      depth,
      chromaAmount: chroma,
      scaleX: scale,
      scaleY: scale,
      blurAmount: blur,
      sdfBoundary: true,
      edgeFalloff: true,
      specularRotation: specularAngle,
      glowStrength: glow,
      edgeStrength: edge,
      domeDepth: curvature,
      splayAmount: splay,
      edgeShadow:
        '0 0 0 1px var(--bg-max), 0 8px 24px rgba(0, 0, 0, 0.4)'
    }),
    [depth, chroma, scale, blur, specularAngle, glow, edge, curvature, splay]
  );

  const updatePointer = useCallback(
    (clientX: number, clientY: number, element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      setPosition({
        x: Math.max(
          0,
          Math.min(
            1,
            (clientX - rect.left) / rect.width - dragRef.current.offsetX
          )
        ),
        y: Math.max(
          0,
          Math.min(
            1,
            (clientY - rect.top) / rect.height - dragRef.current.offsetY
          )
        )
      });
    },
    []
  );
  const pointerHandlers = {
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const pointerX = (event.clientX - rect.left) / rect.width;
      const pointerY = (event.clientY - rect.top) / rect.height;
      dragRef.current = {
        active: true,
        offsetX: pointerX - position.x,
        offsetY: pointerY - position.y
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current.active) return;
      updatePointer(event.clientX, event.clientY, event.currentTarget);
    },
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => {
      dragRef.current.active = false;
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: () => {
      dragRef.current.active = false;
    }
  };

  return (
    <div className="readable-example readable-displacement-example">
      <figure>
        <div
          className="readable-playground-grid"
          style={{ '--split': `${position.x * 100}%` } as React.CSSProperties}
        >
          <div
            ref={resultRef}
            className="readable-playground-result"
            {...pointerHandlers}
          >
            <AaveGlass
              className="readable-playground-glass"
              targetClassName="readable-playground-source"
              geometry={geometry}
              material={material}
              position={{
                x: position.x * stageSize.width,
                y: position.y * stageSize.height
              }}
              onLensMapChange={map => setMapUrl(map.dataUrl)}
              onGenerationTime={timing => setGenerationTime(timing.total)}
            >
              <>
                <div className="readable-playground-background" />
                <canvas
                  ref={particleCanvasRef}
                  className="readable-playground-particles"
                  aria-hidden="true"
                />
              </>
            </AaveGlass>
          </div>
          <div className="readable-map-panel" {...pointerHandlers}>
            {mapUrl ? (
              <img
                src={mapUrl}
                alt="Generated displacement map at the lens position"
                style={{
                  left: `${position.x * 100}%`,
                  top: `${position.y * 100}%`,
                  width: width * 2,
                  height: height * 2
                }}
                draggable={false}
              />
            ) : (
              <span>generating...</span>
            )}
          </div>
        </div>
        <figcaption>
          左侧是实时折射结果，右侧是驱动它的 displacement map。
          {generationTime > 0 ? ` ${generationTime.toFixed(2)}ms` : ''}
        </figcaption>
      </figure>

      <div className="readable-playground-controls">
        <RangeControl label="Width" value={width} min={20} max={120} onChange={setWidth} />
        <RangeControl label="Height" value={height} min={20} max={80} onChange={setHeight} />
        <RangeControl label="BorderRadius" value={borderRadius} min={0} max={64} onChange={setBorderRadius} />
        <RangeControl label="Scale" value={scale} min={0} max={0.2} step={0.001} onChange={setScale} />
        <RangeControl label="Depth" value={depth} min={5} max={60} onChange={setDepth} />
        <RangeControl label="Curvature" value={curvature} min={0} max={80} onChange={setCurvature} />
        <RangeControl label="Splay" value={splay} min={0} max={1} step={0.01} onChange={setSplay} />
        <RangeControl label="Chroma" value={chroma} min={0} max={1} step={0.01} onChange={setChroma} />
        <RangeControl label="Blur" value={blur} min={0} max={2} step={0.25} onChange={setBlur} />
        <RangeControl label="Glow" value={glow} min={0} max={1} step={0.01} onChange={setGlow} />
        <RangeControl label="Edge Highlight" value={edge} min={0} max={1} step={0.01} onChange={setEdge} />
        <RangeControl label="Specular Angle" value={specularAngle} min={0} max={180} onChange={setSpecularAngle} />
      </div>
    </div>
  );
}
// [study:playground-example:end]
