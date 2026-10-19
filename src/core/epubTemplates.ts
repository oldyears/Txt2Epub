import type { Section, TocNode } from './sections';
import type { BookMeta, CoverImage } from './types';

export type SectionPage = { section: Section; paragraphs: string[] };

export type EpubPlan = {
  meta: BookMeta;
  pages: SectionPage[];
  toc: TocNode[];
  uuid: string;
  modified: string;
};

type XhtmlPage = { title: string; stylesheetHref: string; body: string };

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
// XML 1.0 forbids these control characters; one stray byte would make the whole document unparseable.
const XML_FORBIDDEN_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
// Covers are limited to these EPUB core media types; any other type would make the package invalid.
export const COVER_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};
const BOOK_LANGUAGE = 'zh-CN';
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

export const CONTAINER_XML = `${XML_DECLARATION}
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>`;

export const STYLE_CSS = `body { margin: 0 5%; line-height: 1.8; }
p { text-indent: 2em; margin: .6em 0; }
h1 { text-align: center; margin-top: 40%; }
h2 { text-align: center; }
`;

export function escapeXml(text: string): string {
  return text.replace(XML_FORBIDDEN_CHARS, '').replace(/[&<>"']/g, (char) => XML_ESCAPES[char]);
}

export function sectionId(index: number): string {
  return `s${String(index + 1).padStart(4, '0')}`;
}

export function sectionFileName(index: number): string {
  return `text/${sectionId(index)}.xhtml`;
}

export function coverFileName(cover: CoverImage): string {
  return `cover.${COVER_EXTENSIONS[cover.mediaType]}`;
}

export function sectionXhtml(page: SectionPage): string {
  const headingTag = page.section.kind === 'volume' ? 'h1' : 'h2';
  const heading = `<${headingTag}>${escapeXml(page.section.title)}</${headingTag}>`;
  const paragraphs = page.paragraphs.map((text) => `<p>${escapeXml(text)}</p>`);
  return xhtmlDocument({
    title: page.section.title,
    stylesheetHref: '../style.css',
    body: [heading, ...paragraphs].join('\n'),
  });
}

function xhtmlDocument(page: XhtmlPage): string {
  return `${XML_DECLARATION}
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${BOOK_LANGUAGE}" lang="${BOOK_LANGUAGE}">
<head>
<meta charset="UTF-8"/>
<title>${escapeXml(page.title)}</title>
<link rel="stylesheet" type="text/css" href="${page.stylesheetHref}"/>
</head>
<body>
${page.body}
</body>
</html>`;
}

export function opfXml(plan: EpubPlan): string {
  return `${XML_DECLARATION}
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${BOOK_LANGUAGE}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
${opfMetadata(plan).join('\n')}
</metadata>
<manifest>
${opfManifest(plan).join('\n')}
</manifest>
<spine toc="ncx">
${plan.pages.map((_, index) => `<itemref idref="${sectionId(index)}"/>`).join('\n')}
</spine>
</package>`;
}

function opfMetadata(plan: EpubPlan): string[] {
  const { title, author, cover } = plan.meta;
  return [
    `<dc:identifier id="bookid">urn:uuid:${plan.uuid}</dc:identifier>`,
    `<dc:title>${escapeXml(title)}</dc:title>`,
    ...(author ? [`<dc:creator>${escapeXml(author)}</dc:creator>`] : []),
    `<dc:language>${BOOK_LANGUAGE}</dc:language>`,
    `<meta property="dcterms:modified">${plan.modified}</meta>`,
    // WeChat Read only recognises the EPUB2-style cover meta, not the EPUB3 cover-image property alone.
    ...(cover ? ['<meta name="cover" content="cover-image"/>'] : []),
  ];
}

function opfManifest(plan: EpubPlan): string[] {
  const cover = plan.meta.cover;
  return [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
    ...plan.pages.map(
      (_, index) => `<item id="${sectionId(index)}" href="${sectionFileName(index)}" media-type="application/xhtml+xml"/>`,
    ),
    ...(cover ? [coverManifestItem(cover)] : []),
  ];
}

function coverManifestItem(cover: CoverImage): string {
  const mediaType = escapeXml(cover.mediaType);
  return `<item id="cover-image" href="${coverFileName(cover)}" media-type="${mediaType}" properties="cover-image"/>`;
}

export function navXhtml(plan: EpubPlan): string {
  return xhtmlDocument({
    title: plan.meta.title,
    stylesheetHref: 'style.css',
    body: `<nav epub:type="toc" id="toc">\n<h1>目录</h1>\n${navList(plan.toc)}\n</nav>`,
  });
}

function navList(nodes: TocNode[]): string {
  return `<ol>\n${nodes.map(navItem).join('\n')}\n</ol>`;
}

function navItem(node: TocNode): string {
  // An empty <ol> is invalid in an EPUB nav document, so leaf entries must omit it.
  const children = node.children.length > 0 ? navList(node.children) : '';
  return `<li><a href="${sectionFileName(node.sectionIndex)}">${escapeXml(node.title)}</a>${children}</li>`;
}

export function ncxXml(plan: EpubPlan): string {
  return `${XML_DECLARATION}
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="${BOOK_LANGUAGE}">
<head>
<meta name="dtb:uid" content="urn:uuid:${plan.uuid}"/>
<meta name="dtb:depth" content="2"/>
<meta name="dtb:totalPageCount" content="0"/>
<meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>${escapeXml(plan.meta.title)}</text></docTitle>
<navMap>
${plan.toc.map(navPoint).join('\n')}
</navMap>
</ncx>`;
}

function navPoint(node: TocNode): string {
  const playOrder = node.sectionIndex + 1;
  return `<navPoint id="np${playOrder}" playOrder="${playOrder}">
<navLabel><text>${escapeXml(node.title)}</text></navLabel>
<content src="${sectionFileName(node.sectionIndex)}"/>
${node.children.map(navPoint).join('\n')}
</navPoint>`;
}
