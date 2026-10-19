import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test as base, type Download, type Locator, type Page } from '@playwright/test';
import JSZip from 'jszip';

const SAMPLE_PATH = fileURLToPath(new URL('./fixtures/sample-gbk.txt', import.meta.url));
const FIRST_CHAPTER = '第一章 重生';
const SECOND_CHAPTER = /^第二章/;

type PanelName = 'toc' | 'preview' | 'censor';
const TAB_LABELS: Record<PanelName, string> = { toc: '目录', preview: '正文', censor: '和谐词' };

const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors = collectPageErrors(page);
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles(SAMPLE_PATH);
  await expect(page.getByRole('textbox', { name: '书名' })).toHaveValue('测试小说');
});

test('loads a GBK txt with meta, volumes, cleaned body @mobile', async ({ page }) => {
  await expect(page.getByRole('textbox', { name: '作者' })).toHaveValue('某某');
  const toc = await showPanel(page, 'toc');
  await expect(toc).toContainText('共 2 卷 · 3 章');
  await expect(tocEntry(toc, '第一卷 风起')).toHaveCount(1);
  await expect(tocEntry(toc, '第一回合他就输了！')).toHaveCount(0);

  const preview = await openSection(page, FIRST_CHAPTER);
  await expect(preview.getByText('警察')).toBeVisible();
  await expect(previewLine(preview, '心里想着')).toContainText('今天一定要去城里看看');
  await expect(page.getByText('本章未完')).toHaveCount(0);

  const secondChapter = await openSection(page, SECOND_CHAPTER);
  await expect(secondChapter.locator('.line-body', { hasText: '第一回合他就输了！' })).toHaveCount(1);
});

test('fills a censored word', async ({ page }) => {
  const censor = await showPanel(page, 'censor');
  await expect(censor).toContainText('共 2 处');
  await fillFirstFix(page, '封路');
  await expect(censor).toContainText('已填 1 处');
});

test('promotes a body line to a chapter from the keyboard menu', async ({ page }) => {
  const preview = await openSection(page, FIRST_CHAPTER);
  await previewLine(preview, '他点点头').focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: '设为章' }).click();
  const toc = await showPanel(page, 'toc');
  await expect(tocEntry(toc, '他点点头。')).toHaveCount(1);
  await expect(toc).toContainText('共 2 卷 · 4 章');
});

test('exports a valid EPUB with fixes applied', async ({ page }) => {
  await fillFirstFix(page, '封路');
  const zip = await loadEpub(await exportDownload(page));
  expect(Object.keys(zip.files)[0]).toBe('mimetype');
  expect(await zip.file('OEBPS/nav.xhtml')?.async('string')).toContain('第一卷 风起');
  const chapters = await chapterDocuments(zip);
  expect(chapters.find((xhtml) => xhtml.includes(FIRST_CHAPTER))).toContain('封路');
  expect(chapters.some((xhtml) => xhtml.includes('本章未完'))).toBe(false);
});

test('preserves mixed EPUB text and identically named chapters across volumes', async ({ page }) => {
  const buffer = await mixedEpub().generateAsync({ type: 'nodebuffer' });
  await page.locator('input[type=file]').first().setInputFiles({ name: '混排.epub', mimeType: 'application/epub+zip', buffer });
  await expect(page.getByRole('textbox', { name: '书名' })).toHaveValue('混排小说');
  const toc = await showPanel(page, 'toc');
  await expect(toc).toContainText('共 2 卷 · 2 章');
  await expect(tocEntry(toc, '第一章')).toHaveCount(2);
  await tocEntry(toc, '第一章').first().click();
  const preview = await showPanel(page, 'preview');
  await expect(preview).toContainText('开头');
  await expect(preview).toContainText('中间。');
  await expect(preview).toContainText('结尾。');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 EPUB' }).click();
  const chapters = (await chapterDocuments(await loadEpub(await download))).join('\n');
  for (const text of ['开头', '中间。', '结尾。', '另一正文。']) expect(chapters).toContain(text);
});

test('keeps the current book and fixes when an EPUB has a broken spine', async ({ page }) => {
  await fillFirstFix(page, '封路');
  const zip = mixedEpub();
  const path = 'OEBPS/content.opf';
  zip.file(path, (await zip.file(path)!.async('string')).replace('idref="c1"', 'idref="missing"'));
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  await page.locator('input[type=file]').first().setInputFiles({ name: '损坏.epub', mimeType: 'application/epub+zip', buffer });
  await expect(page.getByRole('status')).toContainText('spine 引用了不存在的 manifest 项：missing');
  await expect(page.getByRole('textbox', { name: '书名' })).toHaveValue('测试小说');
  const censor = await showPanel(page, 'censor');
  await expect(censor.getByRole('textbox', { name: '第 1 处替换词' })).toHaveValue('封路');
});

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function showPanel(page: Page, name: PanelName): Promise<Locator> {
  const tab = page.getByRole('tab', { name: TAB_LABELS[name] });
  if (await tab.isVisible()) await tab.click();
  return page.locator(`[data-panel="${name}"]`);
}

async function openSection(page: Page, title: string | RegExp): Promise<Locator> {
  const toc = await showPanel(page, 'toc');
  await tocEntry(toc, title).click();
  return showPanel(page, 'preview');
}

function tocEntry(toc: Locator, title: string | RegExp): Locator {
  return toc.getByRole('button', { name: title, exact: true });
}

function previewLine(preview: Locator, text: string): Locator {
  return preview.locator('[data-line]', { hasText: text });
}

async function fillFirstFix(page: Page, word: string): Promise<void> {
  const censor = await showPanel(page, 'censor');
  await censor.getByRole('textbox', { name: '第 1 处替换词' }).fill(word);
}

async function exportDownload(page: Page): Promise<Download> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 EPUB' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('测试小说.epub');
  return file;
}

async function loadEpub(download: Download): Promise<JSZip> {
  return JSZip.loadAsync(await readFile(await download.path()));
}

function chapterDocuments(zip: JSZip): Promise<string[]> {
  const sectionFiles = zip.file(/^OEBPS\/text\/.+\.xhtml$/);
  return Promise.all(sectionFiles.map((file) => file.async('string')));
}

function mixedEpub(): JSZip {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>');
  zip.file('OEBPS/content.opf', '<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>混排小说</dc:title></metadata><manifest><item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>');
  zip.file('OEBPS/chapter.xhtml', '<html><body><h1>第一卷 A</h1><h2>第一章</h2>开头<p>中间。</p>结尾。<h1>第二卷 B</h1><h2>第一章</h2><p>另一正文。</p></body></html>');
  return zip;
}
