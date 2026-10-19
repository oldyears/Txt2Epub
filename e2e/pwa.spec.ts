import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const SAMPLE_PATH = fileURLToPath(new URL('./fixtures/sample-gbk.txt', import.meta.url));

test('checks installability and converts offline under a GitHub Pages subdirectory', async ({ page, context, baseURL }) => {
  await page.goto(baseURL!);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  });
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  // Playwright contexts are incognito; exclude that environment restriction from the manifest checks.
  expect(installabilityErrors.filter(({ errorId }) => errorId !== 'in-incognito')).toEqual([]);
  await context.setOffline(true);
  await page.reload();
  await page.locator('input[type=file]').first().setInputFiles(SAMPLE_PATH);
  await expect(page.getByRole('textbox', { name: '书名' })).toHaveValue('测试小说');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 EPUB' }).click();
  expect((await download).suggestedFilename()).toBe('测试小说.epub');
});
