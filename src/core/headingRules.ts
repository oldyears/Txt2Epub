import type { HeadingRules } from './types';

const NUMERAL = '[0-9０-９零〇一二两三四五六七八九十百千万]+';
// Ambiguous markers (节/回/话/部/…) need a boundary so prose like「第一回合」is not taken as a heading.
const BOUNDARY = `(?=$|[\\s：:·\\-—（(【、.．])`;
const SPECIAL_CHAPTER = '(序章|楔子|引子|序言|前言|尾声|后记|终章|完本感言|番外篇?)';

export const DEFAULT_HEADING_RULES: HeadingRules = {
  volume: `^(第${NUMERAL}卷|第${NUMERAL}[部集]${BOUNDARY}|卷${NUMERAL})`,
  chapter: `^(第${NUMERAL}章|第${NUMERAL}[节回话幕]${BOUNDARY}|${SPECIAL_CHAPTER}(?:${NUMERAL}|之|${BOUNDARY})|chapter\\s*\\d+)`,
  maxLength: 35,
};
