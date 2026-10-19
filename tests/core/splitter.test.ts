import { describe, expect, it } from 'vitest';
import { DEFAULT_HEADING_RULES } from '../../src/core/headingRules';
import { classifyLines, mergeBrokenParagraphs, removeEmptyHeadings, removeTocDuplicates } from '../../src/core/splitter';
import type { Line } from '../../src/core/types';

const classifyOne = (text: string): Line => classifyLines([text], DEFAULT_HEADING_RULES)[0];
const volume = (text: string): Line => ({ text, kind: 'volume' });
const chapter = (text: string): Line => ({ text, kind: 'chapter' });
const body = (text: string): Line => ({ text, kind: 'body' });

describe('classifyLines', () => {
  it.each([
    ['第1章重生', chapter('第1章 重生')],
    ['第一卷 风起', volume('第一卷 风起')],
    ['第一卷　 风起', volume('第一卷 风起')],
    ['第十二回 大闹天宫', chapter('第十二回 大闹天宫')],
    ['第一章', chapter('第一章')],
    ['序章', chapter('序章')],
    ['Chapter 3 Begin', chapter('Chapter 3 Begin')],
    ['卷三 归来', volume('卷三 归来')],
    ['卷三归来', volume('卷三 归来')],
    ['第五章 怎么可能？', chapter('第五章 怎么可能？')],
    ['第一章：开始', chapter('第一章 开始')],
    ['番外一 重逢', chapter('番外一 重逢')],
    ['番外一重逢', chapter('番外一 重逢')],
    ['第3节 课堂', chapter('第3节 课堂')],
    ['Chapter 3Begin', chapter('Chapter 3 Begin')],
  ])('classifies %s as a heading', (text, expected) => {
    expect(classifyOne(text)).toEqual(expected);
  });

  it.each(['第一回合他就输了！', '第二节课上他说：“走吧！”', '第三节车厢里……', '前言不搭后语？'])(
    'treats prose starting like a marker as body: %s',
    (text) => {
      expect(classifyOne(text)).toEqual(body(text));
    },
  );

  it('treats a line ending with punctuation as body', () => {
    expect(classifyOne('第三章写完了。')).toEqual(body('第三章写完了。'));
  });

  it('treats an overlong line as body', () => {
    const longLine = `第一章${'很'.repeat(37)}`;
    expect(classifyOne(longLine)).toEqual(body(longLine));
  });

  it('leaves body text unchanged', () => {
    expect(classifyOne('他笑了 一下')).toEqual(body('他笑了 一下'));
  });

  it('never matches a kind whose user rule is invalid', () => {
    const rules = { ...DEFAULT_HEADING_RULES, volume: '(' };
    expect(classifyLines(['第一卷 风起', '第一章 a'], rules)).toEqual([body('第一卷 风起'), chapter('第一章 a')]);
  });

  it('accepts 之 after special words and 、 or 【 after numbered markers', () => {
    const texts = ['番外之前世今生', '第一章、开始', '第三节【上】', '第一节之后他就走了'];
    expect(classifyLines(texts, DEFAULT_HEADING_RULES)).toEqual([
      chapter('番外之 前世今生'),
      chapter('第一章 开始'),
      chapter('第三节 【上】'),
      body('第一节之后他就走了'),
    ]);
  });

  it('ignores an unanchored user rule matching mid-line', () => {
    const rules = { ...DEFAULT_HEADING_RULES, chapter: '第\\d+章' };
    expect(classifyLines(['他说第1章', '第2章 归来'], rules)).toEqual([body('他说第1章'), chapter('第2章 归来')]);
  });
});

describe('removeEmptyHeadings', () => {
  it('drops the table-of-contents block', () => {
    const lines = [
      volume('第一卷 A'), chapter('第一章 a'), chapter('第二章 b'),
      volume('第一卷 A'), chapter('第一章 a'), body('x'), chapter('第二章 b'), body('y'),
    ];
    expect(removeEmptyHeadings(lines)).toEqual(lines.slice(3));
  });

  it('keeps a trailing heading', () => {
    const lines = [body('x'), chapter('尾声')];
    expect(removeEmptyHeadings(lines)).toEqual(lines);
  });

  it('drops a chapter directly followed by a volume', () => {
    expect(removeEmptyHeadings([chapter('第一章 a'), volume('第二卷 B'), body('x')])).toEqual([volume('第二卷 B'), body('x')]);
  });

  it('drops the first of consecutive volumes', () => {
    expect(removeEmptyHeadings([volume('第一卷 A'), volume('第二卷 B'), body('x')])).toEqual([volume('第二卷 B'), body('x')]);
  });

  it('returns an empty array for empty input', () => {
    expect(removeEmptyHeadings([])).toEqual([]);
  });
});

describe('removeTocDuplicates', () => {
  const longBody = body('长'.repeat(100));

  it('drops earlier headings repeated later whose short body flows into the preface', () => {
    const lines = [
      volume('第一卷 风起'), chapter('第二章 初遇'), body('这是作者写的序言，感谢大家支持。'),
      volume('第一卷 风起'), chapter('第一章 重生'), body('他睁开眼睛……'), chapter('第二章 初遇'), body('y'),
    ];
    expect(removeTocDuplicates(lines)).toEqual(lines.slice(2));
  });

  it('keeps a bare heading repeated across volumes when each has a long body', () => {
    const lines = [volume('第一卷 A'), chapter('第一章'), longBody, volume('第二卷 B'), chapter('第一章'), longBody];
    expect(removeTocDuplicates(lines)).toEqual(lines);
  });

  it('keeps short chapters with the same title in different volumes', () => {
    const lines = [volume('第一卷 A'), chapter('第一章'), body('短正文。'), volume('第二卷 B'), chapter('第一章'), body('另一正文。')];
    expect(removeTocDuplicates(lines)).toEqual(lines);
  });

  it('keeps a repeated heading whose first occurrence has a long body', () => {
    const lines = [chapter('第一章 a'), longBody, chapter('第一章 a'), body('x')];
    expect(removeTocDuplicates(lines)).toEqual(lines);
  });

  it('treats a volume and a chapter with the same text as different headings', () => {
    const lines = [volume('楔子'), body('x'), chapter('楔子'), body('y')];
    expect(removeTocDuplicates(lines)).toEqual(lines);
  });
});

describe('mergeBrokenParagraphs', () => {
  it('joins a line broken mid-sentence', () => {
    const lines = [body('他抬起头看着远处的山峰，心里想着'), body('明天一定要上去看看。')];
    expect(mergeBrokenParagraphs(lines)).toEqual([body('他抬起头看着远处的山峰，心里想着明天一定要上去看看。')]);
  });

  it('keeps a long line that ends with a closing quote', () => {
    const lines = [body('他说：“明天我们一起去山顶看日出吧”'), body('她点头')];
    expect(mergeBrokenParagraphs(lines)).toEqual(lines);
  });

  it('keeps a short unpunctuated line', () => {
    const lines = [body('他看着远处'), body('山峰很高。')];
    expect(mergeBrokenParagraphs(lines)).toEqual(lines);
  });

  it('never merges across a heading', () => {
    const lines = [body('他抬起头看着远处的山峰，心里想着'), chapter('第二章 b'), body('明天。')];
    expect(mergeBrokenParagraphs(lines)).toEqual(lines);
  });

  it('does not mutate its input', () => {
    const first = body('他抬起头看着远处的山峰，心里想着');
    mergeBrokenParagraphs([first, body('明天。')]);
    expect(first.text).toBe('他抬起头看着远处的山峰，心里想着');
  });
});
