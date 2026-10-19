import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { writeEpub } from '../../src/core/epubWriter';
import type { Book, Line } from '../../src/core/types';

const body = (text: string): Line => ({ text, kind: 'body' });
const chapter = (text: string): Line => ({ text, kind: 'chapter' });
const volume = (text: string): Line => ({ text, kind: 'volume' });

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const sampleBook: Book = {
  meta: { title: '书<&>名', author: '某某' },
  lines: [body('简介'), volume('第一卷'), chapter('第一章 开始'), body('正文 <a> & "b"'), chapter('第二章')],
};

const latin1 = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

async function unzip(book: Book) {
  const bytes = await writeEpub(book);
  return { bytes, zip: await JSZip.loadAsync(bytes) };
}

async function readEntry(zip: JSZip, path: string): Promise<string> {
  const entry = zip.file(path);
  expect(entry, path).not.toBeNull();
  return entry!.async('string');
}

function parseXhtml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xhtml+xml');
}

describe('writeEpub', () => {
  it('stores mimetype uncompressed as the first entry', async () => {
    const { bytes } = await unzip(sampleBook);
    expect(bytes[8] | (bytes[9] << 8)).toBe(0);
    expect(latin1(bytes, 30, 8)).toBe('mimetype');
    expect(latin1(bytes, 38, 20)).toBe('application/epub+zip');
  });

  it('writes one xhtml file per section', async () => {
    const { zip } = await unzip(sampleBook);
    const sectionFiles = zip.file(/^OEBPS\/text\/s\d{4}\.xhtml$/);
    expect(sectionFiles.map((file) => file.name).sort()).toEqual([
      'OEBPS/text/s0001.xhtml',
      'OEBPS/text/s0002.xhtml',
      'OEBPS/text/s0003.xhtml',
      'OEBPS/text/s0004.xhtml',
    ]);
  });

  it('nests chapter entries inside the volume entry in nav', async () => {
    const { zip } = await unzip(sampleBook);
    const nav = parseXhtml(await readEntry(zip, 'OEBPS/nav.xhtml'));
    const nested = nav.querySelectorAll('li li a');
    expect([...nested].map((link) => link.textContent)).toEqual(['第一章 开始', '第二章']);
    expect(nested[0].getAttribute('href')).toBe('text/s0003.xhtml');
  });

  it('numbers ncx navPoints by section order', async () => {
    const { zip } = await unzip(sampleBook);
    const ncx = new DOMParser().parseFromString(await readEntry(zip, 'OEBPS/toc.ncx'), 'application/xml');
    const points = [...ncx.getElementsByTagName('navPoint')];
    expect(points.map((point) => point.getAttribute('playOrder'))).toEqual(['1', '2', '3', '4']);
    expect(points.map((point) => point.getAttribute('id'))).toEqual(['np1', 'np2', 'np3', 'np4']);
  });

  it('escapes special characters and produces well-formed xhtml', async () => {
    const { zip } = await unzip(sampleBook);
    const opf = await readEntry(zip, 'OEBPS/content.opf');
    expect(opf).toContain('<dc:title>书&lt;&amp;&gt;名</dc:title>');
    const chapterDoc = parseXhtml(await readEntry(zip, 'OEBPS/text/s0003.xhtml'));
    expect(chapterDoc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(chapterDoc.getElementsByTagName('p')[0].textContent).toBe('正文 <a> & "b"');
  });

  it('includes the cover as manifest item and file', async () => {
    const book: Book = { ...sampleBook, meta: { ...sampleBook.meta, cover: { data: PNG_BYTES, mediaType: 'image/png' } } };
    const { zip } = await unzip(book);
    const opf = await readEntry(zip, 'OEBPS/content.opf');
    expect(opf).toContain('<item id="cover-image" href="cover.png" media-type="image/png" properties="cover-image"/>');
    expect(opf).toContain('<meta name="cover" content="cover-image"/>');
    expect(await zip.file('OEBPS/cover.png')!.async('uint8array')).toEqual(PNG_BYTES);
  });

  it('omits creator when author is empty', async () => {
    const { zip } = await unzip({ ...sampleBook, meta: { title: '书', author: '' } });
    expect(await readEntry(zip, 'OEBPS/content.opf')).not.toContain('dc:creator');
  });

  it('substitutes a placeholder for a blank title', async () => {
    const { zip } = await unzip({ ...sampleBook, meta: { title: '  ', author: '' } });
    expect(await readEntry(zip, 'OEBPS/content.opf')).toContain('<dc:title>未命名</dc:title>');
    expect(await readEntry(zip, 'OEBPS/toc.ncx')).toContain('<docTitle><text>未命名</text></docTitle>');
  });

  it('names an svg cover with the svg extension', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const book: Book = { ...sampleBook, meta: { ...sampleBook.meta, cover: { data: svg, mediaType: 'image/svg+xml' } } };
    const { zip } = await unzip(book);
    expect(zip.file('OEBPS/cover.svg')).not.toBeNull();
  });
});
