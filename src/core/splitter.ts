import { safeRegExp } from './regex';
import type { HeadingRules, Line, LineKind } from './types';

type HeadingKind = Exclude<LineKind, 'body'>;
type HeadingMatcher = { kind: HeadingKind; regex: RegExp | null };
type HeadingMatch = { kind: HeadingKind; marker: string };
type ClassifyContext = { matchers: HeadingMatcher[]; maxLength: number };
type TocScan = { laterHeadings: Set<string>; bodyLengthBelow: number };

const NON_HEADING_ENDING = /[。，；、,;：:”」』"…]$/;
const MARKER_SEPARATOR = /^[\s：:·\-—、.．]+/;
const SENTENCE_ENDING = /[。！？!?…”」』）)~—】"']$/;
const MIN_BROKEN_LINE_LENGTH = 15;
const MIN_REAL_SECTION_BODY_LENGTH = 100;
const HEADING_LEVEL: Record<LineKind, number> = { volume: 1, chapter: 2, body: Infinity };

export function classifyLines(texts: string[], rules: HeadingRules): Line[] {
  const context = { matchers: compileHeadingMatchers(rules), maxLength: rules.maxLength };
  return texts.map((text) => classifyLine(text, context));
}

function compileHeadingMatchers(rules: HeadingRules): HeadingMatcher[] {
  return [
    { kind: 'volume', regex: safeRegExp(rules.volume, 'i') },
    { kind: 'chapter', regex: safeRegExp(rules.chapter, 'i') },
  ];
}

function classifyLine(text: string, context: ClassifyContext): Line {
  const heading = isHeadingCandidate(text, context.maxLength) ? findHeading(text, context.matchers) : undefined;
  return heading ? { text: formatHeading(text, heading.marker), kind: heading.kind } : { text, kind: 'body' };
}

function isHeadingCandidate(text: string, maxLength: number): boolean {
  return text.length <= maxLength && !NON_HEADING_ENDING.test(text);
}

function findHeading(text: string, matchers: HeadingMatcher[]): HeadingMatch | undefined {
  for (const { kind, regex } of matchers) {
    const match = regex?.exec(text);
    if (match?.index === 0) return { kind, marker: match[0] };
  }
  return undefined;
}

function formatHeading(text: string, marker: string): string {
  const title = text.slice(marker.length).replace(MARKER_SEPARATOR, '').trimEnd();
  return title ? `${marker} ${title}` : marker;
}

export function removeEmptyHeadings(lines: Line[]): Line[] {
  const keptReversed: Line[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!isEmptyHeading(lines[i], keptReversed.at(-1))) keptReversed.push(lines[i]);
  }
  return keptReversed.reverse();
}

function isEmptyHeading(line: Line, nextKept: Line | undefined): boolean {
  const nextLevel = HEADING_LEVEL[nextKept?.kind ?? 'body'];
  return line.kind !== 'body' && nextLevel <= HEADING_LEVEL[line.kind];
}

export function removeTocDuplicates(lines: Line[]): Line[] {
  const scan: TocScan = { laterHeadings: new Set(), bodyLengthBelow: 0 };
  const keys = headingKeys(lines);
  const keptReversed: Line[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!isTocEntry(keys[i], scan)) keptReversed.push(lines[i]);
    recordScannedLine({ line: lines[i], key: keys[i] }, scan);
  }
  return keptReversed.reverse();
}

function isTocEntry(key: string | undefined, scan: TocScan): boolean {
  const hasShortBody = scan.bodyLengthBelow < MIN_REAL_SECTION_BODY_LENGTH;
  return key !== undefined && hasShortBody && scan.laterHeadings.has(key);
}

function recordScannedLine({ line, key }: { line: Line; key?: string }, scan: TocScan): void {
  if (key === undefined) {
    scan.bodyLengthBelow += line.text.length;
    return;
  }
  scan.laterHeadings.add(key);
  scan.bodyLengthBelow = 0;
}

function headingKeys(lines: Line[]): (string | undefined)[] {
  let volume = '';
  return lines.map((line) => {
    if (line.kind === 'volume') volume = line.text;
    if (line.kind === 'body') return undefined;
    return JSON.stringify([line.kind, line.kind === 'chapter' ? volume : '', line.text]);
  });
}

export function mergeBrokenParagraphs(lines: Line[]): Line[] {
  return mergeParagraphsWithStarts(lines).lines;
}

export function mergeParagraphsWithStarts(lines: Line[]): { lines: Line[]; starts: number[] } {
  const merged: Line[] = [];
  const starts: number[] = [];
  for (const [index, line] of lines.entries()) {
    const previous = merged.at(-1);
    if (previous && isBrokenContinuation(previous, line)) {
      merged[merged.length - 1] = { ...previous, text: previous.text + line.text };
    } else {
      merged.push(line);
      starts.push(index);
    }
  }
  return { lines: merged, starts };
}

function isBrokenContinuation(previous: Line, current: Line): boolean {
  const bothBody = previous.kind === 'body' && current.kind === 'body';
  return bothBody && previous.text.length >= MIN_BROKEN_LINE_LENGTH && !SENTENCE_ENDING.test(previous.text);
}
