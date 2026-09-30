const labels = { off: '关闭', selected: '固定说明与镜头同步', titles: '仅热点与标题', aces: 'ACES', none: '无', linear: '线性' };
export async function selectStudio(page, name, value) {
    const input = page.getByRole('combobox', { name, exact: true });
    let openedVideo = false;
    if (name === '叠加模式' && !await input.isVisible()) { await page.getByRole('button', { name: '导出视频', exact: true }).click(); openedVideo = true; }
    await input.click();
    await page.locator('.pcui-select-input-list:visible').getByText(labels[value] ?? value, { exact: true }).click();
    if (openedVideo) await page.keyboard.press('Escape');
}

export async function openFileMenu(page) {
    if (!await page.locator('.studio-file-menu').evaluate(e => e.open)) await page.locator('.studio-file-menu summary').click();
}
