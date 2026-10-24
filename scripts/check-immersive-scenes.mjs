/* global requestAnimationFrame, document, window */
// Run against `npm run dev`: node scripts/check-immersive-scenes.mjs [chromium|webkit]
import assert from 'node:assert/strict';
import { chromium, webkit } from '@playwright/test';

const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const browser = await engine.launch({ headless: true, ...(engine === chromium ? { channel: 'chromium', args: ['--enable-webgl', '--ignore-gpu-blocklist'] } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:1420/scene-lab');
  await page.getByRole('combobox', { name: 'Scene', exact: true }).waitFor();
  const sceneIds = await page.getByRole('combobox', { name: 'Scene', exact: true }).locator('option').evaluateAll(options => options.map(option => option.value));
  assert.equal(sceneIds.length, 7);

  const sample = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl');
    const copy = document.createElement('canvas');
    copy.width = 64; copy.height = 40;
    const ctx = copy.getContext('2d');
    ctx.drawImage(canvas, 0, 0, 64, 40);
    const rgba = ctx.getImageData(0, 0, 64, 40).data;
    const rgb = [...rgba].filter((_, index) => index % 4 !== 3);
    const program = gl.getParameter(gl.CURRENT_PROGRAM);
    const read = name => { const location = gl.getUniformLocation(program, name); return location ? gl.getUniform(program, location) : null; };
    const energy = Math.max(...['uEnergy', 'uBass', 'uMid', 'uTreble', 'uSpectrum[0]'].map(name => read(name) ?? 0));
    resolve({ max: Math.max(...rgb), min: Math.min(...rgb), time: read('uTime'), energy, error: gl.getError(), pixels: canvas.width * canvas.height });
  })));

  for (const id of sceneIds) {
    await page.getByRole('combobox', { name: 'Scene', exact: true }).selectOption(id);
    await page.locator(`canvas[data-scene-ready="${id}"], [role="alert"]`).waitFor();
    assert.equal(await page.getByRole('alert').count(), 0, `${id}: ${await page.getByRole('alert').allTextContents()} ${errors.join('\n')}`);
    // Freeze travel to distinguish changes from live parameter/audio updates.
    await page.getByRole('slider', { name: 'Travel / animation speed', exact: true }).fill('0');
    await sample();
    const still = await sample();
    assert.ok(still.max > 20 && still.max - still.min > 15, `${id}: blank or flat image`);
    assert.equal(still.error, 0, `${id}: WebGL error`);
    assert.equal((await sample()).time, still.time, `${id}: speed zero must freeze travel`);
    await page.getByRole('checkbox', { name: 'Simulated music' }).check();
    // Wait on rendered frames, rather than assuming how quickly the GPU runs.
    for (let i = 0; i < 20; i++) await sample();
    const music = await sample();
    assert.ok(music.energy > 0, `${id}: music envelope did not reach shader`);
    await page.getByRole('slider', { name: 'Music response', exact: true }).fill('0');
    await sample();
    const muted = await sample();
    assert.equal(muted.energy, 0, `${id}: zero music response must suppress audio`);
    await page.getByRole('checkbox', { name: 'Simulated music' }).uncheck();
    // Exercise distant procedural cells, not just the opening camera position.
    for (const time of [60, 180, 600]) {
      await page.getByRole('slider', { name: 'Preview time', exact: true }).fill(String(time));
      await sample();
      const frame = await sample();
      assert.equal(frame.time, time, `${id}: preview time did not reach shader`);
      assert.equal(frame.error, 0, `${id}/${time}s: WebGL error`);
      assert.ok(frame.max > 20 && frame.max - frame.min > 15, `${id}/${time}s: blank or flat image`);
    }
    // All palettes/habitats/formations should render, including each quality level.
    const selects = page.locator('aside select').filter({ hasNot: page.locator('option[value="forest-flight"]') });
    for (const select of await selects.all()) {
      const values = await select.locator('option').evaluateAll(options => options.map(option => option.value));
      for (const value of values) {
        await select.selectOption(value);
        await sample();
        const frame = await sample();
        assert.equal(frame.error, 0, `${id}/${value}: WebGL error`);
        assert.ok(frame.max > 10, `${id}/${value}: blank image`);
      }
    }
    await page.getByRole('slider', { name: 'Brightness', exact: true }).fill('0');
    await sample();
    assert.equal((await sample()).max, 0, `${id}: brightness zero must be black`);
    await page.getByRole('slider', { name: 'Brightness', exact: true }).fill('1');
    await page.getByRole('combobox', { name: 'Render quality' }).selectOption('low');
    await page.setViewportSize({ width: 430, height: 800 });
    await sample();
    assert.ok((await sample()).pixels <= 361000, `${id}: low-quality pixel budget exceeded`);
    await page.setViewportSize({ width: 480, height: 320 });
    assert.equal(await page.getByRole('alert').count(), 0, `${id}: renderer error overlay`);
    console.log(`${id}: render, travel positions, variations, audio, dim, pause, resize passed`);
  }

  // Force actual GPU context loss and restoration on the final mounted scene.
  const canLose = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl');
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    extension.loseContext();
    window.setTimeout(() => extension.restoreContext(), 500);
    return true;
  });
  if (canLose) {
    await page.getByRole('alert').waitFor();
    await page.locator('canvas[data-scene-ready]').waitFor();
    assert.ok((await sample()).max > 10, 'context restore must resume rendering');
    console.log('GPU context recovery passed');
  }
  assert.deepEqual(errors, [], 'browser errors');
} finally {
  await browser.close();
}
