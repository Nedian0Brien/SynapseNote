import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { consumePendingDocPanelTabRequest } from '@/components/doc-panel-events';
import {
  consumePendingMemoComposerRequest,
  requestMemoComposer,
} from '@/components/memo-composer-events';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { SelectionSnapshot } from '@/editor/selection-context';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';

type WindowGlobals = { NodeFilter?: typeof NodeFilter };
type GlobalWithDomShims = typeof globalThis &
  WindowGlobals & { window?: WindowGlobals; ResizeObserver?: unknown };
const g = globalThis as GlobalWithDomShims;
if (g.NodeFilter === undefined && g.window?.NodeFilter !== undefined) {
  g.NodeFilter = g.window.NodeFilter;
}
if (g.ResizeObserver === undefined) {
  class NoopResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  g.ResizeObserver = NoopResizeObserver;
}

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
  useLingui: () => ({ t: renderLinguiTemplate }),
}));

let selectionValue: SelectionSnapshot | null = null;
mock.module('@/hooks/use-selection-context', () => ({
  useSelectionContext: () => selectionValue,
}));

const { MemoPanel } = await import('./MemoPanel');

function renderMemo(docName: string) {
  return render(
    <TooltipProvider>
      <MemoPanel docName={docName} isSourceMode={false} />
    </TooltipProvider>,
  );
}

function memoComposer(): HTMLTextAreaElement {
  return screen.getByRole('textbox', { name: 'New memo' }) as HTMLTextAreaElement;
}

function addMemo(body: string) {
  fireEvent.change(memoComposer(), { target: { value: body } });
  fireEvent.click(screen.getByRole('button', { name: 'Add memo' }));
}

beforeEach(() => {
  window.localStorage.clear();
  selectionValue = null;
  consumePendingMemoComposerRequest('notes/today');
  consumePendingDocPanelTabRequest();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  consumePendingMemoComposerRequest('notes/today');
  consumePendingDocPanelTabRequest();
});

describe('MemoPanel', () => {
  test('restores an unfinished draft after the panel remounts', () => {
    const first = renderMemo('notes/today');
    fireEvent.change(memoComposer(), { target: { value: 'Remember this detail.' } });
    first.unmount();

    renderMemo('notes/today');
    expect(memoComposer().value).toBe('Remember this detail.');
  });

  test('keeps drafts isolated between documents', () => {
    const first = renderMemo('notes/first');
    fireEvent.change(memoComposer(), { target: { value: 'Only for the first document' } });
    first.unmount();

    renderMemo('notes/second');
    expect(memoComposer().value).toBe('');
  });

  test('creates multiple saved memo cards and clears the composer', () => {
    renderMemo('notes/today');
    addMemo('First saved thought');
    addMemo('Second saved thought');

    expect(screen.getByText('First saved thought')).toBeTruthy();
    expect(screen.getByText('Second saved thought')).toBeTruthy();
    expect(memoComposer().value).toBe('');
    expect(screen.getByText('2')).toBeTruthy();
  });

  test('attaches the active editor selection to a memo', () => {
    selectionValue = {
      surface: 'wysiwyg',
      docName: 'notes/today',
      markdown: '## Important result\n\nThe selected evidence.',
      charLen: 43,
      lineCount: 3,
    };
    renderMemo('notes/today');

    fireEvent.click(screen.getByRole('button', { name: 'Attach selection' }));
    expect(screen.getByText('Important result The selected evidence.')).toBeTruthy();
    addMemo('Revisit this argument');

    expect(screen.getByText('Revisit this argument')).toBeTruthy();
    expect(screen.getByText('Important result The selected evidence.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Expand original text' })).toBeNull();
  });

  test('collapses long original text and expands it on demand', () => {
    const longPassage = Array.from(
      { length: 32 },
      (_, index) => `Evidence sentence ${index + 1} supports the result.`,
    ).join(' ');
    selectionValue = {
      surface: 'wysiwyg',
      docName: 'notes/today',
      markdown: longPassage,
      charLen: longPassage.length,
      lineCount: 1,
    };
    renderMemo('notes/today');

    fireEvent.click(screen.getByRole('button', { name: 'Attach selection' }));
    const originalText = document.querySelector('[data-memo-original-text="composer"]');
    expect(originalText?.classList.contains('border-l-2')).toBe(true);
    expect(originalText?.classList.contains('rounded-xl')).toBe(false);
    expect(originalText?.classList.contains('bg-muted/25')).toBe(false);
    const collapsedContent = document.querySelector(
      '[data-memo-original-text="composer"] [data-memo-original-text-content="true"]',
    );
    expect(collapsedContent?.classList.contains('line-clamp-4')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Expand original text' }));
    expect(screen.getByRole('button', { name: 'Collapse original text' })).toBeTruthy();
    expect(collapsedContent?.classList.contains('line-clamp-4')).toBe(false);

    addMemo('Keep this source passage.');
    expect(screen.getByRole('button', { name: 'Expand original text' })).toBeTruthy();
  });

  test('opens from the selection toolbar with the quote attached and composer focused', async () => {
    requestMemoComposer({
      docName: 'notes/today',
      quote: { markdown: 'The passage selected before the panel mounted.' },
    });

    renderMemo('notes/today');

    expect(screen.getByText('The passage selected before the panel mounted.')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(memoComposer()));

    await act(async () => {
      requestMemoComposer({
        docName: 'notes/today',
        quote: { markdown: 'A replacement selection.' },
      });
    });
    expect(screen.getByText('A replacement selection.')).toBeTruthy();
  });

  test('edits a saved memo inline', () => {
    renderMemo('notes/today');
    addMemo('Initial note');
    fireEvent.click(screen.getByRole('button', { name: 'Edit memo' }));
    const editor = screen.getByRole('textbox', { name: 'Edit memo' });
    fireEvent.change(editor, { target: { value: 'Updated note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.queryByText('Initial note')).toBeNull();
    expect(screen.getByText('Updated note')).toBeTruthy();
  });

  test('confirms before deleting a memo', () => {
    renderMemo('notes/today');
    addMemo('Disposable note');
    fireEvent.click(screen.getByRole('button', { name: 'Delete memo' }));

    expect(screen.getByRole('heading', { name: 'Delete this memo?' })).toBeTruthy();
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete memo' });
    fireEvent.click(deleteButtons[deleteButtons.length - 1] as HTMLButtonElement);
    expect(screen.queryByText('Disposable note')).toBeNull();
    expect(screen.getByText('No memos yet')).toBeTruthy();
  });
});
