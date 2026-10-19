import { safeRegExp } from './regex';

export function cleanRawLines(rawLines: string[], adPatterns: string[]): string[] {
  const adRegexes = compileAdPatterns(adPatterns);
  return rawLines
    .map((line) => stripAds(line.trim(), adRegexes).trim())
    .filter((line) => line.length > 0);
}

function compileAdPatterns(patterns: string[]): RegExp[] {
  return patterns
    .map((pattern) => safeRegExp(pattern, 'gi'))
    .filter((regex): regex is RegExp => regex !== null);
}

function stripAds(line: string, adRegexes: RegExp[]): string {
  return adRegexes.reduce((text, regex) => text.replace(regex, ''), line);
}
