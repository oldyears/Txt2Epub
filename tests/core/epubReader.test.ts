import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { EpubFormatError, readEpub } from '../../src/core/epubReader';
import { writeEpub } from '../../src/core/epubWriter';
import type { Book, Line } from '../../src/core/types';

const body = (text: string): Line => ({ text, kind: 'body' });
const chapter = (text: string): Line => ({ text, kind: 'chapter' });
const volume = (text: string): Line => ({ text, kind: 'volume' });

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OPS/package/book.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const PREFIXED_OPF = `<?xml version="1.0" encoding="UTF-8"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0">
<opf:metadata>
<dc:title>手工书</dc:title>
<dc:creator>佚名</dc:creator>
<opf:meta name="cover" content="img1"/>
</opf:metadata>
<opf:manifest>
<opf:item id="c1" href="../Text/chapter%201.xhtml" media-type="application/xhtml+xml"/>
<opf:item id="c2" href="./../Text/c2.html" media-type="text/html"/>
<opf:item id="img1" href="../Images/cover.jpg" media-type="image/jpeg"/>
</opf:manifest>
<opf:spine><opf:itemref idref="c1"/><opf:itemref idref="img1"/><opf:itemref idref="c2"/></opf:spine>
</opf:package>`;

const CHAPTER_ONE = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title><style>p{}</style></head>
<body><div>第一行<br/>第二行</div><div><p>段落一</p><p>段落二</p></div><script>bad()</script></body></html>`;

const CHAPTER_TWO = '<html><body>裸文本<br>换行</body></html>';

async function zipBytes(files: Record<string, string | Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip();
  Object.entries(files).forEach(([path, content]) => zip.file(path, content));
  return zip.generateAsync({ type: 'uint8array' });
}

const handBuiltFiles = {
  'META-INF/container.xml': CONTAINER,
  'OPS/package/book.opf': PREFIXED_OPF,
  'OPS/Text/chapter 1.xhtml': CHAPTER_ONE,
  'OPS/Text/c2.html': CHAPTER_TWO,
  'OPS/Images/cover.jpg': PNG_BYTES,
};

describe('readEpub', () => {
  it('round-trips a written book', async () => {
    const lines = [volume('第一卷'), chapter('第一章 <&>'), body('正文 a < b & "c"'), body('第二段'), chapter('第二章')];
    const book: Book = { meta: { title: '书<名>', author: '某&某', cover: { data: PNG_BYTES, mediaType: 'image/png' } }, lines };
    const source = await readEpub(await writeEpub(book));
    expect(source.rawLines).toEqual(lines.map((line) => line.text));
    expect(source.meta).toEqual(book.meta);
  });

  it('reads a hand-built epub with prefixed opf and lenient html', async () => {
    const source = await readEpub(await zipBytes(handBuiltFiles));
    expect(source.rawLines).toEqual(['第一行', '第二行', '段落一', '段落二', '裸文本', '换行']);
    expect(source.meta).toEqual({ title: '手工书', author: '佚名', cover: { data: PNG_BYTES, mediaType: 'image/jpeg' } });
  });

  it.each([
    ['裸文本与段落混排', '开头<p>中间</p>结尾', ['开头', '中间', '结尾']],
    ['容器内混排', '<div>段首<p>中间</p>段尾</div>', ['段首', '中间', '段尾']],
    ['嵌套引用和列表', '<blockquote>引言<p>段落</p>结语</blockquote><ul><li>项目一</li><li>项目二</li></ul>', ['引言', '段落', '结语', '项目一', '项目二']],
    ['表格正文', '<h1>第一章</h1><table><tr><td>甲</td><td>乙</td></tr></table>', ['第一章', '甲', '乙']],
    ['行内标记和换行', '<p>他<em>轻声</em>说<br/>你好。</p>', ['他轻声说', '你好。']],
  ])('preserves all text in reading order: %s', async (_, content, expected) => {
    const files = { ...handBuiltFiles, 'OPS/Text/chapter 1.xhtml': `<html><body>${content}</body></html>`, 'OPS/Text/c2.html': '' };
    const source = await readEpub(await zipBytes(files));
    expect(source.rawLines.filter((line) => line.trim())).toEqual(expected);
  });

  it('rejects an archive without container.xml', async () => {
    const bytes = await zipBytes({ 'OPS/package/book.opf': PREFIXED_OPF });
    await expect(readEpub(bytes)).rejects.toThrow(new EpubFormatError('缺少 META-INF/container.xml'));
    await expect(readEpub(bytes)).rejects.toBeInstanceOf(EpubFormatError);
  });

  it('rejects a spine item whose file is missing', async () => {
    const { 'OPS/Text/c2.html': _missing, ...files } = handBuiltFiles;
    await expect(readEpub(await zipBytes(files))).rejects.toThrow('OPS/Text/c2.html');
  });

  it('rejects missing manifest references instead of silently dropping chapters', async () => {
    const opf = PREFIXED_OPF.replace('<opf:itemref idref="c1"/>', '<opf:itemref idref="missing"/>');
    const files = { ...handBuiltFiles, 'OPS/package/book.opf': opf };
    await expect(readEpub(await zipBytes(files))).rejects.toThrow(EpubFormatError);
    await expect(readEpub(await zipBytes(files))).rejects.toThrow('missing');
  });

  it('rejects packages without readable spine content', async () => {
    const files = minimalEpub({ items: [], files: {} });
    await expect(readEpub(await zipBytes(files))).rejects.toThrow(EpubFormatError);
  });

  it('rejects bytes that are not a zip archive', async () => {
    await expect(readEpub(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(EpubFormatError);
  });

  it('resolves ../ and %20 hrefs relative to the opf directory', async () => {
    const source = await readEpub(await zipBytes(minimalEpub({
      items: ['<item id="c1" href="../Text/chapter%201.xhtml" media-type="application/xhtml+xml"/>'],
      files: { 'OPS/Text/chapter 1.xhtml': '<html><body><p>找到了</p></body></html>' },
    })));
    expect(source.rawLines).toEqual(['找到了']);
  });

  it('skips the nav document when it is listed in the spine', async () => {
    const source = await readEpub(await zipBytes(minimalEpub({
      items: [
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        '<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>',
      ],
      files: { 'OPS/package/nav.xhtml': NAV_PAGE, 'OPS/package/c1.xhtml': '<html><body><p>正文</p></body></html>' },
    })));
    expect(source.rawLines).toEqual(['正文']);
  });

  it('decodes GBK content documents', async () => {
    const source = await readEpub(await zipBytes(minimalEpub({
      items: ['<item id="c1" href="c1.html" media-type="text/html"/>'],
      files: { 'OPS/package/c1.html': GBK_PARAGRAPH_PAGE },
    })));
    expect(source.rawLines).toEqual(['第一章']);
  });

  it('normalizes the image/jpg cover media type', async () => {
    const source = await readEpub(await zipBytes(coverEpub('image/jpg')));
    expect(source.meta.cover).toEqual({ data: PNG_BYTES, mediaType: 'image/jpeg' });
  });

  it('drops covers of unsupported media types', async () => {
    const source = await readEpub(await zipBytes(coverEpub('image/bmp')));
    expect(source.meta.cover).toBeUndefined();
  });
});

type MinimalEpub = { items: string[]; files: Record<string, string | Uint8Array> };

const NAV_PAGE = '<html><body><nav epub:type="toc"><ol><li><a href="c1.xhtml">目录项</a></li></ol></nav></body></html>';

const GBK_PARAGRAPH_PAGE = new Uint8Array([
  ...new TextEncoder().encode('<html><body><p>'),
  0xb5, 0xda, 0xd2, 0xbb, 0xd5, 0xc2,
  ...new TextEncoder().encode('</p></body></html>'),
]);

function minimalEpub(epub: MinimalEpub): Record<string, string | Uint8Array> {
  const spine = epub.items.map((item) => `<itemref idref="${/id="([^"]+)"/.exec(item)![1]}"/>`).join('');
  const opf = `<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>T</dc:title></metadata>
<manifest>${epub.items.join('')}</manifest><spine>${spine}</spine></package>`;
  return { 'META-INF/container.xml': CONTAINER, 'OPS/package/book.opf': opf, ...epub.files };
}

function coverEpub(mediaType: string): Record<string, string | Uint8Array> {
  return minimalEpub({
    items: [
      '<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>',
      `<item id="img" href="cover.bin" media-type="${mediaType}" properties="cover-image"/>`,
    ],
    files: { 'OPS/package/c1.xhtml': '<html><body><p>正文</p></body></html>', 'OPS/package/cover.bin': PNG_BYTES },
  });
}
