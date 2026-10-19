/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Txt2Epub',
        short_name: 'Txt2Epub',
        lang: 'zh-CN',
        display: 'standalone',
        theme_color: '#2f6f5e',
        background_color: '#ffffff',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
    }),
  ],
  test: {
    environment: 'happy-dom',
    environmentOptions: { happyDOM: { settings: { handleDisabledFileLoadingAsSuccess: true } } },
    include: ['tests/**/*.test.ts'],
    // Node 25 ships a global localStorage that, without --localstorage-file, shadows happy-dom's working Storage.
    execArgv: ['--no-experimental-webstorage'],
  },
});
