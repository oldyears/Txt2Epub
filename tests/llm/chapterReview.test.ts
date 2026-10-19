import { afterEach, expect, it, vi } from 'vitest';
import { reviewChapters } from '../../src/llm/chapterReview';
import type { ReviewBatch } from '../../src/core/chapterReview';

const config = { apiKey: 'sk-test', model: 'deepseek-flash' };
const batch: ReviewBatch = { title: '前言', lines: [{ id: 1, text: '山城夜雨', kind: 'body' }] };
const suggestion = { lineId: 1, text: '山城夜雨', kind: 'volume', reason: '篇名' };
const response = (value: unknown, finish_reason = 'stop') => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) }, finish_reason }] }));
afterEach(() => vi.unstubAllGlobals());

it('reviews serially with JSON mode and reports progress without applying anything', async () => {
  const fetch = vi.fn().mockResolvedValue(response({ suggestions: [suggestion] }));
  vi.stubGlobal('fetch', fetch);
  const progress = vi.fn();
  const result = await reviewChapters({ batches: [batch, batch], config, onProgress: progress });
  expect(fetch).toHaveBeenCalledTimes(2);
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.response_format).toEqual({ type: 'json_object' });
  expect(body.messages[0].content).toContain('json');
  expect(JSON.parse(body.messages[1].content)).toEqual(batch);
  expect(result.suggestions).toEqual([suggestion]);
  expect(progress).toHaveBeenLastCalledWith({ completed: 2, total: 2, suggestions: 1 });
});

it('counts malformed and truncated batches while retaining valid results', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ wrong: [] })).mockResolvedValueOnce(response({ suggestions: [suggestion] }, 'length')).mockResolvedValueOnce(response({ suggestions: [suggestion] })));
  const result = await reviewChapters({ batches: [batch, batch, batch], config });
  expect(result.failedBatches).toBe(2);
  expect(result.suggestions).toEqual([suggestion]);
});

it('stops after HTTP errors and retains earlier suggestions for preview', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response({ suggestions: [suggestion] })).mockResolvedValueOnce(new Response('', { status: 401 }));
  vi.stubGlobal('fetch', fetch);
  const result = await reviewChapters({ batches: [batch, batch, batch], config });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(result.suggestions).toEqual([suggestion]);
  expect(result.error).toContain('401');
  expect(result.failedBatches).toBe(1);
  expect(result.totalBatches).toBe(3);
});

it('reports partially invalid model suggestions while retaining valid anchored suggestions', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ suggestions: [suggestion, { ...suggestion, lineId: 999 }] })));
  const result = await reviewChapters({ batches: [batch], config });
  expect(result.failedBatches).toBe(1);
  expect(result.suggestions).toEqual([suggestion]);
});

it('does not request when cancelled before starting', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const result = await reviewChapters({ batches: [batch], config, signal: AbortSignal.abort() });
  expect(fetch).not.toHaveBeenCalled();
  expect(result.cancelled).toBe(true);
});

it('cancels in-flight requests without losing the original chapter structure', async () => {
  const controller = new AbortController();
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => { controller.abort(); throw new DOMException('Aborted', 'AbortError'); }));
  const result = await reviewChapters({ batches: [batch], config, signal: controller.signal });
  expect(result.cancelled).toBe(true);
  expect(result.suggestions).toEqual([]);
  expect(batch.lines[0].kind).toBe('body');
});
