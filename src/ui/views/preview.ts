import type { Section } from '../../core/sections';
import type { Line } from '../../core/types';
import type { EditorController } from '../controller';
import { button, closestWithData, dataNumber, h, VERTICAL_ARROW_STEPS } from '../dom';
import { paintMark, textWithMarks, type HitMark } from './hitText';
import { LineMenu } from './lineMenu';

type LineView = { line: Line; index: number; marks: HitMark[] };
type LineKeyPress = { event: KeyboardEvent; openKey: string };
type LineStep = { line: HTMLElement; step: number };

const LINE_TAGS = { volume: 'h2', chapter: 'h3', body: 'p' } as const;
const MENU_KEYS = new Set(['Enter', ' ']);
const FLASH_CLASS = 'is-flashing';

export class PreviewView {
  private readonly body = h('article', { className: 'preview-body' });
  private readonly previousButton = button({ label: '上一节', onClick: () => this.step(-1) });
  private readonly nextButton = button({ label: '下一节', onClick: () => this.step(1) });
  private readonly position = h('span', { className: 'preview-position' });
  private readonly menu: LineMenu;
  private renderedSectionStart?: number;
  private tabStopLine?: HTMLElement;
  readonly element: HTMLElement;

  constructor(private readonly controller: EditorController) {
    this.menu = new LineMenu({ controller, onDismiss: (lineIndex) => this.focusLine(lineIndex) });
    this.body.addEventListener('click', (event) => this.openMenuAtPointer(event));
    this.body.addEventListener('focusin', (event) => this.moveTabStop(focusedLine(event)));
    // Space activates a focused button on keyup, so opening on Space keydown would trigger the first menu item.
    this.body.addEventListener('keydown', (event) => this.handleLineKeydown(event));
    this.body.addEventListener('keyup', (event) => this.handleLineKey({ event, openKey: ' ' }));
    const nav = h('nav', { className: 'preview-nav', children: [this.previousButton, this.position, this.nextButton] });
    this.element = h('div', { className: 'preview', children: [this.body, nav, this.menu.element] });
  }

  render(): void {
    const { sections, selectedSection } = this.controller.state;
    const section = sections[selectedSection];
    this.menu.close();
    this.body.replaceChildren(section ? this.sectionContent(section) : emptyNotice());
    this.tabStopLine = undefined;
    this.moveTabStop(this.body.querySelector<HTMLElement>('[data-line]'));
    this.position.textContent = sections.length ? `${selectedSection + 1} / ${sections.length}` : '';
    this.previousButton.disabled = selectedSection <= 0;
    this.nextButton.disabled = selectedSection >= sections.length - 1;
    this.scrollToTopOnSectionChange(section);
  }

  updateMark(hitIndex: number): void {
    const element = this.body.querySelector<HTMLElement>(`mark[data-hit="${hitIndex}"]`);
    const { hits, fixes } = this.controller.state;
    if (element && hits[hitIndex]) paintMark(element, { hitIndex, hit: hits[hitIndex], word: fixes.get(hitIndex) });
  }

  refreshMarks(): void {
    this.body.querySelectorAll<HTMLElement>('mark[data-hit]').forEach((mark) => this.updateMark(dataNumber(mark, 'hit')));
  }

  revealLine(lineIndex: number): void {
    const element = this.lineElement(lineIndex);
    if (!element) return;
    element.scrollIntoView({ block: 'center' });
    element.classList.remove(FLASH_CLASS);
    // Reading offsetWidth forces a reflow so the flash animation restarts on repeated reveals.
    void element.offsetWidth;
    element.classList.add(FLASH_CLASS);
  }

  private step(offset: number): void {
    this.controller.selectSection(this.controller.state.selectedSection + offset);
  }

  private focusLine(lineIndex: number): void {
    this.lineElement(lineIndex)?.focus();
  }

  private lineElement(lineIndex: number): HTMLElement | null {
    return this.body.querySelector<HTMLElement>(`[data-line="${lineIndex}"]`);
  }

  private scrollToTopOnSectionChange(section?: Section): void {
    if (section?.start !== this.renderedSectionStart) this.element.parentElement?.scrollTo({ top: 0 });
    this.renderedSectionStart = section?.start;
  }

  private sectionContent(section: Section): DocumentFragment {
    const lines = this.controller.state.book?.lines ?? [];
    const marksByLine = this.marksByLine(section);
    const fragment = document.createDocumentFragment();
    if (section.kind === 'preface') fragment.append(h('h2', { className: 'preface-title', text: section.title }));
    for (let index = section.start; index < section.end; index += 1) {
      fragment.append(lineElement({ line: lines[index], index, marks: marksByLine.get(index) ?? [] }));
    }
    return fragment;
  }

  private marksByLine(section: Section): Map<number, HitMark[]> {
    const { hits, fixes } = this.controller.state;
    const grouped = new Map<number, HitMark[]>();
    hits.forEach((hit, hitIndex) => {
      if (hit.lineIndex < section.start || hit.lineIndex >= section.end) return;
      const marks = grouped.get(hit.lineIndex) ?? [];
      marks.push({ hitIndex, hit, word: fixes.get(hitIndex) });
      grouped.set(hit.lineIndex, marks);
    });
    return grouped;
  }

  private openMenuAtPointer(event: MouseEvent): void {
    const line = closestWithData(event.target, 'line');
    if (line) this.menu.open({ lineIndex: dataNumber(line, 'line'), x: event.clientX, y: event.clientY });
  }

  private moveTabStop(line: HTMLElement | null): void {
    if (!line || line === this.tabStopLine) return;
    this.tabStopLine?.setAttribute('tabindex', '-1');
    line.setAttribute('tabindex', '0');
    this.tabStopLine = line;
  }

  private handleLineKeydown(event: KeyboardEvent): void {
    const line = focusedLine(event);
    const step = VERTICAL_ARROW_STEPS[event.key];
    if (!line || !step) return this.handleLineKey({ event, openKey: 'Enter' });
    event.preventDefault();
    this.focusNeighbourLine({ line, step });
  }

  private focusNeighbourLine({ line, step }: LineStep): void {
    const lines = Array.from(this.body.querySelectorAll<HTMLElement>('[data-line]'));
    lines[lines.indexOf(line) + step]?.focus();
  }

  private handleLineKey(press: LineKeyPress): void {
    const line = focusedLine(press.event);
    if (!line || !MENU_KEYS.has(press.event.key)) return;
    press.event.preventDefault();
    if (press.event.key !== press.openKey) return;
    const rect = line.getBoundingClientRect();
    this.menu.open({ lineIndex: dataNumber(line, 'line'), x: rect.left, y: rect.bottom });
  }
}

function lineElement(view: LineView): HTMLElement {
  return h(LINE_TAGS[view.line.kind], {
    className: `line line-${view.line.kind}`,
    attrs: { 'data-line': view.index, tabindex: -1, 'aria-haspopup': 'menu' },
    children: textWithMarks(view.line.text, view.marks),
  });
}

function focusedLine(event: Event): HTMLElement | null {
  const line = closestWithData(event.target, 'line');
  return line === event.target ? line : null;
}

function emptyNotice(): HTMLElement {
  return h('p', { className: 'preview-empty', text: '这本书没有可显示的内容。' });
}
