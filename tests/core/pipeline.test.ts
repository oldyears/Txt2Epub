import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/core/defaults';
import { processSource } from '../../src/core/pipeline';
import type { SourceDoc } from '../../src/core/types';

const SAMPLE: SourceDoc = {
  meta: { title: '小镇', author: '某人' },
  rawLines: [
    '目录',
    '第一卷 风起',
    '第一章 开始',
    '第二章 相遇',
    '',
    '第一卷 风起',
    '第一章 开始',
    '　　清晨的阳光洒在小镇的石板路上，一位年轻的jing察',
    '　　缓缓走来。',
    '本章未完，请点击下一页继续阅读',
    '　　他停在路口，四处张望。www.biquge.com',
    '第二章：相遇',
    '　　他说：“那人***了。”',
  ],
};

describe('processSource', () => {
  const { book, hits } = processSource(SAMPLE, DEFAULT_SETTINGS);

  it('keeps the source meta', () => {
    expect(book.meta).toBe(SAMPLE.meta);
  });

  it('produces the cleaned book structure', () => {
    expect(book.lines).toEqual([
      { kind: 'volume', text: '第一卷 风起' },
      { kind: 'chapter', text: '第一章 开始' },
      { kind: 'body', text: '清晨的阳光洒在小镇的石板路上，一位年轻的警察缓缓走来。' },
      { kind: 'body', text: '他停在路口，四处张望。' },
      { kind: 'chapter', text: '第二章 相遇' },
      { kind: 'body', text: '他说：“那人***了。”' },
    ]);
  });

  it('restores pinyin split across a hard wrap', () => {
    const wrapped: SourceDoc = {
      meta: SAMPLE.meta,
      rawLines: ['　　清晨的阳光洒在小镇的石板路上，一位年轻的jing', '　　察缓缓走来。'],
    };
    expect(processSource(wrapped, DEFAULT_SETTINGS).book.lines).toEqual([
      { kind: 'body', text: '清晨的阳光洒在小镇的石板路上，一位年轻的警察缓缓走来。' },
    ]);
  });

  it('drops a table of contents separated from the body by a preface', () => {
    const withPreface: SourceDoc = {
      meta: SAMPLE.meta,
      rawLines: [
        '目录', '第一卷 风起', '第一章 重生', '第二章 初遇', '这是作者写的序言，感谢大家支持。',
        '第一卷 风起', '第一章 重生', '他睁开眼睛……', '第二章 初遇', '她笑了。',
      ],
    };
    expect(processSource(withPreface, DEFAULT_SETTINGS).book.lines).toEqual([
      { kind: 'body', text: '这是作者写的序言，感谢大家支持。' },
      { kind: 'volume', text: '第一卷 风起' },
      { kind: 'chapter', text: '第一章 重生' },
      { kind: 'body', text: '他睁开眼睛……' },
      { kind: 'chapter', text: '第二章 初遇' },
      { kind: 'body', text: '她笑了。' },
    ]);
  });

  it('reports the remaining censor hit', () => {
    expect(hits).toEqual([{ lineIndex: 5, start: 6, end: 9, raw: '***' }]);
  });
});
