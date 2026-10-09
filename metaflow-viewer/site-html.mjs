/** Only the hosted site dispatches resource /director routes. SDK exports keep their standalone bootstrap. */
export async function loadDirectorEntry(
    importer = (url) => import(url),
    delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
) {
    const backoff = [100, 300, 900];
    for (let attempt = 0; ; attempt++) {
        try {
            await importer(`/director/entry.js${attempt ? `?mf_retry=${attempt}` : ''}`);
            return;
        } catch (error) {
            // Failed imports remain rejected in the document's module map. A fresh URL
            // retries the request; runtime and syntax errors must retain their cause.
            const transient = error instanceof TypeError &&
                /failed to fetch dynamically imported module|failed to load module script|importing a module script failed|error loading dynamically imported module/i.test(error.message);
            if (!transient || attempt >= backoff.length) throw error;
            await delay(backoff[attempt]);
        }
    }
}

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
                    await (${loadDirectorEntry.toString()})();
                } else {
                const { createViewer } = await import('./index.js');
                const { config, settings } = await window.sseReady;`
    );
    replace('exposeGlobals: true\n                });', 'exposeGlobals: true\n                });\n                }');
    replace(
        "message.textContent = 'Viewer failed to load. Please check the resource and retry.';",
        `message.textContent = window.metaflowDirectorPath ? '摄影页面加载失败。可以重试，或返回 Viewer。' : 'Viewer failed to load. Please check the resource and retry.';
                if (window.metaflowDirectorPath) {
                    message.setAttribute('role', 'alert');
                    const retry = document.createElement('button');
                    retry.type = 'button'; retry.textContent = '重试摄影页面';
                    retry.addEventListener('click', () => location.reload());
                    const back = document.createElement('a');
                    back.textContent = '返回 Viewer';
                    back.href = location.pathname.replace(/\\/director\\/*$/, '') || '/';
                    message.append(' ', retry, ' ', back);
                }`
    );
    return template;
}
