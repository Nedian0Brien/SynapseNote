import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { DatabaseTableInteractionLayer } from './DatabaseTableInteractionLayer';

afterEach(cleanup);

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

function InteractionLayerHarness() {
  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={hostRef} data-testid="table-host">
      <div ref={scrollRef} data-testid="scroll-owner">
        <table>
          <tbody>
            <tr data-record-id="rec_one" data-record-label="One">
              <td>One</td>
            </tr>
          </tbody>
        </table>
      </div>
      <DatabaseTableInteractionLayer
        enabled
        tableHostRef={hostRef}
        scrollContainerRef={scrollRef}
        mutationLocked={false}
        reorderEnabled={false}
        canCreatePage={false}
        selectedRecordIds={new Set()}
        onToggleSelection={() => {}}
      />
    </div>
  );
}

describe('DatabaseTableInteractionLayer', () => {
  test('reveals the row checkbox when the pointer enters its empty rail position', () => {
    render(<InteractionLayerHarness />);

    const scrollOwner = screen.getByTestId('scroll-owner');
    const row = screen.getByRole('row');
    scrollOwner.getBoundingClientRect = () => rect(100, 20, 300, 120);
    row.getBoundingClientRect = () => rect(100, 40, 300, 40);

    fireEvent.pointerMove(document, { clientX: 80, clientY: 60 });

    const checkbox = screen.getByRole('checkbox', {
      name: 'Select page checkbox rec_one',
    });
    expect(
      checkbox.closest('[data-database-table-interaction-layer]')?.getAttribute('data-record-id'),
    ).toBe('rec_one');
    expect(
      (checkbox.closest('[data-database-table-interaction-layer]') as HTMLElement).style.visibility,
    ).toBe('visible');
  });
});
