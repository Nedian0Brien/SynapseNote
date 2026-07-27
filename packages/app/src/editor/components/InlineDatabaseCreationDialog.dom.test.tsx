/**
 * Parity contract for the Notion-style inline creation placeholder: while the
 * blank-database round-trip runs, the autoStart branch must render the same
 * structural hooks as the loaded inline surface (data-database-inline-surface
 * on the section, data-database-inline-table on the table) so the shared
 * database.css rules style it and the create-to-ready swap stays seamless.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const executeDatabaseUiMutationMock = mock(
  (..._args: unknown[]): Promise<never> => new Promise<never>(() => {}),
);

mock.module('@/lib/database-mutation-client', () => ({
  executeDatabaseUiMutation: executeDatabaseUiMutationMock,
}));

const { InlineDatabaseCreationDialog } = await import('./InlineDatabaseCreationDialog');

beforeEach(() => {
  executeDatabaseUiMutationMock.mockClear();
  executeDatabaseUiMutationMock.mockImplementation(() => new Promise<never>(() => {}));
});

afterEach(cleanup);

describe('InlineDatabaseCreationDialog autoStart placeholder', () => {
  test('renders the inline surface and table parity hooks while creating', () => {
    render(
      <InlineDatabaseCreationDialog open autoStart onOpenChange={() => {}} onCreated={() => {}} />,
    );

    const surface = screen.getByTestId('inline-database-create-dialog');
    expect(surface.hasAttribute('data-database-inline-surface')).toBe(true);
    expect(surface.getAttribute('aria-busy')).toBe('true');
    const table = surface.querySelector('table[data-database-inline-table]');
    expect(table).not.toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Title' })).toBeTruthy();
    expect((screen.getByLabelText('New page title') as HTMLInputElement).disabled).toBe(true);

    // Geometry parity with the loaded empty inline surface, captured from a
    // rendered v2 table: a 280px title track, a 144px inline actions track and
    // the filler track, so the create-to-ready swap does not shift columns.
    const trackWidths = [...surface.querySelectorAll('colgroup col')].map(
      (col) => (col as HTMLTableColElement).style.width,
    );
    expect(trackWidths).toEqual(['280px', '144px', '']);
    expect((table as HTMLTableElement).style.minWidth).toBe('424px');

    // InlineDatabaseHeader renders no view tab strip for a single saved view;
    // showing one here would push the table down when the real surface loads.
    expect(surface.querySelector('[data-linked-database-view-tabs]')).toBeNull();
  });

  test('clears aria-busy and offers an in-place retry when creation fails', async () => {
    executeDatabaseUiMutationMock.mockImplementation(async () => {
      throw new Error('offline');
    });
    render(
      <InlineDatabaseCreationDialog open autoStart onOpenChange={() => {}} onCreated={() => {}} />,
    );

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('offline'));
    expect(screen.getByTestId('inline-database-create-dialog').getAttribute('aria-busy')).toBe(
      'false',
    );

    const callsBefore = executeDatabaseUiMutationMock.mock.calls.length;
    fireEvent.click(screen.getByTestId('inline-database-create-retry'));
    await waitFor(() =>
      expect(executeDatabaseUiMutationMock.mock.calls.length).toBe(callsBefore + 1),
    );
  });
});
