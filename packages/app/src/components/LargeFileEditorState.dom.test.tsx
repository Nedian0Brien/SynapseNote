import { afterEach, describe, expect, mock, test } from 'bun:test';
import { DOCUMENT_OPEN_BYTE_LIMIT } from '@nedian0brien/synapsenote-core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LargeFileEditorState } from './LargeFileEditorState';

describe('LargeFileEditorState', () => {
  afterEach(() => cleanup());

  test('renders the blocked-open copy with formatted sizes', () => {
    const oversizedBytes = 768 * 1024;

    render(
      <LargeFileEditorState
        docName="big-note"
        size={oversizedBytes}
        limit={DOCUMENT_OPEN_BYTE_LIMIT}
      />,
    );

    expect(screen.getByRole('status').getAttribute('data-slot')).toBe('large-file-editor-state');
    expect(screen.getByRole('heading', { name: /file too large to open/i })).toBeTruthy();
    expect(screen.getByText(/big-note/).textContent).toContain('768 KiB');
    expect(screen.getByText(/big-note/).textContent).toContain('512 KiB');
    expect(screen.queryByRole('button', { name: /go back/i })).toBeNull();
  });

  test('go back action routes to the previous document', async () => {
    const onNavigateBack = mock(() => {});
    render(
      <LargeFileEditorState
        docName="big-note"
        size={768 * 1024}
        limit={DOCUMENT_OPEN_BYTE_LIMIT}
        backNav={{ previousDocName: 'small-note', onNavigateBack }}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /go back/i }));

    expect(onNavigateBack).toHaveBeenCalledWith('small-note');
  });
});
