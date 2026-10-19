import JSZip from 'jszip';
import { decodeText } from './decode';
import { COVER_EXTENSIONS } from './epubTemplates';
import { splitLines } from './text';
import type { BookMeta, CoverImage, SourceDoc } from './types';

export class EpubFormatError extends Error {
  override name = 'EpubFormatError';
}

type ManifestItem = { id: string; path: string; mediaType: string; properties: string[] };
type Manifest = Map<string, ManifestItem>;
type Package = { opf: Document; manifest: Manifest };

const CONTAINER_PATH = 'META-INF/container.xml';
const CONTENT_MEDIA_TYPES = new Set(['application/xhtml+xml', 'text/html']);
const MEDIA_TYPE_ALIASES: Record<string, string> = { 'image/jpg': 'image/jpeg' };
const BLOCK_SELECTOR = [
  'p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre',
  'section, article, header, footer, aside, main, figure, figcaption',
  'table, tr, td, th, caption, dl, dt, dd, ul, ol, hr',
].join(', ');

export async function readEpub(bytes: Uint8Array): Promise<SourceDoc> {
  const zip = await loadZip(bytes);
  const pkg = await readPackage(zip);
  const rawLines = await readSpineLines(zip, spinePaths(pkg));
  return { meta: await readMeta(zip, pkg), rawLines };
}

function loadZip(bytes: Uint8Array): Promise<JSZip> {
  return JSZip.loadAsync(bytes).catch(() => {
    throw new EpubFormatError('不是有效的 EPUB（ZIP）文件');
  });
}

async function readPackage(zip: JSZip): Promise<Package> {
  const opfPath = await readRootfilePath(zip);
  const opf = parseXml(await readZipText(zip, opfPath));
  return { opf, manifest: readManifest(opf, directoryOf(opfPath)) };
}

async function readRootfilePath(zip: JSZip): Promise<string> {
  const container = parseXml(await readZipText(zip, CONTAINER_PATH));
  const fullPath = elementsByName(container, 'rootfile')[0]?.getAttribute('full-path');
  if (!fullPath) throw new EpubFormatError(`${CONTAINER_PATH} 未声明 rootfile`);
  return fullPath;
}

async function readZipText(zip: JSZip, path: string): Promise<string> {
  const entry = zip.file(path);
  if (!entry) throw new EpubFormatError(`缺少 ${path}`);
  return decodeText(await entry.async('uint8array'));
}

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const isMalformed = doc.getElementsByTagName('parsererror').length > 0;
  if (isMalformed) throw new EpubFormatError('OPF 或 container.xml 不是合法 XML');
  return doc;
}

function elementsByName(root: Document, localName: string): Element[] {
  // Matches by localName so opf:-prefixed and unprefixed packages read alike; happy-dom's
  // getElementsByTagNameNS returns nothing, so the wildcard-namespace query cannot be used.
  return [...root.getElementsByTagName('*')].filter((element) => element.localName === localName);
}

function readManifest(opf: Document, baseDirectory: string): Manifest {
  const items = elementsByName(opf, 'item').map((element) => ({
    id: element.getAttribute('id') ?? '',
    path: resolvePath(baseDirectory, element.getAttribute('href') ?? ''),
    mediaType: normalizeMediaType(element.getAttribute('media-type') ?? ''),
    properties: (element.getAttribute('properties') ?? '').split(/\s+/),
  }));
  return new Map(items.map((item) => [item.id, item]));
}

function normalizeMediaType(mediaType: string): string {
  return MEDIA_TYPE_ALIASES[mediaType] ?? mediaType;
}

function directoryOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/') + 1);
}

function resolvePath(baseDirectory: string, href: string): string {
  const relativePath = decodeUriSafely(href.split('#')[0]);
  return `${baseDirectory}${relativePath}`.split('/').reduce(appendPathSegment, []).join('/');
}

function appendPathSegment(resolved: string[], segment: string): string[] {
  if (segment === '..') return resolved.slice(0, -1);
  if (segment === '.' || segment === '') return resolved;
  return [...resolved, segment];
}

function decodeUriSafely(href: string): string {
  // decodeURIComponent signals a stray '%' only by throwing; such hrefs are used verbatim.
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

function spinePaths(pkg: Package): string[] {
  const paths = elementsByName(pkg.opf, 'itemref')
    .map((itemref) => spineItem(pkg.manifest, itemref.getAttribute('idref') ?? ''))
    .filter(isReadableContent)
    .map((item) => item.path);
  if (paths.length === 0) throw new EpubFormatError('EPUB 未包含可读取的正文（spine）');
  return paths;
}

function spineItem(manifest: Manifest, id: string): ManifestItem {
  const item = manifest.get(id);
  if (!item) throw new EpubFormatError(`spine 引用了不存在的 manifest 项：${id}`);
  return item;
}

function isReadableContent(item: ManifestItem): boolean {
  return CONTENT_MEDIA_TYPES.has(item.mediaType) && !item.properties.includes('nav');
}

async function readSpineLines(zip: JSZip, paths: string[]): Promise<string[]> {
  const documents = await Promise.all(paths.map((path) => readZipText(zip, path)));
  return documents.flatMap(contentLines);
}

function contentLines(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style').forEach((element) => element.remove());
  doc.querySelectorAll('br').forEach((br) => br.replaceWith(doc.createTextNode('\n')));
  doc.body.querySelectorAll(BLOCK_SELECTOR).forEach(separateBlock);
  return splitLines(doc.body.textContent ?? '').filter((line) => line.trim());
}

function separateBlock(block: Element): void {
  block.before(block.ownerDocument.createTextNode('\n'));
  block.after(block.ownerDocument.createTextNode('\n'));
}

async function readMeta(zip: JSZip, pkg: Package): Promise<BookMeta> {
  return {
    title: firstText(pkg.opf, 'title'),
    author: firstText(pkg.opf, 'creator'),
    cover: await readCover(zip, findCoverItem(pkg)),
  };
}

function firstText(opf: Document, localName: string): string {
  return elementsByName(opf, localName)[0]?.textContent?.trim() ?? '';
}

function findCoverItem(pkg: Package): ManifestItem | undefined {
  const images = [...pkg.manifest.values()].filter((item) => Object.hasOwn(COVER_EXTENSIONS, item.mediaType));
  const coverId = legacyCoverId(pkg.opf);
  return images.find((item) => item.properties.includes('cover-image')) ?? images.find((item) => item.id === coverId);
}

function legacyCoverId(opf: Document): string | null | undefined {
  const coverMeta = elementsByName(opf, 'meta').find((meta) => meta.getAttribute('name') === 'cover');
  return coverMeta?.getAttribute('content');
}

async function readCover(zip: JSZip, item: ManifestItem | undefined): Promise<CoverImage | undefined> {
  const entry = item && zip.file(item.path);
  if (!item || !entry) return undefined;
  return { data: await entry.async('uint8array'), mediaType: item.mediaType };
}
