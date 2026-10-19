import JSZip from 'jszip';
import {
  CONTAINER_XML,
  STYLE_CSS,
  coverFileName,
  navXhtml,
  ncxXml,
  opfXml,
  sectionFileName,
  sectionXhtml,
  type EpubPlan,
} from './epubTemplates';
import { buildSections, buildToc, sectionParagraphs } from './sections';
import type { Book, CoverImage } from './types';

type EpubEntry = { path: string; content: string | Uint8Array };

const MIMETYPE = 'application/epub+zip';
const UNTITLED = '未命名';

export function writeEpub(book: Book): Promise<Uint8Array> {
  return zipEpub(buildPlan(book));
}

function buildPlan(book: Book): EpubPlan {
  const sections = buildSections(book.lines);
  return {
    meta: { ...book.meta, title: book.meta.title.trim() || UNTITLED },
    pages: sections.map((section) => ({ section, paragraphs: sectionParagraphs(book.lines, section) })),
    toc: buildToc(sections),
    uuid: crypto.randomUUID(),
    modified: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
}

function zipEpub(plan: EpubPlan): Promise<Uint8Array> {
  const zip = new JSZip();
  // EPUB OCF requires mimetype to be the first entry and stored uncompressed.
  zip.file('mimetype', MIMETYPE, { compression: 'STORE' });
  epubEntries(plan).forEach((entry) => zip.file(entry.path, entry.content));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

function epubEntries(plan: EpubPlan): EpubEntry[] {
  return [
    { path: 'META-INF/container.xml', content: CONTAINER_XML },
    { path: 'OEBPS/content.opf', content: opfXml(plan) },
    { path: 'OEBPS/nav.xhtml', content: navXhtml(plan) },
    { path: 'OEBPS/toc.ncx', content: ncxXml(plan) },
    { path: 'OEBPS/style.css', content: STYLE_CSS },
    ...sectionEntries(plan),
    ...coverEntries(plan.meta.cover),
  ];
}

function sectionEntries(plan: EpubPlan): EpubEntry[] {
  return plan.pages.map((page, index) => ({
    path: `OEBPS/${sectionFileName(index)}`,
    content: sectionXhtml(page),
  }));
}

function coverEntries(cover: CoverImage | undefined): EpubEntry[] {
  return cover ? [{ path: `OEBPS/${coverFileName(cover)}`, content: cover.data }] : [];
}
