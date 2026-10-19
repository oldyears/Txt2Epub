import { describe, expect, it } from 'vitest';
import { parseJsonOrNull } from '../../src/core/json';

describe('parseJsonOrNull', () => {
  it('parses valid json', () => {
    expect(parseJsonOrNull('{"a":[1]}')).toEqual({ a: [1] });
  });

  it('returns null for invalid json', () => {
    expect(parseJsonOrNull('{oops')).toBeNull();
  });
});
