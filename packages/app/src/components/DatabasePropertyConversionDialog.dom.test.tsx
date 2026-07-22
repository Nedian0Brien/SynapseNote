import { afterEach, describe, expect, mock, test } from 'bun:test';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  createDatabasePropertyConversionTarget,
  DatabasePropertyConversionDialog,
} from './DatabasePropertyConversionDialog';

i18n.load('en', {});
i18n.activate('en');

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

describe('DatabasePropertyConversionDialog', () => {
  test('preserves stable identity and strips status-only vocabulary fields', () => {
    const target = createDatabasePropertyConversionTarget(
      {
        id: 'prop_phase',
        key: 'phase',
        name: 'Phase',
        type: 'status',
        groups: [
          { id: 'stg_todo', key: 'todo', name: 'Todo', category: 'todo' },
          {
            id: 'stg_progress',
            key: 'progress',
            name: 'In progress',
            category: 'in_progress',
          },
          {
            id: 'stg_done',
            key: 'done',
            name: 'Done',
            category: 'complete',
          },
        ],
        options: [
          {
            id: 'opt_todo',
            key: 'todo',
            name: 'Todo',
            groupId: 'stg_todo',
          },
          {
            id: 'opt_progress',
            key: 'progress',
            name: 'In progress',
            groupId: 'stg_progress',
          },
          {
            id: 'opt_done',
            key: 'done',
            name: 'Done',
            groupId: 'stg_done',
          },
        ],
      },
      'multi_select',
    );
    expect(target).toMatchObject({
      id: 'prop_phase',
      key: 'phase',
      name: 'Phase',
      type: 'multi_select',
    });
    const firstOption = target.options[0];
    expect(firstOption).toMatchObject({ id: 'opt_todo', key: 'todo', name: 'Todo' });
    expect(firstOption ? 'groupId' in firstOption : true).toBe(false);
  });

  test('requires a separate lossy approval before exposing the exact plan for review', async () => {
    const hash = `sha256:${'a'.repeat(64)}`;
    const revision = `sha256:${'b'.repeat(64)}`;
    let approved = false;
    globalThis.fetch = mock(async (_input: unknown, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { allowLossy: boolean };
      approved = request.allowLossy;
      return Response.json({
        databaseId: 'db_places',
        sourceId: 'ds_places',
        propertyId: 'prop_place',
        manifestRevision: hash,
        indexRevision: revision,
        preview: {
          rule: {
            from: 'place',
            to: 'text',
            kind: 'lossy',
            reason: 'Structured identity is flattened',
          },
          committable: approved,
          requiresLossyApproval: !approved,
          summary: { total: 1, empty: 0, converted: 0, lossy: 1, blocked: 0 },
          changes: [
            {
              recordId: 'rec_one',
              expectedRevision: hash,
              outcome: 'lossy',
              before: { name: 'Seoul', latitude: 37.5, longitude: 127 },
              after: '{"name":"Seoul","latitude":37.5,"longitude":127}',
            },
          ],
          rollbackValues: { rec_one: { name: 'Seoul', latitude: 37.5, longitude: 127 } },
        },
        draft: approved ? { id: 'draft_conversion', revision: hash } : null,
        plan: approved
          ? {
              id: 'plan_conversion',
              hash,
              snapshotRevision: revision,
              committable: true,
              requiresCommit: true,
              conflicts: [],
              approvals: [],
              diff: { mode: 'exact', manifests: [], records: [], templates: [], policy: null },
            }
          : null,
      });
    }) as unknown as typeof fetch;
    const onReviewPlan = mock(() => {});
    render(
      <I18nProvider i18n={i18n}>
        <DatabasePropertyConversionDialog
          open
          onOpenChange={() => {}}
          databaseId="db_places"
          sourceId="ds_places"
          property={{
            id: 'prop_place',
            key: 'place',
            name: 'Place',
            type: 'place',
            externalSearch: 'disabled',
            externalMap: 'disabled',
          }}
          onReviewPlan={onReviewPlan}
        />
      </I18nProvider>,
    );
    expect(screen.getByText('Place')).toBeTruthy();
    expect(screen.getByText('Short notes or descriptions')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Preview conversion' }));
    expect(await screen.findByText('Structured identity is flattened')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Review exact plan' })).toBeNull();
    fireEvent.click(screen.getByLabelText('Approve lossy conversion'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve and preview' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Review exact plan' })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review exact plan' }));
    expect(onReviewPlan).toHaveBeenCalledWith(expect.objectContaining({ id: 'plan_conversion' }));
  });
});
