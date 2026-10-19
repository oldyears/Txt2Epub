export type DownloadRequest = { bytes: Uint8Array; fileName: string };

const EPUB_MIME_TYPE = 'application/epub+zip';
const UNTITLED = '未命名';
const UNSAFE_FILE_NAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

export function epubFileName(title: string): string {
  const safeTitle = title.replace(UNSAFE_FILE_NAME_CHARS, '_').trim();
  return `${safeTitle || UNTITLED}.epub`;
}

export function downloadEpub(request: DownloadRequest): void {
  const url = URL.createObjectURL(new Blob([request.bytes as BlobPart], { type: EPUB_MIME_TYPE }));
  const link = document.createElement('a');
  link.href = url;
  link.download = request.fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers, so wait until it has started.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
