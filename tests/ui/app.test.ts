import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '../../src/core/types';
import { suggestWords, type SuggestionResult } from '../../src/llm/deepseek';
import { App } from '../../src/ui/app';

vi.mock('../../src/llm/deepseek', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/llm/deepseek')>()),
  suggestWords: vi.fn(),
}));

const NOVEL = ['第一卷 风起', '第一章 开始', '他说***了。', '第二章 相遇', '她来了。'].join('\n');

type Mounted = { app: App; root: HTMLElement };

function mount(): Mounted {
  document.body.replaceChildren();
  const root = document.createElement('div');
  document.body.append(root);
  return { app: new App(root), root };
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100 && !condition(); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  expect(condition()).toBe(true);
}

async function mountWithBook(text = NOVEL): Promise<Mounted> {
  const mounted = mount();
  mounted.app.open(new File([text], '小镇.txt'));
  await waitFor(() => Boolean(mounted.app.state.book));
  return mounted;
}

function withHeading(settings: Settings, maxLength: number): Settings {
  return { ...settings, heading: { ...settings.heading, maxLength } };
}

function toastText(root: HTMLElement): string {
  return root.querySelector('.toast')?.textContent ?? '';
}

describe('App', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('starts on the empty state', () => {
    const { root } = mount();
    expect(root.querySelector<HTMLElement>('.empty-state')?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('.workspace')?.hidden).toBe(true);
  });

  it('loads a txt file into toc, preview and censor list', async () => {
    const { root } = await mountWithBook();
    expect(root.querySelector('.toc .panel-summary')?.textContent).toBe('共 1 卷 · 2 章');
    expect(root.querySelectorAll('.toc-row')).toHaveLength(3);
    expect(root.querySelector('.censor .panel-summary')?.textContent).toBe('共 1 处 · 已填 0 处');
    expect(root.querySelector<HTMLInputElement>('.header-meta input')?.value).toBe('小镇');
  });

  it('rejects unsupported files with a toast', () => {
    const { app, root } = mount();
    app.open(new File(['x'], 'a.pdf'));
    expect(toastText(root)).toBe('仅支持 txt 和 epub 文件');
  });

  it('prevents another import while a file is still loading', async () => {
    const { app, root } = mount();
    const first = new File([NOVEL], '第一本.txt');
    const second = new File([NOVEL], '第二本.txt');
    let finishRead: (bytes: ArrayBuffer) => void = () => {};
    vi.spyOn(first, 'arrayBuffer').mockReturnValue(new Promise((resolve) => (finishRead = resolve)));
    const readSecond = vi.spyOn(second, 'arrayBuffer');
    app.open(first);
    app.open(second);
    expect(readSecond).not.toHaveBeenCalled();
    expect(toastText(root)).toBe('正在处理，请稍候');
    finishRead(new TextEncoder().encode(NOVEL).buffer);
    await waitFor(() => app.state.book?.meta.title === '第一本');
    app.open(second);
    await waitFor(() => app.state.book?.meta.title === '第二本');
  });

  it('demotes a heading from the toc ✕ button', async () => {
    const { app, root } = await mountWithBook();
    root.querySelector<HTMLButtonElement>('.toc-chapter .toc-demote')?.click();
    expect(root.querySelectorAll('.toc-row')).toHaveLength(2);
    expect(app.state.kindEdited).toBe(true);
  });

  it('updates fixes and the preview mark from the censor input', async () => {
    const { app, root } = await mountWithBook();
    app.selectSection(1);
    const input = root.querySelector<HTMLInputElement>('.censor-input')!;
    input.value = '死';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(app.state.fixes.get(0)).toBe('死');
    expect(root.querySelector('.preview mark[data-hit="0"]')?.textContent).toBe('死');
    expect(root.querySelector('.censor .panel-summary')?.textContent).toBe('共 1 处 · 已填 1 处');
  });

  it('pages the censor list with 显示更多', async () => {
    const manyHits = ['第一章 开始', ...Array.from({ length: 250 }, (_, index) => `第${index}句***了。`)].join('\n');
    const { root } = await mountWithBook(manyHits);
    const more = root.querySelector<HTMLButtonElement>('.censor-more')!;
    expect(root.querySelectorAll('.censor-item')).toHaveLength(200);
    expect(more.hidden).toBe(false);
    more.click();
    expect(root.querySelectorAll('.censor-item')).toHaveLength(250);
    expect(more.hidden).toBe(true);
  });

  it('opens the line menu from the keyboard and restores focus on Escape', async () => {
    const { app, root } = await mountWithBook();
    app.selectSection(1);
    const line = root.querySelector<HTMLElement>('.preview [data-line="2"]')!;
    line.focus();
    line.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const menu = root.querySelector<HTMLElement>('.line-menu')!;
    expect(menu.hidden).toBe(false);
    expect(document.activeElement?.textContent).toBe('设为卷');
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement?.textContent).toBe('设为章');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(line);
  });
});

function stubConfirm(answer: boolean) {
  const confirm = vi.fn(() => answer);
  vi.stubGlobal('confirm', confirm);
  return confirm;
}

describe('App preview keyboard', () => {
  beforeEach(() => localStorage.clear());

  async function previewLines(): Promise<HTMLElement[]> {
    const { app, root } = await mountWithBook();
    app.selectSection(1);
    return Array.from(root.querySelectorAll<HTMLElement>('.preview [data-line]'));
  }

  it('keeps a single tab stop on the first line with a menu popup hint', async () => {
    const lines = await previewLines();
    expect(lines.map((line) => line.getAttribute('tabindex'))).toEqual(['0', '-1']);
    expect(lines.every((line) => line.getAttribute('aria-haspopup') === 'menu')).toBe(true);
  });

  it('moves focus and the tab stop with ArrowDown / ArrowUp', async () => {
    const [heading, body] = await previewLines();
    heading.focus();
    heading.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(body);
    expect([heading.tabIndex, body.tabIndex]).toEqual([-1, 0]);
    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(heading);
  });

  it('closes the line menu when focus leaves it without stealing focus', async () => {
    const [heading, body] = await previewLines();
    body.focus();
    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const menu = document.querySelector<HTMLElement>('.line-menu')!;
    expect(menu.hidden).toBe(false);
    heading.focus();
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(heading);
  });
});

describe('App settings', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('stores llm-only changes without confirming or reprocessing', async () => {
    const { app } = await mountWithBook();
    app.setLineKind({ index: 4, kind: 'chapter' });
    const confirm = stubConfirm(true);
    const book = app.state.book;
    app.saveSettings({ ...app.state.settings, llm: { apiKey: 'sk-test', model: 'm' } });
    await waitFor(() => app.state.settings.llm.apiKey === 'sk-test');
    expect(confirm).not.toHaveBeenCalled();
    expect(app.state.book).toBe(book);
  });

  it('reprocesses after the user accepts the confirmation', async () => {
    const { app } = await mountWithBook();
    app.setLineKind({ index: 4, kind: 'chapter' });
    const confirm = stubConfirm(true);
    app.saveSettings(withHeading(app.state.settings, 40));
    await waitFor(() => !app.state.kindEdited);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('keeps manual edits when the user declines', async () => {
    const { app } = await mountWithBook();
    app.setLineKind({ index: 4, kind: 'chapter' });
    stubConfirm(false);
    const book = app.state.book;
    app.saveSettings(withHeading(app.state.settings, 40));
    await waitFor(() => app.state.settings.heading.maxLength === 40);
    expect(app.state.book).toBe(book);
    expect(app.state.kindEdited).toBe(true);
  });

  it('offers to reprocess again after a declined confirmation', async () => {
    const { app } = await mountWithBook();
    app.setLineKind({ index: 4, kind: 'chapter' });
    const confirm = stubConfirm(false);
    const longer = withHeading(app.state.settings, 40);
    app.saveSettings(longer);
    await waitFor(() => app.state.settings === longer);
    confirm.mockReturnValue(true);
    app.saveSettings(longer);
    await waitFor(() => !app.state.kindEdited);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('reports fixes lost by reprocessing', async () => {
    const { app, root } = await mountWithBook();
    app.setFix({ hitIndex: 0, word: '跑' });
    app.saveSettings({ ...app.state.settings, dictionary: [{ from: '***', to: '死' }] });
    await waitFor(() => app.state.hits.length === 0);
    expect(toastText(root)).toBe('有 1 处已填写的替换因重新处理而失效');
  });

  it('blocks saving when a regex is invalid', async () => {
    const { app, root } = await mountWithBook();
    app.openSettings();
    const inputs = root.querySelectorAll<HTMLInputElement>('.settings-form .input');
    inputs[1].value = '第(';
    root.querySelector('.settings-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    const hint = root.querySelector<HTMLElement>('.settings-hint')!;
    expect(hint.hidden).toBe(false);
    expect(hint.textContent).toContain('第(');
    expect(app.state.settings.heading.chapter).not.toBe('第(');
  });

  it('drops an inference result when the book was reprocessed meanwhile', async () => {
    const { app, root } = await mountWithBook();
    let resolveSuggestions: (result: SuggestionResult) => void = () => {};
    vi.mocked(suggestWords).mockReturnValue(new Promise((resolve) => (resolveSuggestions = resolve)));
    app.saveSettings({ ...app.state.settings, llm: { apiKey: 'sk-test', model: 'm' } });
    app.inferWithLlm();
    const hitsBefore = app.state.hits;
    app.saveSettings(withHeading(app.state.settings, 40));
    await waitFor(() => app.state.hits !== hitsBefore);
    resolveSuggestions({ words: new Map([[0, '死']]), failedBatches: 0 });
    await waitFor(() => toastText(root) === '内容已重新处理，本次推断结果已丢弃');
    expect(app.state.fixes.size).toBe(0);
  });
});
