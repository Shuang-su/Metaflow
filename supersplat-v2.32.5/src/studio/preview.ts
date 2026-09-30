import { MemoryFileSystem, ZipFileSystem } from '@playcanvas/splat-transform';

import { clone, type StudioProject } from './document';
import { download, jsonBlob } from './files';

const sessions = new Map<string, Map<string, Blob>>();
navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type !== 'mf-studio-file' || !event.ports[0]) return;
    const session = sessions.get(event.data.session);
    event.ports[0].postMessage({ file: session?.get(event.data.name) ?? null });
});
const checkedFetch = async (url: string) => {
    const result = await fetch(url); if (!result.ok) throw new Error(`无法读取预览运行时 ${url} (${result.status})`); return result;
};
const safePath = (name: string) => {
    if (!name || name.startsWith('/') || name.split('/').some(s => s === '..' || !s) || name.includes('\\')) throw new Error(`资产路径无效：${name}`);
    return name.split('/').map(encodeURIComponent).join('/');
};
const primaryModel = (project: StudioProject) => {
    const models = project.assets.filter(a => a.role === 'model');
    if (models.length !== 1 || models.some(a => a.lod !== undefined || /\.ssproj$/i.test(a.name))) throw new Error('此预览需要已物化的单层模型，请使用场景生成的预览模型');
    return models[0];
};
export const openPreview = async (project: StudioProject, files: Map<string, File>, pending: Window) => {
    if (!('serviceWorker' in navigator)) throw new Error('预览需要 HTTPS（或 localhost）及 Service Worker 支持');
    const model = primaryModel(project);
    if (!pending) throw new Error('浏览器拦截了预览窗口，请允许本站弹窗后重试');
    try {
        const registration = await navigator.serviceWorker.register('/local-files-sw.js', { scope: '/studio-preview/' });
        const worker = registration.installing ?? registration.waiting ?? registration.active;
        if (worker.state !== 'activated') {
            await new Promise<void>((resolve, reject) => {
                worker.addEventListener('statechange', () => {
                    if (worker.state === 'activated') resolve(); if (worker.state === 'redundant') reject(new Error('预览文件服务启动失败'));
                });
            });
        }
        const session = crypto.randomUUID(), root = `/studio-preview/${session}/`, content = new Map<string, Blob>();
        const settings = clone(project.experience);
        for (const asset of project.assets) {
            const file = files.get(asset.name);
            if (file) content.set(asset.name, file);
            else if (!asset.url) throw new Error(`请重新定位资产：${asset.name}`);
        }
        const sky = settings.background.skyboxUrl;
        if (sky && files.has(sky)) settings.background.skyboxUrl = new URL(root + safePath(sky), location.href).href;
        content.set('settings.json', jsonBlob(settings));
        const html = await (await checkedFetch('/viewer/index.html')).text();
        content.set('index.html', new Blob([html.replace(/<base href="[^"]*"\s*\/?>/, '<base href="/viewer/">')], { type: 'text/html' }));
        sessions.set(session, content);
        const url = new URL(`${root}index.html`, location.href);
        url.searchParams.set('content', model.url ?? new URL(root + safePath(model.name), location.href).href);
        url.searchParams.set('settings', `${location.origin}${root}settings.json`);
        if (settings.background.skyboxUrl) url.searchParams.set('skybox', settings.background.skyboxUrl);
        const collision = project.assets.find(a => a.role === 'collision' && a.name.endsWith('.voxel.json'));
        if (collision) url.searchParams.set('collision', `${location.origin}${root}${safePath(collision.name)}`);
        url.searchParams.set('noanalytics', ''); url.searchParams.set('noreveal', ''); url.searchParams.set('lang', 'zh-CN');
        pending.location.replace(url);
        const cleanup = window.setInterval(() => {
            if (pending.closed) {
                sessions.delete(session); window.clearInterval(cleanup);
            }
        }, 1000);
    } catch (error) {
        pending?.close(); throw error;
    }
};
export const exportPreview = async (project: StudioProject, files: Map<string, File>) => {
    const model = primaryModel(project);
    const fs = new MemoryFileSystem(), zip = new ZipFileSystem(await fs.createWriter('preview.zip'));
    const write = async (name: string, blob: Blob) => {
        safePath(name); const writer = await zip.createWriter(name); await writer.write(new Uint8Array(await blob.arrayBuffer())); await writer.close();
    };
    try {
        const runtime: string[] = await (await checkedFetch('/studio/viewer-manifest.json')).json();
        for (const name of runtime) {
            let blob = await (await checkedFetch(`/viewer/${safePath(name)}`)).blob();
            if (name === 'index.html') blob = new Blob([(await blob.text()).replace(/<base href="[^"]*"\s*\/?>/, '<base href="./">')], { type: 'text/html' });
            await write(name === 'index.html' ? 'viewer.html' : name, blob);
        }
        for (const asset of project.assets.filter(a => a.role !== 'model' || a.generated)) {
            const file = files.get(asset.name); if (!file) throw new Error(`预览包缺少附属资产：${asset.name}`);
            await write(asset.name, file);
        }
        await write('settings.json', jsonBlob(project.experience));
        const params = new URLSearchParams({ content: model.url ?? model.name, settings: './settings.json', noanalytics: '', noreveal: '', lang: 'zh-CN' });
        if (project.experience.background.skyboxUrl) params.set('skybox', project.experience.background.skyboxUrl);
        const collision = project.assets.find(a => a.role === 'collision' && a.name.endsWith('.voxel.json'));
        if (collision) params.set('collision', collision.name);
        // Model data is an explicit dependency. Exporting a package never silently
        // duplicates a multi-gigabyte source file or stores browser Blob URLs.
        await write('index.html', new Blob([`<!doctype html><meta charset="utf-8"><title>Metaflow 本地预览</title><script>location.replace(${JSON.stringify(`./viewer.html?${params}`)});</script>`], { type: 'text/html' }));
        await write('README.txt', new Blob([`Metaflow Studio 本地预览包\n\n模型依赖（${model.generated ? '已包含当前单 LOD 预览副本' : '未包含'}）：${model.name}\n将此模型放入解压目录中相同的相对位置，或确保其 URL 可访问。\n在该目录运行 python3 -m http.server 8080 --bind 127.0.0.1\n打开 http://127.0.0.1:8080/\n\n设置与附属资产已包含。请勿直接双击 HTML（浏览器本地文件访问限制）。\n`]));
        await write('dependencies.json', jsonBlob({ models: project.assets.filter(a => a.role === 'model'), sourceProjectVersion: project.version }));
        await zip.close();
        download(new Blob([fs.results.get('preview.zip') as BlobPart], { type: 'application/zip' }), `${project.name}-preview.zip`);
    } catch (error) {
        await zip.close().catch(() => {});
        throw error;
    }
};
