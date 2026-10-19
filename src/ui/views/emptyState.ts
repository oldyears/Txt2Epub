import { h } from '../dom';
import { createFileInput, type FileHandler } from '../fileInput';

export function createEmptyState(onFile: FileHandler): HTMLElement {
  return h('section', {
    className: 'empty-state',
    children: [
      createDropZone(onFile),
      h('p', { className: 'privacy-note', text: '文件只在本机处理，不会上传到任何服务器。' }),
    ],
  });
}

function createDropZone(onFile: FileHandler): HTMLElement {
  return h('label', {
    className: 'drop-zone',
    children: [
      h('span', { className: 'drop-zone-icon', text: '📖', attrs: { 'aria-hidden': 'true' } }),
      h('strong', { className: 'drop-zone-title', text: '拖入或选择 txt / epub 文件' }),
      h('span', { className: 'drop-zone-hint', text: '自动识别卷章目录、清理广告、恢复和谐词，导出适合微信读书的 EPUB' }),
      h('span', { className: 'button button-primary', text: '选择文件' }),
      createFileInput(onFile),
    ],
  });
}
