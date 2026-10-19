import { EpubFormatError } from '../core/epubReader';
import { LlmRequestError } from '../llm/deepseek';

export type SuggestionOutcome = { filled: number; failedBatches: number };

export function errorMessage(error: unknown): string {
  if (error instanceof EpubFormatError || error instanceof LlmRequestError) return error.message;
  console.error(error);
  const detail = error instanceof Error ? error.message : String(error);
  return `处理失败：${detail}`;
}

export function suggestionSummary(outcome: SuggestionOutcome): string {
  const filled = `已填入 ${outcome.filled} 处建议`;
  return outcome.failedBatches > 0 ? `${filled}，${outcome.failedBatches} 批失败` : filled;
}
