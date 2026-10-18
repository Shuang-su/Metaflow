import type { ScenePicker } from './picker';

// Consumers keep one picker while XR and captures temporarily use the sorted renderer.
// Results from the previous rendering path must not update a later frame's navigation/UI.
const createSwitchingPicker = (sorted: ScenePicker, stochastic: ScenePicker, useStochastic: () => boolean) => {
    let generation = 0;
    let released = false;
    const current = () => (useStochastic() ? stochastic : sorted);
    const read = async <T>(operation: (picker: ScenePicker) => Promise<T>, empty: T): Promise<T> => {
        if (released) return empty;
        const version = generation;
        const result = await operation(current());
        return released || generation !== version ? empty : result;
    };
    return {
        pick: (...args: Parameters<ScenePicker['pick']>) => read((picker) => picker.pick(...args), null),
        pickSurface: (...args: Parameters<ScenePicker['pickSurface']>) =>
            read((picker) => picker.pickSurface(...args), null),
        pickVisibility: (...args: Parameters<ScenePicker['pickVisibility']>) =>
            read(
                (picker) => picker.pickVisibility(...args),
                args[0].map((): null => null)
            ),
        renderView: () => {
            if (released) return null;
            const view = current().renderView();
            return view ? { ...view, renders: view.renders + generation * 1000000000 } : null;
        },
        invalidate: () => {
            generation++;
        },
        release: () => {
            if (released) return;
            released = true;
            generation++;
            sorted.release();
            stochastic.release();
        }
    };
};

export { createSwitchingPicker };
