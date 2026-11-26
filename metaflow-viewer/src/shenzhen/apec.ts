import { Vec3 } from 'playcanvas';

import { createFigure8Track } from '../animation/create-figure8-track';
import type { CreateViewerOptions } from '../options';
import type { ExperienceSettings } from '../settings';
import type { ViewerHandle } from '../types';

import directoryGroups from './apec-directory-groups.json';
import panelStyle from './apec-panel.html';
import { attachAreaPosition } from './area-position';
import type { VenueAreas } from './area-position';
import { attachNanhaiMap } from './nanhai';

export async function prepareApec(options: CreateViewerOptions) {
    const dataRoot = new URL('../', new URL(options.contentUrl, location.href)).href;
    const read = async <T>(url: string): Promise<T> => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('新闻中心载入失败 · ' + response.status + ' ' + url);
        return response.json();
    };
    const [scene, areas] = await Promise.all([
        typeof options.settings === 'string'
            ? read<ExperienceSettings>(options.settings)
            : (options.settings as Promise<ExperienceSettings>),
        read<VenueAreas>(dataRoot + 'areas.json')
    ]);
    const pose = scene.cameras[0].initial;
    const preview = new URLSearchParams(location.search).get('motion') === 'preview';
    const track = createFigure8Track(
        new Vec3(...pose.position),
        new Vec3(...pose.target),
        pose.fov,
        preview ? 1.2 : 0.3,
        32,
        20
    );
    const annotations = areas.legacyAnnotations.map((mark) => ({
        title: mark.title,
        text: mark.text,
        position: mark.positionViewer,
        camera: { initial: mark.camera },
        extras: {
            metaflow: {
                annotationDirectory: {
                    code: mark.catalogCode,
                    group: mark.catalogCode.slice(0, 1),
                    groupName: directoryGroups[mark.catalogCode.slice(0, 1) as keyof typeof directoryGroups],
                    name: { zh: mark.catalogTitle, en: mark.catalogTitleEn }
                }
            }
        }
    }));
    const config: CreateViewerOptions = {
        ...options,
        settings: { ...scene, annotations, animTracks: [track], startMode: 'animTrack' },
        displayEuler: [0, 0, 180],
        defaultCameraMode: 'anim',
        animationFirstExitMode: 'orbit',
        orbitMovementMode: 'fly',
        worldUnitsPerMeter: 1,
        walkFallbackPosition: [-3.461877, 1.280768, -31.432549],
        recoverWalkDrops: true,
        revealEffect: 'none',
        initialViewPreload: true,
        controlsHintInitiallyClosed: true
    };
    return { options: config, apec: { dataRoot, areas } };
}

export function attachApec(viewer: ViewerHandle, host: HTMLElement, data: { dataRoot: string; areas: VenueAreas }) {
    host.dataset.locationLabels = '';
    const style = document.createElement('template');
    style.innerHTML = panelStyle;
    const styles = style.content.firstElementChild;
    host.append(styles);
    const position = attachAreaPosition(viewer, data.areas);
    const primary = data.areas.areas.find((area) => area.id === 'hall2')?.viewerRings[0];
    const adjacent = data.areas.areas.find((area) => area.id === 'hall3')?.viewerRings[0];
    const removeMap = attachNanhaiMap(viewer, host, data.dataRoot, false, {
        storageKey: 'metaflow.apec.mapVisible',
        floorLabel: position.floorLabel,
        overviewFootprints:
            primary?.length >= 3 ? { primary, adjacent: adjacent?.length >= 3 ? adjacent : undefined } : undefined
    });
    const sceneTitle = document.createElement('h3');
    const language = new URLSearchParams(location.search).get('lang') ?? navigator.language;
    sceneTitle.textContent = language.startsWith('zh')
        ? '2026年亚太经合组织领导人会议周新闻中心'
        : 'APEC Media Center 2026';
    const description = document.createElement('p');
    description.textContent = "APEC ECONOMIC LEADERS' WEEK MEDIA CENTER · 深圳会展中心（福田）2号馆";
    host.querySelector('.sse-infoPanelContent .sse-viewerTitle')?.after(sceneTitle, description);
    document.title = '2026年亚太经合组织领导人会议周新闻中心 · APEC Media Center 2026';
    return () => {
        position.destroy();
        removeMap();
        sceneTitle.remove();
        description.remove();
        styles.remove();
        delete host.dataset.locationLabels;
    };
}
