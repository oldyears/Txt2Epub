import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/core/defaults';
import type { Settings } from '../../src/core/types';
import { loadSettings, saveSettings } from '../../src/storage/settings';

const STORAGE_KEY = 'txt2epub.settings';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('settings storage', () => {
  it('returns defaults when nothing is saved', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips saved settings', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      adPatterns: ['广告'],
      llm: { apiKey: 'sk-1', model: 'deepseek-pro' },
    };
    expect(saveSettings(settings)).toBe(true);
    expect(loadSettings()).toEqual(settings);
  });

  it('falls back to defaults for corrupt json', () => {
    localStorage.setItem(STORAGE_KEY, '{oops');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it.each(['null', '42', '"text"', '[1,2]'])('falls back to defaults for non-object json %s', (saved) => {
    localStorage.setItem(STORAGE_KEY, saved);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('merges partial settings over defaults including llm', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ llm: { apiKey: 'k' } }));
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, llm: { apiKey: 'k', model: 'deepseek-flash' } });
  });

  it.each([
    ['adPatterns', { adPatterns: 'x' }],
    ['adPatterns', { adPatterns: ['ok', 1] }],
    ['heading', { heading: null }],
    ['heading', { heading: { volume: 1, chapter: [], maxLength: 'x' } }],
    ['dictionary', { dictionary: 'x' }],
    ['llm', { llm: { apiKey: 123, model: null } }],
  ])('falls back per field for an invalid %s', (_, saved) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it.each([0, -1, null])('rejects heading maxLength %s', (maxLength) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ heading: { maxLength } }));
    expect(loadSettings().heading.maxLength).toBe(DEFAULT_SETTINGS.heading.maxLength);
  });

  it('merges partial heading rules over defaults', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ heading: { volume: 'v' } }));
    expect(loadSettings().heading).toEqual({ ...DEFAULT_SETTINGS.heading, volume: 'v' });
  });

  it('keeps valid dictionary entries and drops invalid ones', () => {
    const dictionary = [{ from: 'a', to: 'b' }, { from: 'c' }, null, 'x', { from: 1, to: 'd' }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ dictionary }));
    expect(loadSettings().dictionary).toEqual([{ from: 'a', to: 'b' }]);
  });

  it('keeps a saved empty dictionary', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ dictionary: [] }));
    expect(loadSettings().dictionary).toEqual([]);
  });

  it('falls back to defaults when reading storage throws', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ llm: { apiKey: 'k' } }));
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('ignores storage write failures', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(saveSettings(DEFAULT_SETTINGS)).toBe(false);
  });
});
