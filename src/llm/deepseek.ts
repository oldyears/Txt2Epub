import { parseJsonOrNull } from '../core/json';
import type { LlmConfig } from '../core/types';
import { requestJson, type Completion } from './client';
export { LlmRequestError } from './client';

export type CensorQuery = { id: number; context: string };
export type SuggestionResult = { words: Map<number, string>; failedBatches: number };

type Suggestion = { id: number; word: string };
const BATCH_SIZE = 40;
const MAX_WORD_LENGTH = 20;
// DeepSeek JSON mode requires the word "json" and an example of the output format in the prompt.
const SYSTEM_PROMPT = [
  '你是中文网络小说的校对员。',
  '用户会给出一个 JSON 数组，每项包含 id 和 context；context 中【】里的内容是平台用 *** 或 □ 等符号屏蔽掉的词。',
  '请根据上下文推断每处被屏蔽的最可能原词。',
  '只输出 json，格式为：{"results":[{"id":1,"word":"原词"}]}。',
  '无法确定时 word 填空字符串。',
].join('\n');

export async function suggestWords(queries: CensorQuery[], config: LlmConfig): Promise<SuggestionResult> {
  const result: SuggestionResult = { words: new Map(), failedBatches: 0 };
  // Batches run sequentially on purpose: parallel requests quickly hit DeepSeek rate limits.
  for (const batch of chunk(queries, BATCH_SIZE)) {
    const suggestions = parseSuggestions(await requestCompletion(batch, config), batch);
    if (suggestions === null) result.failedBatches += 1;
    suggestions?.forEach(({ id, word }) => result.words.set(id, word));
  }
  return result;
}

function chunk<T>(items: T[], size: number): T[][] {
  const count = Math.ceil(items.length / size);
  return Array.from({ length: count }, (_, index) => items.slice(index * size, (index + 1) * size));
}

async function requestCompletion(batch: CensorQuery[], config: LlmConfig): Promise<Completion> {
  return requestJson({ system: SYSTEM_PROMPT, payload: batch, config });
}

function parseSuggestions(completion: Completion, batch: CensorQuery[]): Suggestion[] | null {
  const entries = completion.truncated ? null : resultEntries(parseJsonOrNull(completion.content));
  const batchIds = new Set(batch.map((query) => query.id));
  return entries
    ?.map(toSuggestion)
    .filter((suggestion): suggestion is Suggestion => suggestion !== null && batchIds.has(suggestion.id)) ?? null;
}

function resultEntries(payload: unknown): unknown[] | null {
  const results = (payload as { results?: unknown } | null)?.results;
  return Array.isArray(results) ? results : null;
}

function toSuggestion(entry: unknown): Suggestion | null {
  const { id, word } = (entry ?? {}) as { id?: unknown; word?: unknown };
  if (typeof id !== 'number' || typeof word !== 'string') return null;
  const trimmedWord = word.trim();
  const isUsableWord = trimmedWord.length > 0 && trimmedWord.length <= MAX_WORD_LENGTH;
  return isUsableWord ? { id, word: trimmedWord } : null;
}
