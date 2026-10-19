import { h } from '../dom';

export class BusyIndicator {
  readonly element = h('div', {
    className: 'busy',
    attrs: { hidden: true, role: 'status', 'aria-live': 'polite' },
    children: [h('span', { className: 'busy-spinner' }), h('span', { text: '正在处理…' })],
  });

  toggle(isBusy: boolean): void {
    this.element.hidden = !isBusy;
  }
}
