/* global document, requestAnimationFrame, window */
// npm run dev; node scripts/profile-immersive-scenes.mjs /tmp/baseline.json [webkit|chromium] [low|medium|high]
// Measures warmed browser frame cadence, not shader submission time or a GPU timer.
import { chromium, webkit } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const output = process.argv[2];
if (!output) throw new Error('Provide a JSON output path');
const engineName = process.argv[3] || 'webkit';
const quality = process.argv[4] || 'medium';
const ids = (process.env.SCENES || 'forest-flight,dream-fractal,spectral-lines,circuit-flight,ocean-drift,cloud-flight,aurora-voyage').split(',');
const rounds = Number(process.env.ROUNDS || 2);
const seconds = Number(process.env.SECONDS || 6);
const startTime = Number(process.env.START_TIME || 0);
if (!['chromium', 'webkit'].includes(engineName) || !['low', 'medium', 'high'].includes(quality)
  || !Number.isInteger(rounds) || rounds < 1 || !Number.isFinite(seconds) || seconds <= 0
  || !Number.isFinite(startTime) || startTime < 0 || startTime > 3600) {
  throw new Error('Expected a supported browser and quality, positive ROUNDS/SECONDS, and START_TIME between 0 and 3600');
}
const engine = engineName === 'chromium' ? chromium : webkit;
const browser = await engine.launch({ headless: true, ...(engine === chromium ? { channel: 'chromium', args: ['--enable-webgl', '--ignore-gpu-blocklist'] } : {}) });
const report = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  date: new Date().toISOString(), engine: engineName, browser: browser.version(),
  viewport: { width: 1920, height: 1080 }, quality, warmupSeconds: 3, sampleSeconds: seconds,
  music: 'SceneLab synthetic FFT', startTime, rounds, results: [],
};
await mkdir(dirname(output), { recursive: true });
const save = () => writeFile(output, JSON.stringify(report, null, 2) + '\n');
try {
  const page = await browser.newPage({ viewport: report.viewport });
  // A blank-page control distinguishes a browser/OS cadence cap from scene load.
  report.controlFps = await page.evaluate(() => new Promise(resolve => {
    let start = 0, count = 0;
    const tick = now => {
      if (!start) start = now; else count++;
      if (now - start > 2000) resolve(count * 1000 / (now - start)); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  console.log(`Blank-page control: ${report.controlFps.toFixed(1)} fps`);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (let round = 0; round < rounds; round++) {
    for (const id of round % 2 ? [...ids].reverse() : ids) {
      await page.goto(`http://127.0.0.1:1420/scene-lab?scene=${id}&time=${startTime}`);
      await page.locator('canvas[data-scene-ready], [role="alert"]').waitFor();
      if (await page.getByRole('alert').count()) throw new Error(await page.getByRole('alert').innerText());
      if (await page.locator('canvas').getAttribute('data-scene-ready') !== id) throw new Error(`Unknown scene: ${id}`);
      await page.getByRole('combobox', { name: 'Render quality' }).selectOption(quality);
      await page.getByRole('checkbox', { name: 'Simulated music' }).check();
      await page.getByRole('button', { name: 'Hide controls' }).click();
      // No screenshots, readbacks, or GL synchronization inside the timed region.
      const result = await page.evaluate(async duration => {
        await new Promise(resolve => window.setTimeout(resolve, 3000));
        const deltas = [];
        await new Promise(resolve => {
          let previous = 0, start = 0;
          const tick = now => {
            if (!start) start = now;
            if (previous) deltas.push(now - previous);
            previous = now;
            if (now - start >= duration * 1000) resolve(); else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        const canvas = document.querySelector('canvas'), gl = canvas.getContext('webgl');
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const sorted = [...deltas].sort((a, b) => a - b);
        const percentile = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
        return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
          renderSize: [canvas.width, canvas.height], frames: deltas.length,
          fps: 1000 * deltas.length / deltas.reduce((a, b) => a + b, 0),
          p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99),
          over25ms: deltas.filter(delta => delta > 25).length / deltas.length,
          intervalsMs: deltas, glError: gl.getError(), visibility: document.visibilityState };
      }, seconds);
      if (result.glError || result.visibility !== 'visible') throw new Error(`${id}: invalid measurement`);
      report.results.push({ id, round, ...result });
      await save();
      console.log(`${id} #${round + 1}: ${result.fps.toFixed(1)} fps, p95 ${result.p95.toFixed(1)} ms, >25ms ${(result.over25ms * 100).toFixed(1)}%, ${result.renderSize.join('×')}`);
      if (round === 0) await page.screenshot({ path: output.replace(/\.json$/, `-${id}.png`) });
    }
  }
  report.errors = errors;
  if (errors.length) throw new Error(errors.join('\n'));
  await save();
} finally { await browser.close(); }
