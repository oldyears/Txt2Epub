import { DEFAULT_HEADING_RULES } from './headingRules';
import type { DictEntry, Settings } from './types';

const DEFAULT_AD_PATTERNS = [
  '本章未完.{0,10}点击下一页.{0,6}',
  '请记住本书首发域名[^。]*。?',
  '手机版阅读网址[:：]\\S*',
  '(https?://)?(www|m)\\.[a-z0-9-]+\\.(com|net|org|cc|la|info|me|co)',
  '最新章节.{0,10}(访问|搜索)[^。]*。?',
  '^目\\s*录$',
];

const DEFAULT_DICTIONARY: DictEntry[] = Object.entries({
  jing察: '警察',
  zheng府: '政府',
  zheng治: '政治',
  guo家: '国家',
  dang员: '党员',
  ge命: '革命',
  du品: '毒品',
  xi毒: '吸毒',
  xing爱: '性爱',
  luo体: '裸体',
  sha人: '杀人',
  xue腥: '血腥',
  qiang支: '枪支',
  bao炸: '爆炸',
  zi杀: '自杀',
  min主: '民主',
  ya片: '鸦片',
  fu败: '腐败',
  shou贿: '受贿',
  jun队: '军队',
  se情: '色情',
}).map(([from, to]) => ({ from, to }));

export const DEFAULT_SETTINGS: Settings = {
  heading: DEFAULT_HEADING_RULES,
  adPatterns: DEFAULT_AD_PATTERNS,
  dictionary: DEFAULT_DICTIONARY,
  llm: { apiKey: '', model: 'deepseek-flash' },
};
