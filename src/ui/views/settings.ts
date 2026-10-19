import { DEFAULT_SETTINGS } from '../../core/defaults';
import type { Settings } from '../../core/types';
import type { EditorController } from '../controller';
import { button, h } from '../dom';
import { formatDictionary, formatPatterns, invalidPatterns, parseDictionary, parsePatterns } from '../settingsText';

type FieldOptions = { label: string; control: HTMLElement; note?: string };

export class SettingsDialog {
  private readonly volumeInput = textInput({ type: 'text' });
  private readonly chapterInput = textInput({ type: 'text' });
  private readonly maxLengthInput = textInput({ type: 'number', min: 1, step: 1, inputmode: 'numeric' });
  private readonly adPatternsInput = textArea(5);
  private readonly dictionaryInput = textArea(6);
  private readonly apiKeyInput = textInput({ type: 'password', autocomplete: 'off' });
  private readonly modelInput = textInput({ type: 'text', placeholder: DEFAULT_SETTINGS.llm.model });
  private readonly hint = h('p', { className: 'settings-hint', attrs: { role: 'alert', hidden: true } });
  readonly element = h('dialog', { className: 'settings-dialog', attrs: { 'aria-label': '设置' } });

  constructor(private readonly app: EditorController) {
    const form = h('form', {
      className: 'settings-form',
      children: [h('h2', { text: '设置' }), this.hint, ...this.fields(), this.footer()],
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submit();
    });
    this.element.append(form);
  }

  open(hint?: string): void {
    this.fill(this.app.state.settings);
    this.showHint(hint);
    this.element.showModal();
  }

  private submit(): void {
    const settings = this.read();
    const invalid = invalidPatterns(settings);
    if (invalid.length) return this.showHint(`以下正则无效，请修改：${invalid.join('、')}`);
    this.element.close();
    this.app.saveSettings(settings);
  }

  private showHint(text?: string): void {
    this.hint.textContent = text ?? '';
    this.hint.hidden = !text;
  }

  private fill(settings: Settings): void {
    this.volumeInput.value = settings.heading.volume;
    this.chapterInput.value = settings.heading.chapter;
    this.maxLengthInput.value = String(settings.heading.maxLength);
    this.adPatternsInput.value = formatPatterns(settings.adPatterns);
    this.dictionaryInput.value = formatDictionary(settings.dictionary);
    this.apiKeyInput.value = settings.llm.apiKey;
    this.modelInput.value = settings.llm.model;
  }

  private read(): Settings {
    return {
      heading: { volume: this.volumeInput.value, chapter: this.chapterInput.value, maxLength: this.readMaxLength() },
      adPatterns: parsePatterns(this.adPatternsInput.value),
      dictionary: parseDictionary(this.dictionaryInput.value),
      llm: { apiKey: this.apiKeyInput.value.trim(), model: this.modelInput.value.trim() || DEFAULT_SETTINGS.llm.model },
    };
  }

  private readMaxLength(): number {
    const value = Math.floor(Number(this.maxLengthInput.value));
    return value > 0 ? value : DEFAULT_SETTINGS.heading.maxLength;
  }

  private restoreDefaults(): void {
    const apiKey = this.apiKeyInput.value;
    this.fill({ ...DEFAULT_SETTINGS, llm: { ...DEFAULT_SETTINGS.llm, apiKey } });
  }

  private fields(): HTMLElement[] {
    return [
      field({ label: '卷标题正则', control: this.volumeInput }),
      field({ label: '章标题正则', control: this.chapterInput }),
      field({ label: '标题最大长度', control: this.maxLengthInput, note: '超过此长度的行不会被识别为标题' }),
      field({ label: '广告规则', control: this.adPatternsInput, note: '每行一条正则，匹配到的内容会被删除' }),
      field({ label: '谐音词典', control: this.dictionaryInput, note: '每行一条，格式：原文=替换' }),
      field({ label: 'DeepSeek API Key', control: this.apiKeyInput, note: 'Key 仅保存在本机。推断时会将待还原位置及附近正文直接发送给 DeepSeek' }),
      field({ label: '模型', control: this.modelInput }),
    ];
  }

  private footer(): HTMLElement {
    const restore = button({ label: '恢复默认', onClick: () => this.restoreDefaults() });
    const cancel = button({ label: '取消', onClick: () => this.element.close() });
    const save = button({ label: '保存', variant: 'primary', attrs: { type: 'submit' } });
    return h('div', { className: 'settings-footer', children: [restore, h('span', { className: 'spacer' }), cancel, save] });
  }
}

function field(options: FieldOptions): HTMLElement {
  const note = options.note ? h('span', { className: 'field-note', text: options.note }) : null;
  return h('label', {
    className: 'field',
    children: [h('span', { className: 'field-label', text: options.label }), options.control, note],
  });
}

function textInput(attrs: Record<string, string | number>): HTMLInputElement {
  return h('input', { className: 'input', attrs: { spellcheck: 'false', ...attrs } });
}

function textArea(rows: number): HTMLTextAreaElement {
  return h('textarea', { className: 'input textarea', attrs: { rows, spellcheck: 'false' } });
}
