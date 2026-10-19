import { hitContext } from '../../core/censor';
import type { EditorController } from '../controller';
import { button, closestWithData, dataNumber, h } from '../dom';
import { filledCount } from '../state';
import { highlightedSnippet } from './hitText';

const PAGE_SIZE = 200;
const INFER_LABEL = 'DeepSeek 推断';

export class CensorView {
  private readonly summary = h('p', { className: 'panel-summary' });
  private readonly inferButton = button({ label: INFER_LABEL, variant: 'small', onClick: () => this.app.inferWithLlm() });
  private readonly list = h('ol', { className: 'censor-list' });
  private readonly moreButton = button({ label: '显示更多', className: 'censor-more', onClick: () => this.appendPage() });
  private readonly emptyNotice = h('p', { className: 'panel-empty', text: '没有发现被屏蔽的词。' });
  private isInferring = false;
  readonly element: HTMLElement;

  constructor(private readonly app: EditorController) {
    this.list.addEventListener('input', (event) => this.commitFix(event.target));
    this.list.addEventListener('click', (event) => this.reveal(event.target));
    this.element = h('div', { className: 'censor', children: [this.header(), this.emptyNotice, this.list, this.moreButton] });
  }

  render(): void {
    this.list.replaceChildren();
    this.appendPage();
    this.emptyNotice.hidden = this.app.state.hits.length > 0;
    this.renderSummary();
  }

  renderSummary(): void {
    const total = this.app.state.hits.length;
    this.summary.textContent = `共 ${total} 处 · 已填 ${filledCount(this.app.state)} 处`;
    this.inferButton.disabled = this.isInferring || total === 0;
  }

  refreshInputs(): void {
    const { fixes } = this.app.state;
    this.list.querySelectorAll<HTMLInputElement>('input[data-hit]').forEach((input) => {
      const word = fixes.get(dataNumber(input, 'hit')) ?? '';
      if (input.value.trim() !== word) input.value = word;
    });
    this.renderSummary();
  }

  setInferring(isInferring: boolean): void {
    this.isInferring = isInferring;
    this.inferButton.textContent = isInferring ? '推断中…' : INFER_LABEL;
    this.renderSummary();
  }

  private header(): HTMLElement {
    const title = h('h2', { className: 'panel-title', text: '和谐词' });
    return h('div', { className: 'panel-header', children: [h('div', { children: [title, this.summary] }), this.inferButton] });
  }

  private appendPage(): void {
    const { hits } = this.app.state;
    const from = this.list.childElementCount;
    const to = Math.min(hits.length, from + PAGE_SIZE);
    const fragment = document.createDocumentFragment();
    for (let hitIndex = from; hitIndex < to; hitIndex += 1) fragment.append(this.item(hitIndex));
    this.list.append(fragment);
    this.moreButton.hidden = to >= hits.length;
    this.moreButton.textContent = `显示更多（剩余 ${hits.length - to} 处）`;
  }

  private item(hitIndex: number): HTMLElement {
    const { hits, fixes, book } = this.app.state;
    const hit = hits[hitIndex];
    const snippet = button({
      label: '',
      variant: 'bare',
      className: 'censor-snippet',
      attrs: { 'data-reveal': hitIndex, title: '跳转到正文' },
    });
    snippet.append(...highlightedSnippet(hitContext(book?.lines ?? [], hit), hit.raw));
    const input = h('input', {
      className: 'input censor-input',
      attrs: { type: 'text', 'data-hit': hitIndex, placeholder: `替换 ${hit.raw}`, 'aria-label': `第 ${hitIndex + 1} 处替换词` },
    });
    input.value = fixes.get(hitIndex) ?? '';
    return h('li', { className: 'censor-item', children: [snippet, input] });
  }

  private commitFix(target: EventTarget | null): void {
    if (!(target instanceof HTMLInputElement) || !target.dataset.hit) return;
    this.app.setFix({ hitIndex: dataNumber(target, 'hit'), word: target.value });
  }

  private reveal(target: EventTarget | null): void {
    const snippet = closestWithData(target, 'reveal');
    if (snippet) this.app.revealHit(dataNumber(snippet, 'reveal'));
  }
}
