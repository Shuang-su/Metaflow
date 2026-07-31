// [study:toggle-example:start]
import { animate } from 'motion';
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties
} from 'react';
import { AaveGlass } from '../react/AaveGlass';
import { useDarkMode } from '../react/useDarkMode';
import { DEFAULT_MATERIAL } from '../types';
import './example.css';

interface ToggleIconProps {
  className?: string;
}

function ToggleIcon({
  className,
  children
}: ToggleIconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const HubsIcon = memo(function HubsIcon({
  className
}: ToggleIconProps) {
  const maskId = useId();
  return (
    <ToggleIcon className={className}>
      <defs>
        <mask id={maskId}>
          <rect width="16" height="16" fill="white" />
          <path
            d="M9.998 3.79a1 1 0 0 1 1 0l2.9 1.674a1 1 0 0 1 .5.866v3.347a1 1 0 0 1-.5.866l-2.9 1.674a1 1 0 0 1-1 0L7.1 10.543a1 1 0 0 1-.5-.866V6.33a1 1 0 0 1 .5-.866L9.998 3.79Z"
            fill="black"
            stroke="black"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </mask>
      </defs>
      <path
        d="M4.902 2.948a1.2 1.2 0 0 1 1.2 0L9.58 4.956a1.2 1.2 0 0 1 .6 1.04v4.016a1.2 1.2 0 0 1-.6 1.04l-3.478 2.008a1.2 1.2 0 0 1-1.2 0l-3.479-2.008a1.2 1.2 0 0 1-.6-1.04V5.996a1.2 1.2 0 0 1 .6-1.04l3.479-2.008Z"
        fill="var(--color-1)"
        mask={`url(#${maskId})`}
      />
      <path
        d="M9.998 3.79a1 1 0 0 1 1 0l2.9 1.674a1 1 0 0 1 .5.866v3.347a1 1 0 0 1-.5.866l-2.9 1.674a1 1 0 0 1-1 0L7.1 10.543a1 1 0 0 1-.5-.866V6.33a1 1 0 0 1 .5-.866L9.998 3.79Z"
        fill="var(--color-2)"
      />
    </ToggleIcon>
  );
});

const SpokesIcon = memo(function SpokesIcon({
  className
}: ToggleIconProps) {
  return (
    <ToggleIcon className={className}>
      <path
        d="M5.053 2.219c-.185-.365-.041-.815.34-.962A7.2 7.2 0 0 1 9.74.983c.397.099.596.527.458.912l-.356.987a.74.74 0 0 1-.965.501 4.5 4.5 0 0 0-2.327.147.74.74 0 0 1-1.02-.377l-.477-.934ZM10.945 13.782c.185.364.041.814-.34.961a7.2 7.2 0 0 1-4.346.274c-.397-.099-.596-.527-.458-.912l.355-.987a.74.74 0 0 1 .965-.501 4.5 4.5 0 0 0 2.328-.147.74.74 0 0 1 1.02.377l.476.935ZM1.52 7.66a.74.74 0 0 1-.664-.775 7.2 7.2 0 0 1 1.937-3.9.74.74 0 0 1 1.018.06l.677.8a.74.74 0 0 1-.048 1.087 4.5 4.5 0 0 0-1.037 2.089.74.74 0 0 1-.836.694L1.52 7.66ZM11.534 2.559a.74.74 0 0 1 1.003-.187 7.2 7.2 0 0 1 2.41 3.627.74.74 0 0 1-.561.852l-1.032.186a.74.74 0 0 1-.917-.585 4.5 4.5 0 0 0-1.29-1.942.74.74 0 0 1-.184-1.072l.57-.88ZM14.48 8.34a.74.74 0 0 1 .664.775 7.2 7.2 0 0 1-1.937 3.9.74.74 0 0 1-1.018-.06l-.677-.8a.74.74 0 0 1 .048-1.087 4.5 4.5 0 0 0 1.037-2.089.74.74 0 0 1 .836-.694l1.047.055ZM4.466 13.441a.74.74 0 0 1-1.003.187 7.2 7.2 0 0 1-2.41-3.627.74.74 0 0 1 .561-.852l1.032-.186a.74.74 0 0 1 .917.585 4.5 4.5 0 0 0 1.29 1.942.74.74 0 0 1 .184 1.072l-.57.88Z"
        fill="var(--color-1)"
      />
      <circle cx="8" cy="8" r="3" fill="var(--color-2)" />
    </ToggleIcon>
  );
});

const ReservesIcon = memo(function ReservesIcon({
  className
}: ToggleIconProps) {
  const maskId = useId();
  return (
    <ToggleIcon className={className}>
      <defs>
        <mask id={maskId}>
          <rect width="16" height="16" fill="white" />
          <circle
            cx="5.5"
            cy="6"
            r="5.125"
            fill="black"
            stroke="black"
            strokeWidth="3"
          />
        </mask>
      </defs>
      <circle
        cx="10.5"
        cy="10"
        r="4.5"
        fill="var(--color-2)"
        mask={`url(#${maskId})`}
      />
      <circle cx="5.5" cy="6" r="5.125" fill="var(--color-1)" />
    </ToggleIcon>
  );
});

const AssetsIcon = memo(function AssetsIcon({
  className
}: ToggleIconProps) {
  return (
    <ToggleIcon className={className}>
      <path
        d="M7.971 15.015c-3.054 0-5.53-1.486-5.53-3.318v-.955c.298.281.63.529.977.737 1.225.735 2.838 1.15 4.553 1.15 1.714 0 3.327-.415 4.553-1.15.347-.208.679-.456.976-.737v.955c0 1.832-2.475 3.318-5.53 3.318ZM7.971 11.379c-3.054 0-5.53-1.485-5.53-3.318v-.954c.298.281.63.528.977.737 1.225.735 2.838 1.15 4.553 1.15 1.714 0 3.327-.415 4.553-1.15.347-.209.679-.456.976-.737v.954c0 1.833-2.475 3.318-5.53 3.318Z"
        fill="var(--color-1)"
      />
      <ellipse
        cx="7.971"
        cy="4.426"
        rx="5.53"
        ry="3.318"
        fill="var(--color-2)"
      />
    </ToggleIcon>
  );
});

const ChainsIcon = memo(function ChainsIcon({
  className
}: ToggleIconProps) {
  return (
    <ToggleIcon className={className}>
      <circle cx="12.5" cy="8" r="2.5" fill="var(--color-1)" />
      <circle cx="4.5" cy="3.5" r="2.5" fill="var(--color-1)" />
      <circle cx="4.5" cy="12.5" r="2.5" fill="var(--color-1)" />
      <circle cx="8.377" cy="10.293" r="1.273" fill="var(--color-2)" />
      <circle cx="4.301" cy="8" r="1.273" fill="var(--color-2)" />
      <circle cx="8.377" cy="5.707" r="1.273" fill="var(--color-2)" />
    </ToggleIcon>
  );
});

const options = [
  {
    code: 'hubs',
    name: 'Hubs',
    color1: '#00aeff',
    color2: '#008aff',
    Icon: HubsIcon
  },
  {
    code: 'spokes',
    name: 'Spokes',
    color1: '#bdbbff',
    color2: '#9896ff',
    Icon: SpokesIcon
  },
  {
    code: 'reserves',
    name: 'Reserves',
    color1: '#39beb7',
    color2: '#00827b',
    Icon: ReservesIcon
  },
  {
    code: 'assets',
    name: 'Assets',
    color1: '#ff8130',
    color2: '#ff0000',
    Icon: AssetsIcon
  },
  {
    code: 'chains',
    name: 'Chains',
    color1: '#ffd400',
    color2: '#ffb400',
    Icon: ChainsIcon
  }
];

const toggleMaterialLight = {
  ...DEFAULT_MATERIAL,
  depth: 2.5,
  chromaAmount: 0.1,
  scaleX: 0.045,
  scaleY: 0.025,
  sdfBoundary: true,
  edgeFalloff: true,
  domeDepth: 0,
  splayAmount: 1,
  brightness: -0.04,
  specularStrength: 1,
  specularRotation: 28,
  specularDark: true,
  glowStrength: 0,
  glowSpread: 0.5,
  glowExponent: 3,
  edgeStrength: 0.15,
  edgeWidth: 1.5,
  edgeExponent: 1
};

const toggleMaterialDark = {
  ...toggleMaterialLight,
  brightness: 0.06,
  specularRotation: 45,
  specularDark: false,
  glowStrength: 0.5,
  glowSpread: 0.3,
  glowExponent: 1.5,
  edgeStrength: 0.6,
  edgeWidth: 1,
  edgeExponent: 1.5
};

export function ToggleExample() {
  const dark = useDarkMode();
  const toggleMaterial = dark
    ? toggleMaterialDark
    : toggleMaterialLight;
  const [compact, setCompact] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 639px)').matches
  );
  const [selected, setSelected] = useState('hubs');
  const [hostSize, setHostSize] = useState({
    width: compact ? 194.5 : 504,
    height: 46
  });
  const [lens, setLens] = useState({
    x: 84,
    y: 103,
    halfWidth: 43,
    halfHeight: 20
  });
  const [deformation, setDeformation] = useState(0);
  const groupRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const lensRef = useRef(lens);
  const travelAnimation = useRef<Array<{ stop(): void }>>([]);
  const deformationFrame = useRef(0);
  const deformationRunning = useRef(false);
  const deformationTime = useRef(0);
  const deformationPosition = useRef(lens.x);
  const deformationValue = useRef(0);
  const deformationVelocity = useRef(0);
  const visibleOptions = compact ? options.slice(0, 2) : options;

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const sync = () => {
      setCompact(media.matches);
      if (media.matches) setSelected(current =>
        options.slice(0, 2).some(option => option.code === current)
          ? current
          : 'hubs'
      );
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const updateLens = useCallback(
    (patch: Partial<typeof lens>) => {
      lensRef.current = { ...lensRef.current, ...patch };
      setLens(lensRef.current);
    },
    []
  );

  const startDeformation = useCallback(() => {
    if (deformationRunning.current) return;
    deformationRunning.current = true;
    deformationTime.current = performance.now();
    deformationPosition.current = lensRef.current.x;

    const frame = (now: number) => {
      const dt = Math.min((now - deformationTime.current) / 1000, 0.033);
      deformationTime.current = now;
      const x = lensRef.current.x;
      const xVelocity =
        (x - deformationPosition.current) /
        Math.max(dt, 0.008);
      deformationPosition.current = x;
      const target = Math.min(
        0.3,
        Math.sqrt(Math.abs(xVelocity)) * 0.134
      );
      const acceleration =
        -66 * (deformationValue.current - target) -
        4.5 * deformationVelocity.current;
      deformationVelocity.current += acceleration * dt;
      deformationValue.current += deformationVelocity.current * dt;
      setDeformation(deformationValue.current);

      if (
        Math.abs(deformationValue.current) < 0.0005 &&
        Math.abs(deformationVelocity.current) < 0.005 &&
        Math.abs(xVelocity) < 0.005
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
  }, []);

  const placeLens = useCallback(
    (code: string, instant = false) => {
      const host = groupRef.current?.closest(
        '[data-aave-glass-container]'
      ) as HTMLDivElement | null;
      const item = itemRefs.current.get(code);
      if (!host || !item || item.offsetParent === null) return;
      const hostRect = host.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      const next = {
        x: itemRect.left + itemRect.width / 2 - hostRect.left,
        y: itemRect.top + itemRect.height / 2 - hostRect.top,
        halfWidth: itemRect.width / 2,
        halfHeight: itemRect.height / 2
      };

      travelAnimation.current.forEach(control => control.stop());
      travelAnimation.current = [];
      if (instant) {
        updateLens(next);
        return;
      }
      const transition = {
        type: 'spring' as const,
        stiffness: 50,
        damping: 13
      };
      (Object.keys(next) as Array<keyof typeof next>).forEach(key => {
        travelAnimation.current.push(
          animate(lensRef.current[key], next[key], {
            ...transition,
            onUpdate: value => {
              updateLens({ [key]: value });
              if (key === 'x') startDeformation();
            }
          })
        );
      });
    },
    [startDeformation, updateLens]
  );

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const sync = (instant: boolean) => {
      const rect = group.getBoundingClientRect();
      setHostSize({
        width: rect.width,
        height: rect.height
      });
      requestAnimationFrame(() => placeLens(selected, instant));
    };
    sync(true);
    let first = true;
    const observer = new ResizeObserver(() => {
      sync(first);
      first = false;
    });
    observer.observe(group);
    return () => observer.disconnect();
  }, [placeLens, selected]);

  useEffect(() => {
    placeLens(selected);
  }, [placeLens, selected]);

  useEffect(
    () => () => {
      travelAnimation.current.forEach(control => control.stop());
      cancelAnimationFrame(deformationFrame.current);
    },
    []
  );

  const deformedWidth =
    lens.halfWidth *
    (1 - deformation * (deformation > 0 ? 0.3 : 2));
  const deformedHeight =
    lens.halfHeight * (1 + deformation * 4);
  const depth =
    toggleMaterial.depth *
    (1 + (deformedHeight / Math.max(1, lens.halfHeight) - 1) * 1.25);

  const renderItems = (overlay: boolean) =>
    visibleOptions.map(({ code, name, color1, color2, Icon }) => {
      const style = {
        '--color-1': color1,
        '--color-2': color2
      } as CSSProperties;
      if (overlay) {
        return (
          <div
            key={code}
            className="readable-toggle-item readable-toggle-item-overlay"
            style={style}
          >
            <Icon className="readable-toggle-icon" />
            <span>{name}</span>
          </div>
        );
      }
      return (
        <button
          key={code}
          ref={element => {
            if (element) itemRefs.current.set(code, element);
            else itemRefs.current.delete(code);
          }}
          type="button"
          className="readable-toggle-item"
          style={style}
          aria-pressed={selected === code}
          onClick={() => setSelected(code)}
        >
          <Icon className="readable-toggle-icon" />
          <span>{name}</span>
        </button>
      );
    });

  return (
    <div className="readable-example readable-toggle-example">
      <div className="readable-control-stage readable-toggle-stage">
        <AaveGlass
          className="readable-toggle-glass"
          style={{
            width: hostSize.width,
            height: hostSize.height,
            padding: '80px 40px',
            margin: '-80px -40px',
            boxSizing: 'content-box',
            overflow: 'visible'
          }}
          targetClassName="readable-toggle-refraction"
          targetStyle={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          contentStyle={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          refractionTarget={
            <div className="readable-toggle-group readable-toggle-group-overlay">
              {renderItems(true)}
            </div>
          }
          geometry={{
            lensW: deformedWidth,
            lensH: deformedHeight,
            borderRadius: Math.min(deformedWidth, deformedHeight),
            mapSize: 256
          }}
          material={{ ...toggleMaterial, depth }}
          position={{ x: lens.x, y: lens.y }}
          tintOpacity={0}
        >
          <div
            ref={groupRef}
            className="readable-toggle-group"
            role="group"
            aria-label="Aave 视图"
          >
            {renderItems(false)}
          </div>
        </AaveGlass>
      </div>
    </div>
  );
}
// [study:toggle-example:end]
