import { parseJsonOrNull } from '../core/json';
import type { LlmConfig } from '../core/types';

export type JsonRequest = { system: string; payload: unknown; config: LlmConfig; signal?: AbortSignal };
export type Completion = { content: string; truncated: boolean };
type ChatCompletion = { choices?: { message?: { content?: unknown }; finish_reason?: unknown }[] };

export class LlmRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'LlmRequestError';
    this.status = status;
  }
}

export async function requestJson(request: JsonRequest): Promise<Completion> {
  const timeout = AbortSignal.timeout(60_000);
  const signal = request.signal ? AbortSignal.any([timeout, request.signal]) : timeout;
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${request.config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody(request)), signal,
  }).catch(rejectAsConnectionFailure);
  if (!response.ok) throw new LlmRequestError(response.status, `DeepSeek 请求失败（HTTP ${response.status}）`);
  const payload = parseJsonOrNull(await response.text().catch(rejectAsConnectionFailure)) as ChatCompletion | null;
  const choice = payload?.choices?.[0];
  const content = choice?.message?.content;
  return { content: typeof content === 'string' ? content : '', truncated: choice?.finish_reason === 'length' };
}

function rejectAsConnectionFailure(): never {
  throw new LlmRequestError(0, '无法连接 DeepSeek（网络错误或超时）');
}

function requestBody(request: JsonRequest) {
  return {
    model: request.config.model,
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: JSON.stringify(request.payload) },
    ],
    response_format: { type: 'json_object' }, max_tokens: 4096,
  };
}
