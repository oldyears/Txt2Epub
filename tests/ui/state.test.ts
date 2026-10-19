import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/core/defaults';
import type { Settings, SourceDoc } from '../../src/core/types';
import {
  applySettings,
  exportableBook,
  filledCount,
  initialState,
  loadSource,
  mergeSuggestions,
  pendingQueries,
  sectionOfLine,
  selectSection,
  setFix,
  setLineKind,
  setMeta,
  settingsNeedReprocess,
  storeSettings,
} from '../../src/ui/state';

const SOURCE: SourceDoc = {
  meta: { title: '小镇', author: '某人' },
  rawLines: ['第一卷 风起', '第一章 开始', '他说***了。', '那□□很远。', '第二章 相遇', '她来了。'],
};

const loaded = () => loadSource(initialState(DEFAULT_SETTINGS), SOURCE);

describe('initialState', () => {
  it('starts without a book', () => {
    const state = initialState(DEFAULT_SETTINGS);
    expect(state.book).toBeUndefined();
    expect(state.hits).toEqual([]);
    expect(state.sections).toEqual([]);
    expect(exportableBook(state)).toBeNull();
  });
});

describe('loadSource', () => {
  it('processes the source into book, sections and hits', () => {
    const state = loaded();
    expect(state.book?.lines.map((line) => line.kind)).toEqual(['volume', 'chapter', 'body', 'body', 'chapter', 'body']);
    expect(state.sections.map((section) => section.title)).toEqual(['第一卷 风起', '第一章 开始', '第二章 相遇']);
    expect(state.hits.map((hit) => hit.raw)).toEqual(['***', '□□']);
  });

  it('resets fixes, selection and manual edits', () => {
    const edited = setLineKind(setFix(selectSection(loaded(), 2), { hitIndex: 0, word: '死' }), { index: 5, kind: 'chapter' });
    const state = loadSource(edited, SOURCE);
    expect(state.fixes.size).toBe(0);
    expect(state.selectedSection).toBe(0);
    expect(state.kindEdited).toBe(false);
  });
});

describe('selectSection', () => {
  it('clamps to the available sections', () => {
    expect(selectSection(loaded(), 99).selectedSection).toBe(2);
    expect(selectSection(loaded(), -3).selectedSection).toBe(0);
  });
});

describe('setLineKind', () => {
  it('changes the line kind, rebuilds sections and marks the state as edited', () => {
    const state = setLineKind(loaded(), { index: 5, kind: 'chapter' });
    expect(state.book?.lines[5]).toEqual({ text: '她来了。', kind: 'chapter' });
    expect(state.sections).toHaveLength(4);
    expect(state.kindEdited).toBe(true);
  });

  it('selects the section that now contains the line', () => {
    expect(setLineKind(loaded(), { index: 3, kind: 'chapter' }).selectedSection).toBe(2);
    expect(setLineKind(selectSection(loaded(), 2), { index: 4, kind: 'body' }).selectedSection).toBe(1);
  });

  it('does not mutate the previous state', () => {
    const before = loaded();
    setLineKind(before, { index: 5, kind: 'chapter' });
    expect(before.book?.lines[5].kind).toBe('body');
  });

  it('ignores out of range indexes', () => {
    const before = loaded();
    expect(setLineKind(before, { index: 42, kind: 'chapter' })).toBe(before);
  });
});

describe('setFix', () => {
  it('stores a trimmed word and deletes on empty input', () => {
    const filled = setFix(loaded(), { hitIndex: 0, word: ' 死 ' });
    expect(filled.fixes.get(0)).toBe('死');
    expect(setFix(filled, { hitIndex: 0, word: '  ' }).fixes.has(0)).toBe(false);
  });

  it('does not mutate the previous fixes', () => {
    const before = loaded();
    setFix(before, { hitIndex: 0, word: '死' });
    expect(before.fixes.size).toBe(0);
  });
});

describe('mergeSuggestions', () => {
  it('fills only hits without a user fix and skips empty words', () => {
    const typed = setFix(loaded(), { hitIndex: 0, word: '死' });
    const merged = mergeSuggestions(typed, new Map([[0, '跑'], [1, '地方']]));
    expect(merged.fixes.get(0)).toBe('死');
    expect(merged.fixes.get(1)).toBe('地方');
    expect(mergeSuggestions(loaded(), new Map([[1, ' ']])).fixes.size).toBe(0);
  });

  it('ignores suggestions for unknown hits', () => {
    expect(mergeSuggestions(loaded(), new Map([[7, '词']])).fixes.size).toBe(0);
  });
});

describe('pendingQueries / filledCount', () => {
  it('queries only hits without a fix, with marked context', () => {
    const state = setFix(loaded(), { hitIndex: 0, word: '死' });
    const queries = pendingQueries(state);
    expect(queries.map((query) => query.id)).toEqual([1]);
    expect(queries[0].context).toContain('【□□】');
    expect(filledCount(state)).toBe(1);
  });
});

describe('applySettings', () => {
  const noHeadings: Settings = { ...DEFAULT_SETTINGS, heading: { ...DEFAULT_SETTINGS.heading, chapter: '^$', volume: '^$' } };

  it('reprocesses the source and clears manual edits', () => {
    const edited = setLineKind(loaded(), { index: 5, kind: 'chapter' });
    const state = applySettings(edited, noHeadings);
    expect(state.settings).toBe(noHeadings);
    expect(state.kindEdited).toBe(false);
    expect(state.sections.map((section) => section.kind)).toEqual(['preface']);
  });

  it('keeps fixes whose hits survive reprocessing', () => {
    const state = applySettings(setFix(loaded(), { hitIndex: 1, word: '地方' }), DEFAULT_SETTINGS);
    expect(state.fixes.get(1)).toBe('地方');
  });

  it('carries fixes across line index shifts by matching line text', () => {
    const withAd: SourceDoc = { ...SOURCE, rawLines: ['第一卷 风起', '第一章 开始', '广告看小说。', '他说***了。', '那□□很远。'] };
    const adFilter: Settings = { ...DEFAULT_SETTINGS, adPatterns: [...DEFAULT_SETTINGS.adPatterns, '^广告.*'] };
    const before = setFix(setFix(loadSource(initialState(DEFAULT_SETTINGS), withAd), { hitIndex: 0, word: '死' }), { hitIndex: 1, word: '地方' });
    const state = applySettings(before, adFilter);
    expect(state.hits[0].lineIndex).toBe(before.hits[0].lineIndex - 1);
    expect(Array.from(state.fixes)).toEqual([[0, '死'], [1, '地方']]);
  });

  it('carries fixes on identical lines one to one', () => {
    const repeated: SourceDoc = { ...SOURCE, rawLines: ['第一章 开始', '他说***了。', '他说***了。'] };
    const before = setFix(loadSource(initialState(DEFAULT_SETTINGS), repeated), { hitIndex: 1, word: '死' });
    expect(Array.from(applySettings(before, DEFAULT_SETTINGS).fixes)).toEqual([[1, '死']]);
  });

  it('drops fixes whose hit no longer exists', () => {
    const noCensor: Settings = { ...DEFAULT_SETTINGS, dictionary: [{ from: '***', to: '死' }] };
    const state = applySettings(setFix(loaded(), { hitIndex: 0, word: '跑' }), noCensor);
    expect(state.fixes.size).toBe(0);
  });

  it('keeps the selection within range', () => {
    expect(applySettings(selectSection(loaded(), 2), noHeadings).selectedSection).toBe(0);
  });

  it('only stores settings when no source is loaded', () => {
    const state = applySettings(initialState(DEFAULT_SETTINGS), noHeadings);
    expect(state.settings).toBe(noHeadings);
    expect(state.book).toBeUndefined();
  });
});

describe('settingsNeedReprocess', () => {
  const longerHeadings: Settings = { ...DEFAULT_SETTINGS, heading: { ...DEFAULT_SETTINGS.heading, maxLength: 99 } };

  it('ignores llm-only changes', () => {
    const llmChanged: Settings = { ...DEFAULT_SETTINGS, llm: { apiKey: 'sk-1', model: 'other' } };
    expect(settingsNeedReprocess(loaded(), llmChanged)).toBe(false);
  });

  it('detects heading, ad pattern and dictionary changes', () => {
    expect(settingsNeedReprocess(loaded(), longerHeadings)).toBe(true);
    expect(settingsNeedReprocess(loaded(), { ...DEFAULT_SETTINGS, adPatterns: ['x'] })).toBe(true);
    expect(settingsNeedReprocess(loaded(), { ...DEFAULT_SETTINGS, dictionary: [] })).toBe(true);
  });

  it('is false without a processed book', () => {
    expect(settingsNeedReprocess(initialState(DEFAULT_SETTINGS), longerHeadings)).toBe(false);
  });

  it('compares against the rules the book was processed with, not the stored settings', () => {
    const declined = storeSettings(loaded(), longerHeadings);
    expect(settingsNeedReprocess(declined, longerHeadings)).toBe(true);
    expect(settingsNeedReprocess(applySettings(declined, longerHeadings), longerHeadings)).toBe(false);
  });
});

describe('storeSettings', () => {
  it('replaces settings without reprocessing', () => {
    const edited = setLineKind(loaded(), { index: 5, kind: 'chapter' });
    const state = storeSettings(edited, DEFAULT_SETTINGS);
    expect(state.settings).toBe(DEFAULT_SETTINGS);
    expect(state.book).toBe(edited.book);
  });
});

describe('setMeta', () => {
  it('updates the book meta and survives reprocessing', () => {
    const state = setMeta(loaded(), { title: '新书', author: '新人' });
    expect(state.book?.meta).toMatchObject({ title: '新书', author: '新人' });
    expect(applySettings(state, DEFAULT_SETTINGS).book?.meta.title).toBe('新书');
  });

  it('is ignored without a book', () => {
    const empty = initialState(DEFAULT_SETTINGS);
    expect(setMeta(empty, { title: 'x', author: 'y' })).toBe(empty);
  });
});

describe('exportableBook', () => {
  it('applies fixes to the exported lines', () => {
    const state = setFix(loaded(), { hitIndex: 0, word: '死' });
    expect(exportableBook(state)?.lines[2].text).toBe('他说死了。');
  });

  it('returns null for a book without lines', () => {
    const empty = loadSource(initialState(DEFAULT_SETTINGS), { meta: { title: '', author: '' }, rawLines: [] });
    expect(exportableBook(empty)).toBeNull();
  });
});

describe('sectionOfLine', () => {
  it('finds the section containing a line', () => {
    const { sections } = loaded();
    expect(sectionOfLine(sections, 0)).toBe(0);
    expect(sectionOfLine(sections, 3)).toBe(1);
    expect(sectionOfLine(sections, 5)).toBe(2);
  });

  it('falls back to the first section', () => {
    expect(sectionOfLine([], 3)).toBe(0);
  });
});
