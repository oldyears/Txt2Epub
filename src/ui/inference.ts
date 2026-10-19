import { suggestWords } from '../llm/deepseek';
import { suggestionSummary } from './messages';
import { filledCount, mergeSuggestions, pendingQueries, type AppState } from './state';
import type { ToastMessage } from './views/toast';

export type InferenceResult = { state?: AppState; message: ToastMessage };

const STALE_RESULT_MESSAGE: ToastMessage = { text: '内容已重新处理，本次推断结果已丢弃', tone: 'error' };

export async function inferSuggestions(readState: () => AppState): Promise<InferenceResult> {
  const started = readState();
  const { words, failedBatches } = await suggestWords(pendingQueries(started), started.settings.llm);
  const current = readState();
  if (current.hits !== started.hits) return { message: STALE_RESULT_MESSAGE };
  const state = mergeSuggestions(current, words);
  const filled = filledCount(state) - filledCount(current);
  return { state, message: { text: suggestionSummary({ filled, failedBatches }) } };
}
