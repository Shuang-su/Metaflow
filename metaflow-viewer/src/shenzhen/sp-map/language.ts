const labels: Record<string, { zh: string; en: string }> = {
    mapWindowMove: {
        zh: '移动地图浮窗，方向键移动，Shift 加速',
        en: 'Move map window with arrow keys; hold Shift for larger steps'
    },
    mapWindowResize_nw: {
        zh: '调整地图大小（左上角），上或左键放大，反方向缩小，Shift 加速',
        en: 'Resize map from top left; Up or Left enlarges, opposite arrows shrink; hold Shift for larger steps'
    },
    mapWindowResize_ne: {
        zh: '调整地图大小（右上角），上或右键放大，反方向缩小，Shift 加速',
        en: 'Resize map from top right; Up or Right enlarges, opposite arrows shrink; hold Shift for larger steps'
    },
    mapWindowResize_sw: {
        zh: '调整地图大小（左下角），下或左键放大，反方向缩小，Shift 加速',
        en: 'Resize map from bottom left; Down or Left enlarges, opposite arrows shrink; hold Shift for larger steps'
    },
    mapWindowResize_se: {
        zh: '调整地图大小（右下角），下或右键放大，反方向缩小，Shift 加速',
        en: 'Resize map from bottom right; Down or Right enlarges, opposite arrows shrink; hold Shift for larger steps'
    },
    closeMapPanel: {
        zh: '关闭地图',
        en: 'Close map'
    }
};

export function messageText(locale: string, key: string) {
    return labels[key]?.[locale.startsWith('en') ? 'en' : 'zh'] ?? key;
}
