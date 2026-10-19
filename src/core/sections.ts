import type { Line } from './types';

export type SectionKind = 'preface' | 'volume' | 'chapter';
export type Section = { kind: SectionKind; title: string; start: number; end: number };
export type TocNode = { sectionIndex: number; title: string; children: TocNode[] };

const PREFACE_TITLE = '前言';

export function buildSections(lines: Line[]): Section[] {
  const starts = sectionStarts(lines);
  return starts.map((start, index) => ({
    ...sectionHeading(lines[start]),
    start,
    end: starts[index + 1] ?? lines.length,
  }));
}

function sectionStarts(lines: Line[]): number[] {
  const headingIndexes = lines.flatMap((line, index) => (line.kind === 'body' ? [] : [index]));
  const hasPreface = lines.length > 0 && lines[0].kind === 'body';
  return hasPreface ? [0, ...headingIndexes] : headingIndexes;
}

function sectionHeading(line: Line): Pick<Section, 'kind' | 'title'> {
  if (line.kind === 'body') return { kind: 'preface', title: PREFACE_TITLE };
  return { kind: line.kind, title: line.text };
}

export function sectionParagraphs(lines: Line[], section: Section): string[] {
  return lines
    .slice(section.start, section.end)
    .filter((line) => line.kind === 'body')
    .map((line) => line.text);
}

export function buildToc(sections: Section[]): TocNode[] {
  const roots: TocNode[] = [];
  let currentVolume: TocNode | null = null;
  sections.forEach((section, sectionIndex) => {
    const node: TocNode = { sectionIndex, title: section.title, children: [] };
    const siblings = section.kind === 'chapter' && currentVolume ? currentVolume.children : roots;
    siblings.push(node);
    if (section.kind === 'volume') currentVolume = node;
  });
  return roots;
}
