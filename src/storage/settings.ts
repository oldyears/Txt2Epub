import { DEFAULT_SETTINGS } from '../core/defaults';
import { parseJsonOrNull } from '../core/json';
import type { DictEntry, HeadingRules, LlmConfig, Settings } from '../core/types';

type Guard<T> = (value: unknown) => value is T;
type UnknownRecord = Record<string, unknown>;

const STORAGE_KEY = 'txt2epub.settings';

export function loadSettings(): Settings {
  const saved = recordOrEmpty(parseJsonOrNull(readStoredSettings()));
  return {
    heading: loadHeadingRules(saved.heading),
    adPatterns: validOr(isStringArray, DEFAULT_SETTINGS.adPatterns)(saved.adPatterns),
    dictionary: loadDictionary(saved.dictionary),
    llm: loadLlmConfig(saved.llm),
  };
}

export function saveSettings(settings: Settings): boolean {
  // localStorage may throw in private mode, when the quota is exceeded or in sandboxed previews.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

function readStoredSettings(): string {
  // localStorage access itself may throw (private mode, sandboxed previews); treat it as nothing saved.
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function loadHeadingRules(value: unknown): HeadingRules {
  const saved = recordOrEmpty(value);
  const defaults = DEFAULT_SETTINGS.heading;
  return {
    volume: validOr(isString, defaults.volume)(saved.volume),
    chapter: validOr(isString, defaults.chapter)(saved.chapter),
    maxLength: validOr(isPositiveFiniteNumber, defaults.maxLength)(saved.maxLength),
  };
}

function loadDictionary(value: unknown): DictEntry[] {
  return Array.isArray(value) ? value.filter(isDictEntry) : DEFAULT_SETTINGS.dictionary;
}

function loadLlmConfig(value: unknown): LlmConfig {
  const saved = recordOrEmpty(value);
  const defaults = DEFAULT_SETTINGS.llm;
  return {
    apiKey: validOr(isString, defaults.apiKey)(saved.apiKey),
    model: validOr(isString, defaults.model)(saved.model),
  };
}

function validOr<T>(isValid: Guard<T>, fallback: T): (value: unknown) => T {
  return (value) => (isValid(value) ? value : fallback);
}

function recordOrEmpty(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isDictEntry(value: unknown): value is DictEntry {
  return isRecord(value) && isString(value.from) && isString(value.to);
}
