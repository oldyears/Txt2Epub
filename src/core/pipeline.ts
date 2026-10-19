import { cleanRawLines } from './cleaner';
import { createDictionaryApplier, findCensorHits } from './censor';
import { classifyLines, mergeBrokenParagraphs, removeEmptyHeadings, removeTocDuplicates } from './splitter';
import type { Book, CensorHit, DictEntry, Line, Settings, SourceDoc } from './types';

export type ProcessResult = { book: Book; hits: CensorHit[] };

export function processSource(source: SourceDoc, settings: Settings): ProcessResult {
  const texts = cleanRawLines(source.rawLines, settings.adPatterns);
  const headed = removeTocDuplicates(removeEmptyHeadings(classifyLines(texts, settings.heading)));
  const merged = mergeBrokenParagraphs(headed);
  const lines = restoreDictionaryWords(merged, settings.dictionary);
  return { book: { meta: source.meta, lines }, hits: findCensorHits(lines) };
}

function restoreDictionaryWords(lines: Line[], dictionary: DictEntry[]): Line[] {
  const applyDictionary = createDictionaryApplier(dictionary);
  return lines.map((line) => ({ ...line, text: applyDictionary(line.text) }));
}
