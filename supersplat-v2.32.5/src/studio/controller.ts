/* global HTMLElementTagNameMap */
/* eslint no-use-before-define: ["error", { "functions": false }] */
import { Container } from '@playcanvas/pcui';
import { MemoryFileSystem } from '@playcanvas/splat-transform';
import { Mat4, Vec3 } from 'playcanvas';

import { assetDialog } from './asset-dialog';
import { element as el, icon, StudioControls } from './controls';
import { readDrafts, saveDraft } from './drafts';
import { chooseFiles, download, jsonBlob, rememberHandle, restoreHandle, validateCollision } from './files';
import { drawAnnotations, projectAnnotations, moveAlongView, placeAnnotationCard } from './overlay';
import { shortcutGuide } from './shortcut-guide';
import { studioTimeline } from './timeline';
import type { ExperienceSettings } from '../../../metaflow-viewer/src/settings';
import { navigationCapability, navigationMetadataWritable, withNavigationEnabled } from '../../../metaflow-viewer/src/navigation/nav-annotation';
import { ElementType } from '../element';
import type { Events } from '../events';
import type { Scene } from '../scene';
import type { Splat } from '../splat';
import { writeSplatFile } from '../splat-serialize';
import { StudioCompositor } from './compositor';
import { clone, createProject, readProject, portableProject, portableExperience, compatibilityWarnings, type StudioProject, type AssetRef, type OverlayMode } from './document';
import { openPreview, exportPreview } from './preview';
import type { EditorUI } from '../ui/editor';
import type { VideoSettings } from '../video-config';

type CameraPose = ExperienceSettings['cameras'][number]['initial'];

export const registerStudio = (scene: Scene, events: Events, editorUI: EditorUI) => {
    const fingerprint = (data: StudioProject) => {
        const copy = portableProject(data); copy.video.selected = -1; copy.timeline.frame = 0; return JSON.stringify(copy);
    };
    let project = createProject(), saved = fingerprint(project), applying = false, timelineDirty = false;
    let lastGradient: ExperienceSettings['background']['gradient'];
    let editingAnnotation = -1, cameraEditing = -1;
    const annotationSelection = new Set<number>();
    let annotationAnchor = -1;
    let hovered = -1;
    let selected = -1, tab = 'scene', placing = false, relocating = false;
    let handle: FileSystemFileHandle;
    let videoSnapshot: StudioProject = null;
    let saving = false;
    const files = new Map<string, File>();
    let draftSession = crypto.randomUUID();
    let draftFingerprint = '';

    const pendingLods = new Map<string, number>();
    let restoringAssets = false;
    const urls = new Map<string, string>();
    const matrix = new Mat4();
    const compositor = new StudioCompositor(scene, () => (videoSnapshot ?? project).experience, () => ({
        enabled: !videoSnapshot || videoSnapshot.video.overlay !== 'off',
        hovered: videoSnapshot ? -1 : hovered,
        cssHeight: videoSnapshot ? scene.camera.targetSize.height / Math.max(0.65, Math.min(scene.camera.targetSize.width, scene.camera.targetSize.height) / 720) : editorUI.canvas.clientHeight
    }));
    const header = new Container({ id: 'studio-header' });
    const sidebar = new Container({ id: 'studio-sidebar' });
    editorUI.appContainer.dom.prepend(header.dom);
    document.getElementById('main-container').prepend(sidebar.dom);
    const brand = el('div', '', 'studio-brand');
    for (const [file, label] of [['metaflow_logo.svg', 'Metaflow 图形标'], ['metaflow_word.svg', 'Metaflow']]) {
        const image = el('img'); image.src = `./static/studio/${file}`; image.alt = label; brand.append(image);
    }
    brand.append(el('span', 'Studio', 'studio-wordmark'));
    header.dom.append(brand);
    const title = el('span', project.name, 'studio-title'); header.dom.append(title);
    const actions = el('div', '', 'studio-actions'); header.dom.append(actions);
    const status = el('div', '打开一个模型，开始配置展示体验', 'studio-status'); status.setAttribute('role', 'status');
    const tabs = el('div', '', 'studio-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '工作区面板'); sidebar.dom.append(tabs);
    const panel = el('div', '', 'studio-panel'); sidebar.dom.append(panel, status);
    const draftStatus = el('div', '本地草稿：尚未产生编辑记录', 'studio-status');
    sidebar.dom.append(draftStatus);
    const overlay = el('canvas', '', 'studio-overlay'); overlay.setAttribute('aria-label', '场景标记叠层');
    editorUI.canvasContainer.dom.append(overlay);
    const notice = (message: string, error = false) => {
        status.textContent = message; status.classList.toggle('error', error);
    };
    const reportError = (error: any) => {
        if (error?.name !== 'AbortError') notice(error.message ?? String(error), true);
    };
    const run = (action: () => unknown) => {
        try {
            Promise.resolve(action()).catch(reportError);
        } catch (error) {
            reportError(error);
        }
    };
    let saveButton: HTMLButtonElement = null;
    let gesture: { before: StudioProject; timeline: boolean; name: string } = null;
    const beginGesture = () => {
        if (!videoSnapshot && !gesture) gesture = { before: snapshot(), timeline: false, name: '调整参数' };
    };
    const endGesture = () => {
        if (!gesture) return; const { before, timeline, name } = gesture; gesture = null; const after = snapshot();
        if (fingerprint(before) !== fingerprint(after)) events.fire('edit.add', { name: `Studio ${name}`, do: () => apply(after, timeline), undo: () => apply(before, timeline) }, true);
    };
    const controls = new StudioControls(run, beginGesture, endGesture);
    const chrome = new StudioControls(run, beginGesture, endGesture);
    const button = chrome.button.bind(chrome);
    const capturePose = (): CameraPose => {
        const p = events.invoke('camera.getPose');
        return { position: [p.position.x, p.position.y, p.position.z], target: [p.target.x, p.target.y, p.target.z], fov: p.fov };
    };
    const goto = (pose: CameraPose) => {
        events.fire('timeline.setPlaying', false);
        events.fire('camera.setPose', { position: new Vec3(pose.position), target: new Vec3(pose.target), fov: pose.fov }, 0);
    };
    const syncTimeline = () => {
        project.timeline = events.invoke('docSerialize.timeline');
        if (!timelineDirty) return;
        const poses = events.invoke('docSerialize.poseSets')[0]?.poses ?? [];
        const fps = project.timeline.frameRate;
        const previous = project.experience.animTracks[0];
        const track = { ...previous,
            name: previous?.name ?? 'Camera',
            duration: (project.timeline.frames - 1) / fps,
            frameRate: fps,
            loopMode: project.timeline.loopMode ?? (project.timeline.loop ? 'repeat' as const : 'none' as const),
            interpolation: 'spline' as const,
            smoothness: project.timeline.smoothness,
            keyframes: { ...previous?.keyframes,
                times: poses.map((p: any) => p.frame),
                values: { ...previous?.keyframes.values,
                    position: poses.flatMap((p: any) => p.position),
                    target: poses.flatMap((p: any) => p.target),
                    fov: poses.map((p: any) => p.fov) } } };
        project.experience.animTracks = poses.length ? [track, ...project.experience.animTracks.slice(1)] : project.experience.animTracks.slice(1);
        timelineDirty = false;
    };
    function snapshot() {
        syncTimeline(); project.video.selected = selected; return clone(project);
    }
    const experience = (): ExperienceSettings => {
        syncTimeline(); return clone(project.experience);
    };
    const applyTimeline = () => {
        applying = true;
        try {
            events.invoke('docDeserialize.timeline', project.timeline);
            const track = project.experience.animTracks[0];
            const poses = track?.keyframes.times.map((time, i) => ({ name: `镜头 ${i + 1}`,
                frame: time,
                position: track.keyframes.values.position.slice(i * 3, i * 3 + 3),
                target: track.keyframes.values.target.slice(i * 3, i * 3 + 3),
                fov: track.keyframes.values.fov[i] })) ?? [];
            events.invoke('docDeserialize.poseSets', [{ name: 'set0', poses }]);
            timelineDirty = false;
        } finally {
            applying = false;
        }
    };
    const changed = () => {
        const data = snapshot(), currentFingerprint = fingerprint(data);
        const dirty = currentFingerprint !== saved;
        if (data.assets.length && currentFingerprint !== draftFingerprint) {
            try {
                saveDraft(localStorage, draftSession, data); draftFingerprint = currentFingerprint;
                draftStatus.textContent = `本地草稿已备份 · ${data.experience.annotations.length} 个标记`;
                draftStatus.classList.remove('error');
            } catch {
                draftStatus.textContent = '本地备份失败，请保存工程或导出 JSON 后再关闭页面';
                draftStatus.classList.add('error');
            }
        }
        title.textContent = project.name; title.title = project.name; title.classList.toggle('dirty', dirty);
        if (saveButton) saveButton.disabled = !dirty || !!videoSnapshot || saving;
        chrome.sync({ '叠加模式': project.video.overlay });
        scene.forceRender = true;
        events.fire('studio.documentChanged');
    };
    function apply(next: StudioProject, timeline = false) {
        const skyChanged = project.experience.background.skyboxUrl !== next.experience.background.skyboxUrl;
        const previousFov = project.experience.cameras[0]?.initial.fov;
        project = clone(next); selected = project.video.selected;
        const nextFov = project.experience.cameras[0]?.initial.fov;
        if (nextFov !== undefined && previousFov !== nextFov) events.fire('camera.setFov', nextFov);
        if (timeline) applyTimeline();
        if (skyChanged) run(loadSky);
        renderPanel(); changed();
    }
    const edit = (name: string, change: (next: StudioProject) => void, timeline = false, selection?: number[]) => {
        if (videoSnapshot) throw new Error('视频输出中，请完成或取消后继续编辑');
        const before = snapshot(), after = clone(before); change(after);
        if (gesture) {
            gesture.timeline ||= timeline; gesture.name = name; apply(after, timeline); return;
        }
        if (JSON.stringify(before) === JSON.stringify(after)) return;
        const previousSelection = [...annotationSelection];
        return events.invoke('edit.add', { name: `Studio ${name}`,
            do: () => {
                apply(after, timeline); if (selection) {
                    chooseAnnotations(selection); renderPanel();
                }
            },
            undo: () => {
                apply(before, timeline); if (selection) {
                    chooseAnnotations(previousSelection); renderPanel();
                }
            } });
    };
    async function loadSky() {
        const name = project.experience.background.skyboxUrl;
        if (!name) {
            await compositor.setSky(); return;
        }
        const file = files.get(name);
        if (file) {
            if (urls.has(name)) URL.revokeObjectURL(urls.get(name));
            const url = URL.createObjectURL(file); urls.set(name, url); await compositor.setSky(url, file.name);
        } else if (/^https?:/.test(name)) {
            await compositor.setSky(name);
        } else {
            await compositor.setSky(); notice(`天空盒需要重新定位：${name}`, true);
        }
    }
    const attach = async (file: File, name: string, role: AssetRef['role'], fileHandle?: FileSystemFileHandle) => {
        files.set(name, file);
        const ref: AssetRef = { name, role, size: file.size, modified: file.lastModified };
        const old = project.assets.find(a => a.name === name && a.role === role);
        if (old) {
            Object.assign(old, ref); delete old.url;
        } else project.assets.push(ref);
        if (fileHandle) await rememberHandle(ref, fileHandle);
    };
    const originalImport = events.functions.get('import');
    events.functions.set('import', async (inputs: any[], animation = false) => {
        if (videoSnapshot) throw new Error('视频输出中，请先完成或取消输出');
        const previousSplats = scene.getElementsByType(ElementType.splat);
        const documentImport = inputs.some(input => /\.ssproj$/i.test(input.filename));
        const wasApplying = applying;
        if (documentImport) applying = true;
        let imported;
        try {
            imported = await originalImport(inputs, animation);
        } finally {
            applying = wasApplying;
        }
        if (!animation && scene.getElementsByType(ElementType.splat).some(splat => !previousSplats.includes(splat))) {
            if (documentImport) {
                project.assets = project.assets.filter(asset => asset.role !== 'model');
                timelineDirty = true; syncTimeline();
                scene.camera.onUpdate(0);
                project.experience.cameras = [{ initial: capturePose() }];
                const view = events.invoke('docSerialize.view');
                if (view?.bgColor) project.experience.background.color = view.bgColor.slice(0, 3);
            }
            for (const input of inputs) {
                if (input.contents) await attach(input.contents, input.filename, 'model', input.handle);
                else if (input.url) {
                    const ref: AssetRef = { role: 'model', name: input.filename, url: new URL(input.url, location.href).href };
                    const old = project.assets.find(a => a.role === 'model' && a.name === ref.name);
                    if (old) Object.assign(old, ref); else project.assets.push(ref);
                }
                const lod = pendingLods.get(input.filename) ?? pendingLods.get(input.filename.split('/').pop());
                if (lod !== undefined) {
                    project.assets.find(a => a.name === input.filename && a.role === 'model').lod = lod;
                    pendingLods.delete(input.filename); pendingLods.delete(input.filename.split('/').pop());
                }
            }
            if (!project.experience.cameras.length) project.experience.cameras.push({ initial: capturePose() });
            renderPanel(); changed(); notice('模型已打开。可设置初始视角、添加标记或编辑相机时间线。');
        }
        return imported;
    });
    events.on('model.lodSelected', (filename: string, lod: number) => {
        pendingLods.set(filename, lod); pendingLods.set(filename.split('/').pop(), lod);
        notice(`当前加载 LOD ${lod}，以单层数据进行编辑`);
    });
    events.function('studio.restoreLod', (filename: string) => {
        if (!restoringAssets) return undefined;
        return project.assets.find(a => a.name === filename || a.name === filename.split('/').pop())?.lod;
    });
    const openModel = async (directory = false) => {
        const picked = await chooseFiles('.ply,.sog,.spz,.ssproj,.json,.lcc2,.bin', directory);
        if (picked.length) await events.invoke('import', picked.map(p => ({ filename: p.name, contents: p.file, handle: p.handle })));
    };
    const restoreAssets = async () => {
        const available = [], missing = [];
        for (const ref of project.assets) {
            let file = files.get(ref.name);
            if (file && ((ref.size !== undefined && file.size !== ref.size) || (ref.modified !== undefined && file.lastModified !== ref.modified))) {
                file = null; files.delete(ref.name);
            }
            if (!file) {
                try {
                    file = await restoreHandle(ref);
                } catch { /* Storage may be unavailable; relink stays usable. */ }
            }
            if (file) files.set(ref.name, file);
            else if (!ref.url) missing.push(ref.name);
            if (ref.role === 'model' && (file || ref.url)) available.push({ filename: ref.name, contents: file, url: ref.url });
        }
        if (available.length && !missing.some(n => project.assets.some(a => a.name === n && a.role === 'model'))) {
            restoringAssets = true; applying = true;
            try {
                await originalImport(available, false);
            } finally {
                restoringAssets = false; applying = false; pendingLods.clear();
            }
            applyTimeline();
        }
        await loadSky();
        if (missing.length) notice(`需要重新定位 ${missing.length} 个资产：${missing.join('、')}`, true);
        else notice('工程已恢复；源模型保持只读。');
    };
    const importProject = async (raw: unknown) => {
        await scene.commandQueue.enqueue(() => {});
        if (videoSnapshot) throw new Error('视频输出中，请先完成或取消输出');
        const next = portableProject(readProject(raw));
        // Confirm dirty state in the application, preserving the in-memory document
        // until the new JSON is completely validated.
        if (scene.getElementsByType(ElementType.splat).length) events.fire('scene.clear');
        project = next; annotationSelection.clear(); selected = project.video.selected; cameraEditing = -1; editingAnnotation = -1; placing = relocating = false; saved = fingerprint(next); handle = undefined;
        applyTimeline(); await restoreAssets(); if (project.experience.cameras[0]) goto(project.experience.cameras[0].initial);
        renderPanel(); changed();
        if ((raw as any).version === 1) notice('已将旧工程相机时间转换为标准帧号；另存为 v2 工程后可继续编辑。');
    };
    const pickJson = async () => {
        const picked = await chooseFiles('.json'); if (!picked.length) return;
        if (picked.length !== 1) throw new Error('请一次选择一个 JSON 文件');
        let raw: unknown;
        try {
            raw = JSON.parse(await picked[0].file.text());
        } catch {
            throw new Error('JSON 文件无法解析，请检查文件内容');
        }
        return { raw, handle: picked[0].handle };
    };
    const save = async (as = false) => {
        await scene.commandQueue.enqueue(() => {});
        if (saving) return;
        const data = portableProject(snapshot());
        saving = true; changed();
        try {
            if (typeof window.showSaveFilePicker === 'function') {
                const dest = (!as && handle) || await window.showSaveFilePicker({ suggestedName: `${project.name}.mfstudio.json`, types: [{ description: 'Metaflow Studio 工程', accept: { 'application/json': ['.json'] } }] });
                const stream = await dest.createWritable();
                try {
                    await stream.write(jsonBlob(data)); await stream.close();
                } catch (error) {
                    await stream.abort().catch(() => {}); throw error;
                }
                handle = dest;
            } else download(jsonBlob(data), `${project.name}.mfstudio.json`);
            saved = fingerprint(data); notice('工程已保存。模型与附属资产按引用关联。');
        } finally {
            saving = false; changed();
        }
    };
    const importExperience = async (raw: unknown) => {
        const settings = portableExperience(raw);
        await edit('导入设置', (next) => {
            next.experience = settings; next.video.selected = -1;
            const sky = settings.background.skyboxUrl;
            next.assets = next.assets.filter(asset => asset.role !== 'skybox' || asset.name === sky);
            if (sky && !next.assets.some(asset => asset.role === 'skybox' && asset.name === sky)) {
                next.assets.push({ name: sky, role: 'skybox', ...(/^https?:/i.test(sky) ? { url: sky } : {}) });
            }
            const track = settings.animTracks[0];
            if (track) next.timeline = { frames: Math.max(1, Math.round(track.duration * track.frameRate) + 1), frameRate: track.frameRate, frame: 0, smoothness: track.smoothness, loop: track.loopMode === 'repeat', loopMode: track.loopMode };
            else next.timeline = createProject().timeline;
        }, true);
        cameraEditing = -1; editingAnnotation = -1; placing = false; relocating = false; renderPanel();
        if (settings.cameras[0]) goto(settings.cameras[0].initial);
        const warnings = compatibilityWarnings(settings);
        const sky = settings.background.skyboxUrl;
        const missingSky = sky && !files.has(sky) && !/^https?:/i.test(sky);
        if (missingSky) warnings.unshift(`天空盒需要重新定位：${sky}。请从文件菜单重新定位资产，或重新导入天空盒。`);
        notice(warnings.join(' ') || '展示设置已导入', !!missingSky);
    };
    const preparePreview = async () => {
        const next = snapshot();
        const models = next.assets.filter(a => a.role === 'model');
        const previewFiles = new Map(files);
        if (!scene.getElementsByType(ElementType.splat).length) throw new Error('请先打开或重新定位模型');
        if (models.length !== 1 || models.some(a => a.lod !== undefined || /\.ssproj$/i.test(a.name))) {
            notice('正在将当前选中的 LOD 生成临时预览模型…');
            const memory = new MemoryFileSystem();
            await writeSplatFile(scene.getElementsByType(ElementType.splat) as Splat[], { minOpacity: 1 / 255, removeInvalid: true }, 'compressed-ply', 'studio-preview.ply', {}, memory);
            const data = memory.results.get('studio-preview.ply');
            if (!data) throw new Error('未能生成单层预览模型');
            const file = new File([data as BlobPart], 'studio-preview.ply');
            previewFiles.set(file.name, file);
            next.assets = [...next.assets.filter(a => a.role !== 'model'), { name: file.name, role: 'model', size: file.size, generated: true }];
            notice('临时单层预览已生成，原始模型未改动。');
        }
        return { next, previewFiles };
    };
    const menu = el('details', '', 'studio-file-menu');
    const summary = el('summary', '文件'); summary.prepend(icon('file')); summary.setAttribute('aria-label', '文件'); menu.append(summary); actions.append(menu);
    const menuItems = el('div', '', 'studio-menu-items'); menu.append(menuItems);
    menuItems.addEventListener('click', (event) => {
        if ((event.target as HTMLElement).closest('button')) menu.open = false;
    });
    document.addEventListener('pointerdown', (event) => {
        if (!menu.contains(event.target as Node)) menu.open = false;
    });
    menu.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation(); menu.open = false; summary.focus();
        } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault(); event.stopPropagation(); menu.open = true;
            const items = Array.from(menuItems.querySelectorAll<HTMLButtonElement>('button')).filter(item => item.offsetHeight && !item.disabled);
            const current = items.indexOf(document.activeElement as HTMLButtonElement);
            const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items[index]?.focus();
        }
    });
    button(menuItems, '打开模型', () => openModel(), '', 'file');
    button(menuItems, '打开模型文件夹', () => openModel(true), '', 'file');
    button(menuItems, '打开工程', async () => {
        const p = await pickJson(); if (!p) return; readProject(p.raw);
        if (fingerprint(snapshot()) !== saved) {
            const answer = await events.invoke('showPopup', { type: 'okcancel', header: '打开工程', message: '当前工程尚未保存。放弃这些配置并打开所选工程？', okText: '放弃并打开', cancelText: '继续编辑' });
            if (answer.action !== 'ok') return;
        }
        await importProject(p.raw); handle = p.handle;
    }, '', 'file');
    button(menuItems, '另存为', () => save(true), '', 'save');
    button(menuItems, '恢复本地草稿', () => {
        const drafts = readDrafts(localStorage);
        const dialog = el('dialog', '', 'studio-asset-dialog blocks-shortcuts');
        dialog.setAttribute('aria-label', '恢复本地草稿');
        dialog.append(el('h2', '恢复本地草稿'), el('p', '仅保留本浏览器中的配置；模型按原引用重新加载。恢复前会保留当前页草稿。正式交付仍请保存工程。'));
        if (!drafts.length) dialog.append(el('p', '没有可恢复的草稿。此功能不能找回启用之前关闭的未保存页面。'));
        drafts.forEach((draft) => {
            const names = draft.project.assets.filter(a => a.role === 'model').map(a => a.name).join('、');
            const count = draft.project.experience.annotations.length;
            button(dialog, `恢复 ${new Date(draft.savedAt).toLocaleString()} · ${count} 个标记 · ${names}`, async () => {
                if (project.assets.length) saveDraft(localStorage, draftSession, snapshot());
                // The restored document must never overwrite the just-saved current page.
                draftSession = crypto.randomUUID(); draftFingerprint = '';
                dialog.close(); await importProject(draft.project);
            }, '', 'file');
        });
        button(dialog, '关闭草稿列表', () => dialog.close());
        dialog.addEventListener('close', () => dialog.remove());
        document.body.append(dialog); dialog.showModal();
    }, '', 'file');

    button(menuItems, '新建工程', async () => {
        if (fingerprint(snapshot()) !== saved) {
            const answer = await events.invoke('showPopup', { type: 'okcancel', header: '新建工程', message: '当前工程尚未保存。放弃这些配置并新建工程？', okText: '放弃并新建', cancelText: '继续编辑' });
            if (answer.action !== 'ok') return;
        }
        applying = true; try {
            events.fire('scene.clear');
        } finally {
            applying = false;
        }
        project = createProject(); selected = -1; cameraEditing = -1; editingAnnotation = -1; placing = relocating = false; handle = undefined; applyTimeline(); await loadSky();
        saved = fingerprint(project); renderPanel(); changed(); notice('已新建空工程');
    }, '', 'plus');
    const relink = async (directory = false) => {
        const picked = await chooseFiles('', directory);
        for (const p of picked) {
            let ref = project.assets.find(a => a.name === p.name);
            if (!ref) {
                const matches = project.assets.filter(a => a.name.split('/').pop() === p.file.name);
                if (matches.length > 1) throw new Error(`多个资产同名：${p.file.name}，请重新定位完整文件夹以匹配相对路径`);
                ref = matches[0];
            }
            if (!ref) {
                if (directory) continue; throw new Error(`工程未引用 ${p.file.name}`);
            }
            await attach(p.file, ref.name, ref.role, p.handle);
        }
        if (!scene.getElementsByType(ElementType.splat).length) await restoreAssets(); else await loadSky();
        renderPanel(); changed();
    };
    button(menuItems, '重新定位资产', () => relink(), '', 'file');
    button(menuItems, '重新定位文件夹', () => relink(true), '', 'file');
    button(menuItems, '导出本地预览包', async () => {
        const { next, previewFiles } = await preparePreview(); await exportPreview(next, previewFiles);
    }, '', 'export');
    button(menuItems, '关于 Studio', () => events.invoke('showPopup', { type: 'info', header: 'Metaflow Studio', message: '本地创作原型 · MF-58\n基于 SuperSplat Editor 2.32.5 / PCUI 6.1.4\n模型和工程保存在本地。' }), '', 'help');
    const timeline = document.getElementById('timeline-panel');
    const timelineButton = button(actions, '时间线', () => {
        timeline.classList.toggle('studio-collapsed'); timelineButton.setAttribute('aria-pressed', String(!timeline.classList.contains('studio-collapsed')));
    }, '', 'timeline'); timelineButton.setAttribute('aria-pressed', 'false');
    // Move the existing strip so its measured frame positions continue to drive the Editor track.
    editorUI.appContainer.dom.append(timeline);
    const importSettings = async () => {
        const p = await pickJson(); if (!p) return;
        const settings = portableExperience(p.raw);
        if (fingerprint(snapshot()) !== saved) {
            const answer = await events.invoke('showPopup', { type: 'okcancel', header: '导入展示设置', message: '导入将替换当前尚未保存的展示设置。', okText: '导入', cancelText: '取消' });
            if (answer.action !== 'ok') return;
        }
        await importExperience(settings);
    };
    const exportSettings = async () => {
        await scene.commandQueue.enqueue(() => {});
        const settings = portableExperience(experience());
        const warnings = compatibilityWarnings(settings);
        if (settings.background.skyboxUrl) warnings.push('天空盒按引用导出，请同时提供该资产；JSON 不包含天空盒文件。');
        download(jsonBlob(settings), 'settings.json');
        notice(['展示设置 JSON 已导出。', ...warnings].join(' '));
    };
    const importButton = button(actions, '导入展示设置', importSettings, 'studio-secondary-action', 'import'); importButton.replaceChildren(icon('import'), document.createTextNode('导入 JSON'));
    const exportButton = button(actions, '导出展示设置', exportSettings, 'studio-secondary-action', 'export'); exportButton.replaceChildren(icon('export'), document.createTextNode('导出 JSON'));
    button(menuItems, '导入展示设置', importSettings, 'studio-menu-secondary', 'import');
    button(menuItems, '导出展示设置', exportSettings, 'studio-menu-secondary', 'export');
    const preview = async () => {
        const windowRef = window.open('about:blank', '_blank');
        try {
            const { next, previewFiles } = await preparePreview(); await openPreview(next, previewFiles, windowRef);
        } catch (error) {
            windowRef?.close(); throw error;
        }
    };
    button(actions, '预览', preview, 'studio-secondary-action', 'external'); button(menuItems, '预览', preview, 'studio-menu-secondary', 'external');
    button(actions, '导出视频', () => events.invoke('show.videoSettingsDialog'), '', 'video');
    saveButton = button(actions, '保存工程', () => save(), 'primary', 'save');

    const mobileToggle = button(header.dom, '打开场景面板', () => {
        document.body.classList.toggle('studio-sidebar-open'); mobileToggle.setAttribute('aria-expanded', String(document.body.classList.contains('studio-sidebar-open')));
    }, 'studio-mobile-toggle', 'menu', true); mobileToggle.setAttribute('aria-expanded', 'false');
    const scrim = el('button', '', 'studio-sidebar-scrim'); scrim.setAttribute('aria-label', '关闭场景面板');
    scrim.onclick = () => {
        document.body.classList.remove('studio-sidebar-open'); mobileToggle.setAttribute('aria-expanded', 'false');
    }; editorUI.appContainer.dom.append(scrim);
    const tabButtons = ['scene', 'annotations'].map((name, i) => {
        const b = button(tabs, i ? '标记' : '场景', () => {
            tab = name; renderPanel();
        }, '', i ? 'pin' : 'scene');
        b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', 'studio-inspector'); return b;
    }); panel.id = 'studio-inspector'; panel.setAttribute('role', 'tabpanel');
    tabs.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault(); tab = tab === 'scene' ? 'annotations' : 'scene'; renderPanel(); tabButtons[tab === 'scene' ? 0 : 1].focus();
        }
    });
    const toolbar = el('div', '', 'studio-viewport-toolbar'); toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', '视口工具');
    editorUI.canvasContainer.dom.append(toolbar);
    const toolGroups = Array.from({ length: 4 }, (_, index) => {
        if (index) toolbar.append(el('span', '', 'studio-tool-divider'));
        const group = el('div', '', `studio-tool-group group-${index}`); toolbar.append(group); return group;
    });
    const undo = button(toolGroups[0], '撤销', () => events.fire('edit.undo'), '', 'undo', true); undo.disabled = true;
    const redo = button(toolGroups[0], '重做', () => events.fire('edit.redo'), '', 'redo', true); redo.disabled = true;
    events.on('edit.canUndo', (value: boolean) => {
        undo.disabled = !value;
    }); events.on('edit.canRedo', (value: boolean) => {
        redo.disabled = !value;
    });
    const move = button(toolGroups[1], '移动', () => {
        placing = false; relocating = false; updateTools();
    }, '', 'move', true);
    function setPlacing(value: boolean) {
        placing = value; relocating = false; tab = 'annotations'; renderPanel(); updateTools();
    }
    const add = button(toolGroups[1], '放置标记', () => setPlacing(!placing), '', 'annotation', true);
    const orbit = button(toolGroups[2], 'Orbit 模式', () => events.fire('camera.setControlMode', 'orbit'), '', 'orbit', true);
    const fly = button(toolGroups[2], 'Fly 模式', () => events.fire('camera.setControlMode', 'fly'), '', 'fly', true);
    button(toolGroups[3], '取景', () => events.fire('camera.focus'), '', 'frame', true);
    button(toolGroups[3], '重置相机', () => (project.experience.cameras[0] ? goto(project.experience.cameras[0].initial) : events.fire('camera.reset')), '', 'reset', true);
    const updateHint = shortcutGuide(editorUI.canvasContainer.dom, chrome);
    document.addEventListener('keydown', (event) => {
        if (event.target instanceof Element && event.target.closest('input, textarea, select, [role=combobox], .blocks-shortcuts, dialog')) return;
        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || videoSnapshot) return;
        if (event.key.toLowerCase() === 'c') {
            event.preventDefault(); setPlacing(true);
        }
        if (event.key === 'Escape' && cameraEditing >= 0) {
            setCameraEditing(-1); return;
        }
        if (event.key === 'Escape') {
            placing = false; relocating = false; selected = -1; editingAnnotation = -1; renderPanel(); updateTools();
        }
    });
    function updateTools() {
        for (const [b, active] of [[move, !placing], [add, placing], [orbit, events.invoke('camera.controlMode') === 'orbit'], [fly, events.invoke('camera.controlMode') === 'fly']] as const) {
            b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active));
        }
        updateHint(events.invoke('camera.controlMode') === 'fly', placing);
    } events.on('camera.controlMode', updateTools);
    const nav = el('div', '', 'studio-annotation-nav'); editorUI.canvasContainer.dom.append(nav);
    function chooseAnnotations(indices: number[]) {
        annotationSelection.clear(); indices.filter(i => i >= 0 && i < project.experience.annotations.length).forEach(i => annotationSelection.add(i));
        selected = [...annotationSelection][0] ?? -1; project.video.selected = selected;
        if (!annotationSelection.has(editingAnnotation)) editingAnnotation = -1;
    }
    function selectAnnotation(index: number, event?: MouseEvent) {
        const values = [...annotationSelection];
        if (event?.shiftKey && annotationAnchor >= 0) {
            const range = Array.from({ length: Math.abs(index - annotationAnchor) + 1 }, (_, n) => Math.min(index, annotationAnchor) + n);
            chooseAnnotations([...values, ...range]);
        } else if (event?.metaKey || event?.ctrlKey) {
            chooseAnnotations(annotationSelection.has(index) ? values.filter(i => i !== index) : [...values, index]); annotationAnchor = index;
        } else {
            chooseAnnotations(annotationSelection.size === 1 && annotationSelection.has(index) ? [] : [index]); annotationAnchor = index;
        }
        editingAnnotation = -1; renderPanel();
    }
    const navigate = (delta: number) => {
        const count = project.experience.annotations.length; if (!count) return;
        chooseAnnotations([(selected + delta + count) % count]); tab = 'annotations'; const annotation = project.experience.annotations[selected];
        if (annotation.camera) goto(annotation.camera.initial); renderPanel(); scene.forceRender = true;
    };
    const previous = button(nav, '上一条', () => navigate(-1), '', 'left', true);
    const selectedName = button(nav, '未选择标记', () => {
        tab = 'annotations'; renderPanel();
    });
    const following = button(nav, '下一条', () => navigate(1), '', 'right', true);
    const cardLayer = el('div', '', 'studio-annotation-cards'); editorUI.canvasContainer.dom.append(cardLayer);
    const cards = new Map<number, HTMLElement>();
    for (const surface of [toolbar, nav, cardLayer]) {
        for (const type of ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick']) {
            surface.addEventListener(type, event => event.stopPropagation());
        }
    }
    let cardKey = '', structure = '';
    const cameraMode = el('div', '', 'studio-camera-mode'); cameraMode.hidden = true; editorUI.canvasContainer.dom.append(cameraMode);
    cameraMode.append(el('span', '相机编辑模式'));
    const applyCamera = button(cameraMode, '应用相机视角', () => {
        const index = cameraEditing, pose = capturePose();
        if (index < 0) return;
        setCameraEditing(-1);
        edit('编辑相机', (next) => {
            next.experience.cameras[index].initial = pose;
        });
    }, 'studio-camera-apply', 'check');
    applyCamera.replaceChildren(icon('check'), document.createTextNode('应用'));
    const cancelCamera = button(cameraMode, '取消相机编辑', () => {
        const pose = project.experience.cameras[cameraEditing]?.initial;
        if (pose) goto(pose);
        setCameraEditing(-1);
    }, '', 'close');
    cancelCamera.replaceChildren(icon('close'), document.createTextNode('取消'));
    for (const type of ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick']) cameraMode.addEventListener(type, event => event.stopPropagation());
    function setCameraEditing(index: number) {
        cameraEditing = index;
        if (index >= 0) {
            events.fire('timeline.setPlaying', false); placing = false; relocating = false;
            goto(project.experience.cameras[index].initial);
        }
        cameraMode.hidden = index < 0; renderPanel(); events.fire('studio.cameraEditMode', index >= 0);
    }
    let panelButtons: (() => void)[] = [];
    const openSections = new Set<string>();
    const section = (name: string, glyph = '', parent = panel) => {
        const group = el('section'); const heading = el('h2', name); if (glyph) heading.prepend(icon(glyph)); group.append(heading); parent.append(group); return group;
    };
    const disclosure = (parent: HTMLElement, name: string, forceOpen = false) => {
        const d = el('details', '', 'studio-disclosure'); d.open = forceOpen || openSections.has(name); d.append(el('summary', name));
        d.addEventListener('toggle', () => {
            if (d.open) openSections.add(name); else openSections.delete(name);
        }); parent.append(d); return d;
    };
    const effectNames = { sharpness: '锐化', bloom: '辉光', grading: '调色', vignette: '暗角', fringing: '色散' };
    const effectFields: Record<string, [string, string, number, number, number][]> = {
        sharpness: [['amount', '锐化强度', 0, 1, 0.01]],
        bloom: [['intensity', '辉光强度', 0, 0.1, 0.01], ['blurLevel', '模糊层级', 1, 16, 1]],
        grading: [['brightness', '亮度', 0, 3, 0.01], ['contrast', '对比度', 0.5, 1.5, 0.01], ['saturation', '饱和度', 0, 2, 0.01]],
        vignette: [['intensity', '暗角强度', 0, 1, 0.01], ['inner', '内边界', 0, 3, 0.01], ['outer', '外边界', 0, 3, 0.01], ['curvature', '曲率', 0.01, 10, 0.01]],
        fringing: [['intensity', '色散强度', 0, 100, 1]]
    };
    const reorder = (from: number, to: number) => {
        if (from === to || from < 0 || to < 0 || from >= project.experience.annotations.length || to >= project.experience.annotations.length) return;
        const selection = [...annotationSelection];
        const reordered = selection.map(i => (i === from ? to : from < to && i > from && i <= to ? i - 1 : from > to && i >= to && i < from ? i + 1 : i));
        edit('标记排序', (next) => {
            const chosen = next.experience.annotations[selected]; const [item] = next.experience.annotations.splice(from, 1); next.experience.annotations.splice(to, 0, item); next.video.selected = next.experience.annotations.indexOf(chosen);
        }, false, reordered);
    };
    const removeAnnotation = (index: number) => {
        const selection = [...annotationSelection].filter(i => i !== index).map(i => (i > index ? i - 1 : i));
        edit('删除标记', (next) => {
            next.experience.annotations.splice(index, 1); next.video.selected = selection[0] ?? -1;
        }, false, selection);
    };
    const uploadCollision = () => assetDialog('collision', async (picked) => {
        const json = picked.find(p => p.name.endsWith('.voxel.json')), bin = picked.find(p => p.name.endsWith('.voxel.bin'));
        const meta = await validateCollision(json.file, bin.file);
        const stem = json.name.slice(0, -'.voxel.json'.length);
        let suffix = '', index = 1;
        const occupied = new Set([...files.keys(), ...project.assets.map(a => a.name)]);
        while (occupied.has(`${stem}${suffix}.voxel.json`) || occupied.has(`${stem}${suffix}.voxel.bin`)) suffix = `-${++index}`;
        picked = picked.map(p => ({ ...p, name: `${stem}${suffix}.voxel.${p.name.endsWith('.json') ? 'json' : 'bin'}` }));
        for (const p of picked) files.set(p.name, p.file);
        await edit('导入碰撞', (next) => {
            next.assets = [...next.assets.filter(a => a.role !== 'collision'), ...picked.map(p => ({ name: p.name, role: 'collision' as const, size: p.file.size, modified: p.file.lastModified }))];
        });
        for (const p of picked) if (p.handle) await rememberHandle(project.assets.find(a => a.name === p.name), p.handle).catch(() => notice('资产已导入；文件授权未缓存，重开时需要重新定位。'));
        notice(`碰撞已校验，坐标范围 ${meta.gridBounds.min.join(', ')} → ${meta.gridBounds.max.join(', ')}；请进入预览验证步行。`);
    });
    const syncSelection = () => {
        if (selected < 0) annotationSelection.clear();
        else if (!annotationSelection.has(selected)) chooseAnnotations([selected]);
        for (const index of annotationSelection) if (index >= project.experience.annotations.length) annotationSelection.delete(index);
    };
    const syncPanel = () => {
        syncSelection();
        const a = project.experience.annotations[selected];
        const values: Record<string, unknown> = { '场景名称': project.name, '背景颜色': project.experience.background.color, '色调映射': project.experience.tonemapping, '高精度渲染': project.experience.highPrecisionRendering, '视野 FOV': scene.camera.fov, '开始时播放动画': project.experience.startMode === 'animTrack' };
        const gradient = project.experience.background.gradient;
        Object.assign(values, { '渐变背景': !!gradient });
        if (gradient) Object.assign(values, { '顶部颜色': gradient.topColor, '中间颜色': gradient.horizonColor ?? gradient.bottomColor, '底部颜色': gradient.bottomColor, '中间位置 %': (gradient.horizonStop ?? 0.55) * 100, '底部位置 %': (gradient.bottomStop ?? 1) * 100 });
        const camera = project.experience.cameras[cameraEditing]?.initial;
        if (camera) {
            for (const key of ['position', 'target'] as const) {
                for (let axis = 0; axis < 3; axis++) values[`${key === 'position' ? '相机位置' : '相机目标'} ${'XYZ'[axis]}`] = camera[key][axis];
            }
        }
        if (a) {
            (['X', 'Y', 'Z'] as const).forEach((axis, i) => {
                values[`位置 ${axis}`] = a.position[i];
            });
        }
        for (const key of Object.keys(effectNames) as (keyof typeof effectNames)[]) {
            const settings = project.experience.postEffectSettings[key]; values[effectNames[key]] = settings.enabled;
            for (const [prop, label] of effectFields[key]) values[label] = (settings as any)[prop];
        } values['色彩染色'] = project.experience.postEffectSettings.grading.tint;
        controls.sync(values); panelButtons.forEach(update => update()); updateTools();
        cameraMode.hidden = cameraEditing < 0;
        nav.hidden = !project.experience.annotations.length;
        selectedName.textContent = a ? a.title || `标记 ${selected + 1}` : '未选择标记'; selectedName.disabled = !a; previous.disabled = following.disabled = !project.experience.annotations.length;
        renderAnnotationCard(); scene.forceRender = true;
    };
    function renderPanel() {
        syncSelection();
        tabButtons.forEach((b, i) => {
            const active = tab === (i ? 'annotations' : 'scene'); b.classList.toggle('active', active); b.setAttribute('aria-selected', String(active)); b.tabIndex = active ? 0 : -1;
        });
        panel.setAttribute('aria-label', tab === 'scene' ? '场景' : '标记');
        const sig = JSON.stringify([tab, selected, [...annotationSelection], placing, cameraEditing, project.experience.cameras.length, project.experience.annotations.map(a => [a.title, !!a.camera, navigationCapability(a).declared]), Object.values(project.experience.postEffectSettings).map(v => v.enabled), project.assets.map(a => [a.name, a.lod, files.has(a.name) || !!a.url]), project.experience.background.skyboxUrl, !!project.experience.background.gradient]);
        if (sig === structure) {
            syncPanel(); return;
        } structure = sig;
        const scroll = panel.scrollTop; const focused = (document.activeElement as HTMLElement)?.getAttribute('aria-label');
        controls.clear(); panel.replaceChildren(); panelButtons = [];
        if (tab === 'scene') {
            const appearance = section('外观与色调', 'palette'); appearance.classList.add('studio-appearance');
            controls.color(appearance, '背景颜色', project.experience.background.color, value => edit('背景颜色', (next) => {
                next.experience.background.color = value;
            }));
            controls.toggle(appearance, '渐变背景', !!project.experience.background.gradient, value => edit('渐变背景', (next) => {
                if (value) next.experience.background.gradient = clone(lastGradient ?? { topColor: [0.15, 0.24, 0.36], horizonColor: [0.65, 0.76, 0.85], bottomColor: [0.08, 0.11, 0.16], horizonStop: 0.55, bottomStop: 1 });
                else {
                    lastGradient = clone(next.experience.background.gradient); delete next.experience.background.gradient;
                }
            }));
            const gradient = project.experience.background.gradient;
            if (gradient) {
                const fields = el('div', '', 'studio-gradient-fields'); appearance.append(fields);
                for (const [key, label] of [['topColor', '顶部颜色'], ['horizonColor', '中间颜色'], ['bottomColor', '底部颜色']] as const) {
                    controls.color(fields, label, gradient[key] ?? gradient.bottomColor, value => edit(label, (next) => {
                        next.experience.background.gradient[key] = value;
                    }));
                }
                for (const [key, label, fallback] of [['horizonStop', '中间位置 %', 0.55], ['bottomStop', '底部位置 %', 1]] as const) {
                    controls.number(fields, label, (gradient[key] ?? fallback) * 100, 0, 100, value => edit(label, (next) => {
                        next.experience.background.gradient[key] = value / 100;
                    }), 1, true);
                }
            }
            const sky = el('div', '', 'studio-field'); sky.append(el('span', '天空盒', 'studio-field-label')); appearance.append(sky);
            button(sky, '导入天空盒', () => assetDialog('skybox', async ([p]) => {
                const temporary = URL.createObjectURL(p.file);
                try {
                    await compositor.setSky(temporary, p.name);
                } finally {
                    URL.revokeObjectURL(temporary);
                }
                let name = p.name, index = 1;
                const dot = p.name.lastIndexOf('.');
                const occupied = new Set([...files.keys(), ...project.assets.map(a => a.name)]);
                while (occupied.has(name)) name = `${p.name.slice(0, dot)}-${++index}${p.name.slice(dot)}`;
                p = { ...p, name }; files.set(name, p.file);
                await edit('天空盒', (next) => {
                    next.assets = [...next.assets.filter(a => a.role !== 'skybox'), { name: p.name, role: 'skybox', size: p.file.size, modified: p.file.lastModified }];
                    next.experience.background.skyboxUrl = p.name;
                });
                if (p.handle) await rememberHandle(project.assets.find(a => a.name === p.name), p.handle).catch(() => notice('资产已导入；文件授权未缓存，重开时需要重新定位。'));
            }), 'compact', 'upload');
            button(sky, '移除天空盒', () => edit('移除天空盒', (next) => {
                delete next.experience.background.skyboxUrl;
            }), 'ghost', 'trash', true).disabled = !project.experience.background.skyboxUrl;
            if (project.experience.background.skyboxUrl) {
                const skyName = el('p', project.experience.background.skyboxUrl, 'studio-sky-name'); appearance.append(skyName);
            }
            controls.select(appearance, '色调映射', project.experience.tonemapping, [['none', '无'], ['linear', '线性'], ['neutral', '中性'], ['aces', 'ACES'], ['aces2', 'ACES 2'], ['filmic', '电影'], ['hejl', 'Hejl']], value => edit('色调映射', (next) => {
                next.experience.tonemapping = value as ExperienceSettings['tonemapping'];
            }));
            controls.toggle(appearance, '高精度渲染', project.experience.highPrecisionRendering, value => edit('高精度渲染', (next) => {
                next.experience.highPrecisionRendering = value;
            }));
            const cameras = section('相机', 'video');
            project.experience.cameras.forEach((camera, i) => {
                const row = el('div', '', 'studio-list-row studio-camera-row'); row.append(icon('video'), el('span', `相机 ${i + 1}`, 'studio-row-title')); cameras.append(row);
                button(row, `转到相机 ${i + 1}`, () => goto(project.experience.cameras[i].initial), 'ghost', 'locate', true);
                const updateCamera = button(row, `更新相机 ${i + 1}`, () => edit('更新相机', (next) => {
                    next.experience.cameras[i].initial = capturePose();
                }), 'ghost', 'camera', true);
                updateCamera.disabled = cameraEditing >= 0;
                updateCamera.dataset.tooltip = cameraEditing >= 0 ? '请先应用或取消相机编辑' : `以当前视角更新相机 ${i + 1}`;
                const editCamera = button(row, `编辑相机 ${i + 1}`, () => setCameraEditing(cameraEditing === i ? -1 : i), 'ghost', 'edit', true);
                editCamera.setAttribute('aria-pressed', String(cameraEditing === i)); editCamera.classList.toggle('active', cameraEditing === i);
            });
            button(cameras.querySelector('h2'), '添加展示相机', () => edit('添加相机', (next) => {
                next.experience.cameras.push({ initial: capturePose() });
            }), 'ghost', 'plus', true);
            const lens = el('div', '', 'studio-inset'); lens.append(el('h3', '镜头')); cameras.append(lens);
            controls.number(lens, '视野 FOV', scene.camera.fov, 10, 120, (value) => {
                edit('视野', (next) => {
                    (next.experience.cameras[0] ??= { initial: capturePose() }).initial.fov = value;
                    next.experience.annotations.forEach((a) => {
                        if (a.camera) a.camera.initial.fov = value;
                    });
                }); events.fire('camera.setFov', value);
            }, 1, true);
            const animation = section('动画', 'timeline'); controls.toggle(animation, '开始时播放动画', project.experience.startMode === 'animTrack', value => edit('开始时播放', (next) => {
                next.experience.startMode = value ? 'animTrack' : 'default';
            }));
            const collision = section('碰撞', 'cube'); const collisionRow = el('div', '', 'studio-field'); collisionRow.append(el('span', '体素', 'studio-field-label')); collision.append(collisionRow);
            button(collisionRow, '导入碰撞文件对', uploadCollision, 'compact', 'upload');
            button(collisionRow, '移除碰撞', () => edit('移除碰撞', (next) => {
                next.assets = next.assets.filter(a => a.role !== 'collision');
            }), 'ghost', 'trash', true).disabled = !project.assets.some(a => a.role === 'collision');
            if (project.assets.some(a => a.role === 'collision')) collision.append(el('p', '文件已关联 · 在预览中检查步行与坐标'));
            const effects = section('后处理', 'sparkle'); const effectBox = el('div', '', 'studio-inset studio-effects'); effects.append(effectBox);
            for (const key of Object.keys(effectNames) as (keyof typeof effectNames)[]) {
                const group = el('div', '', 'studio-effect'); effectBox.append(group); const settings = project.experience.postEffectSettings[key];
                controls.toggle(group, effectNames[key], settings.enabled, enabled => edit(effectNames[key], (next) => {
                    next.experience.postEffectSettings[key].enabled = enabled;
                }));
                if (settings.enabled) {
                    for (const [prop, label, min, max, step] of effectFields[key]) {
                        controls.number(group, label, (settings as any)[prop], min, max, value => edit(label, (next) => {
                            (next.experience.postEffectSettings[key] as any)[prop] = value;
                        }), step, true);
                    }
                    if (key === 'grading') {
                        controls.color(group, '色彩染色', project.experience.postEffectSettings.grading.tint, value => edit('色彩染色', (next) => {
                            next.experience.postEffectSettings.grading.tint = value;
                        }));
                    }
                }
            }
            const missing = project.assets.some(a => !files.has(a.name) && !a.url);
            const assets = disclosure(panel, '本地资源', missing); controls.text(assets, '场景名称', project.name, value => edit('场景名称', (next) => {
                next.name = value.trim() || '未命名场景';
            }));
            if (!project.assets.length) assets.append(el('p', '从文件菜单打开本地模型或工程。'));
            for (const ref of project.assets) {
                const row = el('div', '', 'studio-asset'); row.classList.toggle('missing', !files.has(ref.name) && !ref.url); row.append(el('span', ref.name), el('small', ref.lod === undefined ? ref.role === 'model' ? '模型' : ref.role === 'skybox' ? '天空盒' : '碰撞' : `单层 · LOD ${ref.lod}`)); assets.append(row);
            }
        } else {
            const list = section(`标记 · ${project.experience.annotations.length}`, 'pin'); list.classList.add('studio-annotations-section');
            if (annotationSelection.size > 1) list.querySelector('h2').append(el('span', `${annotationSelection.size} 已选择`, 'studio-annotation-count'));
            button(list.querySelector('h2'), placing ? '取消添加标记' : '添加标记', () => setPlacing(!placing), 'compact', 'plus');
            if (placing) list.append(el('p', '单击场景表面放置标记。', 'studio-placement-hint'));
            const items = el('ul', '', 'studio-annotation-items'); items.setAttribute('role', 'list'); list.append(items);
            project.experience.annotations.forEach((annotation, i) => {
                const row = el('li', '', `studio-list-row studio-annotation-row${annotationSelection.has(i) ? ' selected' : ''}`); row.dataset.annotationIndex = String(i); row.setAttribute('role', 'listitem'); items.append(row);
                const grip = button(row, `拖动标记 ${i + 1}`, () => {}, 'ghost studio-grip', 'grip', true); grip.draggable = true;
                grip.addEventListener('dragstart', (event) => {
                    event.dataTransfer.setData('application/x-metaflow-annotation', String(i)); event.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging');
                });
                grip.addEventListener('keydown', (event) => {
                    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                        event.preventDefault(); event.stopPropagation(); reorder(i, i + (event.key === 'ArrowUp' ? -1 : 1));
                    }
                });
                grip.addEventListener('dragend', () => row.classList.remove('dragging'));
                row.addEventListener('dragover', (event) => {
                    if (event.dataTransfer.types.includes('application/x-metaflow-annotation')) {
                        event.preventDefault(); event.dataTransfer.dropEffect = 'move';
                    }
                });
                row.addEventListener('drop', (event) => {
                    const data = event.dataTransfer.getData('application/x-metaflow-annotation');
                    if (!data) return; event.preventDefault(); const from = Number(data); if (Number.isInteger(from)) reorder(from, i);
                });
                row.append(el('span', '', 'studio-annotation-dot'));
                const choose = button(row, annotation.title || `标记 ${i + 1}`, event => selectAnnotation(i, event), 'ghost studio-row-title'); choose.setAttribute('aria-label', `${String(i + 1).padStart(2, '0')} ${annotation.title}`);
                button(row, `定位标记 ${i + 1}`, () => {
                    // Rows survive value-only edits; do not retain the previous document's camera.
                    chooseAnnotations([i]);
                    const camera = project.experience.annotations[i]?.camera;
                    if (camera) goto(camera.initial);
                    renderPanel();
                }, 'ghost', 'locate', true);
                button(row, `删除标记 ${i + 1}`, () => removeAnnotation(i), 'ghost', 'trash', true);
            });
            if (!project.experience.annotations.length) list.append(el('p', '点击添加，再在模型表面放置标记。'));
            const a = project.experience.annotations[selected];
            if (a && annotationSelection.size === 1) {
                const navigation = section('导览', 'pin');
                const navControl = controls.toggle(navigation, '@Nav 可导览', navigationCapability(a).declared, value => edit('标记导览资格', (next) => {
                    const current = next.experience.annotations[selected];
                    next.experience.annotations[selected] = withNavigationEnabled(current, value);
                }));
                navControl.enabled = navigationMetadataWritable(a);
                if (!navControl.enabled) navigation.append(el('p', '扩展字段格式不兼容，已保留原数据，暂不能修改 @Nav。'));
                if (navigationCapability(a).declared && !navigationCapability(a).enabled)
                    navigation.append(el('p', navigationCapability(a).reason, 'studio-placement-hint'));
                else navigation.append(el('p', '允许在 Viewer 导览模式中选择此标记；保存相机用于确定目的地区域。'));

                const distance = section('与相机的距离'); distance.classList.add('studio-inset', 'studio-distance-card'); const row = el('div', '', 'studio-field'); const output = el('span', '', 'studio-distance'); row.append(icon('video'), output, icon('pin')); distance.append(row);
                panelButtons.push(() => {
                    const position = project.experience.annotations[selected]?.position; if (position) output.textContent = `${new Vec3(position).distance(new Vec3(project.experience.annotations[selected].camera?.initial.position ?? capturePose().position)).toFixed(2)} m`;
                });
                for (const [text, delta, glyph] of [['向关联相机靠近', -1, 'minus'], ['远离关联相机', 1, 'plus']] as const) {
                    // eslint-disable-next-line no-loop-func -- Read the current selection when the user nudges it.
                    button(row, text, event => edit('标记距离', (next) => {
                        const a = next.experience.annotations[selected];
                        const camera = a.camera?.initial.position ?? capturePose().position;
                        const distance = new Vec3(a.position).distance(new Vec3(camera));
                        a.position = moveAlongView(a.position, camera, delta * distance * (event.shiftKey ? 0.001 : 0.005));
                    }), 'compact', glyph, true);
                }
                const details = disclosure(panel, '精确调整');
                (['X', 'Y', 'Z'] as const).forEach((axis, i) => controls.number(details, `位置 ${axis}`, a.position[i], -1e9, 1e9, value => edit('移动标记', (next) => {
                    next.experience.annotations[selected].position[i] = value;
                })));
                button(details, '表面重新定位', () => {
                    placing = true; relocating = true; updateTools();
                }, 'compact', 'pin');
                button(details, '关联当前视角', () => edit('标记视角', (next) => {
                    next.experience.annotations[selected].camera = { initial: capturePose() };
                }), 'compact', 'camera');
                const order = el('div', '', 'studio-button-row'); details.append(order);
                button(order, '上移', () => reorder(selected, selected - 1), 'compact', 'up').disabled = !selected;
                button(order, '下移', () => reorder(selected, selected + 1), 'compact', 'down').disabled = selected === project.experience.annotations.length - 1;
                button(order, '删除标记', () => removeAnnotation(selected), 'danger compact', 'trash');
            }
        }
        panel.scrollTop = scroll; syncPanel();
        if (focused) Array.from(panel.querySelectorAll<HTMLElement>('[aria-label]')).find(e => e.getAttribute('aria-label') === focused)?.focus({ preventScroll: true });
    }
    function renderAnnotationCard() {
        const entries = [...annotationSelection].map(index => [index, project.experience.annotations[index]] as const).filter(([, a]) => a);
        const key = JSON.stringify([entries, editingAnnotation]); if (key === cardKey) return; cardKey = key;
        cardLayer.replaceChildren(); cards.clear();
        entries.forEach(([index, a]) => {
            const floating = el('div', '', 'studio-floating-card blocks-shortcuts'); cards.set(index, floating); cardLayer.append(floating);
            floating.setAttribute('aria-label', `标记 ${index + 1}：${a.title}`);
            if (editingAnnotation === index) {
                const titleInput = el('input'); titleInput.value = a.title; titleInput.maxLength = Math.max(60, a.title.length); titleInput.placeholder = '未命名'; titleInput.setAttribute('aria-label', '标记标题');
                const text = el('textarea'); text.value = a.text; text.maxLength = Math.max(280, a.text.length); text.placeholder = '输入说明…'; text.rows = 3; text.setAttribute('aria-label', '说明文字'); floating.append(titleInput, text);
                if (a.title.length > 60 || a.text.length > 280) floating.append(el('p', '原有文本超出线上长度限制，已完整保留。', 'studio-import-note'));
                const row = el('div', '', 'studio-button-row'); floating.append(row);
                const cancel = () => {
                    editingAnnotation = -1; renderAnnotationCard();
                };
                button(row, '取消编辑标记', cancel, 'ghost');
                const confirm = async () => {
                    const titleValue = titleInput.value, body = text.value;
                    if ((titleValue.length > 60 && titleValue !== a.title) || (body.length > 280 && body !== a.text)) {
                        notice('标题最多 60 字，说明最多 280 字；未修改的原有长文本可以保留。', true); return;
                    }
                    editingAnnotation = -1;
                    await edit('编辑标记', (next) => {
                        next.experience.annotations[index].title = titleValue; next.experience.annotations[index].text = body;
                    });
                    renderAnnotationCard();
                };
                button(row, '确定标记', confirm, 'primary');
                floating.onkeydown = (event) => {
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault(); event.stopPropagation(); confirm();
                    }
                    if (event.key === 'Escape') {
                        event.stopPropagation(); cancel();
                    }
                };
                titleInput.focus();
            } else {
                const heading = el('div', '', 'studio-card-heading'); heading.append(el('strong', a.title || `标记 ${index + 1}`)); floating.append(heading);
                button(heading, '编辑标记', () => {
                    editingAnnotation = index; renderAnnotationCard();
                }, 'ghost', 'edit', true);
                button(heading, '关联当前视角', () => edit('标记视角', (next) => {
                    next.experience.annotations[index].camera = { initial: capturePose() };
                }), 'ghost', 'camera', true);
                button(heading, '取消选择标记', () => {
                    chooseAnnotations([...annotationSelection].filter(i => i !== index)); renderPanel();
                }, 'ghost', 'close', true);
                if (a.text) floating.append(el('p', a.text));
            }
        });
        positionAnnotationCard(); scene.forceRender = true;
    }
    function positionAnnotationCard() {
        const rect = editorUI.canvas.getBoundingClientRect(); const points = projectAnnotations(project.experience.annotations, matrix, rect.width, rect.height);
        for (const [index, floating] of cards) {
            const point = points.find(p => p.index === index); floating.hidden = !point;
            if (!point) continue;
            const width = floating.offsetWidth, height = floating.offsetHeight;
            const position = placeAnnotationCard(point.x, point.y, width, height, rect.width, rect.height, 112);
            floating.style.left = `${position.left}px`;
            floating.style.top = `${position.top}px`;
        }
    }
    const drawOverlay = () => {
        const width = editorUI.canvas.width, height = editorUI.canvas.height;
        if (overlay.width !== width || overlay.height !== height) {
            overlay.width = width; overlay.height = height;
        }
        const ctx = overlay.getContext('2d'); ctx.clearRect(0, 0, width, height);
        const camera = scene.camera.camera; matrix.mul2(camera.projectionMatrix, camera.viewMatrix);
        // Hotspots are Viewer billboards in the GPU render graph; this layer only
        // retains the editor's projection and card positioning lifecycle.
        positionAnnotationCard();
    };
    editorUI.canvasContainer.dom.addEventListener('pointermove', (event) => {
        const rect = editorUI.canvas.getBoundingClientRect();
        const point = projectAnnotations(project.experience.annotations, matrix, rect.width, rect.height).find(p => Math.hypot(p.x - event.clientX + rect.left, p.y - event.clientY + rect.top) < 13);
        const next = event.target === editorUI.canvas ? point?.index ?? -1 : -1;
        if (next !== hovered) {
            hovered = next; scene.forceRender = true;
        }
    });
    editorUI.canvasContainer.dom.addEventListener('pointerleave', () => {
        hovered = -1; scene.forceRender = true;
    });
    events.on('postrender', drawOverlay);
    let placementDown: { x: number; y: number; pointerId: number } = null;
    editorUI.canvasContainer.dom.addEventListener('pointerdown', (event) => {
        if (videoSnapshot || event.button !== 0 || (event.target instanceof Element && event.target.closest('button, input, textarea, select, .studio-floating-card, .studio-viewport-toolbar, .studio-annotation-nav, .studio-mobile-toggle'))) return;
        const rect = editorUI.canvas.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
        if (!placing && !event.altKey) {
            const camera = scene.camera.camera; matrix.mul2(camera.projectionMatrix, camera.viewMatrix);
            const points = projectAnnotations(project.experience.annotations, matrix, rect.width, rect.height);
            const hit = points.find(point => Math.hypot(point.x - (event.clientX - rect.left), point.y - (event.clientY - rect.top)) < 14);
            if (!hit) return;
            tab = 'annotations'; selectAnnotation(hit.index, event); scene.forceRender = true;
            event.preventDefault(); event.stopImmediatePropagation(); return;
        }
        event.preventDefault(); event.stopImmediatePropagation();
        placementDown = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
        editorUI.canvas.setPointerCapture(event.pointerId);
    }, true);
    editorUI.canvasContainer.dom.addEventListener('pointercancel', () => {
        placementDown = null;
    });
    editorUI.canvasContainer.dom.addEventListener('pointerup', (event) => {
        const down = placementDown; placementDown = null;
        if (!down || down.pointerId !== event.pointerId) return;
        if (editorUI.canvas.hasPointerCapture(event.pointerId)) editorUI.canvas.releasePointerCapture(event.pointerId);
        event.preventDefault(); event.stopImmediatePropagation();
        if ((!placing && !event.altKey) || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4) return;
        const rect = editorUI.canvas.getBoundingClientRect();
        run(async () => {
            const hit = await scene.camera.intersect((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
            if (!hit) {
                notice('此处没有可拾取的模型表面，请换一个位置', true); return;
            }
            const pos = hit.position;
            const anchor = new Vec3(capturePose().position); pos.lerp(pos, anchor, 0.01);
            const position: [number, number, number] = [pos.x, pos.y, pos.z];
            await edit(relocating ? '重新定位' : '添加标记', (next) => {
                if (relocating && selected >= 0) next.experience.annotations[selected].position = position;
                else {
                    next.experience.annotations.push({ position, title: '', text: '', camera: { initial: capturePose() } }); next.video.selected = next.experience.annotations.length - 1;
                }
            });
            editingAnnotation = relocating ? -1 : selected; chooseAnnotations([selected]); placing = false; relocating = false; tab = 'annotations'; renderPanel(); updateTools();
        });
    }, true);
    for (const name of ['track.keyAdded', 'track.keyRemoved', 'track.keyMoved', 'track.keyUpdated', 'track.keysCleared', 'track.keysLoaded', 'timeline.frames', 'timeline.frameRate', 'timeline.smoothness', 'timeline.loop', 'timeline.loopMode']) {
        // eslint-disable-next-line no-loop-func -- UI callbacks intentionally read the active document at interaction time.
        events.on(name, () => {
            if (!applying) {
                timelineDirty = true; changed();
            }
        });
    }
    events.function('studio.changeTimeline', (key: 'frames' | 'frameRate' | 'smoothness' | 'loop' | 'loopMode', value: number | boolean | string) => {
        if (applying || project.timeline[key] === value) return;
        edit('时间线设置', (next) => {
            if (key === 'frameRate') next.timeline.frames = Math.max(2, Math.round((next.timeline.frames - 1) / next.timeline.frameRate * Number(value)) + 1);
            Object.assign(next.timeline, { [key]: value });
            if (key === 'loopMode') next.timeline.loop = value === 'repeat';
            if (key === 'loop') next.timeline.loopMode = value ? 'repeat' : 'none';
            next.timeline.frame = Math.min(next.timeline.frame, next.timeline.frames - 1);
            const track = next.experience.animTracks[0];
            if (track) {
                track.duration = (next.timeline.frames - 1) / next.timeline.frameRate;
                track.frameRate = next.timeline.frameRate;
                track.smoothness = next.timeline.smoothness;
                track.loopMode = next.timeline.loopMode ?? (next.timeline.loop ? 'repeat' : 'none');
            }
        }, true);
    });
    events.function('studio.cameraEditing', () => cameraEditing >= 0);
    events.function('studio.enableAnimation', () => edit('打开时播放', (next) => {
        next.experience.startMode = 'animTrack';
    }));
    events.function('studio.addKey', () => {
        if (cameraEditing >= 0) return;
        const pose = capturePose(), frame = Math.round(events.invoke('timeline.frame'));
        edit('设置相机关键帧', (next) => {
            let track = next.experience.animTracks[0];
            const first = !track?.keyframes.times.length;
            if (!track) {
                track = { name: 'Camera',
                    duration: (next.timeline.frames - 1) / next.timeline.frameRate,
                    frameRate: next.timeline.frameRate,
                    loopMode: next.timeline.loopMode ?? 'repeat',
                    interpolation: 'spline',
                    smoothness: next.timeline.smoothness,
                    keyframes: { times: [], values: { position: [], target: [], fov: [] } } };
                next.experience.animTracks.unshift(track);
            }
            const data = track.keyframes;
            const poses = data.times.map((time, i) => ({ frame: time, position: data.values.position.slice(i * 3, i * 3 + 3), target: data.values.target.slice(i * 3, i * 3 + 3), fov: data.values.fov[i] })).filter(p => p.frame !== frame);
            if (poses.length >= 1000) throw new Error('最多支持 1000 个相机关键帧');
            poses.push({ frame, ...pose }); poses.sort((a, b) => a.frame - b.frame);
            track.keyframes = { ...data, times: poses.map(p => p.frame), values: { ...data.values, position: poses.flatMap(p => p.position), target: poses.flatMap(p => p.target), fov: poses.map(p => p.fov) } };
            if (first) next.experience.startMode = 'animTrack';
        }, true);
    });
    events.function('studio.clearAnimation', () => edit('删除相机动画', (next) => {
        const frame = Math.min(180, Math.round(next.timeline.frame / next.timeline.frameRate * 30));
        next.timeline = { frames: 181, frameRate: 30, frame, smoothness: 1, loop: true, loopMode: 'repeat' };
        next.experience.animTracks = next.experience.animTracks.slice(1);
        next.experience.startMode = 'default';
    }, true));
    events.function('studio.experience', experience);
    events.function('studio.project', snapshot);
    events.function('studio.videoOptions', () => clone(project.video));
    events.function('studio.importProject', importProject);
    events.function('studio.importExperience', importExperience);
    events.function('studio.renderTarget', () => compositor.output ?? scene.camera.mainTarget);
    events.function('studio.videoPreflight', (settings: VideoSettings) => {
        if (settings.transparentBg) throw new Error('Studio 场景视频包含背景，请关闭透明背景后导出');
        if (settings.projection === 'equirect') throw new Error('Studio 合成视频仅支持普通透视，请切换投影；360° 导出可使用 Editor 入口');
        if (project.video.overlay === 'selected' && !project.experience.annotations[selected]) throw new Error('请先选中一条标记说明，或切换为「仅热点与标题」');
    });
    const videoCanvas = document.createElement('canvas');
    events.on('studio.videoBegin', (settings: VideoSettings) => {
        project.video = { ...project.video, ...clone(settings) }; videoSnapshot = snapshot();
        header.dom.inert = true; sidebar.dom.inert = true; changed();
        editorUI.canvasContainer.dom.inert = true; document.getElementById('timeline-panel').inert = true;
    });
    events.on('studio.videoEnd', () => {
        videoSnapshot = null; header.dom.inert = false; sidebar.dom.inert = false; changed();
        editorUI.canvasContainer.dom.inert = false; document.getElementById('timeline-panel').inert = false;
    });
    events.function('studio.overlayFrame', async (data: Uint8Array<ArrayBuffer>, width: number, height: number) => {
        const frozen = videoSnapshot; if (!frozen || frozen.video.overlay === 'off') return;
        await document.fonts.ready;
        if (videoCanvas.width !== width || videoCanvas.height !== height) {
            videoCanvas.width = width; videoCanvas.height = height;
        }
        const ctx = videoCanvas.getContext('2d', { willReadFrequently: true });
        ctx.putImageData(new ImageData(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width, height), 0, 0);
        const camera = scene.camera.camera; matrix.mul2(camera.projectionMatrix, camera.viewMatrix);
        drawAnnotations(ctx, projectAnnotations(frozen.experience.annotations, matrix, width, height), width, height, frozen.video.overlay, frozen.video.selected, -1, undefined, false);
        data.set(ctx.getImageData(0, 0, width, height).data);
    });
    window.addEventListener('beforeunload', (event) => {
        if (fingerprint(snapshot()) !== saved) {
            event.preventDefault(); event.returnValue = '';
        }
    });
    events.fire('statusBar.panelChanged', 'timeline');
    document.getElementById('timeline-panel').classList.add('studio-collapsed');
    events.fire('tool.deactivate');
    events.fire('grid.setVisible', false);
    events.fire('camera.setOverlay', false);
    for (const [id, label] of [['totalFrames', '时间线总帧数'], ['smoothness', '曲线平滑度']]) {
        document.querySelector(`#${id} input`)?.setAttribute('aria-label', label);
    }
    const keyControls = document.querySelectorAll('#button-controls .button');
    ['上一关键帧', '播放或暂停', '下一关键帧', '添加关键帧', '删除关键帧'].forEach((label, index) => keyControls[index]?.setAttribute('aria-label', label));
    document.getElementById('loop')?.setAttribute('aria-label', '循环播放');
    studioTimeline(events, new StudioControls(run, beginGesture, endGesture), () => {
        timeline.classList.toggle('studio-collapsed'); timelineButton.setAttribute('aria-pressed', String(!timeline.classList.contains('studio-collapsed')));
    });
    const videoContent = document.querySelector<HTMLElement>('#video-settings-dialog #content');
    if (videoContent) {
        const videoOverlay = el('div', '', 'studio-video-overlay-options'); videoContent.append(videoOverlay);
        chrome.select(videoOverlay, '叠加模式', project.video.overlay, [['off', '关闭'], ['selected', '固定说明与镜头同步'], ['titles', '仅热点与标题']], value => edit('视频叠加', (next) => {
            next.video.overlay = value as OverlayMode;
        }));
        videoOverlay.append(el('p', '说明以纯文本叠加；固定说明使用当前选中的标记。'));
    }
    renderPanel(); changed();
};
