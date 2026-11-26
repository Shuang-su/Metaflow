import type { EventHandler } from 'playcanvas';

import { QUALITY_LEVELS } from './quality';
import type { QualityLevel, State } from './types';

type Preferences = Pick<State, 'quality' | 'performanceMode' | 'gamingControls' | 'showAnnotations'>;

const readPreferences = (mobile: boolean): Preferences => {
    const defaults: Preferences = {
        quality: mobile ? 'performance' : 'default',
        performanceMode: mobile,
        gamingControls: false,
        showAnnotations: true
    };
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
        const stored = localStorage.getItem('quality') as QualityLevel;
        const legacy =
            performanceMode === null ? defaults.quality : performanceMode === 'true' ? 'performance' : 'default';
        const quality = QUALITY_LEVELS.includes(stored) ? stored : legacy;
        return {
            quality,
            performanceMode: quality === 'performance',
            gamingControls: localStorage.getItem('gamingControls') === 'true',
            showAnnotations: localStorage.getItem('showAnnotations') !== 'false'
        };
    } catch {
        // Embedded documents can be denied storage. Preferences must not prevent viewing.
        return defaults;
    }
};

const persistPreferences = (events: EventHandler) => {
    // Write changes only, so creating a viewer does not persist platform defaults.
    const subscriptions = (['quality', 'performanceMode', 'gamingControls', 'showAnnotations'] as const).map((key) =>
        // A slider change only writes quality. The standalone viewer uses its legacy
        // performanceMode key for a separate renderer preference on the same origin.
        events.on(
            key === 'performanceMode' ? 'legacyPerformancePreference' : `${key}:changed`,
            (value: string | boolean) => {
                try {
                    localStorage.setItem(key, String(value));
                } catch {
                    // Storage may be blocked or full; runtime state still takes effect.
                }
            }
        )
    );
    return () => subscriptions.forEach((subscription) => subscription.off());
};

export { readPreferences, persistPreferences };
