import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { DatabaseTableSelectionLayer } from './DatabaseTableSelectionLayer';

afterEach(cleanup);

function SelectionLayerHarness() {
  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set(['rec_one']));
  return (
    <div ref={hostRef} className="relative">
      <div ref={scrollRef}>
        <table>
          <thead>
            <tr>
              <th>Title</th>
            </tr>
          </thead>
          <tbody>
            <tr data-record-id="rec_one" data-record-label="One">
              <td>One</td>
            </tr>
            <tr data-record-id="rec_two" data-record-label="Two">
              <td>Two</td>
            </tr>
          </tbody>
        </table>
      </div>
      <DatabaseTableSelectionLayer
        enabled
        tableHostRef={hostRef}
        scrollContainerRef={scrollRef}
        mutationLocked={false}
        recordIds={['rec_one', 'rec_two']}
        selectedRecordIds={selected}
        onSelectionChange={setSelected}
      />
    </div>
  );
}

describe('DatabaseTableSelectionLayer', () => {
  test('keeps selected rows and the loaded-page control actionable outside table tracks', async () => {
    render(<SelectionLayerHarness />);

    const header = await screen.findByRole('checkbox', { name: 'Select all loaded pages' });
    expect(header.getAttribute('aria-checked')).toBe('mixed');
    expect(screen.getByRole('checkbox', { name: 'Deselect page One' })).toBeTruthy();
    expect(document.querySelector('[data-database-table-selector-track]')).toBeNull();

    fireEvent.click(header);
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Deselect page Two' })).toBeTruthy();
      expect(header.getAttribute('aria-checked')).toBe('true');
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Deselect page One' }));
    await waitFor(() =>
      expect(screen.queryByRole('checkbox', { name: 'Deselect page One' })).toBeNull(),
    );
  });
});
