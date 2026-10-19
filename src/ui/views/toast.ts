import { h } from '../dom';

export type ToastTone = 'info' | 'error';
export type ToastMessage = { text: string; tone?: ToastTone };

const VISIBLE_MS = 4000;

export class ToastView {
  readonly element = h('div', { className: 'toast', attrs: { role: 'status', 'aria-live': 'polite' } });
  private hideTimer = 0;

  show(message: ToastMessage): void {
    this.element.textContent = message.text;
    this.element.dataset.tone = message.tone ?? 'info';
    this.element.classList.add('is-visible');
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.element.classList.remove('is-visible'), VISIBLE_MS);
  }
}
