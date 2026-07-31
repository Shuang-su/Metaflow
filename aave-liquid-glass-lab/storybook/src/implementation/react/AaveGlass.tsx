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
      tintOpacity
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
      tintOpacity
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
    onLensMapChange,
    onGenerationTime
  ]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ position: 'relative', ...style }}
    >
      <div
        ref={targetRef}
        className={targetClassName}
        style={{
          pointerEvents: refractionTarget ? 'none' : undefined,
          ...targetStyle
        }}
      >
        {refractionTarget ?? children}
      </div>
      {refractionTarget ? (
        <div
          className="aave-glass-content"
          style={{ position: 'absolute', inset: 0, ...contentStyle }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
// [study:react-adapter:end]
