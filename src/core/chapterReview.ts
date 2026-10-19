import type { Book, LineKind } from './types';
import { buildSections } from './sections';

export type ReviewTarget = { title: string; start: number; end: number; characters: number; reason: string };
export type ReviewRow = { id: number; text: string; kind: LineKind; truncated?: boolean };
export type ReviewBatch = { title: string; lines: ReviewRow[] };
export type ReviewSuggestion = { lineId: number; text: string; kind: LineKind; reason: string };
export type MergedSuggestions = { suggestions: ReviewSuggestion[]; conflicts: number };

const KINDS = new Set(['volume', 'chapter', 'body']);
const MAX_BATCH_CHARS = 10000;
const MAX_BATCH_ROWS = 160;
const MAX_ROW_CHARS = 1000;

export function findReviewTargets(book: Book): ReviewTarget[] {
  const sections = buildSections(book.lines);
  const counts = sections.map(s => book.lines.slice(s.start, s.end).reduce((n, l) => n + l.text.length, 0));
  const ordinary = counts.filter(n => n >= 300).sort((a, b) => a - b);
  const median = ordinary[Math.floor(ordinary.length / 2)] ?? 0;
  return sections.flatMap((s, i) => {
    const characters = counts[i];
    const suspicious = characters >= 20000 || (median > 0 && characters >= Math.max(8000, median * 4));
    const sparse = (s.kind === 'preface' || sections.length <= 2) && characters >= 4000;
    const reason = s.kind === 'preface' ? '前言包含较多正文' : '篇幅偏长或分章较少';
    return suspicious || sparse ? [{ title: s.title, start: s.start, end: s.end, characters, reason }] : [];
  });
}

export function buildReviewBatches(book: Book, targets: ReviewTarget[]): ReviewBatch[] {
  return targets.flatMap(target => {
    const rows = book.lines.slice(target.start, target.end).map((line, index) => reviewRow(line, target.start + index));
    return chunkRows(rows).map(lines => ({ title: target.title, lines }));
  });
}

function reviewRow(line: Book['lines'][number], id: number): ReviewRow {
  if (line.text.length <= MAX_ROW_CHARS) return { ...line, id };
  const text = `${line.text.slice(0, 700)}…[本行过长，中间省略]…${line.text.slice(-200)}`;
  return { id, text, kind: line.kind, truncated: true };
}

function chunkRows(rows: ReviewRow[]): ReviewRow[][] {
  const chunks: ReviewRow[][] = [];
  let start = 0;
  while (start < rows.length) {
    let end = start;
    let size = 0;
    while (end < rows.length && end - start < MAX_BATCH_ROWS && size + rows[end].text.length <= MAX_BATCH_CHARS) {
      size += rows[end++].text.length;
    }
    chunks.push(rows.slice(start, end));
    start = end === rows.length ? end : Math.max(start + 1, end - 2);
  }
  return chunks;
}

export function validateReviewSuggestions(payload: unknown, batch: ReviewBatch): ReviewSuggestion[] | null {
  const entries = (payload as { suggestions?: unknown } | null)?.suggestions;
  if (!Array.isArray(entries)) return null;
  const rows = new Map(batch.lines.map(row => [row.id, row]));
  return entries.flatMap(entry => {
    const value = entry as Partial<ReviewSuggestion> | null;
    const row = typeof value?.lineId === 'number' ? rows.get(value.lineId) : undefined;
    return row && validSuggestion(value, row) ? [{ ...value, reason: String(value.reason ?? '建议调整目录层级').slice(0, 200) } as ReviewSuggestion] : [];
  });
}

function validSuggestion(value: Partial<ReviewSuggestion> | null, row: ReviewRow): value is ReviewSuggestion {
  if (!value || !Number.isSafeInteger(value.lineId) || !KINDS.has(value.kind ?? '')) return false;
  if (value.text !== row.text || value.kind === row.kind || row.truncated) return false;
  return value.kind === 'body' || (row.text.length > 0 && row.text.length <= 120);
}

export function mergeReviewSuggestions(items: ReviewSuggestion[]): MergedSuggestions {
  const grouped = new Map<number, ReviewSuggestion>();
  const conflicts = new Set<number>();
  for (const item of items) {
    if (grouped.has(item.lineId) && grouped.get(item.lineId)?.kind !== item.kind) conflicts.add(item.lineId);
    grouped.set(item.lineId, item);
  }
  const suggestions = [...grouped.values()].filter(item => !conflicts.has(item.lineId)).sort((a, b) => a.lineId - b.lineId);
  return { suggestions, conflicts: conflicts.size };
}
