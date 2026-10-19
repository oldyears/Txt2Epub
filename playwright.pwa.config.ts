import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const BASE_URL = 'http://127.0.0.1:5392/Txt2Epub/';

export default defineConfig({
  ...base,
  outputDir: 'test-results/pwa',
  testMatch: 'pwa.spec.ts',
  projects: [{ name: 'production', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }],
  use: { ...base.use, baseURL: BASE_URL },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5392 --strictPort --base /Txt2Epub/',
    url: BASE_URL,
    reuseExistingServer: false,
  },
});
