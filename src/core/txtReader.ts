import { decodeText } from './decode';
import { parseFileName, splitLines } from './text';
import type { BookMeta, SourceDoc } from './types';

export type NamedBytes = { name: string; bytes: Uint8Array };
type LeadingMeta = { title: string; author: string; consumed: Set<number> };

const META_SCAN_LINE_COUNT = 5;
const BRACKETED_FILE_NAME = /^《[^》]+》/;
const META_LINE_PATTERNS = [
  /^《(?<title>[^》]+)》\s*(?:作者[:：]\s*(?<author>\S.*))?$/,
  /^书名[:：]\s*(?<title>\S.*)$/,
  /^作者[:：]\s*(?<author>\S.*)$/,
];

export function readTxt(file: NamedBytes): SourceDoc {
  const lines = splitLines(decodeText(file.bytes));
  const leading = extractLeadingMeta(lines);
  return { meta: mergeMeta(file.name, leading), rawLines: lines.filter((_, i) => !leading.consumed.has(i)) };
}

function extractLeadingMeta(lines: string[]): LeadingMeta {
  const meta: LeadingMeta = { title: '', author: '', consumed: new Set() };
  for (const index of leadingNonEmptyIndices(lines)) {
    const groups = matchMetaLine(lines[index].trim());
    if (!groups) continue;
    meta.title ||= groups.title ?? '';
    meta.author ||= groups.author ?? '';
    meta.consumed.add(index);
  }
  return meta;
}

function leadingNonEmptyIndices(lines: string[]): number[] {
  const indices: number[] = [];
  for (let i = 0; i < lines.length && indices.length < META_SCAN_LINE_COUNT; i++) {
    if (lines[i].trim()) indices.push(i);
  }
  return indices;
}

function matchMetaLine(text: string): Record<string, string | undefined> | undefined {
  return META_LINE_PATTERNS.map((pattern) => pattern.exec(text)?.groups).find(Boolean);
}

function mergeMeta(fileName: string, leading: LeadingMeta): BookMeta {
  const fromName = parseFileName(fileName);
  const preferredTitle = BRACKETED_FILE_NAME.test(fileName) ? fromName.title : leading.title;
  return { title: preferredTitle || fromName.title, author: fromName.author || leading.author };
}
