import { afterEach, describe, expect, test } from 'bun:test';
import { act, cleanup, render, screen } from '@testing-library/react';
import { DatabaseOverlayHost } from '@/components/DatabaseOverlayHost';
import { resetDatabaseOverlayState } from '@/lib/database-overlay-store';
import { requestOpenDatabaseRecord } from '@/lib/database-record-open-command';
import { createDatabaseTestFixture } from './database-test-fixture';

afterEach(() => {
  cleanup();
  resetDatabaseOverlayState();
});

describe('database focused open suite', () => {
  test('opens the canonical peek from a fresh fixture', async () => {
    const fixture = createDatabaseTestFixture();
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
    expect(outcome.status).toBe('peek');
    expect(await screen.findByRole('button', { name: 'Open full page' })).toBeTruthy();
  });
});
