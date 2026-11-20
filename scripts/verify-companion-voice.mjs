import {createRequire} from 'node:module';
import path from 'node:path';
import {mkdir, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const [origin, label] = process.argv.slice(2), url = new URL(origin);
assert.equal(url.protocol, 'https:');
assert.ok(url.hostname === 'polite-semolina-b478fc.netlify.app' || /^[0-9a-f]{24}--polite-semolina-b478fc\.netlify\.app$/.test(url.hostname));
assert.ok(['preview', 'production'].includes(label));
const {chromium} = createRequire(path.join(process.env.BROWSER_MODULE_DIR, 'package.json'))('playwright');
const out = process.env.EVIDENCE_DIR;
assert.ok(out);
await mkdir(out, {recursive: true});

// Original generated test tone. It tests playback/lip motion, not a human voice.
function makeWav() {
  const rate = 16000, frames = rate * 40, buffer = Buffer.alloc(44 + frames * 2);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) buffer.writeInt16LE(Math.round(Math.sin(i / rate * 440 * Math.PI * 2) * 6500 * (.7 + .3 * Math.sin(i / rate * 8))), 44 + i * 2);
  return buffer;
}
const wav = makeWav();
const report = {origin, label, engine: 'CI Chromium software WebGL; real remote VRM/VRMA and generated test WAV; normal user-gesture policy; no physical Apple or human voice-quality claim', scenarios: [], pass: false};
const browser = await chromium.launch({headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']});
try {
  for (const mobile of [false, true]) {
    const name = mobile ? 'mobile' : 'desktop';
    const context = await browser.newContext({viewport: mobile ? {width: 420, height: 912} : {width: 1280, height: 900}, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, reducedMotion: 'reduce'});
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {if (message.type() === 'error' && !message.text().includes('favicon.ico')) errors.push(message.text());});
    try {
      await page.goto(origin, {waitUntil: 'domcontentloaded', timeout: 60000});
      assert.equal(new URL(page.url()).hostname, url.hostname);
      assert.match(await page.title(), /MetaFlow/);
      await page.waitForFunction(() => window.__companionDiagnostics?.().ready, null, {timeout: 110000});
      const initial = await page.evaluate(() => window.__companionDiagnostics());
      assert.equal(initial.cameraActive, false);
      assert.equal(initial.displays.permission, 'unrequested');
      assert.equal(initial.voice.active, false);
      assert.equal(initial.voice.agentOptedIn, false);
      assert.equal(initial.experience.startupMode, 'wenjing');
      assert.equal(initial.renderer.modelCount, 1);
      assert.ok(initial.renderer.triangles > 100);
      assert.match(await page.locator('#scene-name').textContent(), /文镜|文静/);
      await page.locator('#room-shortcut').click();
      assert.equal(await page.locator('[data-room="terrace"]').count(), 0);
      await page.locator('#appearance-advanced>summary').click();
      await page.locator('#room-quality').selectOption('low');
      await page.locator('#tab-avatar').click();
      assert.equal(await page.locator('.motion-entry').count(), 16);
      await page.locator('#native-idle').selectOption('talking');
      await page.waitForFunction(() => {const m = window.__companionDiagnostics().renderer.nativeMotion; return m?.idle === 'talking' && !m.loading && m.actions === 1;});
      await page.locator('#tab-interaction').click();
      assert.equal(await page.locator('#audio-play').isDisabled(), true);
      assert.equal(await page.locator('#audio-progress').isDisabled(), true);
      await page.locator('#speech-audio').setInputFiles({name: 'original-pipeline-test.wav', mimeType: 'audio/wav', buffer: wav});
      assert.match(await page.locator('#speech-file-name').textContent(), /original-pipeline-test\.wav.*MiB/);
      assert.equal(await page.locator('#audio-play').isEnabled(), true);
      await page.locator('#speech-caption').fill('本项目生成的测试音，只验证播放与口型通路。');
      // The click is the only playback trigger; do not relax autoplay policy.
      await page.locator('#audio-play').click();
      await page.waitForFunction(() => {const d = window.__companionDiagnostics(); return d.voice.phase === 'playing' && d.renderer.speaking && d.renderer.mouthLevel > .02;}, null, {timeout: 22000});
      await page.waitForFunction(() => Number(document.querySelector('#audio-progress').value) > 0);
      assert.equal(await page.locator('#audio-progress').isEnabled(), true);
      assert.match(await page.locator('#audio-progress-time').textContent(), /\/ 0:40/);
      assert.match(await page.locator('#caption').textContent(), /本项目生成/);
      await page.locator('#voice-pause').click();
      await page.waitForFunction(() => window.__companionDiagnostics().voice.phase === 'paused');
      const before = Number(await page.locator('#audio-progress').inputValue());
      await page.locator('#audio-progress').press('Home');
      await page.locator('#audio-progress').press('PageUp');
      await page.locator('#audio-progress').press('PageUp');
      await page.locator('#audio-progress').press('PageUp');
      await page.waitForFunction(() => Number(document.querySelector('#audio-progress').value) >= 10);
      const sought = Number(await page.locator('#audio-progress').inputValue());
      assert.ok(sought >= 10 && sought < 20, `Keyboard seek was ${sought}; previous ${before}`);
      assert.equal(await page.evaluate(() => window.__companionDiagnostics().voice.phase), 'paused');
      assert.equal(await page.evaluate(() => window.__companionDiagnostics().renderer.speaking), false);
      await page.locator('#speech-volume').press('Home');
      assert.equal(await page.locator('#speech-volume-value').textContent(), '0%');
      assert.match(await page.locator('#speech-volume-help').textContent(), /已应用/);
      await page.locator('#speech-volume').press('End');
      await page.locator('#voice-resume').click();
      await page.waitForFunction(() => window.__companionDiagnostics().voice.phase === 'playing');
      await page.waitForFunction(previous => Number(document.querySelector('#audio-progress').value) > previous, sought);
      await page.locator('#audio-progress').scrollIntoViewIfNeeded();
      await page.screenshot({path: `${out}/${label}-${name}-voice-playing.png`});
      await page.locator('#speech-stop').click();
      await page.waitForFunction(() => window.__companionDiagnostics().voice.phase === 'idle');
      assert.equal(await page.locator('#audio-progress').isDisabled(), true);
      assert.equal(await page.locator('#audio-progress-time').textContent(), '0:00 / 0:00');
      assert.equal(await page.locator('#caption').isVisible(), false);
      assert.equal(await page.evaluate(() => window.__companionDiagnostics().renderer.speaking), false);
      assert.equal(await page.evaluate(() => window.__companionDiagnostics().renderer.mouthLevel), 0);
      await page.locator('#audio-play').click();
      await page.waitForFunction(() => window.__companionDiagnostics().voice.phase === 'playing');
      await page.locator('#speech-stop').click();
      await page.waitForFunction(() => window.__companionDiagnostics().voice.phase === 'idle');
      await page.locator('#system-speech-panel>summary').click();
      assert.equal(await page.locator('#speech-play').isVisible(), true);
      assert.match(await page.locator('#speech-volume-help').textContent(), /下次/);
      await page.locator('#agent-voice-panel>summary').click();
      assert.equal(await page.locator('#agent-voice-enable').isChecked(), false);
      assert.equal(await page.evaluate(() => window.metaflowCompanionVoice.submit({kind: 'audio', url: 'https://example.com/arbitrary.wav'})), false);
      const last = await page.evaluate(() => window.__companionDiagnostics());
      assert.equal(last.cameraActive, false);
      assert.equal(last.displays.permission, 'unrequested');
      assert.equal(last.renderer.nativeMotion.idle, 'talking');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      assert.equal(await page.locator('[id^="midori-"]').count(), 0);
      assert.deepEqual(errors, []);
      report.scenarios.push({name, pass: true, errors, checks: ['actual Wenjing VRM and original talking idle', '16-item animation catalogue retained', 'no automatic camera/display/Agent access', 'actual local WAV playback under normal autoplay policy', 'real progress and duration', 'pause and keyboard seek stays paused', 'volume control feedback', 'resume advances from chosen time', 'stop clears mouth/caption/progress', 'replay succeeds', 'system voice and opt-in controls retained', 'no 2D media or horizontal overflow']});
    } catch (error) {
      report.scenarios.push({name, pass: false, error: error.stack, errors, status: await page.locator('#voice-status').textContent().catch(() => ''), diagnostics: await page.evaluate(() => window.__companionDiagnostics?.()).catch(() => null)});
      await page.screenshot({path: `${out}/${label}-${name}-failed.png`}).catch(() => {});
      throw error;
    } finally {
      await context.close();
    }
  }
  report.pass = true;
  console.log('REMOTE_VOICE_PLAYBACK_VERIFIED', label);
} finally {
  await browser.close();
  await writeFile(`${out}/${label}-report.json`, JSON.stringify(report, null, 2));
}
