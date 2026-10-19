import { defineConfig } from '@playwright/test';

const PORT = 5390;
const BASE_URL = `http://localhost:${PORT}`;
const browserChannel = process.env.CI ? undefined : 'chrome';

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results/smoke',
  testMatch: 'smoke.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: BASE_URL, channel: browserChannel, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    {
      name: 'mobile',
      grep: /@mobile/,
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
});
