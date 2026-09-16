import type { XrInputSource } from 'playcanvas';

/** A brief confirmation where supported; hand/gaze input and unavailable motors stay silent. */
const confirmSelection = (source: Pick<XrInputSource, 'gamepad'>): void => {
    const actuator = source.gamepad?.hapticActuators?.[0];
    if (typeof actuator?.pulse !== 'function') return;
    try {
        void actuator.pulse(0.2, 35).catch(() => {
            // Haptics can become unavailable while the selection itself remains valid.
        });
    } catch {
        // A disconnected controller must never interrupt the selected action.
    }
};

export { confirmSelection };
