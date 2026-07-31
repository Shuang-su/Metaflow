// [study:hero-example:start]
import { animate, motion } from 'motion/react';
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

const IDLE_LENS = 80;
const HOVER_LENS = 95;
const HOVER_RADIUS = 103;
const TRAVEL_SPEED = 90;

interface HeroState {
  x: number;
  y: number;
  lensW: number;
  lensH: number;
  radius: number;
}

export function HeroGlassExample() {
  const stageRef = useRef<HTMLDivElement>(null);
  const directionRef = useRef({ x: 1, y: 1 });
  const hoverRef = useRef(false);
  const pointerTargetRef = useRef({ x: 0.5, y: 0.5 });
  const leaveTimerRef = useRef<number | undefined>(undefined);
  const geometryAnimationsRef = useRef<Array<{ stop(): void }>>([]);
  const [mobileScale, setMobileScale] = useState(1);
  const [stageSize, setStageSize] = useState({ width: 700, height: 336 });
  const [state, setState] = useState<HeroState>({
    x: 0.5,
    y: 0.5,
    lensW: IDLE_LENS,
    lensH: IDLE_LENS,
    radius: IDLE_LENS
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const updateScale = () => setMobileScale(query.matches ? 2 / 3 : 1);
    updateScale();
    query.addEventListener('change', updateScale);
    return () => query.removeEventListener('change', updateScale);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const updateSize = () => {
      const rect = stage.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const animateGeometry = useCallback(
    (lensW: number, lensH: number, radius: number, duration: number) => {
      geometryAnimationsRef.current.forEach(control => control.stop());
      const from = stateRef.current;
      geometryAnimationsRef.current = [
        animate(from.lensW, lensW * mobileScale, {
          duration,
          ease: 'easeOut',
          onUpdate: value => {
            setState(current => ({ ...current, lensW: value }));
          }
        }),
        animate(from.lensH, lensH * mobileScale, {
          duration,
          ease: 'easeOut',
          onUpdate: value => {
            setState(current => ({ ...current, lensH: value }));
          }
        }),
        animate(from.radius, radius * mobileScale, {
          duration,
          ease: 'easeOut',
          onUpdate: value => {
            setState(current => ({ ...current, radius: value }));
          }
        })
      ];
    },
    [mobileScale]
  );

  useEffect(() => {
    if (!hoverRef.current) {
      animateGeometry(IDLE_LENS, IDLE_LENS, IDLE_LENS, 0.3);
    }
  }, [animateGeometry]);

  useEffect(() => {
    let frame = 0;
    let previous = 0;
    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      if (previous === 0) {
        previous = time;
        return;
      }
      const dt = Math.min((time - previous) / 1000, 0.05);
      previous = time;
      setState(current => {
        const minX = (current.lensW + 2) / stageSize.width;
        const minY = (current.lensH + 2) / stageSize.height;
        if (hoverRef.current) {
          const amount = 1 - Math.exp(-12 * dt);
          const targetX = Math.max(
            minX,
            Math.min(1 - minX, pointerTargetRef.current.x)
          );
          const targetY = Math.max(
            minY,
            Math.min(1 - minY, pointerTargetRef.current.y)
          );
          return {
            ...current,
            x: current.x + (targetX - current.x) * amount,
            y: current.y + (targetY - current.y) * amount
          };
        }

        let x =
          current.x +
          (TRAVEL_SPEED / stageSize.width) * directionRef.current.x * dt;
        let y =
          current.y +
          (TRAVEL_SPEED / stageSize.height) * directionRef.current.y * dt;
        if (x <= minX) {
          x = minX;
          directionRef.current.x = 1;
        } else if (x >= 1 - minX) {
          x = 1 - minX;
          directionRef.current.x = -1;
        }
        if (y <= minY) {
          y = minY;
          directionRef.current.y = 1;
        } else if (y >= 1 - minY) {
          y = 1 - minY;
          directionRef.current.y = -1;
        }
        return { ...current, x, y };
      });
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [stageSize]);

  useEffect(
    () => () => {
      if (leaveTimerRef.current !== undefined) {
        window.clearTimeout(leaveTimerRef.current);
      }
      geometryAnimationsRef.current.forEach(control => control.stop());
    },
    []
  );

  const geometry = useMemo(
    () => ({
      lensW: state.lensW,
      lensH: state.lensH,
      borderRadius: state.radius,
      mapSize: 512
    }),
    [state.lensW, state.lensH, state.radius]
  );
  // Pointer hover changes the displayed lens bounds, but the source component
  // keeps the 80px displacement texture stable and only moves/scales its
  // filter region. Regenerating the PNG on every animation frame would produce
  // a similar still image with the wrong runtime cost and motion behaviour.
  const mapGeometry = useMemo(
    () => ({
      lensW: IDLE_LENS * mobileScale,
      lensH: IDLE_LENS * mobileScale,
      borderRadius: IDLE_LENS * mobileScale,
      mapSize: 512
    }),
    [mobileScale]
  );
  const material = useMemo(
    () => ({
      ...DEFAULT_MATERIAL,
      depth: 40,
      chromaAmount: 0.4,
      scaleX: 0.07,
      scaleY: 0.07,
      blurAmount: 0.5,
      sdfBoundary: true,
      edgeFalloff: true,
      brightness: 0.12,
      specularStrength: 1,
      specularRotation: 45,
      glowStrength: 0.1,
      glowSpread: 1,
      glowExponent: 0.5,
      edgeStrength: 0.25,
      edgeWidth: 3,
      edgeExponent: 1.5,
      domeDepth: IDLE_LENS * mobileScale,
      splayAmount: 1
    }),
    [mobileScale]
  );

  return (
    <div
      ref={stageRef}
      className="readable-example readable-hero-stage"
      onPointerEnter={() => {
        if (leaveTimerRef.current !== undefined) {
          window.clearTimeout(leaveTimerRef.current);
        }
        hoverRef.current = true;
        pointerTargetRef.current = {
          x: stateRef.current.x,
          y: stateRef.current.y
        };
        animateGeometry(HOVER_LENS, HOVER_LENS, HOVER_RADIUS, 0.2);
      }}
      onPointerMove={event => {
        const rect = stageRef.current?.getBoundingClientRect();
        if (!rect) return;
        const minX = (stateRef.current.lensW + 2) / rect.width;
        const minY = (stateRef.current.lensH + 2) / rect.height;
        pointerTargetRef.current = {
          x: Math.max(
            minX,
            Math.min(1 - minX, (event.clientX - rect.left) / rect.width)
          ),
          y: Math.max(
            minY,
            Math.min(1 - minY, (event.clientY - rect.top) / rect.height)
          )
        };
      }}
      onPointerLeave={() => {
        if (leaveTimerRef.current !== undefined) {
          window.clearTimeout(leaveTimerRef.current);
        }
        leaveTimerRef.current = window.setTimeout(() => {
          hoverRef.current = false;
          animateGeometry(IDLE_LENS, IDLE_LENS, IDLE_LENS, 0.3);
        }, 400);
      }}
    >
      <AaveGlass
        className="readable-hero-glass"
        targetClassName="readable-hero-target"
        geometry={geometry}
        mapGeometry={mapGeometry}
        material={material}
        position={{
          x: state.x * stageSize.width,
          y: state.y * stageSize.height
        }}
      >
        <div className="readable-hero-content">
          <div className="readable-hero-background-frame">
            <div className="readable-hero-background" />
          </div>
          <div className="readable-hero-icon-wrap">
            <motion.div
              animate={{ y: [-6, 6] }}
              transition={{
                duration: 1,
                ease: 'easeInOut',
                repeat: Infinity,
                repeatType: 'reverse'
              }}
            >
              <motion.div
                animate={{ rotate: [3, -3] }}
                transition={{
                  duration: 1,
                  delay: -0.5,
                  ease: 'easeInOut',
                  repeat: Infinity,
                  repeatType: 'reverse'
                }}
              >
                <img
                  className="readable-hero-icon"
                  src="/design/demo/photos/aave-glass-icon.png"
                  width="320"
                  height="180"
                  alt=""
                />
              </motion.div>
            </motion.div>
          </div>
        </div>
      </AaveGlass>
    </div>
  );
}
// [study:hero-example:end]
