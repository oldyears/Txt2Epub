import { describe, expect, it } from 'vitest';
import { readTxt } from '../../src/core/txtReader';

const GBK_FIRST_CHAPTER_AND_BODY = new Uint8Array([0xb5, 0xda, 0xd2, 0xbb, 0xd5, 0xc2, 0x0a, 0xd5, 0xfd, 0xce, 0xc4]);
const GBK_META_LINE_THEN_CHAPTER = new Uint8Array([
  0xa1, 0xb6, 0xb2, 0xe2, 0xca, 0xd4, 0xd0, 0xa1, 0xcb, 0xb5, 0xa1, 0xb7, 0xd7, 0xf7, 0xd5, 0xdf, 0xa3, 0xba, 0xc4, 0xb3,
  0xc4, 0xb3, 0x0a, 0xb5, 0xda, 0xd2, 0xbb, 0xd5, 0xc2, 0x0a, 0xd5, 0xfd, 0xce, 0xc4,
]);
const utf8 = (lines: string[]): Uint8Array => new TextEncoder().encode(lines.join('\n'));

describe('readTxt', () => {
  it('decodes GBK text and takes meta from the file name', () => {
    const source = readTxt({ name: '《书名》作者：某某.txt', bytes: GBK_FIRST_CHAPTER_AND_BODY });
    expect(source).toEqual({ meta: { title: '书名', author: '某某' }, rawLines: ['第一章', '正文'] });
  });

  it('takes meta from a leading 《书名》作者 line and removes it', () => {
    const source = readTxt({ name: 'sample.txt', bytes: GBK_META_LINE_THEN_CHAPTER });
    expect(source).toEqual({ meta: { title: '测试小说', author: '某某' }, rawLines: ['第一章', '正文'] });
  });

  it('prefers a bracketed file name over an in-file title', () => {
    const source = readTxt({ name: '《甲》作者：乙.txt', bytes: utf8(['《测试小说》', '第一章']) });
    expect(source).toEqual({ meta: { title: '甲', author: '乙' }, rawLines: ['第一章'] });
  });

  it('reads separate 书名 and 作者 lines among the first five non-empty lines', () => {
    const source = readTxt({ name: 'x.txt', bytes: utf8(['', '　书名：风起', '', '作者： 某某', '第一章']) });
    expect(source).toEqual({ meta: { title: '风起', author: '某某' }, rawLines: ['', '', '第一章'] });
  });

  it('fills only the author when the file name gives just a title', () => {
    const source = readTxt({ name: '《甲》.txt', bytes: utf8(['作者：乙', '正文']) });
    expect(source.meta).toEqual({ title: '甲', author: '乙' });
  });

  it('ignores meta-like lines beyond the first five non-empty lines', () => {
    const lines = ['第一章', 'a', 'b', 'c', 'd', '作者：某某', ...Array.from({ length: 44 }, () => 'e'), '作者：某某'];
    const source = readTxt({ name: 'x.txt', bytes: utf8(lines) });
    expect(source).toEqual({ meta: { title: 'x', author: '' }, rawLines: lines });
  });

  it('keeps leading lines that only partly look like meta', () => {
    const lines = ['《测试小说》是他写的。', '作者：', '作者说：大家好'];
    const source = readTxt({ name: 'x.txt', bytes: utf8(lines) });
    expect(source).toEqual({ meta: { title: 'x', author: '' }, rawLines: lines });
  });
});
