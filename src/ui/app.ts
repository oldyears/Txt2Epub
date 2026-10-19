import { writeEpub } from '../core/epubWriter';
import type { Book, Settings, SourceDoc } from '../core/types';
import { loadSettings, saveSettings as persistSettings } from '../storage/settings';
import type { EditorController } from './controller';
import { downloadEpub, epubFileName } from './download';
import { bindFileDrop } from './fileInput';
import { inferSuggestions } from './inference';
import { errorMessage } from './messages';
import { sourceReaderFor } from './sourceFile';
import * as transitions from './state';
import type { AppState, FixChange, LineKindChange, MetaChange } from './state';
import { BusyIndicator } from './views/busy';
import { CensorView } from './views/censor';
import { createEmptyState } from './views/emptyState';
import { HeaderView } from './views/header';
import { LayoutView } from './views/layout';
import { PreviewView } from './views/preview';
import { SettingsDialog } from './views/settings';
import { ToastView, type ToastMessage } from './views/toast';
import { TocView } from './views/toc';

type Toggle = (isOn: boolean) => void;
type Task = () => void | Promise<void>;

const REPROCESS_CONFIRMATION = '重新处理会丢失手动调整的目录，继续？';
const MISSING_API_KEY_HINT = '请先填写 DeepSeek API Key，再使用推断功能。';

export class App implements EditorController {
  private current = transitions.initialState(loadSettings());
  private isBusy = false;
  private readonly toast = new ToastView();
  private readonly busy = new BusyIndicator();
  private readonly emptyState = createEmptyState((file) => this.open(file));
  private readonly header = new HeaderView(this);
  private readonly toc = new TocView(this);
  private readonly preview = new PreviewView(this);
  private readonly censor = new CensorView(this);
  private readonly settingsDialog = new SettingsDialog(this);
  private readonly layout = new LayoutView({ toc: this.toc.element, preview: this.preview.element, censor: this.censor.element });
  private readonly toggleInferring: Toggle = (isOn) => this.censor.setInferring(isOn);
  private readonly toggleBusy: Toggle = (isOn) => {
    this.isBusy = isOn;
    this.busy.toggle(isOn);
    this.header.setBusy(isOn);
  };

  constructor(root: HTMLElement) {
    const regions = [this.header.element, this.emptyState, this.layout.element, this.settingsDialog.element];
    root.append(...regions, this.busy.element, this.toast.element);
    bindFileDrop(document.body, (file) => this.open(file));
    this.render();
  }

  get state(): AppState {
    return this.current;
  }

  open(file: File): void {
    if (this.isBusy) return this.notify({ text: '正在处理，请稍候' });
    const readSource = sourceReaderFor(file.name);
    if (!readSource) return this.notify({ text: '仅支持 txt 和 epub 文件', tone: 'error' });
    this.run(() => this.during(this.toggleBusy, async () => this.showSource(await readSource(file))));
  }

  selectSection(index: number): void {
    this.run(() => {
      this.current = transitions.selectSection(this.current, index);
      this.toc.highlight();
      this.preview.render();
      this.layout.showPanel('preview');
    });
  }

  setLineKind(change: LineKindChange): void {
    this.run(() => {
      this.current = transitions.setLineKind(this.current, change);
      this.toc.render();
      this.preview.render();
    });
  }

  setFix(change: FixChange): void {
    this.run(() => {
      this.current = transitions.setFix(this.current, change);
      this.censor.renderSummary();
      this.preview.updateMark(change.hitIndex);
    });
  }

  setMeta(change: MetaChange): void {
    this.run(() => {
      this.current = transitions.setMeta(this.current, change);
    });
  }

  revealHit(hitIndex: number): void {
    const hit = this.current.hits[hitIndex];
    if (!hit) return;
    this.selectSection(transitions.sectionOfLine(this.current.sections, hit.lineIndex));
    this.run(() => this.preview.revealLine(hit.lineIndex));
  }

  inferWithLlm(): void {
    if (!this.current.settings.llm.apiKey) return this.openSettings(MISSING_API_KEY_HINT);
    if (!transitions.pendingQueries(this.current).length) return this.notify({ text: '所有和谐词都已填写' });
    this.run(() => this.during(this.toggleInferring, () => this.applyInference()));
  }

  openSettings(hint?: string): void {
    this.run(() => this.settingsDialog.open(hint));
  }

  saveSettings(settings: Settings): void {
    this.run(() => this.storeOrReprocess(settings));
  }

  exportEpub(): void {
    const book = transitions.exportableBook(this.current);
    if (book) this.run(() => this.during(this.toggleBusy, () => this.downloadBook(book)));
  }

  private async downloadBook(book: Book): Promise<void> {
    const fileName = epubFileName(book.meta.title);
    downloadEpub({ bytes: await writeEpub(book), fileName });
    this.notify({ text: `已导出 ${fileName}` });
  }

  private async showSource(source: SourceDoc): Promise<void> {
    await nextFrame();
    this.current = transitions.loadSource(this.current, source);
    this.render();
    this.layout.showPanel('toc');
  }

  private async applyInference(): Promise<void> {
    const result = await inferSuggestions(() => this.current);
    if (result.state) this.current = result.state;
    this.censor.refreshInputs();
    this.preview.refreshMarks();
    this.notify(result.message);
  }

  private async storeOrReprocess(settings: Settings): Promise<void> {
    if (!persistSettings(settings)) this.notify({ text: '设置无法保存到本机浏览器，仅本次有效', tone: 'error' });
    if (!this.shouldReprocess(settings)) {
      this.current = transitions.storeSettings(this.current, settings);
      return;
    }
    await this.during(this.toggleBusy, () => this.reprocess(settings));
  }

  private shouldReprocess(settings: Settings): boolean {
    if (!transitions.settingsNeedReprocess(this.current, settings)) return false;
    return !this.current.kindEdited || window.confirm(REPROCESS_CONFIRMATION);
  }

  private async reprocess(settings: Settings): Promise<void> {
    await nextFrame();
    const previous = this.current;
    this.current = transitions.applySettings(previous, settings);
    this.render();
    const lostFixes = previous.fixes.size - this.current.fixes.size;
    if (lostFixes > 0) this.notify({ text: `有 ${lostFixes} 处已填写的替换因重新处理而失效`, tone: 'error' });
  }

  private render(): void {
    const hasBook = Boolean(this.current.book);
    this.emptyState.hidden = hasBook;
    this.layout.element.hidden = !hasBook;
    this.header.render();
    this.toc.render();
    this.preview.render();
    this.censor.render();
  }

  private notify(message: ToastMessage): void {
    this.toast.show(message);
  }

  private async during(toggle: Toggle, task: () => Promise<void>): Promise<void> {
    toggle(true);
    try {
      await task();
    } finally {
      toggle(false);
    }
  }

  private run(task: Task): void {
    void this.guard(task);
  }

  private async guard(task: Task): Promise<void> {
    try {
      await task();
    } catch (error) {
      this.notify({ text: errorMessage(error), tone: 'error' });
    }
  }
}

function nextFrame(): Promise<void> {
  // Without this yield the busy indicator never paints: processing below blocks the main thread synchronously.
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
}
