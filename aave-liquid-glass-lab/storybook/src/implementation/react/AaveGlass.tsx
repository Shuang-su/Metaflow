import { useEffect, useLayoutEffect, useRef } from 'react';
import { createSvgGlass } from '../svg-glass';
import type {
  GlassMaterial,
  LensGeometry,
  LensMapResource,
  LensPosition,
  SvgGlassController
} from '../types';

interface AaveGlassProps {
  geometry: LensGeometry;
  mapGeometry?: LensGeometry;
  material: GlassMaterial;
  position: LensPosition;
  children: React.ReactNode;
  refractionTarget?: React.ReactNode;
  className?: string;
  targetClassName?: string;
  style?: React.CSSProperties;
  targetStyle?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  tintColor?: string;
  tintOpacity?: number;
  tintBlur?: number;
  shadowOpacity?: number;
  restShadowOpacity?: number;
  edgeBias?: number;
  filterResolution?: number;
  onLensMapChange?(map: LensMapResource): void;
  onGenerationTime?(timing: {
    loop: number;
    encode: number;
    total: number;
  }): void;
}

// [study:react-adapter:start]
export function AaveGlass({
  geometry,
  mapGeometry,
  material,
  position,
  children,
  refractionTarget,
  className,
  targetClassName,
  style,
  targetStyle,
  contentStyle,
  tintColor,
  tintOpacity,
  tintBlur,
  shadowOpacity,
  restShadowOpacity,
  edgeBias,
  filterResolution = 1,
  onLensMapChange,
  onGenerationTime
}: AaveGlassProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SvgGlassController | undefined>(undefined);

  useLayoutEffect(() => {
    if (!hostRef.current || !targetRef.current) return;
    controllerRef.current = createSvgGlass({
      host: hostRef.current,
      target: targetRef.current,
      geometry,
      mapGeometry,
      material,
      position,
      tintColor,
      tintOpacity,
      tintBlur,
      shadowOpacity,
      restShadowOpacity,
      edgeBias,
      filterResolution,
      clipTarget: refractionTarget !== undefined
    });
    const map = controllerRef.current.getMap();
    onLensMapChange?.(map);
    onGenerationTime?.({
      loop: map.loopMs,
      encode: map.encodeMs,
      total: map.loopMs + map.encodeMs
    });
    return () => controllerRef.current?.destroy();
    // controller 只创建一次；参数变化走 update，避免重建 SVG filter DOM。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    controllerRef.current?.update({
      geometry,
      mapGeometry,
      material,
      position,
      tintColor,
      tintOpacity,
      tintBlur,
      shadowOpacity,
      restShadowOpacity,
      edgeBias
    });
    const map = controllerRef.current?.getMap();
    if (map) {
      onLensMapChange?.(map);
      onGenerationTime?.({
        loop: map.loopMs,
        encode: map.encodeMs,
        total: map.loopMs + map.encodeMs
      });
    }
  }, [
    geometry,
    mapGeometry,
    material,
    position,
    tintColor,
    tintOpacity,
    tintBlur,
    shadowOpacity,
    restShadowOpacity,
    edgeBias,
    onLensMapChange,
    onGenerationTime
  ]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ position: 'relative', ...style }}
    >
      {refractionTarget ? (
        <div
          className="aave-glass-content"
          style={{ position: 'relative', ...contentStyle }}
        >
          {children}
        </div>
      ) : null}
      <div
        ref={targetRef}
        className={targetClassName}
        style={{
          ...(refractionTarget
            ? {
                position: 'absolute',
                top: 0,
                left: 0,
                pointerEvents: 'none',
                willChange: 'filter, clip-path'
              }
            : {}),
          ...targetStyle,
          ...(refractionTarget && filterResolution !== 1
            ? {
                width: `${filterResolution * 100}%`,
                height: `${filterResolution * 100}%`,
                right: 'auto',
                bottom: 'auto',
                transform: `scale(${1 / filterResolution})`,
                transformOrigin: 'top left'
              }
            : {})
        }}
      >
        {refractionTarget ? (
          <div
            style={
              filterResolution !== 1
                ? {
                    width: `${100 / filterResolution}%`,
                    height: `${100 / filterResolution}%`,
                    transform: `scale(${filterResolution})`,
                    transformOrigin: 'top left'
                  }
                : undefined
            }
          >
            {refractionTarget}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
// [study:react-adapter:end]
