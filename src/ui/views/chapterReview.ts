import type { Book } from '../../core/types';
import { buildReviewBatches, findReviewTargets, type ReviewBatch, type ReviewSuggestion, type ReviewTarget } from '../../core/chapterReview';
import { reviewChapters, type ChapterReviewResult, type ReviewProgress } from '../../llm/chapterReview';
import type { EditorController } from '../controller';
import { button, h } from '../dom';
import { reviewSuggestionRow, reviewTargetRow } from './chapterReviewRows';

type ReviewRun = { base: Book; batches: ReviewBatch[]; id: number; signal: AbortSignal };

export class ChapterReviewDialog {
  readonly element = h('dialog', { className: 'settings-dialog chapter-review-dialog', attrs: { 'aria-label': '章节复查' } });
  private readonly summary = h('p', { className: 'panel-summary' });
  private readonly status = h('p', { className: 'review-status', attrs: { role: 'status', 'aria-live': 'polite' } });
  private readonly targets = h('div', { className: 'review-targets' });
  private readonly results = h('div', { className: 'review-results' });
  private readonly startButton = button({ label: '开始复查', variant: 'primary', onClick: () => this.start() });
  private readonly stopButton = button({ label: '取消复查', onClick: () => this.abort?.abort() });
  private readonly applyButton = button({ label: '应用所选建议', variant: 'primary', onClick: () => this.apply() });
  private readonly closeButton = button({ label: '关闭', onClick: () => this.close() });
  private base?: Book;
  private choices: ReviewTarget[] = [];
  private suggestions: ReviewSuggestion[] = [];
  private running = false;
  private generation = 0;
  private abort?: AbortController;

  constructor(private readonly app: EditorController) {
    const note = h('p', { className: 'field-note', text: '开始复查会将所选区段的正文分块发送给 DeepSeek，可能产生 API 费用。过长单行仅发送首尾片段。确认建议前，目录和正文不会改变。' });
    const actions = h('div', { className: 'settings-footer review-actions', children: [this.startButton, this.stopButton, this.applyButton, this.closeButton] });
    const body = h('div', { className: 'settings-form review-body', children: [h('h2', { text: '章节复查' }), this.summary, note, this.targets, this.status, this.results] });
    this.element.append(body, actions);
    this.element.addEventListener('cancel', () => { this.generation += 1; this.abort?.abort(); });
    this.results.addEventListener('change', () => this.controls());
  }

  open(): void {
    this.base = this.app.state.reviewBase;
    if (!this.base) return;
    this.generation += 1;
    this.running = false;
    this.suggestions = [];
    this.choices = findReviewTargets(this.base);
    this.summary.textContent = `发现 ${this.choices.length} 个待复查区段。长章节可能本来就正确，模型也可以建议保持原样。`;
    this.targets.replaceChildren(...this.choices.map(reviewTargetRow));
    this.results.replaceChildren();
    this.status.textContent = this.choices.length ? '选择要复查的区段，再点击“开始复查”。' : '未发现明显异常的章节，可继续手动调整目录。';
    this.controls();
    this.element.showModal();
  }

  private start(): void {
    if (!this.base || this.running) return;
    const chosen = this.selectedIds('review-target');
    const targets = this.choices.filter((_, index) => chosen.has(index));
    const batches = buildReviewBatches(this.base, targets);
    if (!batches.length) { this.status.textContent = '请至少选择一个待复查区段。'; return; }
    this.running = true;
    this.status.textContent = `正在复查 0 / ${batches.length} 批…`;
    this.suggestions = [];
    this.results.replaceChildren();
    this.abort = new AbortController();
    this.controls();
    void this.perform({ base: this.base, batches, id: ++this.generation, signal: this.abort.signal });
  }

  private async perform(run: ReviewRun): Promise<void> {
    try {
      const result = await reviewChapters({ batches: run.batches, config: this.app.state.settings.llm, signal: run.signal, onProgress: p => this.progress(p, run.id) });
      if (run.id === this.generation) this.receive(result, run.base);
    } catch (error) {
      if (run.id === this.generation) this.status.textContent = error instanceof Error ? error.message : '复查失败，请重试。';
    } finally {
      if (run.id === this.generation) { this.running = false; this.controls(); }
    }
  }

  private progress(progress: ReviewProgress, id: number): void {
    if (id === this.generation) this.status.textContent = `已复查 ${progress.completed} / ${progress.total} 批，发现 ${progress.suggestions} 处建议。`;
  }

  private receive(result: ChapterReviewResult, base: Book): void {
    if (base !== this.app.state.reviewBase) { this.status.textContent = '内容已变化，请关闭后重新复查。'; return; }
    this.suggestions = result.suggestions;
    const notice = result.cancelled ? '已取消。' : '';
    const failures = result.failedBatches ? ` ${result.failedBatches} 批失败或含无效建议。` : '';
    const conflicts = result.conflicts ? ` ${result.conflicts} 处冲突建议已丢弃。` : '';
    const pending = result.totalBatches - result.completedBatches;
    const remaining = pending > 0 ? ` ${pending} 批尚未复查。` : '';
    this.status.textContent = `${notice}已处理 ${result.completedBatches}/${result.totalBatches} 批，${result.suggestions.length} 处建议待确认。${failures}${conflicts}${remaining} ${result.error ?? ''}`;
    this.results.replaceChildren(...this.suggestions.map(item => reviewSuggestionRow(item, base)));
  }

  private selectedIds(attribute: string): Set<number> {
    const inputs = this.element.querySelectorAll<HTMLInputElement>(`input[data-${attribute}]:checked`);
    return new Set([...inputs].map(input => Number(input.getAttribute(`data-${attribute}`))));
  }

  private apply(): void {
    if (!this.base || this.running) return;
    if (this.base !== this.app.state.reviewBase) { this.status.textContent = '内容已变化，请关闭后重新复查。'; return; }
    const ids = this.selectedIds('review-line');
    const applied = this.app.applyChapterReview({ base: this.base, suggestions: this.suggestions.filter(item => ids.has(item.lineId)) });
    if (applied) this.close();
    else this.status.textContent = '建议已失效或会影响已还原的正文，目录未修改。请手动调整该位置。';
  }

  private controls(): void {
    this.startButton.disabled = this.running || !this.choices.length;
    this.targets.querySelectorAll<HTMLInputElement>('input').forEach(input => input.disabled = this.running);
    this.stopButton.hidden = !this.running;
    this.applyButton.hidden = !this.suggestions.length;
    this.applyButton.disabled = this.running || !this.selectedIds('review-line').size;
  }

  private close(): void {
    this.generation += 1;
    this.abort?.abort();
    this.running = false;
    this.element.close();
  }
}
