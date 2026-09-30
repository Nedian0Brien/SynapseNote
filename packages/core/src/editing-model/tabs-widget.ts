import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from '../markdown/index.ts';
import type { Range } from './layout.ts';
import { mdxWidgetSource, updateMdxWidget } from './mdx-widget.ts';

export interface TabsWidgetPanel {
  from: number;
  to: number;
  kind: 'tab' | 'block';
  label: string;
  id: string | null;
  body: string;
  bodyRange?: Range | null;
}

export interface TabsWidgetSource {
  id: string | null;
  panels: readonly TabsWidgetPanel[];
}

export type TabsWidgetEdit =
  | { type: 'tabs-label'; index: number; text: string }
  | { type: 'tabs-body'; index: number; text: string }
  | { type: 'tabs-add'; label: string }
  | { type: 'tabs-remove'; index: number };

let parser: MarkdownManager | undefined;
function md(): MarkdownManager {
  parser ??= new MarkdownManager({ extensions: sharedExtensions });
  return parser;
}

/** Direct child ranges only; nested Tabs remain inside their parent Tab body. */
export function tabsWidgetSource(
  source: string,
  from: number,
  to: number,
): TabsWidgetSource | null {
  const raw = source.slice(from, to);
  if (!/^<Tabs(?:\s|>)/.test(raw)) return null;
  const node = md().parseToMdast(raw).children[0];
  if (node?.type !== 'mdxJsxFlowElement' || node.name !== 'Tabs') return null;
  const id = node.attributes.find((item) => item.type === 'mdxJsxAttribute' && item.name === 'id');
  const panels: TabsWidgetPanel[] = [];
  for (const child of node.children) {
    const start = child.position?.start.offset;
    const end = child.position?.end.offset;
    if (start === undefined || end === undefined || start >= end) continue;
    const panelFrom = from + start;
    const panelTo = from + end;
    const tab = mdxWidgetSource(source, panelFrom, panelTo);
    if (tab?.name === 'Tab') {
      panels.push({
        from: panelFrom,
        to: panelTo,
        kind: 'tab',
        label: typeof tab.props.label === 'string' ? tab.props.label : 'Tab',
        id: typeof tab.props.id === 'string' ? tab.props.id : null,
        body: tab.body,
        bodyRange: tab.bodyRange,
      });
    } else {
      panels.push({
        from: panelFrom,
        to: panelTo,
        kind: 'block',
        label: `Panel ${panels.length + 1}`,
        id: null,
        body: source.slice(panelFrom, panelTo),
        bodyRange: [panelFrom, panelTo],
      });
    }
  }
  return {
    id: id?.type === 'mdxJsxAttribute' && typeof id.value === 'string' ? id.value : null,
    panels,
  };
}

export function updateTabsWidget(
  source: string,
  from: number,
  to: number,
  edit: TabsWidgetEdit,
): string | null {
  const model = tabsWidgetSource(source, from, to);
  if (!model) return null;
  if (edit.type === 'tabs-add') {
    const close = source.slice(from, to).lastIndexOf('</Tabs>');
    if (close < 0) return null;
    const at = from + close;
    const label = edit.label
      .replace(/[\r\n]/g, ' ')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;');
    const insert = `${source[at - 1] === '\n' ? '' : '\n'}<Tab label="${label}">\n\n</Tab>\n`;
    return source.slice(0, at) + insert + source.slice(at);
  }
  const panel = model.panels[edit.index];
  if (!panel) return null;
  if (edit.type === 'tabs-remove') {
    const start = panel.from;
    const end = source[panel.to] === '\n' ? panel.to + 1 : panel.to;
    return source.slice(0, start) + source.slice(end);
  }
  if (edit.type === 'tabs-label') {
    return panel.kind === 'tab'
      ? updateMdxWidget(source, panel.from, panel.to, {
          type: 'mdx-prop',
          key: 'label',
          text: edit.text,
        })
      : null;
  }
  if (panel.kind === 'tab') {
    return updateMdxWidget(source, panel.from, panel.to, { type: 'mdx-body', text: edit.text });
  }
  return source.slice(0, panel.from) + edit.text + source.slice(panel.to);
}
