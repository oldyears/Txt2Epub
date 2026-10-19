import type { CensorHit } from '../../core/types';
import { h } from '../dom';

export type HitMark = { hitIndex: number; hit: CensorHit; word?: string };

export function textWithMarks(text: string, marks: HitMark[]): (Node | string)[] {
  const segments: (Node | string)[] = [];
  let cursor = 0;
  for (const mark of marks) {
    segments.push(text.slice(cursor, mark.hit.start), markElement(mark));
    cursor = mark.hit.end;
  }
  segments.push(text.slice(cursor));
  return segments.filter((segment) => segment !== '');
}

function markElement(mark: HitMark): HTMLElement {
  const element = h('mark', { attrs: { title: `原文：${mark.hit.raw}`, 'data-hit': mark.hitIndex } });
  paintMark(element, mark);
  return element;
}

export function paintMark(element: HTMLElement, mark: HitMark): void {
  element.textContent = mark.word ?? mark.hit.raw;
  element.className = mark.word ? 'hit is-fixed' : 'hit';
}

export function highlightedSnippet(context: string, raw: string): (Node | string)[] {
  const marked = `【${raw}】`;
  const index = context.indexOf(marked);
  if (index < 0) return [context];
  const highlight = h('mark', { className: 'hit', text: marked });
  return [context.slice(0, index), highlight, context.slice(index + marked.length)];
}
