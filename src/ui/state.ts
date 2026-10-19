import { applyFixes, hitContext } from '../core/censor';
import { processPrepared, processSource } from '../core/pipeline';
import { validateReviewSuggestions, type ReviewSuggestion } from '../core/chapterReview';
import { buildSections, type Section } from '../core/sections';
import type { Book, CensorHit, LineKind, Settings, SourceDoc } from '../core/types';
import type { CensorQuery } from '../llm/deepseek';

export type AppState = {
  source?: SourceDoc;
  book?: Book;
  sections: Section[];
  hits: CensorHit[];
  fixes: Map<number, string>;
  selectedSection: number;
  kindEdited: boolean;
  settings: Settings;
  processedRules?: ProcessingRules;
  reviewBase?: Book;
  lineStarts: number[];
};

export type ProcessingRules = Omit<Settings, 'llm'>;

export type LineKindChange = { index: number; kind: LineKind };
export type FixChange = { hitIndex: number; word: string };
export type MetaChange = { title: string; author: string };
export type ChapterReviewChange = { base: Book; suggestions: ReviewSuggestion[] };

export function initialState(settings: Settings): AppState {
  return { sections: [], hits: [], fixes: new Map(), lineStarts: [], selectedSection: 0, kindEdited: false, settings };
}

export function loadSource(state: AppState, source: SourceDoc): AppState {
  const { book, hits, reviewBase, lineStarts } = processSource(source, state.settings);
  const sections = buildSections(book.lines);
  const processedRules = processingRules(state.settings);
  return { ...state, source, book, hits, reviewBase, lineStarts, sections, processedRules, fixes: new Map(), selectedSection: 0, kindEdited: false };
}

export function storeSettings(state: AppState, settings: Settings): AppState {
  return { ...state, settings };
}

export function settingsNeedReprocess(state: AppState, next: Settings): boolean {
  if (!state.processedRules) return false;
  return JSON.stringify(state.processedRules) !== JSON.stringify(processingRules(next));
}

function processingRules(settings: Settings): ProcessingRules {
  return { heading: settings.heading, adPatterns: settings.adPatterns, dictionary: settings.dictionary };
}

export function applySettings(state: AppState, settings: Settings): AppState {
  if (!state.source) return storeSettings(state, settings);
  const reloaded = loadSource(storeSettings(state, settings), state.source);
  const fixes = carryOverFixes(state, reloaded);
  return selectSection({ ...reloaded, fixes }, state.selectedSection);
}

function carryOverFixes(previous: AppState, next: AppState): Map<number, string> {
  const pendingWords = wordsByHitKey(previous);
  const carried = new Map<number, string>();
  next.hits.forEach((hit, hitIndex) => {
    const word = pendingWords.get(hitKey(next, hit))?.shift();
    if (word !== undefined) carried.set(hitIndex, word);
  });
  return carried;
}

function wordsByHitKey(state: AppState): Map<string, (string | undefined)[]> {
  const grouped = new Map<string, (string | undefined)[]>();
  state.hits.forEach((hit, hitIndex) => {
    const key = hitKey(state, hit);
    const words = grouped.get(key) ?? [];
    words.push(state.fixes.get(hitIndex));
    grouped.set(key, words);
  });
  return grouped;
}

function hitKey(state: AppState, hit: CensorHit): string {
  const lineText = state.book?.lines[hit.lineIndex]?.text ?? '';
  return JSON.stringify([lineText, hit.start, hit.raw]);
}

export function selectSection(state: AppState, index: number): AppState {
  const lastIndex = Math.max(0, state.sections.length - 1);
  return { ...state, selectedSection: Math.min(Math.max(0, index), lastIndex) };
}

export function setLineKind(state: AppState, change: LineKindChange): AppState {
  const line = state.book?.lines[change.index];
  if (!state.book || !line) return state;
  const lines = state.book.lines.map((current, index) => (index === change.index ? { ...line, kind: change.kind } : current));
  const sections = buildSections(lines);
  const book = { ...state.book, lines };
  return { ...state, ...editReviewBase(state, change), book, sections, selectedSection: sectionOfLine(sections, change.index), kindEdited: true };
}

export function setFix(state: AppState, change: FixChange): AppState {
  const fixes = new Map(state.fixes);
  const word = change.word.trim();
  if (word) fixes.set(change.hitIndex, word);
  else fixes.delete(change.hitIndex);
  return { ...state, fixes };
}

export function mergeSuggestions(state: AppState, words: Map<number, string>): AppState {
  const fixes = new Map(state.fixes);
  words.forEach((word, hitIndex) => {
    const isFillable = state.hits[hitIndex] !== undefined && !fixes.has(hitIndex) && word.trim();
    if (isFillable) fixes.set(hitIndex, word.trim());
  });
  return { ...state, fixes };
}

export function setMeta(state: AppState, change: MetaChange): AppState {
  if (!state.book || !state.source) return state;
  const meta = { ...state.book.meta, ...change };
  const reviewBase = state.reviewBase ? { ...state.reviewBase, meta } : undefined;
  return { ...state, reviewBase, source: { ...state.source, meta }, book: { ...state.book, meta } };
}

function editReviewBase(state: AppState, change: LineKindChange): Pick<AppState, 'reviewBase' | 'lineStarts'> {
  const { reviewBase, lineStarts } = state;
  const start = lineStarts[change.index];
  if (!reviewBase || start === undefined) return { reviewBase, lineStarts };
  const end = lineStarts[change.index + 1] ?? reviewBase.lines.length;
  const text = reviewBase.lines.slice(start, end).map(line => line.text).join('');
  const lines = [...reviewBase.lines.slice(0, start), { text, kind: change.kind }, ...reviewBase.lines.slice(end)];
  const shift = end - start - 1;
  return { reviewBase: { ...reviewBase, lines }, lineStarts: lineStarts.map(index => index > start ? index - shift : index) };
}

export function applyChapterReview(state: AppState, change: ChapterReviewChange): AppState {
  if (!state.book || state.reviewBase !== change.base) return state;
  const batch = { title: '', lines: change.base.lines.map((line, id) => ({ ...line, id })) };
  const valid = validateReviewSuggestions({ suggestions: change.suggestions }, batch) ?? [];
  if (!valid.length) return state;
  const kinds = new Map(valid.map(item => [item.lineId, item.kind]));
  const lines = change.base.lines.map((line, index) => ({ ...line, kind: kinds.get(index) ?? line.kind }));
  const result = processPrepared({ ...change.base, lines }, state.processedRules?.dictionary ?? state.settings.dictionary);
  if (textStream(state.book) !== textStream(result.book)) return state;
  const sections = buildSections(result.book.lines);
  const next = { ...state, ...result, sections, kindEdited: true };
  next.fixes = reviewFixes(state, next);
  const focusLine = previewIndex(result.lineStarts, valid[0].lineId);
  return selectSection(next, sectionOfLine(sections, focusLine));
}

function previewIndex(starts: number[], sourceIndex: number): number {
  let found = 0;
  for (let index = 0; index < starts.length && starts[index] <= sourceIndex; index += 1) found = index;
  return found;
}

function reviewFixes(previous: AppState, next: AppState): Map<number, string> {
  const prior = wordsByOffset(previous);
  const offsets = lineOffsets(next);
  const fixes = new Map<number, string>();
  next.hits.forEach((hit, index) => {
    const word = prior.get(`${offsets[hit.lineIndex] + hit.start}:${hit.raw}`);
    if (word !== undefined) fixes.set(index, word);
  });
  return fixes;
}

function textStream(book: Book): string {
  return book.lines.map(line => line.text).join('');
}

function lineOffsets(state: AppState): number[] {
  let offset = 0;
  return (state.book?.lines ?? []).map(line => {
    const start = offset;
    offset += line.text.length;
    return start;
  });
}

function wordsByOffset(state: AppState): Map<string, string> {
  const offsets = lineOffsets(state);
  const words = new Map<string, string>();
  state.hits.forEach((hit, index) => {
    const word = state.fixes.get(index);
    if (word !== undefined) words.set(`${offsets[hit.lineIndex] + hit.start}:${hit.raw}`, word);
  });
  return words;
}

export function exportableBook(state: AppState): Book | null {
  if (!state.book?.lines.length) return null;
  const fixes = Array.from(state.fixes, ([hitIndex, replacement]) => ({ hit: state.hits[hitIndex], replacement }));
  return { ...state.book, lines: applyFixes(state.book.lines, fixes) };
}

export function pendingQueries(state: AppState): CensorQuery[] {
  const lines = state.book?.lines ?? [];
  return state.hits.flatMap((hit, id) => (state.fixes.has(id) ? [] : [{ id, context: hitContext(lines, hit) }]));
}

export function filledCount(state: AppState): number {
  return state.fixes.size;
}

export function sectionOfLine(sections: Section[], lineIndex: number): number {
  let low = 0;
  let high = sections.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (sections[middle].start <= lineIndex) low = middle;
    else high = middle - 1;
  }
  return Math.max(0, low);
}
