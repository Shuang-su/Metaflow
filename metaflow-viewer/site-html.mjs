/** Only the hosted site dispatches resource /director routes. SDK exports keep their standalone bootstrap. */
export function siteHtml(template) {
    const replace = (from, to) => {
        if (!template.includes(from)) throw Error(`Site bootstrap seam missing: ${from}`);
        template = template.replace(from, to);
    };
    replace(
        'window.sseReady = (async () => {',
        `
            window.metaflowDirectorPath = (() => {
                try { return /\\/director\\/*$/.test(decodeURIComponent(location.pathname)); }
                catch { return false; }
            })();
            window.sseReady = window.metaflowDirectorPath ? null : (async () => {`
    );
    replace("import { createViewer } from './index.js';", '');
    replace(
        'try {\n                const { config, settings } = await window.sseReady;',
        `try {
                if (window.metaflowDirectorPath) {
                    document.querySelector('link[href="./index.css"]')?.remove();
                    const css = document.createElement('link');
                    css.rel = 'stylesheet'; css.href = '/director/style.css';
                    document.head.appendChild(css);
                    await import('/director/entry.js');
                } else {
                const { createViewer } = await import('./index.js');
                const { config, settings } = await window.sseReady;`
    );
    replace('exposeGlobals: true\n                });', 'exposeGlobals: true\n                });\n                }');
    replace(
        "message.textContent = 'Viewer failed to load. Please check the resource and retry.';",
        "message.textContent = window.metaflowDirectorPath ? 'Director 实验版加载失败，请刷新重试或返回资源 Viewer。' : 'Viewer failed to load. Please check the resource and retry.';"
    );
    return template;
}
