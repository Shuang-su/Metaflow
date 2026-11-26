export type SkyState = 'initializing' | 'dynamic' | 'static' | 'authored' | 'destroyed';
export type SkyLayer = { destroy(): void; activate(): void; update?(seconds: number): void };

/** One pass through the fallback chain. A late completion after disposal is never activated. */
export function startSkyFallback(
    factories: { dynamic(): Promise<SkyLayer>; static(): Promise<SkyLayer> },
    onState: (state: SkyState) => void
) {
    let disposed = false,
        active: SkyLayer | undefined;
    onState('initializing');
    const ready = (async () => {
        for (const state of ['dynamic', 'static'] as const) {
            let candidate: SkyLayer | undefined;
            try {
                candidate = await factories[state]();
                if (disposed) {
                    candidate.destroy();
                    return;
                }
                candidate.activate();
                active = candidate;
                onState(state);
                return;
            } catch {
                candidate?.destroy();
                if (disposed) return;
            }
        }
        if (!disposed) onState('authored');
    })();
    return {
        ready,
        update: (dt: number) => {
            if (!disposed) active?.update?.(dt);
        },
        destroy: () => {
            if (disposed) return;
            disposed = true;
            active?.destroy();
            onState('destroyed');
        }
    };
}
