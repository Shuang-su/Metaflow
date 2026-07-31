import { useEffect, useRef, useState } from 'react';
import { ensureOriginRuntime } from './runtime';
import type { OriginCaseId } from './types';

export function OriginModuleHost({ caseId }: { caseId: OriginCaseId }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let disposed = false;
    let unmount: (() => void) | undefined;
    setReady(false);
    setError(undefined);

    void ensureOriginRuntime()
      .then(runtime => {
        if (disposed || !hostRef.current) return;
        unmount = runtime.mount(caseId, hostRef.current);
        setReady(true);
      })
      .catch(reason => {
        if (!disposed) setError(reason instanceof Error ? reason.message : String(reason));
      });

    return () => {
      disposed = true;
      unmount?.();
    };
  }, [caseId]);

  return (
    <div className="origin-demo-frame" data-origin-case={caseId} data-ready={ready || undefined}>
      <div ref={hostRef} className="origin-demo-host" />
      {error ? (
        <div className="origin-demo-error" role="alert">
          原组件加载失败：{error}
        </div>
      ) : null}
    </div>
  );
}
