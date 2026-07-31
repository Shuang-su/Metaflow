async page => {
  const baseUrl = 'http://127.0.0.1:6006';
  page.setDefaultTimeout(10_000);
  const engine = await page.evaluate(() =>
    navigator.userAgent.includes('Chrome/') ? 'chromium' : 'webkit'
  );
  const ids = {
    hero: '1-组件案例--hero-glass',
    switch: '1-组件案例--switch',
    slider: '1-组件案例--slider',
    toggle: '1-组件案例--segmented-toggle',
    qr: '1-组件案例-1-5-qr-code-canvas--interactive-demo',
    video: '1-组件案例-1-6-video-controls--interactive-demo',
    how: '2-playground--how-it-works'
  };

  const openStory = async id => {
    await page.goto(`${baseUrl}/?path=/story/${encodeURIComponent(id)}`);
    await page.locator('#storybook-preview-iframe').waitFor({ state: 'attached' });
    const frame = page.frames().find(candidate => candidate.url().includes('/iframe.html'));
    if (!frame) throw new Error(`Preview frame missing for ${id}`);
    await frame.locator('.origin-demo-frame[data-ready="true"]').waitFor();
    return frame;
  };

  const inspectDomGlass = async frame => ({
    nestedIframes: await frame.locator('iframe').count(),
    glass: await frame.locator('[data-aave-glass-container]').count(),
    filters: await frame.locator('filter').count(),
    feImage: await frame.locator('feImage').count(),
    displacement: await frame.locator('feDisplacementMap').count(),
    originalChrome: await frame
      .getByText(/^(Back|Share)$/)
      .count()
  });

  const results = {};

  let frame = await openStory(ids.hero);
  const lens = frame.locator('.origin-demo-host [style*="border-radius: 80px"]').first();
  const lensBox = await lens.boundingBox();
  const transformBefore = await lens.getAttribute('style');
  await page.waitForTimeout(500);
  const transformAfter = await lens.getAttribute('style');
  results.hero = {
    ...(await inspectDomGlass(frame)),
    lens: lensBox ? [Math.round(lensBox.width), Math.round(lensBox.height)] : null,
    moving: transformBefore !== transformAfter
  };

  frame = await openStory(ids.switch);
  const checkbox = frame.locator('input[type="checkbox"]');
  const switchBefore = await checkbox.isChecked();
  await checkbox.locator('xpath=..').click();
  results.switch = {
    ...(await inspectDomGlass(frame)),
    before: switchBefore,
    after: await checkbox.isChecked()
  };

  frame = await openStory(ids.slider);
  const range = frame.locator('input[type="range"]');
  const sliderBefore = await range.inputValue();
  await range.evaluate(input => {
    input.value = '82';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  results.slider = {
    ...(await inspectDomGlass(frame)),
    before: sliderBefore,
    after: await range.inputValue()
  };

  frame = await openStory(ids.toggle);
  const reserves = frame.locator('.origin-demo-host button').filter({ hasText: 'Reserves' });
  const hubs = frame.locator('.origin-demo-host button').filter({ hasText: 'Hubs' });
  await reserves.click();
  results.toggle = {
    ...(await inspectDomGlass(frame)),
    reserves: await reserves.getAttribute('data-state'),
    hubs: await hubs.getAttribute('data-state')
  };

  frame = await openStory(ids.qr);
  const qrFigure = frame.locator('.origin-demo-host figure').first();
  const qrBefore = await qrFigure.screenshot();
  await frame.locator('.origin-demo-host button').click();
  await page.waitForTimeout(350);
  const qrAfter = await qrFigure.screenshot();
  results.qr = {
    nestedIframes: await frame.locator('iframe').count(),
    canvases: await frame.locator('canvas').count(),
    changed: !qrBefore.equals(qrAfter)
  };

  frame = await openStory(ids.video);
  const video = frame.locator('video');
  await frame.waitForFunction(() => document.querySelector('video')?.readyState >= 3);
  const videoButton = frame.getByRole('button', { name: /Pause|Play/ }).first();
  const videoBefore = await videoButton.getAttribute('aria-label');
  await videoButton.click();
  await frame.waitForFunction(
    previousLabel =>
      document.querySelector('button[aria-label="Pause"], button[aria-label="Play"]')?.getAttribute('aria-label') !==
      previousLabel,
    videoBefore
  );
  await frame.waitForFunction(
    previousLabel => document.querySelector('video')?.paused === (previousLabel === 'Pause'),
    videoBefore
  );
  results.video = {
    nestedIframes: await frame.locator('iframe').count(),
    canvases: await frame.locator('canvas').count(),
    videos: await frame.locator('video').count(),
    before: videoBefore,
    after: await videoButton.getAttribute('aria-label'),
    paused: await video.evaluate(element => element.paused)
  };

  frame = await openStory(ids.how);
  const widthControl = frame.getByRole('slider').first();
  const mapImage = frame.locator('feImage').first();
  const widthBefore = await widthControl.getAttribute('aria-valuenow');
  const mapBefore = await mapImage.getAttribute('href');
  await widthControl.press('End');
  await page.waitForTimeout(200);
  results.how = {
    ...(await inspectDomGlass(frame)),
    canvases: await frame.locator('canvas').count(),
    before: widthBefore,
    after: await widthControl.getAttribute('aria-valuenow'),
    mapChanged: mapBefore !== (await mapImage.getAttribute('href'))
  };

  const themeButton = page.locator('#web-liquid-glass-theme-control button');
  await themeButton.click();
  const theme = await page.evaluate(() => localStorage.getItem('theme'));
  const previewTheme = await frame.evaluate(() => document.documentElement.className);
  await page.reload();
  await page.locator('#web-liquid-glass-theme-control button').waitFor();
  results.theme = {
    stored: theme,
    manager: await page.evaluate(() => document.documentElement.dataset.theme),
    preview: previewTheme,
    persisted: await page.evaluate(() => localStorage.getItem('theme'))
  };

  const mobile = await page.context().newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${baseUrl}/iframe.html?id=${encodeURIComponent(ids.how)}&viewMode=story`);
  await mobile.locator('.origin-demo-frame[data-ready="true"]').waitFor();
  results.mobile = await mobile.evaluate(() => ({
    innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    overflow: document.documentElement.scrollWidth > innerWidth
  }));
  await mobile.screenshot({
    path: `output/playwright/how-it-works-mobile-${engine}.png`,
    fullPage: true
  });
  await mobile.close();

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: `output/playwright/storybook-final-${engine}.png`,
    fullPage: true
  });
  return results;
}
