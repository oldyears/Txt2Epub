import { describe, expect, it } from 'vitest';
import { buildSections, buildToc, sectionParagraphs } from '../../src/core/sections';
import type { Line } from '../../src/core/types';

const body = (text: string): Line => ({ text, kind: 'body' });
const chapter = (text: string): Line => ({ text, kind: 'chapter' });
const volume = (text: string): Line => ({ text, kind: 'volume' });

describe('buildSections', () => {
  it('returns no sections for empty input', () => {
    expect(buildSections([])).toEqual([]);
  });

  it('creates a preface for leading body lines', () => {
    const lines = [body('简介'), body('内容'), chapter('第一章'), body('正文')];
    expect(buildSections(lines)).toEqual([
      { kind: 'preface', title: '前言', start: 0, end: 2 },
      { kind: 'chapter', title: '第一章', start: 2, end: 4 },
    ]);
  });

  it('splits at every heading with half-open ranges', () => {
    const lines = [volume('第一卷'), chapter('第一章'), body('a'), chapter('第二章')];
    expect(buildSections(lines)).toEqual([
      { kind: 'volume', title: '第一卷', start: 0, end: 1 },
      { kind: 'chapter', title: '第一章', start: 1, end: 3 },
      { kind: 'chapter', title: '第二章', start: 3, end: 4 },
    ]);
  });
});

describe('sectionParagraphs', () => {
  it('excludes the heading line', () => {
    const lines = [chapter('第一章'), body('a'), body('b')];
    const [section] = buildSections(lines);
    expect(sectionParagraphs(lines, section)).toEqual(['a', 'b']);
  });

  it('keeps every line of a preface', () => {
    const lines = [body('a'), body('b'), chapter('第一章')];
    const [preface] = buildSections(lines);
    expect(sectionParagraphs(lines, preface)).toEqual(['a', 'b']);
  });
});

describe('buildToc', () => {
  it('nests chapters under the latest volume', () => {
    const lines = [volume('卷一'), chapter('一'), chapter('二'), volume('卷二'), chapter('三')];
    expect(buildToc(buildSections(lines))).toEqual([
      { sectionIndex: 0, title: '卷一', children: [
        { sectionIndex: 1, title: '一', children: [] },
        { sectionIndex: 2, title: '二', children: [] },
      ] },
      { sectionIndex: 3, title: '卷二', children: [{ sectionIndex: 4, title: '三', children: [] }] },
    ]);
  });

  it('keeps preface and chapters before any volume top-level', () => {
    const lines = [body('序'), chapter('楔子'), volume('卷一'), chapter('一')];
    const toc = buildToc(buildSections(lines));
    expect(toc.map((node) => node.title)).toEqual(['前言', '楔子', '卷一']);
    expect(toc[2].children.map((node) => node.title)).toEqual(['一']);
  });
});
