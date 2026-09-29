import type { Extension } from '@codemirror/state';
import { EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap, WidgetType } from '@codemirror/view';
import { t } from '@lingui/core/macro';
import {
  type BlockWidgetEdit,
  codeWidgetSource,
  sourceChanges,
  type TableWidgetSource,
  tableWidgetSource,
  updateBlockWidget,
} from '@nedian0brien/synapsenote-core';

interface WidgetPosition {
  from: number;
  to: number;
}

export function writeWidget(
  view: EditorView,
  position: WidgetPosition,
  edit: BlockWidgetEdit,
): void {
  const source = view.state.doc.toString();
  const updated = updateBlockWidget(source, position.from, position.to, edit);
  if (updated === null || updated === source) return;
  view.dispatch({ changes: sourceChanges(source, updated), userEvent: 'input.widget' });
}

export function syncInput(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  if (input.value === value) return;
  const active = document.activeElement === input;
  const start = active ? (input.selectionStart ?? 0) : 0;
  const end = active ? (input.selectionEnd ?? 0) : 0;
  input.value = value;
  if (active) input.setSelectionRange(Math.min(start, value.length), Math.min(end, value.length));
}

interface CodeDOM {
  position: WidgetPosition;
  language: HTMLInputElement;
  body: HTMLTextAreaElement;
}
const codeDOM = new WeakMap<HTMLElement, CodeDOM>();

export class CodeBlockWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }

  eq(other: CodeBlockWidget): boolean {
    return this.source === other.source && this.from === other.from && this.to === other.to;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-live-code-block';
    const language = document.createElement('input');
    language.className = 'cm-live-code-language';
    language.type = 'text';
    language.setAttribute('aria-label', t`Code language`);
    const body = document.createElement('textarea');
    body.className = 'cm-live-code-body';
    body.spellcheck = false;
    body.setAttribute('aria-label', t`Code`);
    wrapper.append(language, body);
    const position = { from: this.from, to: this.to };
    const state = { position, language, body };
    codeDOM.set(wrapper, state);
    const data = codeWidgetSource(view.state.doc.toString(), this.from, this.to);
    if (data) {
      language.value = view.state.sliceDoc(...data.language);
      body.value = view.state.sliceDoc(...data.body);
    }
    language.addEventListener('input', () =>
      writeWidget(view, state.position, { type: 'code-language', text: language.value }),
    );
    body.addEventListener('input', () =>
      writeWidget(view, state.position, { type: 'code-body', text: body.value }),
    );
    return wrapper;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const state = codeDOM.get(dom);
    const data = codeWidgetSource(view.state.doc.toString(), this.from, this.to);
    if (!state || !data) return false;
    state.position = { from: this.from, to: this.to };
    syncInput(state.language, view.state.sliceDoc(...data.language));
    syncInput(state.body, view.state.sliceDoc(...data.body));
    return true;
  }
}

interface TableDOM {
  position: WidgetPosition;
  model: TableWidgetSource;
  cells: EditorView[][];
  syncing: boolean;
}
const tableDOM = new WeakMap<HTMLElement, TableDOM>();

/** Every cell uses the same live editing rules; only its source span is written to the parent. */
export class TableBlockWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
    readonly to: number,
    readonly cellExtension: () => Extension,
  ) {
    super();
  }

  eq(other: TableBlockWidget): boolean {
    return this.source === other.source && this.from === other.from && this.to === other.to;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-live-table-wrap';
    const table = document.createElement('table');
    table.className = 'cm-live-table';
    wrapper.append(table);
    const model = tableWidgetSource(view.state.doc.toString(), this.from, this.to);
    if (!model) return wrapper;
    const state: TableDOM = {
      position: { from: this.from, to: this.to },
      model,
      cells: [],
      syncing: false,
    };
    tableDOM.set(wrapper, state);
    const focusCell = (row: number, column: number, direction: 1 | -1): boolean => {
      const all = state.cells.flat();
      const current = state.cells.slice(0, row).reduce((n, cells) => n + cells.length, 0) + column;
      const target = all[(current + direction + all.length) % all.length];
      target?.focus();
      return Boolean(target);
    };
    model.rows.forEach((row, rowIndex) => {
      const tr = document.createElement('tr');
      table.append(tr);
      const views: EditorView[] = [];
      state.cells.push(views);
      row.forEach((cell, columnIndex) => {
        const td = document.createElement(rowIndex === 0 ? 'th' : 'td');
        td.className = 'cm-live-table-cell';
        tr.append(td);
        const nextCell = () => focusCell(rowIndex, columnIndex, 1);
        const previousCell = () => focusCell(rowIndex, columnIndex, -1);
        const cellView = new EditorView({
          parent: td,
          state: EditorState.create({
            doc: cell.text,
            extensions: [
              Prec.highest(
                keymap.of([
                  { key: 'Enter', run: nextCell },
                  { key: 'Tab', run: nextCell },
                  { key: 'Shift-Tab', run: previousCell },
                ]),
              ),
              this.cellExtension(),
              EditorView.updateListener.of((update) => {
                if (!update.docChanged || state.syncing) return;
                writeWidget(view, state.position, {
                  type: 'table-cell',
                  row: rowIndex,
                  column: columnIndex,
                  text: update.state.doc.toString(),
                });
              }),
            ],
          }),
        });
        views.push(cellView);
      });
    });
    return wrapper;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const state = tableDOM.get(dom);
    const model = tableWidgetSource(view.state.doc.toString(), this.from, this.to);
    if (!state || !model || model.rows.length !== state.cells.length) return false;
    if (model.rows.some((row, i) => row.length !== state.cells[i]?.length)) return false;
    state.position = { from: this.from, to: this.to };
    state.model = model;
    state.syncing = true;
    try {
      model.rows.forEach((row, i) => {
        row.forEach((cell, j) => {
          const cellView = state.cells[i]?.[j];
          if (!cellView) return;
          const previous = cellView.state.doc.toString();
          if (previous !== cell.text) {
            cellView.dispatch({ changes: sourceChanges(previous, cell.text) });
          }
        });
      });
    } finally {
      state.syncing = false;
    }
    return true;
  }

  destroy(dom: HTMLElement): void {
    const state = tableDOM.get(dom);
    for (const cell of state?.cells.flat() ?? []) cell.destroy();
    tableDOM.delete(dom);
  }
}
