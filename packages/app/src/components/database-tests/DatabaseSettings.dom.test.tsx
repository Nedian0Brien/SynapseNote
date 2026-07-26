import { afterEach, describe, expect, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InlineDatabaseSettingsPanel } from '@/editor/components/InlineDatabaseSettingsPanel';
import { createDatabaseTestFixture } from './database-test-fixture';

afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe('database focused settings suite', () => {
  test('opens settings without removing the mounted table surface', async () => {
    const fixture = createDatabaseTestFixture();
    const calls: string[] = [];
    render(
      <>
        <div data-testid="stable-table-surface" />
        <InlineDatabaseSettingsPanel
          open
          onOpenChange={() => {}}
          activeView={fixture.view as never}
          linkedSource={fixture.source as never}
          visiblePropertyCount={2}
          totalPropertyCount={2}
          onOpenFilters={() => calls.push('filter')}
          onOpenSort={() => calls.push('sort')}
          onOpenProperties={() => calls.push('properties')}
          onOpenAdvancedSettings={() => calls.push('layout')}
          onOpenSavedViews={() => calls.push('views')}
        />
      </>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByRole('dialog', { name: 'View settings' })).toBeTruthy();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close view settings' }));
    });
    expect(screen.getByTestId('stable-table-surface')).toBeTruthy();
    expect(calls).toEqual([]);
  });
});
