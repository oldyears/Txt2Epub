import type { Book } from '../../core/types';
import type { ReviewSuggestion, ReviewTarget } from '../../core/chapterReview';
import { h } from '../dom';

const KIND_LABELS = { volume: '卷 / 篇', chapter: '章', body: '正文' };

export function reviewTargetRow(target: ReviewTarget, index: number): HTMLElement {
  const input = h('input', { attrs: { type: 'checkbox', checked: true, 'data-review-target': index } });
  const title = h('strong', { text: `${target.title} · ${target.characters.toLocaleString()} 字` });
  const note = h('span', { className: 'field-note', text: target.reason });
  return h('label', { className: 'review-choice', children: [input, h('span', { children: [title, note] })] });
}

export function reviewSuggestionRow(item: ReviewSuggestion, book: Book): HTMLElement {
  const input = h('input', { attrs: { type: 'checkbox', checked: true, 'data-review-line': item.lineId, 'aria-label': `采用建议：${item.text}` } });
  const type = h('span', { className: 'review-kind', text: `${KIND_LABELS[book.lines[item.lineId].kind]} → ${KIND_LABELS[item.kind]}` });
  const title = h('strong', { text: item.text });
  const reason = h('p', { className: 'field-note', text: item.reason });
  const excerpt = h('blockquote', { className: 'review-context', text: suggestionContext(book, item.lineId) });
  return h('label', { className: 'review-choice review-suggestion', children: [input, h('span', { children: [type, title, reason, excerpt] })] });
}

function suggestionContext(book: Book, index: number): string {
  const before = book.lines[index - 1]?.text.slice(-100);
  const current = `【${book.lines[index].text}】`;
  const after = book.lines[index + 1]?.text.slice(0, 160);
  return [before, current, after].filter(Boolean).join('\n');
}
