const BRACKETED_NAME = /^《(.+?)》.*?(?:作者\s*[：:]\s*(.*?))?\s*$/;
const KNOWN_EXTENSION = /\.(txt|epub)$/i;

export function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}

export function parseFileName(name: string): { title: string; author: string } {
  const baseName = name.replace(KNOWN_EXTENSION, '');
  const match = BRACKETED_NAME.exec(baseName);
  if (!match) return { title: baseName, author: '' };
  return { title: match[1], author: match[2] ?? '' };
}
