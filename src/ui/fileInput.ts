import { h } from './dom';

export type FileHandler = (file: File) => void;

export const ACCEPTED_EXTENSIONS = '.txt,.epub';

export function createFileInput(onFile: FileHandler): HTMLInputElement {
  const input = h('input', { className: 'visually-hidden', attrs: { type: 'file', accept: ACCEPTED_EXTENSIONS, tabindex: -1 } });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (file) onFile(file);
  });
  return input;
}

export function bindFileDrop(target: HTMLElement, onFile: FileHandler): void {
  // dragenter/dragleave also fire when crossing child elements; counting them keeps the highlight steady.
  let dragDepth = 0;
  const setDragDepth = (depth: number) => {
    dragDepth = Math.max(0, depth);
    target.classList.toggle('is-dragging', dragDepth > 0);
  };
  target.addEventListener('dragenter', () => setDragDepth(dragDepth + 1));
  target.addEventListener('dragleave', () => setDragDepth(dragDepth - 1));
  target.addEventListener('dragover', (event) => event.preventDefault());
  target.addEventListener('drop', (event) => {
    event.preventDefault();
    setDragDepth(0);
    const file = event.dataTransfer?.files[0];
    if (file) onFile(file);
  });
}
