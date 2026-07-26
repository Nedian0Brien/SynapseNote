import { afterEach, describe, expect, test } from 'bun:test';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatabaseOverlayHost } from '@/components/DatabaseOverlayHost';
import { resetDatabaseOverlayState } from '@/lib/database-overlay-store';
import { requestOpenDatabaseRecord } from '@/lib/database-record-open-command';
import { createDatabaseTestFixture } from './database-test-fixture';

afterEach(() => {
  cleanup();
  resetDatabaseOverlayState();
});

describe('database focused overlay suite', () => {
  test('exposes a named dialog with description and closes through keyboard focus management', async () => {
    const fixture = createDatabaseTestFixture();
    const user = userEvent.setup();
    render(<DatabaseOverlayHost />);
    let outcome!: ReturnType<typeof requestOpenDatabaseRecord>;
    act(() => {
      outcome = requestOpenDatabaseRecord({
        ...fixture,
        recordPaths: [fixture.record.path],
        origin: 'inline',
        notionSurface: true,
      });
    });
    const dialog = await screen.findByRole('dialog', { name: 'Database page' });
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    await user.tab();
    expect(document.activeElement).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(outcome.interactionId).toMatch(/^db-interaction-/);
  });
});
