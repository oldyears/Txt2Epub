import { readEpub } from '../core/epubReader';
import { readTxt } from '../core/txtReader';
import type { SourceDoc } from '../core/types';

export type SourceReader = (file: File) => Promise<SourceDoc>;

export function sourceReaderFor(fileName: string): SourceReader | null {
  const extension = fileName.toLowerCase().split('.').pop();
  if (extension === 'epub') return readEpubFile;
  if (extension === 'txt') return readTxtFile;
  return null;
}

async function readEpubFile(file: File): Promise<SourceDoc> {
  return readEpub(await fileBytes(file));
}

async function readTxtFile(file: File): Promise<SourceDoc> {
  return readTxt({ name: file.name, bytes: await fileBytes(file) });
}

async function fileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}
