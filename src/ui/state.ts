import { applyFixes, hitContext } from '../core/censor';
import { processSource } from '../core/pipeline';
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
};

export type ProcessingRules = Omit<Settings, 'llm'>;

export type LineKindChange = { index: number; kind: LineKind };
export type FixChange = { hitIndex: number; word: string };
export type MetaChange = { title: string; author: string };

export function initialState(settings: Settings): AppState {
  return { sections: [], hits: [], fixes: new Map(), selectedSection: 0, kindEdited: false, settings };
}

export function loadSource(state: AppState, source: SourceDoc): AppState {
  const { book, hits } = processSource(source, state.settings);
  const sections = buildSections(book.lines);
  const processedRules = processingRules(state.settings);
  return { ...state, source, book, hits, sections, processedRules, fixes: new Map(), selectedSection: 0, kindEdited: false };
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
  return { ...state, book, sections, selectedSection: sectionOfLine(sections, change.index), kindEdited: true };
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
  return { ...state, source: { ...state.source, meta }, book: { ...state.book, meta } };
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
