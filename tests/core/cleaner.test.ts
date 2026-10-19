import { describe, expect, it } from 'vitest';
import { cleanRawLines } from '../../src/core/cleaner';

const NEXT_PAGE_AD = '本章未完.{0,10}点击下一页.{0,6}';
const URL_AD = '(https?://)?(www|m)\\.[a-z0-9-]+\\.(com|net|org|cc|la|info)';

describe('cleanRawLines', () => {
  it('trims full-width indentation', () => {
    expect(cleanRawLines(['　　他笑了。'], [])).toEqual(['他笑了。']);
  });

  it('drops a line that is entirely an ad', () => {
    expect(cleanRawLines(['本章未完，请点击下一页继续阅读', '正文。'], [NEXT_PAGE_AD])).toEqual(['正文。']);
  });

  it('removes inline ads and keeps the rest of the line', () => {
    expect(cleanRawLines(['他来了www.abc.com。'], [URL_AD])).toEqual(['他来了。']);
  });

  it('removes every occurrence within a line', () => {
    expect(cleanRawLines(['a www.x.com b m.y.net c'], [URL_AD])).toEqual(['a  b  c']);
  });

  it('ignores invalid patterns without throwing', () => {
    expect(cleanRawLines(['他来了www.abc.com。'], ['(', URL_AD])).toEqual(['他来了。']);
  });

  it('drops blank lines', () => {
    expect(cleanRawLines(['甲', '', '   ', '　 ', '乙'], [])).toEqual(['甲', '乙']);
  });

  it('matches anchored ad patterns against indented lines', () => {
    expect(cleanRawLines(['　　目录', '正文'], ['^目\\s*录$'])).toEqual(['正文']);
  });
});
