import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useDatabaseRefreshScheduler } from './use-database-refresh-scheduler';

afterEach(cleanup);

function Harness() {
  const { refreshKey, setRefresh, refreshNow } = useDatabaseRefreshScheduler(20);
  return (
    <div>
      <output data-testid="refresh-key">{refreshKey}</output>
      <button
        type="button"
        onClick={() => {
          for (let index = 0; index < 10; index += 1) {
            setRefresh((current) => current + 1);
          }
        }}
      >
        Burst
      </button>
      <button type="button" onClick={refreshNow}>
        Now
      </button>
    </div>
  );
}

describe('useDatabaseRefreshScheduler', () => {
  test('coalesces a burst and still supports an immediate user refresh', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Burst' }));
    expect(screen.getByTestId('refresh-key').textContent).toBe('0');
    await waitFor(() => expect(screen.getByTestId('refresh-key').textContent).toBe('1'));

    fireEvent.click(screen.getByRole('button', { name: 'Now' }));
    expect(screen.getByTestId('refresh-key').textContent).toBe('2');
  });
});
