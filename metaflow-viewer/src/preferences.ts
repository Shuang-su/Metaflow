import type { EventHandler } from 'playcanvas';

import type { State } from './types';

type Preferences = Pick<State, 'performanceMode' | 'gamingControls' | 'showAnnotations' | 'guidanceMode' | 'guidanceRadius' | 'guidanceRouteDisplay'>;

const readPreferences = (mobile: boolean): Preferences => {
    const defaults = { performanceMode: mobile, gamingControls: false, showAnnotations: true, guidanceMode: false, guidanceRadius: 2 as const, guidanceRouteDisplay: 'full' as const };
    try {
        // Preserve the legacy preference migration and origin-wide keys.
        const legacyRetina = localStorage.getItem('retinaDisplay');
        let performanceMode = localStorage.getItem('performanceMode');
        if (legacyRetina !== null && performanceMode === null) {
            performanceMode = String(legacyRetina === 'false');
            try {
                localStorage.setItem('performanceMode', performanceMode);
                localStorage.removeItem('retinaDisplay');
            } catch {
                // Keep the migrated runtime value even if storage cannot be updated.
            }
        }
        return {
            performanceMode: performanceMode === null ? mobile : performanceMode === 'true',
            gamingControls: localStorage.getItem('gamingControls') === 'true',
            showAnnotations: localStorage.getItem('showAnnotations') !== 'false',
            guidanceMode: localStorage.getItem('guidanceMode') === 'true',
            guidanceRadius: localStorage.getItem('guidanceRadius') === '3' ? 3 : 2,
            guidanceRouteDisplay: localStorage.getItem('guidanceRouteDisplay') === 'near' ? 'near' : 'full'
        };
    } catch {
        // Embedded documents can be denied storage. Preferences must not prevent viewing.
        return defaults;
    }
};

const persistPreferences = (events: EventHandler) => {
    // Write changes only, so creating a viewer does not persist platform defaults.
    const subscriptions = (['performanceMode', 'gamingControls', 'showAnnotations', 'guidanceMode', 'guidanceRadius', 'guidanceRouteDisplay'] as const).map((key) =>
        events.on(`${key}:changed`, (value: boolean | number | string) => {
            try {
                localStorage.setItem(key, String(value));
            } catch {
                // Storage may be blocked or full; runtime state still takes effect.
            }
        })
    );
    return () => subscriptions.forEach((subscription) => subscription.off());
};

export { readPreferences, persistPreferences };
