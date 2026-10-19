export type Child = Node | string | null | undefined | false;
type AttributeValue = string | number | boolean;
type Handlers = { [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void };

export type ElementProps = {
  className?: string;
  text?: string;
  attrs?: Record<string, AttributeValue>;
  on?: Handlers;
  children?: Child[];
};

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: ElementProps = {}): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props.className) element.className = props.className;
  if (props.text !== undefined) element.textContent = props.text;
  setAttributes(element, props.attrs ?? {});
  addHandlers(element, props.on ?? {});
  element.append(...childNodes(props.children ?? []));
  return element;
}

function setAttributes(element: HTMLElement, attrs: Record<string, AttributeValue>): void {
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false) continue;
    element.setAttribute(name, value === true ? '' : String(value));
  }
}

function addHandlers(element: HTMLElement, handlers: Handlers): void {
  for (const [type, handler] of Object.entries(handlers)) {
    element.addEventListener(type, handler as EventListener);
  }
}

function childNodes(children: Child[]): (Node | string)[] {
  return children.filter((child): child is Node | string => child !== null && child !== undefined && child !== false);
}

export function closestWithData(target: EventTarget | null, key: string): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(`[data-${key}]`) : null;
}

export function dataNumber(element: HTMLElement, key: string): number {
  return Number(element.dataset[key]);
}

export type ButtonVariant = 'default' | 'primary' | 'small' | 'bare';
export type ButtonOptions = {
  label: string;
  onClick?: () => void;
  variant?: ButtonVariant;
  className?: string;
  attrs?: Record<string, AttributeValue>;
};

const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default: 'button',
  primary: 'button button-primary',
  small: 'button button-small',
  bare: '',
};

export function button(options: ButtonOptions): HTMLButtonElement {
  const className = [BUTTON_VARIANT_CLASSES[options.variant ?? 'default'], options.className].filter(Boolean).join(' ');
  const on = options.onClick ? { click: options.onClick } : {};
  return h('button', { className, text: options.label, attrs: { type: 'button', ...options.attrs }, on });
}

export const VERTICAL_ARROW_STEPS: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };
