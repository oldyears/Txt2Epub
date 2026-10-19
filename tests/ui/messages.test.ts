import { describe, expect, it, vi } from 'vitest';
import { EpubFormatError } from '../../src/core/epubReader';
import { LlmRequestError } from '../../src/llm/deepseek';
import { epubFileName } from '../../src/ui/download';
import { errorMessage, suggestionSummary } from '../../src/ui/messages';

describe('suggestionSummary', () => {
  it('omits the failure part when nothing failed', () => {
    expect(suggestionSummary({ filled: 3, failedBatches: 0 })).toBe('已填入 3 处建议');
    expect(suggestionSummary({ filled: 3, failedBatches: 2 })).toBe('已填入 3 处建议，2 批失败');
  });
});

describe('errorMessage', () => {
  it('passes through user-facing core errors', () => {
    expect(errorMessage(new LlmRequestError(401, 'DeepSeek 请求失败（HTTP 401）'))).toBe('DeepSeek 请求失败（HTTP 401）');
    expect(errorMessage(new EpubFormatError('不是有效的 EPUB 文件'))).toBe('不是有效的 EPUB 文件');
  });

  it('prefixes unexpected errors', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(errorMessage(new Error('boom'))).toBe('处理失败：boom');
  });
});

describe('epubFileName', () => {
  it('falls back to 未命名 and strips unsafe characters', () => {
    expect(epubFileName('')).toBe('未命名.epub');
    expect(epubFileName('  ')).toBe('未命名.epub');
    expect(epubFileName('a/b:c')).toBe('a_b_c.epub');
  });
});
