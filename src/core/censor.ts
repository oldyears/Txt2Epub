import { escapeRegExp } from './regex';
import type { CensorHit, DictEntry, Line } from './types';

export type CensorFix = { hit: CensorHit; replacement: string };

type CompiledEntry = { regex: RegExp; to: string };

const CENSOR_PATTERN = /[*＊]{2,}|(?<=\p{Script=Han})[*＊](?=\p{Script=Han})|[□■]+|×{2,}/gu;
const NEIGHBOUR_CONTEXT_LENGTH = 60;
const LINE_CONTEXT_RADIUS = 90;

export function createDictionaryApplier(entries: DictEntry[]): (text: string) => string {
  // Replacement goes through a function so `$` patterns in user-supplied `to` stay literal.
  const compiled = entries.filter((entry) => entry.from.length > 0).map(compileEntry);
  return (text) => compiled.reduce((result, { regex, to }) => result.replace(regex, () => to), text);
}

function compileEntry(entry: DictEntry): CompiledEntry {
  return { regex: new RegExp(escapeRegExp(entry.from), 'gi'), to: entry.to };
}

export function findCensorHits(lines: Line[]): CensorHit[] {
  return lines.flatMap((line, lineIndex) => findLineHits(line.text, lineIndex));
}

function findLineHits(text: string, lineIndex: number): CensorHit[] {
  return Array.from(text.matchAll(CENSOR_PATTERN), (match) => ({
    lineIndex,
    start: match.index,
    end: match.index + match[0].length,
    raw: match[0],
  }));
}

export function applyFixes(lines: Line[], fixes: CensorFix[]): Line[] {
  const fixesByLine = groupFixesByLine(fixes);
  return lines.map((line, index) => {
    const lineFixes = fixesByLine.get(index);
    return lineFixes ? { ...line, text: applyLineFixes(line.text, lineFixes) } : line;
  });
}

function groupFixesByLine(fixes: CensorFix[]): Map<number, CensorFix[]> {
  const grouped = new Map<number, CensorFix[]>();
  for (const fix of fixes) {
    const lineFixes = grouped.get(fix.hit.lineIndex) ?? [];
    lineFixes.push(fix);
    grouped.set(fix.hit.lineIndex, lineFixes);
  }
  return grouped;
}

function applyLineFixes(text: string, fixes: CensorFix[]): string {
  return applicableFixes(text, fixes).reduce(
    (result, { hit, replacement }) => result.slice(0, hit.start) + replacement + result.slice(hit.end),
    text,
  );
}

function applicableFixes(text: string, fixes: CensorFix[]): CensorFix[] {
  const descending = fixes
    .filter(({ hit }) => text.slice(hit.start, hit.end) === hit.raw)
    .sort((a, b) => b.hit.start - a.hit.start);
  return descending.filter((fix, index) => fix.hit.start !== descending[index - 1]?.hit.start);
}

export function hitContext(lines: Line[], hit: CensorHit): string {
  const previous = lines[hit.lineIndex - 1]?.text.slice(-NEIGHBOUR_CONTEXT_LENGTH) ?? '';
  const next = lines[hit.lineIndex + 1]?.text.slice(0, NEIGHBOUR_CONTEXT_LENGTH) ?? '';
  return [previous, markedLineExcerpt(lines[hit.lineIndex].text, hit), next].filter(Boolean).join('\n');
}

function markedLineExcerpt(text: string, hit: CensorHit): string {
  const before = text.slice(Math.max(0, hit.start - LINE_CONTEXT_RADIUS), hit.start);
  const after = text.slice(hit.end, hit.end + LINE_CONTEXT_RADIUS);
  return `${before}【${hit.raw}】${after}`;
}
