export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function safeRegExp(source: string, flags: string): RegExp | null {
  // RegExp signals invalid user-supplied syntax only by throwing.
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}
