import { BackgroundFill, Background, exportBackground, backgroundCss } from '../metaflow-viewer/src/background';
export interface BackgroundEvents {
    on(name: string, fn: (...args: any[]) => void): unknown;
    fire(name: string, ...args: any[]): unknown;
    function(name: string, fn: (...args: any[]) => any): unknown;
    invoke(name: string, ...args: any[]): any;
}
const copy = <T>(value: T): T => structuredClone(value);
export function registerBackground(
    events: BackgroundEvents,
    initial: BackgroundFill,
    render: (fill: Background) => void,
    setBase: (rgb: number[]) => void
) {
    let value = copy(initial),
        before: BackgroundFill | undefined,
        applying = false;
    const apply = (next: BackgroundFill) => {
        value = copy(next);
        applying = true;
        try {
            setBase(value.color);
        } finally {
            applying = false;
        }
        render(value);
        events.fire('background.changed', copy(value));
    };
    events.function('background.value', () => copy(value));
    events.function('background.export', () => exportBackground(value));
    events.function('background.css', () => backgroundCss(value));
    events.on('background.begin', () => {
        before ??= copy(value);
    });
    events.on('background.preview', (next: BackgroundFill) => {
        before ??= copy(value);
        apply(next);
    });
    events.on('background.commit', () => {
        if (!before) return;
        const old = before,
            next = copy(value);
        before = undefined;
        if (JSON.stringify(old) !== JSON.stringify(next)) {
            events.fire(
                'edit.add',
                {
                    name: 'background',
                    do: () => {
                        apply(next);
                        events.fire('background.refresh');
                    },
                    undo: () => {
                        apply(old);
                        events.fire('background.refresh');
                    }
                },
                true
            );
        }
    });
    events.on('background.cancel', () => {
        if (before) {
            const old = before;
            before = undefined;
            apply(old);
            events.fire('background.refresh');
        }
    });
    events.on('background.restore', (next: BackgroundFill) => {
        before = undefined;
        apply(next);
    });
    events.on('setBgClr', (color: { r: number; g: number; b: number }) => {
        if (!applying) {
            before = undefined;
            apply({ color: [color.r, color.g, color.b] });
        }
    });
    apply(value);
}
