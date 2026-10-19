import type { EditorController } from '../controller';
import { button, h } from '../dom';
import { createFileInput } from '../fileInput';

export class HeaderView {
  readonly element: HTMLElement;
  private readonly titleInput = metaInput({ label: '书名', placeholder: '未命名' });
  private readonly authorInput = metaInput({ label: '作者', placeholder: '佚名' });
  private readonly fileInput = createFileInput((file) => this.controller.open(file));
  private readonly openButton = button({ label: '打开文件', onClick: () => this.fileInput.click() });
  private readonly settingsButton = button({ label: '设置', onClick: () => this.controller.openSettings() });
  private readonly exportButton = button({ label: '导出 EPUB', variant: 'primary', onClick: () => this.controller.exportEpub() });
  private isBusy = false;

  constructor(private readonly controller: EditorController) {
    this.titleInput.addEventListener('input', () => this.commitMeta());
    this.authorInput.addEventListener('input', () => this.commitMeta());
    this.element = h('header', {
      className: 'app-header',
      children: [h('h1', { className: 'brand', text: 'Txt2Epub' }), this.openControls(), this.metaFields(), this.actions()],
    });
  }

  render(): void {
    const meta = this.controller.state.book?.meta;
    syncValue(this.titleInput, meta?.title ?? '');
    syncValue(this.authorInput, meta?.author ?? '');
    this.titleInput.disabled = !meta;
    this.authorInput.disabled = !meta;
    this.openButton.disabled = this.isBusy;
    this.settingsButton.disabled = this.isBusy;
    this.exportButton.disabled = this.isBusy || !this.controller.state.book?.lines.length;
  }

  setBusy(isBusy: boolean): void {
    this.isBusy = isBusy;
    this.render();
  }

  private commitMeta(): void {
    this.controller.setMeta({ title: this.titleInput.value, author: this.authorInput.value });
  }

  private openControls(): HTMLElement {
    return h('span', { className: 'header-open', children: [this.openButton, this.fileInput] });
  }

  private metaFields(): HTMLElement {
    return h('div', { className: 'header-meta', children: [labeled('书名', this.titleInput), labeled('作者', this.authorInput)] });
  }

  private actions(): HTMLElement {
    return h('div', { className: 'header-actions', children: [this.settingsButton, this.exportButton] });
  }
}

type MetaInputOptions = { label: string; placeholder: string };

function metaInput(options: MetaInputOptions): HTMLInputElement {
  return h('input', {
    className: 'input',
    attrs: { type: 'text', placeholder: options.placeholder, 'aria-label': options.label, disabled: true },
  });
}

function labeled(label: string, input: HTMLInputElement): HTMLElement {
  return h('label', { className: 'meta-field', children: [h('span', { className: 'meta-label', text: label }), input] });
}

function syncValue(input: HTMLInputElement, value: string): void {
  if (input.value !== value) input.value = value;
}
