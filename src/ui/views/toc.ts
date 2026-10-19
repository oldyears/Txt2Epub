import { buildToc, type Section, type SectionKind, type TocNode } from '../../core/sections';
import type { EditorController } from '../controller';
import { button, closestWithData, dataNumber, h } from '../dom';

export class TocView {
  private readonly reviewButton = button({ label: '复查异常章节', variant: 'small', onClick: () => this.app.reviewChapters() });
  private readonly summary = h('p', { className: 'panel-summary' });
  private readonly list = h('ol', { className: 'toc-list' });
  readonly element = h('div', {
    className: 'toc',
    children: [h('h2', { className: 'panel-title', text: '目录' }), this.summary, this.reviewButton, this.list],
  });
  private rows: HTMLElement[] = [];
  private highlighted?: HTMLElement;

  constructor(private readonly app: EditorController) {
    this.list.addEventListener('click', (event) => this.handleClick(event.target));
  }

  render(): void {
    const { sections } = this.app.state;
    this.reviewButton.disabled = !sections.length;
    this.summary.textContent = sectionSummary(sections);
    this.rows = [];
    this.highlighted = undefined;
    const fragment = document.createDocumentFragment();
    fragment.append(...buildToc(sections).map((node) => this.item(node)));
    this.list.replaceChildren(fragment);
    this.highlight();
  }

  highlight(): void {
    const row = this.rows[this.app.state.selectedSection];
    this.highlighted?.removeAttribute('aria-current');
    row?.setAttribute('aria-current', 'true');
    row?.scrollIntoView({ block: 'nearest' });
    this.highlighted = row;
  }

  private handleClick(target: EventTarget | null): void {
    const demote = closestWithData(target, 'demote');
    if (demote) return this.app.setLineKind({ index: dataNumber(demote, 'demote'), kind: 'body' });
    const row = closestWithData(target, 'section');
    if (row) this.app.selectSection(dataNumber(row, 'section'));
  }

  private item(node: TocNode): HTMLElement {
    const section = this.app.state.sections[node.sectionIndex];
    const row = tocRow(section, node.sectionIndex);
    this.rows[node.sectionIndex] = row;
    const childItems = node.children.map((child) => this.item(child));
    const children = childItems.length ? h('ol', { className: 'toc-children', children: childItems }) : null;
    return h('li', { children: [row, children] });
  }
}

function tocRow(section: Section, sectionIndex: number): HTMLElement {
  const title = button({ label: section.title, variant: 'bare', className: 'toc-title' });
  return h('div', {
    className: `toc-row toc-${section.kind}`,
    attrs: { 'data-section': sectionIndex },
    children: [title, section.kind === 'preface' ? null : demoteButton(section)],
  });
}

function demoteButton(section: Section): HTMLButtonElement {
  return button({
    label: '✕',
    variant: 'bare',
    className: 'toc-demote',
    attrs: { title: '设为正文', 'aria-label': `将「${section.title}」设为正文`, 'data-demote': section.start },
  });
}

function sectionSummary(sections: Section[]): string {
  const counts: Record<SectionKind, number> = { preface: 0, volume: 0, chapter: 0 };
  for (const section of sections) counts[section.kind] += 1;
  const chapters = `${counts.chapter} 章`;
  return counts.volume ? `共 ${counts.volume} 卷 · ${chapters}` : `共 ${chapters}`;
}
