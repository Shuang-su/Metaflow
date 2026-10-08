import { useEffect, useRef, type ReactNode } from "react";

/** Keep keyboard input in the foreground dialog and return it to its trigger. */
export function Modal({
  label,
  children,
  onDismiss,
  dismissOutside = true,
}: {
  label: string;
  children: ReactNode;
  onDismiss?: () => void;
  dismissOutside?: boolean;
}) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const target = root.current?.querySelector<HTMLElement>(
      "button:not(:disabled)",
    );
    (target ?? root.current)?.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={dismissOutside ? onDismiss : undefined}
    >
      <section
        ref={root}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape" && onDismiss) {
            e.preventDefault();
            onDismiss();
          }
          if (e.key !== "Tab") return;
          const controls: HTMLElement[] = root.current
            ? Array.from(
                root.current.querySelectorAll<HTMLElement>(
                  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]',
                ),
              )
            : [];
          const first = controls[0],
            last = controls[controls.length - 1];
          if (!first) {
            e.preventDefault();
            root.current?.focus();
          } else if (
            e.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === root.current)
          ) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        {children}
      </section>
    </div>
  );
}
