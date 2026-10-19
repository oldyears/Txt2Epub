import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/core/defaults';
import { initialState, loadSource, setFix, setLineKind, setMeta, applyChapterReview, exportableBook } from '../../src/ui/state';

const SOURCE = { meta: { title: '中性合集', author: '甲' }, rawLines: [
  '这是一段较长的合集说明文字用来模拟首行目录', '山城夜雨', `第一篇正文***${'字'.repeat(60)}。`, '江湖旧事', '第二篇正文。',
] };
const loaded = () => loadSource(initialState(DEFAULT_SETTINGS), SOURCE);
const suggestions = [
  { lineId: 1, text: '山城夜雨', kind: 'volume' as const, reason: '独立篇名' },
  { lineId: 3, text: '江湖旧事', kind: 'volume' as const, reason: '独立篇名' },
];

describe('chapter review state', () => {
  it('keeps unmerged input lines available while the original directory stays unchanged', () => {
    const state = loaded();
    expect(state.reviewBase?.lines[1].text).toBe('山城夜雨');
    expect(state.reviewBase?.lines[1].kind).toBe('body');
    expect(state.sections[0].kind).toBe('preface');
    expect(state.book?.lines[0].text).toContain('山城夜雨');
  });
  it('applies only confirmed line kinds and preserves text, metadata and filled replacements', () => {
    const state = setMeta(setFix(loaded(), { hitIndex: 0, word: '封路' }), { title: '自定义书名', author: '乙' });
    const next = applyChapterReview(state, { base: state.reviewBase!, suggestions });
    expect(next.sections.map(s => s.kind)).toEqual(['preface', 'volume', 'volume']);
    expect(next.book?.lines.map(l => l.text).join('')).toBe(state.book?.lines.map(l => l.text).join(''));
    expect(next.book?.meta).toEqual({ title: '自定义书名', author: '乙' });
    expect(next.fixes.get(0)).toBe('封路');
    expect(exportableBook(next)?.lines.some(l => l.text.includes('封路'))).toBe(true);
  });
  it('rejects stale results after another file or manual directory edit', () => {
    const state = loaded();
    const other = loadSource(state, { ...SOURCE, meta: { title: '另一文件', author: '' } });
    expect(applyChapterReview(other, { base: state.reviewBase!, suggestions })).toBe(other);
    const edited = setLineKind(state, { index: 1, kind: 'chapter' });
    expect(applyChapterReview(edited, { base: state.reviewBase!, suggestions })).toBe(edited);
  });
  it('rejects invented line text and preserves manual heading edits when adding other suggestions', () => {
    const state = setLineKind(loaded(), { index: 0, kind: 'chapter' });
    const lineId = state.reviewBase!.lines.findIndex(l => l.text === '江湖旧事');
    const next = applyChapterReview(state, { base: state.reviewBase!, suggestions: [{ ...suggestions[1], lineId }] });
    expect(next.book?.lines.some(l => l.kind === 'chapter')).toBe(true);
    expect(next.book?.lines.some(l => l.kind === 'volume' && l.text === '江湖旧事')).toBe(true);
    expect(applyChapterReview(state, { base: state.reviewBase!, suggestions: [{ ...suggestions[0], text: '伪造标题' }] })).toBe(state);
  });
  it('rejects a split that would change an existing dictionary restoration across a line boundary', () => {
    const settings = { ...DEFAULT_SETTINGS, dictionary: [{ from: '山城夜雨', to: '替换词' }] };
    const source = { meta: SOURCE.meta, rawLines: ['前文'.repeat(7) + '山城', '夜雨', '正文。'] };
    const state = loadSource(initialState(settings), source);
    const next = applyChapterReview(state, { base: state.reviewBase!, suggestions: [{ lineId: 1, text: '夜雨', kind: 'volume', reason: '候选标题' }] });
    expect(next).toBe(state);
    expect(next.book?.lines.map(l => l.text).join('')).toContain('替换词');
  });
});
