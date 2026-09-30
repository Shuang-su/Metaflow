import { element, StudioControls } from './controls';
import { chooseFiles } from './files';

type Picked = Awaited<ReturnType<typeof chooseFiles>>[number];
/** File choice stays provisional until the explicit apply action succeeds. */
export function assetDialog(kind: 'skybox' | 'collision', apply: (files: Picked[]) => Promise<void>) {
    const dialog = element('dialog', '', 'studio-asset-dialog blocks-shortcuts');
    const title = kind === 'skybox' ? '导入天空盒' : '导入碰撞文件';
    const id = `studio-${kind}-dialog-title`; dialog.setAttribute('aria-labelledby', id);
    const heading = element('h2', title); heading.id = id;
    const description = element('p', kind === 'skybox' ? '选择一个 WebP 或 HDR 文件作为天空盒。HDR 在浏览器中读取处理。' : '选择同名的 .voxel.json 和 .voxel.bin；可以同时拖入，也可以分两次选择。');
    const error = element('p', '', 'studio-asset-error'); error.setAttribute('role', 'alert'); error.hidden = true;
    dialog.append(heading, description);
    const zone = element('div', '', 'studio-drop-zone'); dialog.append(zone);
    const chosen = new Map<string, Picked>();
    let busy = false;
    const controls = new StudioControls((action) => {
        Promise.resolve().then(action).catch((reason) => {
            if (reason?.name === 'AbortError') return;
            error.textContent = reason?.message ?? String(reason); error.hidden = false;
        });
    }, () => {}, () => {});
    const accept = kind === 'skybox' ? '.webp,.hdr' : '.voxel.json,.voxel.bin';
    const choose = controls.button(zone, '选择文件', async () => receive(await chooseFiles(accept)), '', 'file');
    zone.append(element('p', kind === 'skybox' ? '点击选择或拖入 .webp / .hdr 文件' : '拖入 .voxel.json / .voxel.bin 文件'));
    const slots = element('div', '', 'studio-asset-slots'); dialog.append(slots, error);
    const footer = element('div', '', 'studio-dialog-actions'); dialog.append(footer);
    const cancel = controls.button(footer, '取消', () => dialog.close());
    const submit = controls.button(footer, title, async () => {
        if (busy || submit.disabled) return;
        busy = true; refresh(); error.hidden = true;
        try {
            await apply([...chosen.values()]); dialog.close();
        } finally {
            busy = false; refresh();
        }
    }, 'primary', 'upload');
    const close = controls.button(dialog, '关闭导入窗口', () => dialog.close(), 'ghost studio-dialog-close', 'close', true);
    function refresh() {
        choose.disabled = cancel.disabled = close.disabled = busy;
        submit.disabled = busy || chosen.size !== (kind === 'skybox' ? 1 : 2);
        submit.setAttribute('aria-busy', String(busy));
        slots.replaceChildren();
        for (const key of kind === 'skybox' ? ['skybox'] : ['json', 'bin']) {
            const file = chosen.get(key), row = element('div', '', 'studio-asset-slot'); slots.append(row);
            row.append(element('span', file?.name ?? (key === 'skybox' ? '尚未选择文件' : `尚未选择 .voxel.${key}`)));
            if (file) {
                controls.button(row, `移除 ${file.name}`, () => {
                    chosen.delete(key); refresh();
                }, 'ghost', 'trash', true).disabled = busy;
            }
        }
    }
    function receive(files: Picked[]) {
        if (busy || !files.length) return;
        if (kind === 'skybox' && (files.length !== 1 || !/\.(?:webp|hdr)$/i.test(files[0].name))) throw new Error('请选择一个 WebP 或 HDR 文件。');
        if (kind === 'collision' && files.some(file => !/\.voxel\.(?:json|bin)$/i.test(file.name))) throw new Error('碰撞文件必须是 .voxel.json 或 .voxel.bin。');
        const next = new Map(chosen);
        for (const file of files) next.set(kind === 'skybox' ? 'skybox' : file.name.endsWith('.json') ? 'json' : 'bin', file);
        chosen.clear(); next.forEach((file, key) => chosen.set(key, file)); error.hidden = true; refresh();
    }
    zone.addEventListener('dragover', (event) => {
        if (!busy) {
            event.preventDefault(); zone.classList.add('drag-over');
        }
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (event) => {
        event.preventDefault(); event.stopPropagation(); zone.classList.remove('drag-over');
        try {
            receive(Array.from(event.dataTransfer.files).map(file => ({ file, name: file.name })));
        } catch (reason) {
            error.textContent = reason.message; error.hidden = false;
        }
    });
    // Prevent Editor's global model drop handler from consuming local dialog input.
    dialog.addEventListener('dragover', event => event.preventDefault()); dialog.addEventListener('drop', event => event.stopPropagation());
    dialog.addEventListener('cancel', (event) => {
        if (busy) event.preventDefault();
    });
    const focus = document.activeElement as HTMLElement;
    dialog.addEventListener('close', () => {
        controls.clear(); dialog.remove(); if (focus?.isConnected) focus.focus();
    });
    document.body.append(dialog); refresh(); dialog.showModal();
}
