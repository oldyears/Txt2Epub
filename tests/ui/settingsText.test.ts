import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/core/defaults';
import { formatDictionary, formatPatterns, invalidPatterns, parseDictionary, parsePatterns } from '../../src/ui/settingsText';

describe('patterns text', () => {
  it('keeps one trimmed pattern per non-empty line', () => {
    expect(parsePatterns(' a+ \n\n\tb$\n')).toEqual(['a+', 'b$']);
  });

  it('round-trips a list', () => {
    expect(parsePatterns(formatPatterns(['x', 'y']))).toEqual(['x', 'y']);
  });
});

describe('dictionary text', () => {
  it('splits each line at the first equals sign', () => {
    expect(parseDictionary('jing察=警察\na=b=c')).toEqual([
      { from: 'jing察', to: '警察' },
      { from: 'a', to: 'b=c' },
    ]);
  });

  it('skips lines without a source word', () => {
    expect(parseDictionary('无等号\n=空\n  \n x = y ')).toEqual([{ from: 'x', to: 'y' }]);
  });

  it('formats entries one per line', () => {
    expect(formatDictionary([{ from: 'a', to: 'b' }, { from: 'c', to: 'd' }])).toBe('a=b\nc=d');
  });
});

describe('invalidPatterns', () => {
  it('accepts the defaults', () => {
    expect(invalidPatterns(DEFAULT_SETTINGS)).toEqual([]);
  });

  it('lists heading and ad patterns that do not compile', () => {
    const settings = { ...DEFAULT_SETTINGS, heading: { ...DEFAULT_SETTINGS.heading, chapter: '第(' }, adPatterns: ['ok', '[x'] };
    expect(invalidPatterns(settings)).toEqual(['第(', '[x']);
  });
});
