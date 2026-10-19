import { describe, expect, it } from 'vitest';
import { buildReviewBatches, findReviewTargets, mergeReviewSuggestions, validateReviewSuggestions, type ReviewBatch } from '../../src/core/chapterReview';
import type { Book, Line } from '../../src/core/types';

const body = (text: string): Line => ({ kind: 'body', text });
const chapter = (text: string): Line => ({ kind: 'chapter', text });
const book = (lines: Line[]): Book => ({ meta: { title: '中性测试', author: '' }, lines });

describe('chapter review planning', () => {
  it('detects a long preface and keeps its original line positions', () => {
    const source = book([body('未编号篇名'), body('正文'.repeat(2500)), chapter('第一章'), body('正文。')]);
    expect(findReviewTargets(source)[0]).toMatchObject({ title: '前言', start: 0, end: 2 });
  });
  it('detects unusually long chapters and sparse chapter structures', () => {
    const source = book([chapter('第一章'), body('字'.repeat(22000)), chapter('第二章'), body('字'.repeat(1000))]);
    expect(findReviewTargets(source)).toHaveLength(1);
    expect(findReviewTargets(book([body('字'.repeat(4500))]))).toHaveLength(1);
  });
  it('leaves ordinary and empty books without review targets', () => {
    expect(findReviewTargets(book([chapter('第一章'), body('字'.repeat(1000))]))).toEqual([]);
    expect(findReviewTargets(book([]))).toEqual([]);
  });
  it('covers all input lines in bounded, overlapping batches', () => {
    const source = book(Array.from({ length: 400 }, (_, i) => body(`行${i}${'字'.repeat(100)}`)));
    const batches = buildReviewBatches(source, findReviewTargets(source));
    expect(batches.length).toBeGreaterThan(1);
    expect(new Set(batches.flatMap(b => b.lines.map(l => l.id))).size).toBe(400);
    expect(batches.every(b => b.lines.length <= 160)).toBe(true);
    expect(batches[0].lines.at(-1)?.id).toBeGreaterThanOrEqual(batches[1].lines[0].id);
    expect(batches.every(b => b.lines.reduce((n, l) => n + l.text.length, 0) <= 10000)).toBe(true);
  });
  it('marks oversized single-line excerpts so they cannot be promoted', () => {
    const source = book([body('字'.repeat(25000))]);
    const row = buildReviewBatches(source, findReviewTargets(source))[0].lines[0];
    expect(row.truncated).toBe(true);
    expect(row.text.length).toBeLessThanOrEqual(1000);
  });
});

describe('chapter review result validation', () => {
  const batch: ReviewBatch = { title: '前言', lines: [{ id: 1, text: '山城夜雨', kind: 'body' }, { id: 2, text: '正文。', kind: 'body' }] };
  it('accepts anchored suggestions and empty successful reviews', () => {
    expect(validateReviewSuggestions({ suggestions: [{ lineId: 1, text: '山城夜雨', kind: 'volume', reason: '独立篇名' }] }, batch))
      .toEqual([{ lineId: 1, text: '山城夜雨', kind: 'volume', reason: '独立篇名' }]);
    expect(validateReviewSuggestions({ suggestions: [] }, batch)).toEqual([]);
  });
  it('rejects fabricated ids, rewritten text, invalid kinds and no-op changes', () => {
    const suggestions = [
      { lineId: 99, text: '山城夜雨', kind: 'volume' }, { lineId: 1, text: '新标题', kind: 'chapter' },
      { lineId: 1, text: '山城夜雨', kind: 'preface' }, { lineId: 1, text: '山城夜雨', kind: 'body' },
      { lineId: '1', text: '山城夜雨', kind: 'chapter' }, null,
    ];
    expect(validateReviewSuggestions({ suggestions }, batch)).toEqual([]);
    expect(validateReviewSuggestions({ answer: [] }, batch)).toBeNull();
  });
  it('rejects promoting truncated or overlong rows', () => {
    const text = '字'.repeat(200);
    const context: ReviewBatch = { title: '前言', lines: [{ id: 1, text, kind: 'body', truncated: true }] };
    expect(validateReviewSuggestions({ suggestions: [{ lineId: 1, text, kind: 'chapter' }] }, context)).toEqual([]);
  });
  it('deduplicates agreeing suggestions and discards conflicting kinds', () => {
    const a = { lineId: 1, text: '山城夜雨', kind: 'volume' as const, reason: '篇名' };
    const b = { lineId: 2, text: '开始', kind: 'chapter' as const, reason: '章节' };
    expect(mergeReviewSuggestions([a, a, b])).toEqual({ suggestions: [a, b], conflicts: 0 });
    expect(mergeReviewSuggestions([a, { ...a, kind: 'chapter' }])).toEqual({ suggestions: [], conflicts: 1 });
  });
});
