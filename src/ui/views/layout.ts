import { button, h } from '../dom';

export type PanelName = 'toc' | 'preview' | 'censor';
export type Panels = Record<PanelName, HTMLElement>;

const PANEL_LABELS: Record<PanelName, string> = { toc: '目录', preview: '正文', censor: '和谐词' };
const PANEL_NAMES = Object.keys(PANEL_LABELS) as PanelName[];

export class LayoutView {
  readonly element: HTMLElement;
  private readonly tabs = new Map<PanelName, HTMLButtonElement>();

  constructor(panels: Panels) {
    const columns = h('div', { className: 'columns', children: PANEL_NAMES.map((name) => panelSection(name, panels[name])) });
    this.element = h('main', { className: 'workspace', children: [this.tabBar(), columns] });
    this.showPanel('toc');
  }

  showPanel(name: PanelName): void {
    this.element.dataset.activePanel = name;
    this.tabs.forEach((tab, tabName) => tab.setAttribute('aria-selected', String(tabName === name)));
  }

  private tabBar(): HTMLElement {
    const buttons = PANEL_NAMES.map((name) => this.tab(name));
    return h('nav', { className: 'tab-bar', attrs: { role: 'tablist' }, children: buttons });
  }

  private tab(name: PanelName): HTMLButtonElement {
    const tab = button({
      label: PANEL_LABELS[name],
      variant: 'bare',
      className: 'tab',
      attrs: { role: 'tab', 'aria-controls': panelId(name) },
      onClick: () => this.showPanel(name),
    });
    this.tabs.set(name, tab);
    return tab;
  }
}

function panelSection(name: PanelName, content: HTMLElement): HTMLElement {
  return h('section', {
    className: `panel panel-${name}`,
    attrs: { id: panelId(name), role: 'tabpanel', 'data-panel': name, 'aria-label': PANEL_LABELS[name] },
    children: [content],
  });
}

function panelId(name: PanelName): string {
  return `panel-${name}`;
}
