import { cleanRawLines } from './cleaner';
import { createDictionaryApplier, findCensorHits } from './censor';
import { classifyLines, mergeParagraphsWithStarts, removeEmptyHeadings, removeTocDuplicates } from './splitter';
import type { Book, CensorHit, DictEntry, Line, Settings, SourceDoc } from './types';

export type ProcessResult = { book: Book; hits: CensorHit[]; reviewBase: Book; lineStarts: number[] };

export function processSource(source: SourceDoc, settings: Settings): ProcessResult {
  const texts = cleanRawLines(source.rawLines, settings.adPatterns);
  const headed = removeTocDuplicates(removeEmptyHeadings(classifyLines(texts, settings.heading)));
  return processPrepared({ meta: source.meta, lines: headed }, settings.dictionary);
}

export function processPrepared(reviewBase: Book, dictionary: DictEntry[]): ProcessResult {
  const { lines: merged, starts: lineStarts } = mergeParagraphsWithStarts(reviewBase.lines);
  const lines = restoreDictionaryWords(merged, dictionary);
  return { book: { meta: reviewBase.meta, lines }, hits: findCensorHits(lines), reviewBase, lineStarts };
}

function restoreDictionaryWords(lines: Line[], dictionary: DictEntry[]): Line[] {
  const applyDictionary = createDictionaryApplier(dictionary);
  return lines.map((line) => ({ ...line, text: applyDictionary(line.text) }));
}
