// [study:slider-example:start]
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

const DESKTOP_WIDTH = 240;
const MOBILE_WIDTH = 200;
const THUMB_WIDTH = 44;
const THUMB_HEIGHT = 22;
const TRACK_HEIGHT = 6;
const REFRACTION_TRACK_HEIGHT = Math.round(0.75 * THUMB_HEIGHT);
const RUBBER_OVERSHOOT = 0.05;
const RUBBER_DAMPENING = 30;

const PRESS_TRANSITION = {
  duration: 0.32,
  ease: [0.22, 1.15, 0.36, 1.06] as const
};
const RELEASE_TRANSITION = {
  duration: 0.52,
  ease: [0.22, 1, 0.36, 1] as const
};

const sliderMaterialLight = {
  ...DEFAULT_MATERIAL,
  depth: 2,
  chromaAmount: 0.65,
  scaleX: 0.1,
  scaleY: 0.1,
  sdfBoundary: true,
  edgeFalloff: true,
  domeDepth: 5,
  splayAmount: 0.5,
  brightness: -0.02,
  specularStrength: 1.5,
  specularRotation: 30,
  specularDark: true,
  glowStrength: 0.4,
  glowSpread: 0.5,
  glowExponent: 2,
  edgeStrength: 0.5,
  edgeWidth: 1,
  edgeExponent: 1,
  edgeShadow: '0 2px 6px rgba(0, 0, 0, 0.16)',
  edgeInsetShadow: '0 -4px 10px rgba(0, 0, 0, 0.12)'
};

const sliderMaterialDark = {
  ...sliderMaterialLight,
  scaleX: 0.133,
  scaleY: 0.135,
  brightness: 0.12,
  specularRotation: 45,
  specularDark: false,
  glowExponent: 1.5,
  edgeWidth: 1,
  edgeExponent: 1.5
};

function rubberBand(
  distance: number,
  overshoot: number,
  dampening: number
): number {
  return (
    overshoot *
    (1 -
      Math.pow(
        1 - Math.min(1, distance / dampening),
        3
      ))
  );
}

export function SliderExample() {
  const dark = useDarkMode();
  const sliderMaterial = dark
    ? sliderMaterialDark
    : sliderMaterialLight;
  const [width, setWidth] = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 767px)').matches
      ? MOBILE_WIDTH
      : DESKTOP_WIDTH
  );
  const travel = width - THUMB_WIDTH;
  const overshoot = width * RUBBER_OVERSHOOT;
  const overshootDampening = overshoot * RUBBER_DAMPENING;
  const bleed =
    Math.ceil(
      0.5 * Math.max(THUMB_WIDTH / 2, THUMB_HEIGHT / 2) +
        overshoot
    ) + 2;
  const hostWidth = width + 2 * bleed;
  const hostHeight = THUMB_HEIGHT + 2 * bleed;

  const [value, setValue] = useState(50);
  const [x, setX] = useState(travel / 2);
  const [lensHalfWidth, setLensHalfWidth] =
    useState(THUMB_WIDTH / 2);
  const [lensHalfHeight, setLensHalfHeight] =
    useState(THUMB_HEIGHT / 2);
  const [lensRadius, setLensRadius] = useState(THUMB_HEIGHT / 2);
  const [tintOpacity, setTintOpacity] = useState(1);
  const [targetScaleX, setTargetScaleX] = useState(0.85);
  const [targetScaleY, setTargetScaleY] = useState(0.525);
  const [deformation, setDeformation] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pointerId = useRef<number | null>(null);
  const pointerStart = useRef(0);
  const dragStart = useRef(0);
  const dragging = useRef(false);
  const xRef = useRef(x);
  const positionAnimation = useRef<{ stop(): void } | undefined>(
    undefined
  );
  const shapeAnimations = useRef<Array<{ stop(): void }>>([]);
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

  const positionToValue = (position: number): number =>
    travel > 0
      ? Math.round((Math.max(0, Math.min(travel, position)) / travel) * 100)
      : 0;

  const setPosition = (position: number, updateValue = true) => {
    xRef.current = position;
    setX(position);
    if (updateValue) setValue(positionToValue(position));
    startDeformation();
  };

  const stopShapeAnimations = () => {
    shapeAnimations.current.forEach(control => control.stop());
    shapeAnimations.current = [];
  };

  const runShape = (
    from: number,
    to: number,
    setter: (next: number) => void,
    transition: typeof PRESS_TRANSITION | typeof RELEASE_TRANSITION
  ) => {
    shapeAnimations.current.push(
      animate(from, to, {
        ...transition,
        onUpdate: setter
      })
    );
  };

  const expand = () => {
    stopShapeAnimations();
    runShape(
      lensHalfWidth,
      1.5 * (THUMB_WIDTH / 2),
      setLensHalfWidth,
      PRESS_TRANSITION
    );
    runShape(
      lensHalfHeight,
      1.5 * (THUMB_HEIGHT / 2),
      setLensHalfHeight,
      PRESS_TRANSITION
    );
    runShape(
      lensRadius,
      1.5 * (THUMB_HEIGHT / 2),
      setLensRadius,
      PRESS_TRANSITION
    );
    runShape(tintOpacity, 0, setTintOpacity, PRESS_TRANSITION);
    runShape(targetScaleX, 0.95, setTargetScaleX, PRESS_TRANSITION);
    runShape(targetScaleY, 0.975, setTargetScaleY, PRESS_TRANSITION);
    deformationForce.current = 0.175;
    startDeformation();
  };

  const collapse = () => {
    stopShapeAnimations();
    runShape(
      lensHalfWidth,
      THUMB_WIDTH / 2,
      setLensHalfWidth,
      RELEASE_TRANSITION
    );
    runShape(
      lensHalfHeight,
      THUMB_HEIGHT / 2,
      setLensHalfHeight,
      RELEASE_TRANSITION
    );
    runShape(
      lensRadius,
      THUMB_HEIGHT / 2,
      setLensRadius,
      RELEASE_TRANSITION
    );
    runShape(tintOpacity, 1, setTintOpacity, RELEASE_TRANSITION);
    runShape(targetScaleX, 0.85, setTargetScaleX, RELEASE_TRANSITION);
    runShape(targetScaleY, 0.525, setTargetScaleY, RELEASE_TRANSITION);
    deformationForce.current = 0;
    startDeformation();
  };

  const onPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (pointerId.current !== null) return;
    pointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    inputRef.current?.focus({ preventScroll: true });
    positionAnimation.current?.stop();
    dragging.current = true;

    const rect = event.currentTarget.getBoundingClientRect();
    const next = Math.max(
      0,
      Math.min(travel, event.clientX - rect.left - THUMB_WIDTH / 2)
    );
    setPosition(next);
    pointerStart.current = event.clientX;
    dragStart.current = next;
    expand();
  };

  const onPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (event.pointerId !== pointerId.current) return;
    let next = dragStart.current + event.clientX - pointerStart.current;
    if (next < 0) {
      next = -rubberBand(-next, overshoot, overshootDampening);
    } else if (next > travel) {
      next =
        travel +
        rubberBand(next - travel, overshoot, overshootDampening);
    }
    setPosition(next);
  };

  const finishPointer = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (event.pointerId !== pointerId.current) return;
    pointerId.current = null;
    dragging.current = false;
    deformationForce.current = 0;
    const next = Math.max(0, Math.min(travel, xRef.current));
    positionAnimation.current = animate(xRef.current, next, {
      ...RELEASE_TRANSITION,
      onUpdate: position => setPosition(position)
    });
    collapse();
  };

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const syncWidth = () => {
      const nextWidth = query.matches ? MOBILE_WIDTH : DESKTOP_WIDTH;
      setWidth(nextWidth);
    };
    query.addEventListener('change', syncWidth);
    return () => query.removeEventListener('change', syncWidth);
  }, []);

  useEffect(() => {
    if (dragging.current) return;
    const nextTravel = width - THUMB_WIDTH;
    const next = (value / 100) * nextTravel;
    xRef.current = next;
    setX(next);
  }, [width, value]);

  useEffect(
    () => () => {
      stopShapeAnimations();
      positionAnimation.current?.stop();
      cancelAnimationFrame(deformationFrame.current);
      if (
        pointerId.current !== null &&
        rootRef.current?.hasPointerCapture(pointerId.current)
      ) {
        rootRef.current.releasePointerCapture(pointerId.current);
      }
    },
    []
  );

  const progress = travel > 0 ? x / travel : 0;
  const refractionTarget = (
    <div
      className="readable-slider-refraction-padding"
      style={{ padding: bleed, height: THUMB_HEIGHT }}
    >
      <div
        className="readable-slider-refraction-track"
        style={{
          width,
          height: REFRACTION_TRACK_HEIGHT,
          borderRadius: REFRACTION_TRACK_HEIGHT / 2,
          transform: `scale(${targetScaleX}, ${targetScaleY})`
        }}
      >
        <span className="readable-slider-refraction-base" />
        <span
          className="readable-slider-refraction-fill"
          style={{
            transform: `translateX(${(progress - 1) * 100}%)`
          }}
        />
      </div>
    </div>
  );

  return (
    <div className="readable-example readable-slider-example">
      <div
        className="readable-slider-wrapper"
        style={{ width, height: THUMB_HEIGHT }}
      >
        <AaveGlass
          className="readable-slider-glass"
          style={{
            width: hostWidth,
            height: hostHeight,
            margin: -bleed,
            overflow: 'visible'
          }}
          targetClassName="readable-slider-refraction"
          targetStyle={{ position: 'absolute', inset: 0 }}
          contentStyle={{
            padding: bleed,
            boxSizing: 'border-box'
          }}
          refractionTarget={refractionTarget}
          geometry={{
            lensW: lensHalfWidth * (1 - 0.2 * deformation),
            lensH: lensHalfHeight * (1 + 0.4 * deformation),
            borderRadius: lensRadius,
            mapSize: 256
          }}
          material={sliderMaterial}
          position={{
            x: bleed + THUMB_WIDTH / 2 + x,
            y: bleed + THUMB_HEIGHT / 2
          }}
          tintColor="white"
          tintOpacity={tintOpacity}
        >
          <div className="readable-slider-content">
            <input
              ref={inputRef}
              className="readable-slider-native"
              type="range"
              min="0"
              max="100"
              step="1"
              value={value}
              aria-label="玻璃滑块"
              onChange={event => {
                const nextValue = event.currentTarget.valueAsNumber;
                setValue(nextValue);
                setPosition((nextValue / 100) * travel, false);
              }}
            />
            <div
              ref={rootRef}
              className="readable-slider-root"
              style={{ width, height: THUMB_HEIGHT }}
              aria-hidden="true"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={finishPointer}
              onPointerCancel={finishPointer}
              onDragStart={event => event.preventDefault()}
            >
              <div
                className="readable-slider-track"
                style={{
                  height: TRACK_HEIGHT,
                  borderRadius: TRACK_HEIGHT / 2
                }}
              >
                <span className="readable-slider-track-base" />
                <span
                  className="readable-slider-fill"
                  style={{ width: THUMB_WIDTH / 2 + x }}
                />
              </div>
              <span
                className="readable-slider-thumb-hit-area"
                style={{
                  width: THUMB_WIDTH,
                  height: THUMB_HEIGHT,
                  transform: `translateX(${x}px)`
                }}
              />
            </div>
          </div>
        </AaveGlass>
      </div>
    </div>
  );
}
// [study:slider-example:end]
