import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { consumePendingDocPanelTabRequest } from '@/components/doc-panel-events';
import {
  consumePendingMemoComposerRequest,
  requestMemoComposer,
} from '@/components/memo-composer-events';
import { TooltipProvider } from '@/components/ui/tooltip';
import { requestMemoReveal, subscribeMemoNavigation } from '@/editor/memo-navigation';
import {
  publishNativeDocumentHighlights,
  subscribeNativeHighlightMutations,
} from '@/editor/native-document-highlights';
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
  return screen.getByRole('textbox', {
    name: 'New memo',
  }) as HTMLTextAreaElement;
}

function addMemo(body: string) {
  fireEvent.change(memoComposer(), { target: { value: body } });
  fireEvent.click(screen.getByRole('button', { name: 'Add memo' }));
}

beforeEach(() => {
  window.localStorage.clear();
  publishNativeDocumentHighlights('notes/today', []);
  selectionValue = null;
  consumePendingMemoComposerRequest('notes/today');
  consumePendingDocPanelTabRequest();
});

afterEach(() => {
  cleanup();
  publishNativeDocumentHighlights('notes/today', []);
  window.localStorage.clear();
  consumePendingMemoComposerRequest('notes/today');
  consumePendingDocPanelTabRequest();
});

describe('MemoPanel', () => {
  test('restores an unfinished draft after the panel remounts', () => {
    const first = renderMemo('notes/today');
    fireEvent.change(memoComposer(), {
      target: { value: 'Remember this detail.' },
    });
    first.unmount();

    renderMemo('notes/today');
    expect(memoComposer().value).toBe('Remember this detail.');
  });

  test('keeps drafts isolated between documents', () => {
    const first = renderMemo('notes/first');
    fireEvent.change(memoComposer(), {
      target: { value: 'Only for the first document' },
    });
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

  test('saves a selected passage as a highlight annotation', () => {
    selectionValue = {
      surface: 'wysiwyg',
      docName: 'notes/today',
      markdown: 'A highlight-only passage.',
      charLen: 25,
      lineCount: 1,
      memoAnchor: {
        surface: 'wysiwyg',
        exact: 'A highlight-only passage.',
        prefix: '',
        suffix: '',
        from: 1,
        to: 26,
      },
    };
    const unsubscribe = subscribeNativeHighlightMutations((request) => {
      publishNativeDocumentHighlights(request.docName, [
        {
          id: 'native-highlight-1',
          quote: { markdown: request.anchor.exact, anchor: request.anchor },
          from: request.anchor.from,
          to: request.anchor.to,
        },
      ]);
    });
    try {
      renderMemo('notes/today');

      fireEvent.click(screen.getByRole('button', { name: 'Attach selection' }));
      fireEvent.click(screen.getByRole('button', { name: 'Add highlight' }));

      const highlightLabel = screen.getByText('Highlight');
      expect(highlightLabel).toBeTruthy();
      expect(screen.getByText('A highlight-only passage.')).toBeTruthy();
      expect(highlightLabel.closest('[data-memo-card-id]')?.classList).toContain('bg-card');
      expect(highlightLabel.closest('[data-memo-card-id]')?.classList).toContain(
        'border-amber-300/80',
      );
      expect(document.querySelector('[data-memo-original-text="saved"]')?.classList).toContain(
        'border-amber-400/70',
      );

      fireEvent.click(screen.getByRole('button', { name: 'Add memo to highlight' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Edit memo' }), {
        target: { value: 'A note attached to the native highlight.' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(screen.getByText('A note attached to the native highlight.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Edit memo' })).toBeTruthy();
    } finally {
      unsubscribe();
    }
  });

  test('requests a document jump when a passage memo card is clicked', () => {
    selectionValue = {
      surface: 'wysiwyg',
      docName: 'notes/today',
      markdown: 'The selected evidence.',
      charLen: 22,
      lineCount: 1,
      memoAnchor: {
        surface: 'wysiwyg',
        exact: 'The selected evidence.',
        prefix: 'Before ',
        suffix: ' After',
        from: 8,
        to: 30,
      },
    };
    const requests: Array<{ docName: string; memoId: string }> = [];
    const unsubscribe = subscribeMemoNavigation((request) => requests.push(request));
    try {
      renderMemo('notes/today');
      fireEvent.click(screen.getByRole('button', { name: 'Attach selection' }));
      addMemo('Jump back here');
      fireEvent.click(screen.getByRole('button', { name: 'Go to annotation in document' }));

      expect(requests).toHaveLength(1);
      expect(requests[0]?.docName).toBe('notes/today');
      expect(requests[0]?.memoId).toBeTruthy();
    } finally {
      unsubscribe();
    }
  });

  test('reveals the matching annotation card when requested from the document', async () => {
    renderMemo('notes/today');
    addMemo('Reveal this note');
    const card = screen.getByText('Reveal this note').closest<HTMLElement>('[data-memo-card-id]');
    expect(card).toBeTruthy();

    await act(async () =>
      requestMemoReveal({
        docName: 'notes/today',
        memoId: card?.dataset.memoCardId ?? '',
      }),
    );
    expect(card?.classList.contains('ring-2')).toBe(true);
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
    fireEvent.click(screen.getByRole('button', { name: 'Delete annotation' }));

    expect(screen.getByRole('heading', { name: 'Delete this annotation?' })).toBeTruthy();
    const deleteButtons = screen.getAllByRole('button', {
      name: 'Delete annotation',
    });
    fireEvent.click(deleteButtons[deleteButtons.length - 1] as HTMLButtonElement);
    expect(screen.queryByText('Disposable note')).toBeNull();
    expect(screen.getByText('No annotations yet')).toBeTruthy();
  });
});
