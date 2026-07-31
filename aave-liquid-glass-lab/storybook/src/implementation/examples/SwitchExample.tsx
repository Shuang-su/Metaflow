// [study:switch-example:start]
import { animate } from 'motion';
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react';
import { AaveGlass } from '../react/AaveGlass';
import { useDarkMode } from '../react/useDarkMode';
import { DEFAULT_MATERIAL } from '../types';
import './example.css';

const WIDTH = 74;
const HEIGHT = 28;
const THUMB_WIDTH = Math.round(0.6 * WIDTH);
const THUMB_HEIGHT = HEIGHT - 6;
const TRAVEL = WIDTH - THUMB_WIDTH - 6;
const BLEED = 21;
const HOST_WIDTH = WIDTH + 2 * BLEED;
const HOST_HEIGHT = HEIGHT + 2 * BLEED;
const REST_HALF_WIDTH = THUMB_WIDTH / 2;
const REST_HALF_HEIGHT = THUMB_HEIGHT / 2;
const REST_RADIUS = THUMB_HEIGHT / 2;
const OVERSHOOT = WIDTH * 0.1;
const OVERSHOOT_DAMPING = OVERSHOOT * 10;

const TAP_TRANSITION = {
  duration: 0.32,
  ease: [0.22, 1.15, 0.36, 1.06] as const
};
const TRAVEL_TRANSITION = {
  duration: 0.6,
  ease: [0.22, 1.15, 0.36, 1.06] as const
};
const RELEASE_TRANSITION = {
  duration: 0.52,
  ease: [0.22, 1.15, 0.36, 1.06] as const
};

const switchMaterialLight = {
  ...DEFAULT_MATERIAL,
  depth: 2,
  chromaAmount: 1,
  scaleX: 0.25,
  scaleY: 0.25,
  sdfBoundary: true,
  edgeFalloff: true,
  domeDepth: 6,
  splayAmount: 0.4,
  brightness: -0.02,
  specularStrength: 1.5,
  specularRotation: 30,
  specularDark: true,
  glowStrength: 0.4,
  glowSpread: 0.5,
  glowExponent: 2,
  edgeStrength: 0.5,
  edgeWidth: 1.5,
  edgeExponent: 1,
  edgeShadow: '0 2px 6px rgba(0, 0, 0, 0.16)',
  edgeInsetShadow: '0 -4px 10px rgba(0, 0, 0, 0.12)'
};

const switchMaterialDark = {
  ...switchMaterialLight,
  brightness: 0.12,
  specularStrength: 1,
  specularRotation: 45,
  specularDark: false,
  glowExponent: 1.5,
  edgeWidth: 2,
  edgeExponent: 1.5
};

function rubberBand(distance: number): number {
  return (
    OVERSHOOT *
    (1 -
      Math.pow(
        1 - Math.min(1, distance / OVERSHOOT_DAMPING),
        3
      ))
  );
}

export function SwitchExample() {
  const dark = useDarkMode();
  const switchMaterial = dark
    ? switchMaterialDark
    : switchMaterialLight;
  const [checked, setChecked] = useState(false);
  const [x, setX] = useState(0);
  const [lensHalfWidth, setLensHalfWidth] =
    useState(REST_HALF_WIDTH);
  const [lensHalfHeight, setLensHalfHeight] =
    useState(REST_HALF_HEIGHT);
  const [lensRadius, setLensRadius] = useState(REST_RADIUS);
  const [tintOpacity, setTintOpacity] = useState(1);
  const [targetScaleX, setTargetScaleX] = useState(0.85);
  const [targetScaleY, setTargetScaleY] = useState(0.525);
  const [deformation, setDeformation] = useState(0);
  const pointerId = useRef<number | undefined>(undefined);
  const pointerStart = useRef(0);
  const dragStart = useRef(0);
  const dragged = useRef(false);
  const mode = useRef<'idle' | 'pending' | 'hold' | 'tap'>('idle');
  const holdTimer = useRef<number | undefined>(undefined);
  const releaseTimer = useRef<number | undefined>(undefined);
  const shapeAnimations = useRef<Array<{ stop(): void }>>([]);
  const positionAnimation = useRef<{ stop(): void } | undefined>(undefined);
  const xRef = useRef(x);
  const deformationForce = useRef(0);
  const deformationFrame = useRef(0);
  const deformationRunning = useRef(false);
  const deformationPosition = useRef(x);
  const deformationTime = useRef(0);
  const deformationValue = useRef(0);
  const deformationVelocity = useRef(0);

  const startDeformation = () => {
    if (deformationRunning.current) return;
    deformationRunning.current = true;
    deformationTime.current = performance.now();
    deformationPosition.current = xRef.current;

    const frame = (now: number) => {
      const elapsed = (now - deformationTime.current) / 1000;
      const dt = Math.min(elapsed, 0.033);
      deformationTime.current = now;
      const position = xRef.current;
      const positionVelocity =
        (position - deformationPosition.current) /
        Math.min(Math.max(elapsed, 0.008), 0.03);
      deformationPosition.current = position;
      const speed = Math.abs(positionVelocity);
      const target = Math.min(
        0.35,
        Math.max(
          Math.min(0.35, 0.012 * Math.pow(speed, 0.75)),
          deformationForce.current
        )
      );
      const acceleration =
        -180 * (deformationValue.current - target) -
        14 * deformationVelocity.current;
      deformationVelocity.current += acceleration * dt;
      deformationValue.current += deformationVelocity.current * dt;
      setDeformation(deformationValue.current);

      if (
        Math.abs(deformationValue.current) < 0.0005 &&
        Math.abs(deformationVelocity.current) < 0.005 &&
        speed < 0.005 &&
        deformationForce.current === 0
      ) {
        deformationRunning.current = false;
        deformationValue.current = 0;
        deformationVelocity.current = 0;
        setDeformation(0);
        return;
      }
      deformationFrame.current = requestAnimationFrame(frame);
    };

    deformationFrame.current = requestAnimationFrame(frame);
  };

  const updateX = (value: number) => {
    xRef.current = value;
    setX(value);
    startDeformation();
  };

  const stopShapeAnimations = () => {
    shapeAnimations.current.forEach(control => control.stop());
    shapeAnimations.current = [];
  };
  const run = (
    from: number,
    to: number,
    setter: (value: number) => void,
    transition: typeof TAP_TRANSITION | typeof RELEASE_TRANSITION
  ) => {
    const control = animate(from, to, {
      ...transition,
      onUpdate: setter
    });
    shapeAnimations.current.push(control);
  };
  const expand = () => {
    stopShapeAnimations();
    run(
      lensHalfWidth,
      1.5 * REST_HALF_WIDTH,
      setLensHalfWidth,
      TAP_TRANSITION
    );
    run(
      lensHalfHeight,
      1.5 * REST_HALF_HEIGHT,
      setLensHalfHeight,
      TAP_TRANSITION
    );
    run(lensRadius, 1.5 * REST_RADIUS, setLensRadius, TAP_TRANSITION);
    run(tintOpacity, 0, setTintOpacity, TAP_TRANSITION);
    run(targetScaleX, 0.95, setTargetScaleX, TAP_TRANSITION);
    run(targetScaleY, 0.975, setTargetScaleY, TAP_TRANSITION);
    deformationForce.current = 0.175;
    startDeformation();
  };
  const collapse = () => {
    stopShapeAnimations();
    run(
      lensHalfWidth,
      REST_HALF_WIDTH,
      setLensHalfWidth,
      RELEASE_TRANSITION
    );
    run(
      lensHalfHeight,
      REST_HALF_HEIGHT,
      setLensHalfHeight,
      RELEASE_TRANSITION
    );
    run(lensRadius, REST_RADIUS, setLensRadius, RELEASE_TRANSITION);
    run(tintOpacity, 1, setTintOpacity, RELEASE_TRANSITION);
    run(targetScaleX, 0.85, setTargetScaleX, RELEASE_TRANSITION);
    run(targetScaleY, 0.525, setTargetScaleY, RELEASE_TRANSITION);
    deformationForce.current = 0;
    startDeformation();
  };
  const animatePosition = (next: number) => {
    positionAnimation.current?.stop();
    const control = animate(xRef.current, next, {
      ...TRAVEL_TRANSITION,
      onUpdate: updateX
    });
    positionAnimation.current = control;
  };
  const commit = (next: boolean) => {
    setChecked(next);
    animatePosition(next ? TRAVEL : 0);
  };

  useEffect(
    () => () => {
      stopShapeAnimations();
      positionAnimation.current?.stop();
      window.clearTimeout(holdTimer.current);
      window.clearTimeout(releaseTimer.current);
      cancelAnimationFrame(deformationFrame.current);
    },
    []
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== undefined) return;
    pointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerStart.current = event.clientX;
    dragStart.current = x;
    dragged.current = false;
    mode.current = 'pending';
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      if (mode.current !== 'pending') return;
      mode.current = 'hold';
      expand();
    }, 200);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== pointerId.current) return;
    let delta = event.clientX - pointerStart.current;
    if (!dragged.current) {
      if (Math.abs(delta) < 3) return;
      dragged.current = true;
      positionAnimation.current?.stop();
      dragStart.current = xRef.current;
      pointerStart.current = event.clientX;
      delta = 0;
      window.clearTimeout(holdTimer.current);
      if (mode.current !== 'hold') {
        mode.current = 'hold';
        expand();
      }
    }
    const raw = dragStart.current + delta;
        updateX(
      raw < 0
        ? -rubberBand(-raw)
        : raw > TRAVEL
          ? TRAVEL + rubberBand(raw - TRAVEL)
          : raw
    );
  };

  const finishPointer = (
    event: ReactPointerEvent<HTMLSpanElement>,
    cancelled: boolean
  ) => {
    if (event.pointerId !== pointerId.current) return;
    pointerId.current = undefined;
    window.clearTimeout(holdTimer.current);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (cancelled) {
      mode.current = 'idle';
      collapse();
      animatePosition(checked ? TRAVEL : 0);
      return;
    }

    if (dragged.current) {
      const next =
        Math.max(0, Math.min(TRAVEL, xRef.current)) > TRAVEL / 2;
      mode.current = 'idle';
      collapse();
      setChecked(next);
      animatePosition(next ? TRAVEL : 0);
      return;
    }

    if (mode.current === 'pending') {
      mode.current = 'tap';
      expand();
      const next = !checked;
      setChecked(next);
      animatePosition(next ? TRAVEL : 0);
      releaseTimer.current = window.setTimeout(() => {
        mode.current = 'idle';
        collapse();
      }, 330);
      return;
    }

    mode.current = 'idle';
    collapse();
    animatePosition(checked ? TRAVEL : 0);
  };

  const target = (
    <div
      className="readable-switch-refraction-padding"
      style={{ padding: BLEED }}
    >
      <div
        className="readable-switch-refraction-track"
        style={{
          width: WIDTH,
          height: Math.round(0.75 * HEIGHT),
          borderRadius: Math.round(0.75 * HEIGHT) / 2,
          background: `color-mix(in srgb, var(--bg-4, #dedde2), var(--primary, #9188ff) ${
            (x / TRAVEL) * 100
          }%)`,
          transform: `scale(${targetScaleX}, ${targetScaleY})`
        }}
      />
    </div>
  );

  return (
    <div className="readable-example readable-switch-example">
      <AaveGlass
        className="readable-switch-glass"
        style={{
          width: HOST_WIDTH,
          height: HOST_HEIGHT,
          margin: -BLEED,
          overflow: 'visible'
        }}
        targetClassName="readable-switch-refraction"
        targetStyle={{ position: 'absolute', inset: 0 }}
        contentStyle={{ padding: BLEED, boxSizing: 'border-box' }}
        refractionTarget={target}
        geometry={{
          lensW: lensHalfWidth * (1 - 0.2 * deformation),
          lensH: lensHalfHeight * (1 + 0.4 * deformation),
          borderRadius: lensRadius,
          mapSize: 256
        }}
        material={switchMaterial}
        position={{
          x: BLEED + 3 + THUMB_WIDTH / 2 + x,
          y: BLEED + HEIGHT / 2
        }}
        tintColor="white"
        tintOpacity={tintOpacity}
      >
        <label
          className="readable-switch"
          style={{ width: WIDTH, height: HEIGHT }}
        >
          <input
            type="checkbox"
            role="switch"
            checked={checked}
            aria-label="Glass switch"
            onChange={event => commit(event.currentTarget.checked)}
            onKeyDown={event => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              commit(!checked);
            }}
          />
          <span className="readable-switch-track" aria-hidden="true" />
          <span
            className="readable-switch-thumb-hit-area"
            style={{
              width: THUMB_WIDTH,
              height: THUMB_HEIGHT,
              transform: `translate(${3 + x}px, 3px)`
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={event => finishPointer(event, false)}
            onPointerCancel={event => finishPointer(event, true)}
            onClick={event => event.preventDefault()}
            onDragStart={event => event.preventDefault()}
          />
        </label>
      </AaveGlass>
    </div>
  );
}
// [study:switch-example:end]
