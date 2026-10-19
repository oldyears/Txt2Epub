import type { LineKind } from '../../core/types';
import type { EditorController } from '../controller';
import { button, h, VERTICAL_ARROW_STEPS } from '../dom';

export type LineMenuTarget = { lineIndex: number; x: number; y: number };
export type LineMenuOptions = { controller: EditorController; onDismiss: (lineIndex: number) => void };

const KIND_ACTIONS: { kind: LineKind; label: string }[] = [
  { kind: 'volume', label: '设为卷' },
  { kind: 'chapter', label: '设为章' },
  { kind: 'body', label: '设为正文' },
];
type MenuAction = { kind: LineKind; label: string; isCurrent: boolean };

const VIEWPORT_MARGIN = 8;

export class LineMenu {
  readonly element = h('div', { className: 'line-menu', attrs: { role: 'menu', hidden: true } });
  private target?: LineMenuTarget;

  constructor(private readonly options: LineMenuOptions) {
    document.addEventListener('pointerdown', (event) => this.closeUnlessInside(event.target));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.target) this.dismiss();
    });
    this.element.addEventListener('keydown', (event) => this.moveFocus(event));
    this.element.addEventListener('focusout', (event) => this.closeUnlessInside(event.relatedTarget));
  }

  open(target: LineMenuTarget): void {
    const currentKind = this.options.controller.state.book?.lines[target.lineIndex]?.kind;
    this.target = target;
    const items = KIND_ACTIONS.map((action) => this.item({ ...action, isCurrent: action.kind === currentKind }));
    this.element.replaceChildren(...items);
    this.element.hidden = false;
    this.placeAt(target);
    this.enabledItems()[0]?.focus();
  }

  close(): void {
    this.target = undefined;
    this.element.hidden = true;
  }

  private item(action: MenuAction): HTMLButtonElement {
    return button({
      label: action.label,
      variant: 'bare',
      className: 'line-menu-item',
      attrs: { role: 'menuitem', disabled: action.isCurrent },
      onClick: () => this.choose(action.kind),
    });
  }

  private dismiss(): void {
    const lineIndex = this.target?.lineIndex;
    this.close();
    if (lineIndex !== undefined) this.options.onDismiss(lineIndex);
  }

  private choose(kind: LineKind): void {
    const lineIndex = this.target?.lineIndex;
    if (lineIndex === undefined) return;
    this.close();
    this.options.controller.setLineKind({ index: lineIndex, kind });
    this.options.onDismiss(lineIndex);
  }

  private closeUnlessInside(target: EventTarget | null): void {
    if (target instanceof Node && this.element.contains(target)) return;
    this.close();
  }

  private moveFocus(event: KeyboardEvent): void {
    const step = VERTICAL_ARROW_STEPS[event.key];
    if (!step) return;
    event.preventDefault();
    const items = this.enabledItems();
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(currentIndex + step + items.length) % items.length]?.focus();
  }

  private enabledItems(): HTMLButtonElement[] {
    return Array.from(this.element.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
  }

  private placeAt(point: LineMenuTarget): void {
    const { offsetWidth: width, offsetHeight: height } = this.element;
    const left = Math.min(point.x, window.innerWidth - width - VIEWPORT_MARGIN);
    const fitsBelow = point.y + height + VIEWPORT_MARGIN < window.innerHeight;
    const top = fitsBelow ? point.y + VIEWPORT_MARGIN : point.y - height - VIEWPORT_MARGIN;
    this.element.style.left = `${Math.max(VIEWPORT_MARGIN, left)}px`;
    this.element.style.top = `${Math.max(VIEWPORT_MARGIN, top)}px`;
  }
}
