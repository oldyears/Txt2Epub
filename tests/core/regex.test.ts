import { describe, expect, it } from 'vitest';
import { escapeRegExp, safeRegExp } from '../../src/core/regex';

describe('safeRegExp', () => {
  it('builds a valid regex', () => {
    const regex = safeRegExp('^第.+章$', 'u');
    expect(regex?.test('第一章')).toBe(true);
  });

  it('returns null for invalid syntax', () => {
    expect(safeRegExp('([', 'u')).toBeNull();
  });
});

describe('escapeRegExp', () => {
  it('makes special characters literal', () => {
    const regex = new RegExp(`^${escapeRegExp('a.b*')}$`);
    expect(regex.test('a.b*')).toBe(true);
    expect(regex.test('axbbb')).toBe(false);
  });
});
