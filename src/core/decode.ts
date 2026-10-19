export function decodeText(bytes: Uint8Array): string {
  const utf16Encoding = detectUtf16Bom(bytes);
  if (utf16Encoding) return new TextDecoder(utf16Encoding).decode(bytes);
  return decodeStrictUtf8(bytes) ?? new TextDecoder('gb18030').decode(bytes);
}

function detectUtf16Bom(bytes: Uint8Array): 'utf-16le' | 'utf-16be' | null {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  return null;
}

function decodeStrictUtf8(bytes: Uint8Array): string | null {
  // TextDecoder with fatal: true signals malformed input only by throwing.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
