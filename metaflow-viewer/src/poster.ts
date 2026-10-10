import type { EventHandler } from 'playcanvas';

/** Show loading chrome only after the poster can paint; never hold up the scene itself. */
function initPoster(root: HTMLElement, image: HTMLImageElement, events: EventHandler) {
    const poster = root.querySelector<HTMLElement>('.sse-poster');
    root.classList.add('sse-posterPending');
    root.dataset.posterStatus = 'pending';
    poster.style.setProperty('--poster-url', `url(${image.src})`);
    poster.style.display = 'block';
    poster.style.filter = 'blur(40px)';
    root.style.setProperty('--canvas-opacity', '0');
    let stopped = false;
    let frame: number | undefined;
    const release = (status: string) => {
        if (stopped || (root.dataset.posterStatus !== 'pending' && status !== 'ready')) return;
        clearTimeout(timeout);
        root.dataset.posterStatus = status;
        root.classList.remove('sse-posterPending');
    };
    const ready = () => {
        if (stopped) return;
        // Allow the cached background to paint before the loading chrome is shown.
        frame = requestAnimationFrame(() => release('ready'));
    };
    const failed = () => release('unavailable');
    const timeout = setTimeout(failed, 10000);
    image.addEventListener('load', ready);
    image.addEventListener('error', failed);
    if (image.complete) {
        if (image.naturalWidth > 0) ready();
        else failed();
    }
    const loaded = () => {
        release('scene-ready');
        poster.style.display = 'none';
        root.style.setProperty('--canvas-opacity', '1');
        stop();
    };
    const blur = (progress: number) => {
        poster.style.filter = `blur(${Math.floor((100 - progress) * 0.4)}px)`;
    };
    const stop = () => {
        if (stopped) return;
        stopped = true;
        clearTimeout(timeout);
        if (frame !== undefined) cancelAnimationFrame(frame);
        image.removeEventListener('load', ready);
        image.removeEventListener('error', failed);
        events.off('loaded:changed', loaded);
        events.off('progress:changed', blur);
    };
    events.on('loaded:changed', loaded);
    events.on('progress:changed', blur);
    return stop;
}

export { initPoster };
