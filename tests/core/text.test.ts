import { describe, expect, it } from 'vitest';
import { parseFileName, splitLines } from '../../src/core/text';

describe('splitLines', () => {
  it('splits on CRLF, CR and LF', () => {
    expect(splitLines('a\r\nb\rc\nd')).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('parseFileName', () => {
  it('extracts title and author with full-width colon', () => {
    expect(parseFileName('《斗破苍穹》作者：天蚕土豆.txt')).toEqual({ title: '斗破苍穹', author: '天蚕土豆' });
  });

  it('accepts half-width colon and spaces', () => {
    expect(parseFileName('《斗破苍穹》 作者 : 天蚕土豆 .txt')).toEqual({ title: '斗破苍穹', author: '天蚕土豆' });
  });

  it('falls back to name without extension', () => {
    expect(parseFileName('abc.txt')).toEqual({ title: 'abc', author: '' });
  });

  it('extracts bracketed title without author', () => {
    expect(parseFileName('《凡人修仙传》.epub')).toEqual({ title: '凡人修仙传', author: '' });
  });

  it('keeps dots that are not a known extension', () => {
    expect(parseFileName('《第1.5卷》')).toEqual({ title: '第1.5卷', author: '' });
  });

  it('ignores trailing text after the title', () => {
    expect(parseFileName('《书名》（完结）.txt')).toEqual({ title: '书名', author: '' });
  });

  it('finds the author after trailing text', () => {
    expect(parseFileName('《书名》（完结）作者：某某.txt')).toEqual({ title: '书名', author: '某某' });
  });
});
