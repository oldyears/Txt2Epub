import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlmRequestError, suggestWords, type CensorQuery } from '../../src/llm/deepseek';
import type { LlmConfig } from '../../src/core/types';

const config: LlmConfig = { apiKey: 'sk-test', model: 'deepseek-flash' };

const query = (id: number): CensorQuery => ({ id, context: `上文【***】下文${id}` });

function completion(content: string | null, finishReason = 'stop'): Response {
  const choices = [{ message: { content }, finish_reason: finishReason }];
  return new Response(JSON.stringify({ choices }), { status: 200 });
}

function resultsCompletion(results: unknown[]): Response {
  return completion(JSON.stringify({ results }));
}

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>();
  responses.forEach((response) => fetchMock.mockResolvedValueOnce(response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof stubFetch>, callIndex: number) {
  return JSON.parse(String(fetchMock.mock.calls[callIndex][1]?.body));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('suggestWords', () => {
  it('posts an OpenAI-compatible json-mode request to DeepSeek', async () => {
    const fetchMock = stubFetch(resultsCompletion([]));
    await suggestWords([query(1)], config);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(init?.method).toBe('POST');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer sk-test', 'Content-Type': 'application/json' });
    const body = sentBody(fetchMock, 0);
    expect(body.model).toBe('deepseek-flash');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.max_tokens).toBe(4096);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('json');
    expect(body.messages[1]).toEqual({ role: 'user', content: JSON.stringify([query(1)]) });
  });

  it('sends batches of 40 sequentially and merges results', async () => {
    const queries = Array.from({ length: 41 }, (_, index) => query(index + 1));
    const fetchMock = stubFetch(
      resultsCompletion([{ id: 1, word: '警察' }]),
      resultsCompletion([{ id: 41, word: '政府' }]),
    );
    const { words, failedBatches } = await suggestWords(queries, config);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(failedBatches).toBe(0);
    expect(JSON.parse(sentBody(fetchMock, 0).messages[1].content)).toHaveLength(40);
    expect(JSON.parse(sentBody(fetchMock, 1).messages[1].content)).toEqual([query(41)]);
    expect(words).toEqual(new Map([[1, '警察'], [41, '政府']]));
  });

  it('ignores ids outside the batch, empty or overlong words and malformed entries', async () => {
    stubFetch(
      resultsCompletion([
        { id: 1, word: ' 警察 ' },
        { id: 3, word: '长'.repeat(21) },
        { id: 4, word: '字'.repeat(20) },
        { id: 2, word: '  ' },
        { id: 99, word: '外人' },
        { id: '1', word: '字符串' },
        { id: 1 },
        null,
      ]),
    );
    const result = await suggestWords([query(1), query(2), query(3), query(4)], config);
    expect(result).toEqual({ words: new Map([[1, '警察'], [4, '字'.repeat(20)]]), failedBatches: 0 });
  });

  it.each([
    ['empty content', completion('')],
    ['null content', completion(null)],
    ['invalid json', completion('{not json')],
    ['missing results', completion('{"answer":[]}')],
    ['missing choices', new Response('{}', { status: 200 })],
    ['truncated output', completion('{"results":[{"id":1,"word":"警察"}]}', 'length')],
  ])('counts %s as a failed batch without throwing', async (_, response) => {
    stubFetch(response);
    await expect(suggestWords([query(1)], config)).resolves.toEqual({ words: new Map(), failedBatches: 1 });
  });

  it('keeps results of other batches when one batch fails', async () => {
    const queries = Array.from({ length: 41 }, (_, index) => query(index + 1));
    stubFetch(completion(''), resultsCompletion([{ id: 41, word: '政府' }]));
    const result = await suggestWords(queries, config);
    expect(result).toEqual({ words: new Map([[41, '政府']]), failedBatches: 1 });
  });

  it('rejects with LlmRequestError on non-2xx responses', async () => {
    stubFetch(new Response('unauthorized', { status: 401 }));
    const failure = suggestWords([query(1)], config);
    await expect(failure).rejects.toBeInstanceOf(LlmRequestError);
    await expect(failure).rejects.toMatchObject({ status: 401, message: 'DeepSeek 请求失败（HTTP 401）' });
  });

  it('rejects with LlmRequestError status 0 when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')));
    const failure = suggestWords([query(1)], config);
    await expect(failure).rejects.toBeInstanceOf(LlmRequestError);
    await expect(failure).rejects.toMatchObject({ status: 0, message: '无法连接 DeepSeek（网络错误或超时）' });
  });

  it('does not call the API for empty queries', async () => {
    const fetchMock = stubFetch();
    await expect(suggestWords([], config)).resolves.toEqual({ words: new Map(), failedBatches: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
