import { describe, expect, it } from 'vitest';
import { applyFixes, createDictionaryApplier, findCensorHits, hitContext } from '../../src/core/censor';
import type { CensorHit, Line } from '../../src/core/types';

const body = (text: string): Line => ({ text, kind: 'body' });

describe('createDictionaryApplier', () => {
  it('replaces literally and case-insensitively', () => {
    const apply = createDictionaryApplier([{ from: 'jing察', to: '警察' }]);
    expect(apply('JING察来了，jing察走了')).toBe('警察来了，警察走了');
  });

  it('treats regex metacharacters literally', () => {
    const apply = createDictionaryApplier([{ from: 'a.b', to: 'X' }]);
    expect(apply('a.b acb')).toBe('X acb');
  });

  it('keeps $ in replacements literal', () => {
    const apply = createDictionaryApplier([{ from: 'x', to: '$&$1' }]);
    expect(apply('x')).toBe('$&$1');
  });

  it('applies entries in order', () => {
    const apply = createDictionaryApplier([
      { from: 'ab', to: 'c' },
      { from: 'c', to: 'd' },
    ]);
    expect(apply('ab')).toBe('d');
  });

  it('ignores entries with empty from', () => {
    const apply = createDictionaryApplier([{ from: '', to: 'X' }]);
    expect(apply('原文')).toBe('原文');
  });
});

describe('findCensorHits', () => {
  it('finds a single asterisk between Han characters', () => {
    expect(findCensorHits([body('习*平')])).toEqual([{ lineIndex: 0, start: 1, end: 2, raw: '*' }]);
  });

  it('finds a run of asterisks', () => {
    expect(findCensorHits([body('他**了')])).toEqual([{ lineIndex: 0, start: 1, end: 3, raw: '**' }]);
  });

  it('finds full-width asterisks and crosses', () => {
    expect(findCensorHits([body('他＊＊了'), body('他××了')]).map((hit) => hit.raw)).toEqual(['＊＊', '××']);
  });

  it('does not treat 口 as a censor box', () => {
    expect(findCensorHits([body('口口声声')])).toEqual([]);
  });

  it('ignores a single asterisk without Han neighbours', () => {
    expect(findCensorHits([body('a*b')])).toEqual([]);
  });

  it('ignores a lone multiplication sign', () => {
    expect(findCensorHits([body('3×4')])).toEqual([]);
  });

  it('finds box runs', () => {
    expect(findCensorHits([body('他□□了')])).toEqual([{ lineIndex: 0, start: 1, end: 3, raw: '□□' }]);
  });

  it('scans headings and reports every line index', () => {
    const lines: Line[] = [{ text: '第一章 □□', kind: 'chapter' }, body('无'), body('甲**乙■丙')];
    expect(findCensorHits(lines).map((hit) => [hit.lineIndex, hit.raw])).toEqual([
      [0, '□□'],
      [2, '**'],
      [2, '■'],
    ]);
  });
});

describe('applyFixes', () => {
  it('applies multiple fixes on one line', () => {
    const lines = [body('他**了，又□□了')];
    const hits = findCensorHits(lines);
    const result = applyFixes(lines, [
      { hit: hits[0], replacement: '死' },
      { hit: hits[1], replacement: '跑掉' },
    ]);
    expect(result[0].text).toBe('他死了，又跑掉了');
  });

  it('ignores a stale hit whose raw no longer matches the text', () => {
    const stale: CensorHit = { lineIndex: 0, start: 1, end: 3, raw: '**' };
    expect(applyFixes([body('他死了')], [{ hit: stale, replacement: '活' }])[0].text).toBe('他死了');
  });

  it('applies the same hit only once', () => {
    const lines = [body('他**了')];
    const fix = { hit: findCensorHits(lines)[0], replacement: '死' };
    expect(applyFixes(lines, [fix, fix])[0].text).toBe('他死了');
  });

  it('keeps untouched lines by identity and does not mutate input', () => {
    const lines = [body('甲'), body('他**了')];
    const result = applyFixes(lines, [{ hit: findCensorHits(lines)[0], replacement: '死' }]);
    expect(result[0]).toBe(lines[0]);
    expect(result[1]).toEqual(body('他死了'));
    expect(lines[1].text).toBe('他**了');
  });
});

describe('hitContext', () => {
  const hitAt = (lineIndex: number, text: string, raw: string): CensorHit => {
    const start = text.indexOf(raw);
    return { lineIndex, start, end: start + raw.length, raw };
  };

  it('includes previous and next lines', () => {
    const lines = [body('前一行'), body('他**了'), body('后一行')];
    expect(hitContext(lines, hitAt(1, '他**了', '**'))).toBe('前一行\n他【**】了\n后一行');
  });

  it('omits missing neighbours at file start and end', () => {
    const lines = [body('他**了')];
    expect(hitContext(lines, hitAt(0, '他**了', '**'))).toBe('他【**】了');
  });

  it('truncates long neighbours and the current line', () => {
    const long = '长'.repeat(100);
    const current = `${'左'.repeat(100)}**${'右'.repeat(100)}`;
    const lines = [body(`头${long}`), body(current), body(`${long}尾`)];
    const [prev, mid, next] = hitContext(lines, hitAt(1, current, '**')).split('\n');
    expect(prev).toBe('长'.repeat(60));
    expect(mid).toBe(`${'左'.repeat(90)}【**】${'右'.repeat(90)}`);
    expect(next).toBe('长'.repeat(60));
  });
});
