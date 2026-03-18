import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  outputDir: 'playwright-results',
  reporter: [
    ['line'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'matrix' },
    { name: 'chromium' },
    { name: 'firefox' },
    { name: 'webkit' },
    { name: 'mobile-chromium' },
  ],
});
