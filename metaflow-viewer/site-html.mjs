/** Only the hosted site dispatches resource /director routes. SDK exports keep their standalone bootstrap. */
export async function loadViewerEntry(
    baseUrl = document.baseURI,
    importer = (url) => import(url),
    delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onRetry = () => {}
) {
    // Resolve against <base>, rather than the inline module's deep route URL.
    // WebKit otherwise requests e.g. /shenzhen/index.js instead of /index.js.
    const entry = new URL('./index.js', baseUrl);
    const backoff = [100, 300, 900];
    for (let attempt = 0; ; attempt++) {
        const url = new URL(entry);
        if (attempt) url.searchParams.set('mf_retry', String(attempt));
        try {
            return await importer(url.href);
        } catch (error) {
            // Use a fresh module-map key after a failed network import. Do not
            // re-evaluate modules that failed due to syntax or runtime errors.
            const transient = error instanceof TypeError &&
                /failed to fetch dynamically imported module|failed to load module script|importing a module script failed|error loading dynamically imported module/i.test(error.message);
            if (!transient || attempt >= backoff.length) throw error;
            onRetry({ url: url.href, attempt: attempt + 2, maxAttempts: 4, error: error.message });
            await delay(backoff[attempt]);
        }
    }
}

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

export function initHostedStartup() {
    if (window.metaflowDirectorPath || new URL(location.href).searchParams.has('noui')) return null;
    const node = document.createElement('div');
    node.setAttribute('role', 'status');
    node.style.cssText = 'position:fixed;z-index:10;left:50%;bottom:120px;transform:translateX(-50%);box-sizing:border-box;width:min(420px,calc(100% - 32px));padding:16px;color:inherit;font:13px/1.6 sans-serif;overflow-wrap:anywhere';
    const status = document.createElement('div');
    status.textContent = '正在解析路由、加载 Viewer 程序与设置…';
    const details = document.createElement('div');
    node.append(status, details);
    document.body.append(node);
    const retries = [];
    const message = (error) => {
        const text = String(error?.message || error);
        if (/HTTP 404/.test(text)) return '资源暂不可用，请稍后重试。';
        if (/HTTP (401|403)/.test(text)) return '暂时无法访问此资源。';
        if (/HTTP 429/.test(text)) return '服务繁忙，请稍后重试。';
        if (/HTTP 5\d\d/.test(text)) return '资源服务暂时不可用，请稍后重试。';
        if (/HTTP 408|timeout|timed out/i.test(text)) return '请求超时，请重试。';
        return '资源加载失败，请重试。';
    };
    return {
        retries,
        message,
        retry(detail) {
            retries.push(detail);
            if (retries.length > 20) retries.shift();
            details.textContent = `正在重试 ${detail.attempt}/${detail.maxAttempts} · ${message(detail.error)}`;
            window.dispatchEvent(new CustomEvent('metaflow:loadretry', { detail }));
        },
        stage(text) { status.textContent = text; },
        remove() { node.remove(); }
    };
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
            window.metaflowStartup = (${initHostedStartup.toString()})();
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
                const { createViewer } = await (${loadViewerEntry.toString()})(document.baseURI, undefined, undefined,
                    (detail) => window.metaflowStartup?.retry(detail));
                const { config, settings } = await window.sseReady;
                window.metaflowStartup?.stage('正在读取场景设置、初始化渲染器…');`
    );
    replace('exposeGlobals: true\n                });', 'exposeGlobals: true\n                });\n                window.metaflowStartup?.remove();\n                }');
    replace(
        "message.textContent = 'Viewer failed to load. Please check the resource and retry.';",
        `window.metaflowStartup?.remove();
                message.style.cssText = 'position:fixed;z-index:10;left:50%;top:50%;transform:translate(-50%,-50%);box-sizing:border-box;width:min(480px,calc(100% - 32px));padding:20px;color:inherit;font:14px/1.6 sans-serif;overflow-wrap:anywhere';
                message.textContent = window.metaflowDirectorPath ? '摄影页面加载失败。可以重试，或返回 Viewer。' : '加载失败，请重试。';
                const reason = document.createElement('div');
                reason.textContent = window.metaflowStartup?.message(error) || '页面加载失败，请稍后重试。';
                message.append(reason);
                message.setAttribute('role', 'alert');
                const retry = document.createElement('button');
                retry.type = 'button';
                retry.textContent = window.metaflowDirectorPath ? '重试摄影页面' : '重新加载 Viewer';
                if (!window.metaflowDirectorPath) retry.style.cssText = 'color:inherit;background:none;border:0;padding:0;text-decoration:underline;cursor:pointer;font:inherit';
                retry.addEventListener('click', () => location.reload());
                message.append(' ', retry);
                if (window.metaflowDirectorPath) {
                    const back = document.createElement('a');
                    back.textContent = '返回 Viewer';
                    back.href = location.pathname.replace(/\\/director\\/*$/, '') || '/';
                    message.append(' ', back);
                }`
    );
    return template;
}
