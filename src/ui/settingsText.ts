import { safeRegExp } from '../core/regex';
import type { DictEntry, Settings } from '../core/types';

const ENTRY_SEPARATOR = '=';

export function parsePatterns(text: string): string[] {
  return nonEmptyLines(text);
}

export function formatPatterns(patterns: string[]): string {
  return patterns.join('\n');
}

export function parseDictionary(text: string): DictEntry[] {
  return nonEmptyLines(text).flatMap(parseEntry);
}

export function formatDictionary(entries: DictEntry[]): string {
  return entries.map(({ from, to }) => `${from}${ENTRY_SEPARATOR}${to}`).join('\n');
}

function parseEntry(line: string): DictEntry[] {
  const separatorIndex = line.indexOf(ENTRY_SEPARATOR);
  const from = line.slice(0, separatorIndex).trim();
  const to = line.slice(separatorIndex + 1).trim();
  return separatorIndex > 0 && from ? [{ from, to }] : [];
}

function nonEmptyLines(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function invalidPatterns(settings: Settings): string[] {
  const patterns = [settings.heading.volume, settings.heading.chapter, ...settings.adPatterns];
  return patterns.filter((pattern) => safeRegExp(pattern, 'i') === null);
}
