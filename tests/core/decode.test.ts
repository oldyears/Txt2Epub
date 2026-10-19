import { describe, expect, it } from 'vitest';
import { decodeText } from '../../src/core/decode';

const utf8 = (text: string) => new TextEncoder().encode(text);

describe('decodeText', () => {
  it('decodes UTF-8', () => {
    expect(decodeText(utf8('第一章'))).toBe('第一章');
  });

  it('strips UTF-8 BOM', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('第一章')]))).toBe('第一章');
  });

  it('falls back to GB18030 for GBK bytes', () => {
    expect(decodeText(new Uint8Array([0xb5, 0xda, 0xd2, 0xbb, 0xd5, 0xc2]))).toBe('第一章');
  });

  it('decodes UTF-16LE with BOM', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x2c, 0x7b, 0x00, 0x4e, 0xe0, 0x7a]);
    expect(decodeText(bytes)).toBe('第一章');
  });

  it('decodes UTF-16BE with BOM', () => {
    const bytes = new Uint8Array([0xfe, 0xff, 0x7b, 0x2c, 0x4e, 0x00, 0x7a, 0xe0]);
    expect(decodeText(bytes)).toBe('第一章');
  });
});
