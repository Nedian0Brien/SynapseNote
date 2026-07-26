import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { DatabaseTable } from '@/components/DatabaseTableDialog';
import { createDatabaseTestFixture } from './database-test-fixture';

afterEach(cleanup);

describe('database focused continuity suite', () => {
  test('keeps the table root identity across a background result update', () => {
    const fixture = createDatabaseTestFixture();
    const view = render(
      <DatabaseTable
        source={fixture.source as never}
        result={fixture.result as never}
        notionSurface
      />,
    );
    const root = view.container.querySelector('[data-database-inline-table]');
    expect(root).not.toBeNull();
    view.rerender(
      <DatabaseTable
        source={fixture.source as never}
        result={{ ...fixture.result, snapshotRevision: `sha256:${'a'.repeat(64)}` } as never}
        notionSurface
      />,
    );
    expect(view.container.querySelector('[data-database-inline-table]')).toBe(root);
  });
});
