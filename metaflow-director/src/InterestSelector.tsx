import { useRef, useState } from "react";
import { Crop } from "lucide-react";
export type InterestArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};
/** The source uses a rectangular drag area; map its center through sharp 3D picking. */
export function InterestSelector({
  onSelect,
  selections,
  onCancel,
  ready = true,
  clickSize = 0.3,
}: {
  clickSize?: number;
  ready?: boolean;
  selections: (InterestArea | null)[];
  onSelect: (area: InterestArea, index: number) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const start = useRef<[number, number] | null>(null);
  const pointerId = useRef<number | null>(null);
  const startPixels = useRef<[number, number]>([0, 0]);
  const [area, setArea] = useState<InterestArea | null>(null),
    [pending, setPending] = useState(false);
  const coordinate = (
    e: React.PointerEvent<HTMLDivElement>,
  ): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    ];
  };
  return (
    <>
      <span
        className={`auto-motion-selection-hint ${!ready || area || pending ? "is-hidden" : ""}`}
      >
        <Crop size={13} strokeWidth={1.9} />
        Click or drag to select interest points
      </span>
      <div
        className="auto-motion-overlay is-select director-interest-overlay"
        tabIndex={0}
        aria-label="Select interest area"
        aria-busy={!ready || pending}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          }
        }}
        onPointerDown={(e) => {
          if (!ready || pending || e.button !== 0 || pointerId.current !== null)
            return;
          e.preventDefault();
          pointerId.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          start.current = coordinate(e);
          startPixels.current = [e.clientX, e.clientY];
          setArea(null);
        }}
        onPointerMove={(e) => {
          if (!start.current || pointerId.current !== e.pointerId) return;
          const [x, y] = coordinate(e),
            [sx, sy] = start.current;
          setArea({
            x: Math.min(x, sx),
            y: Math.min(y, sy),
            width: Math.abs(x - sx),
            height: Math.abs(y - sy),
          });
        }}
        onPointerUp={(e) => {
          if (!start.current || pointerId.current !== e.pointerId) return;
          const [x, y] = coordinate(e),
            [sx, sy] = start.current;
          start.current = null;
          pointerId.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
          let a = {
            x: Math.min(x, sx),
            y: Math.min(y, sy),
            width: Math.abs(x - sx),
            height: Math.abs(y - sy),
          };
          const dragged =
            Math.hypot(
              e.clientX - startPixels.current[0],
              e.clientY - startPixels.current[1],
            ) >= 4;
          if (!dragged)
            a = {
              x: sx - clickSize / 2,
              y: sy - clickSize / 2,
              width: clickSize,
              height: clickSize,
            };
          else if (a.width < 0.025 || a.height < 0.025) {
            setArea(null);
            return;
          }
          setArea(a);
          setPending(true);
          void onSelect(a, editing ?? selections.length)
            .then((selected) => {
              if (selected) setEditing(null);
              setArea(null);
            })
            .catch(() => setArea(null))
            .finally(() => setPending(false));
        }}
        onPointerCancel={(e) => {
          if (pointerId.current !== e.pointerId) return;
          pointerId.current = null;
          start.current = null;
          setArea(null);
        }}
        onLostPointerCapture={(e) => {
          if (pointerId.current !== e.pointerId) return;
          pointerId.current = null;
          start.current = null;
          setArea(null);
        }}
      >
        {(area && editing !== null
          ? selections.map((saved, i) => (i === editing ? area : saved))
          : [...selections, ...(area ? [area] : [])]
        ).map(
          (area, index) =>
            area && (
              <div
                key={index}
                className={
                  index < selections.length && index !== editing
                    ? "auto-motion-focus-area"
                    : "auto-motion-selection"
                }
                style={{
                  // Clip presentation only; preserve the selected center used by 3D picking.
                  left: `${Math.max(0, area.x) * 100}%`,
                  top: `${Math.max(0, area.y) * 100}%`,
                  width: `${Math.max(0, Math.min(1, area.x + area.width) - Math.max(0, area.x)) * 100}%`,
                  height: `${Math.max(0, Math.min(1, area.y + area.height) - Math.max(0, area.y)) * 100}%`,
                }}
              >
                {index < selections.length && index !== editing ? (
                  <button
                    type="button"
                    aria-label={`Edit interest area ${index + 1}`}
                    disabled={!ready || pending}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setEditing(index);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(index);
                    }}
                    className="auto-motion-focus-handle"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </button>
                ) : (
                  ["top-left", "top-right", "bottom-right", "bottom-left"].map(
                    (c) => <i key={c} className={`is-${c}`} />,
                  )
                )}
              </div>
            ),
        )}
      </div>
    </>
  );
}
