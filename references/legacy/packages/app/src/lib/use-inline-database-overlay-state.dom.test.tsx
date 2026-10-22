import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useInlineDatabaseOverlayState } from './use-inline-database-overlay-state';

afterEach(cleanup);

function Harness() {
  const state = useInlineDatabaseOverlayState();
  return (
    <div>
      <button type="button" onClick={() => state.openFilter('title')}>
        Filters
      </button>
      <button type="button" onClick={() => state.openSort('status')}>
        Sort
      </button>
      <button type="button" onClick={state.openProperties}>
        Properties
      </button>
      <button type="button" onClick={state.close}>
        Close
      </button>
      <output data-testid="overlay">{state.overlay?.kind ?? 'none'}</output>
      <output data-testid="property">{state.overlay?.propertyId ?? 'none'}</output>
    </div>
  );
}

describe('useInlineDatabaseOverlayState', () => {
  test('keeps one active overlay and replaces it on the next toolbar action', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByTestId('overlay').textContent).toBe('filter');
    expect(screen.getByTestId('property').textContent).toBe('title');

    fireEvent.click(screen.getByRole('button', { name: 'Sort' }));
    expect(screen.getByTestId('overlay').textContent).toBe('sort');
    expect(screen.getByTestId('property').textContent).toBe('status');

    fireEvent.click(screen.getByRole('button', { name: 'Properties' }));
    expect(screen.getByTestId('overlay').textContent).toBe('properties');
    expect(screen.getByTestId('property').textContent).toBe('none');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByTestId('overlay').textContent).toBe('none');
  });
});
