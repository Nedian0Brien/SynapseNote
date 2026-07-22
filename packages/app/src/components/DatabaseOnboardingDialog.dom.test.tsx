import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DatabaseOnboardingDialog } from './DatabaseOnboardingDialog';

const originalFetch = globalThis.fetch;
const revision = `sha256:${'a'.repeat(64)}`;
const target = {
  databaseId: 'db_research',
  sourceId: 'ds_notes',
  expectedManifestRevision: revision,
};

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

describe('DatabaseOnboardingDialog', () => {
  test('shows blocking paths and cannot start a partial or unresolved onboarding', async () => {
    const requests: Record<string, unknown>[] = [];
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push(body);
      return Response.json({
        action: 'preview_import',
        preview: {
          databaseId: target.databaseId,
          sourceId: target.sourceId,
          sourceFolder: 'research/notes',
          items: [
            {
              path: 'research/notes/untitled.md',
              action: 'modify',
              reasons: [
                {
                  code: 'required_property_missing',
                  message: 'Title is required.',
                  propertyId: 'prop_title',
                  propertyKey: 'title',
                },
              ],
              plannedChanges: [
                {
                  type: 'provide_required_property',
                  propertyId: 'prop_title',
                  propertyKey: 'title',
                },
              ],
            },
          ],
          summary: { include: 0, exclude: 0, modify: 1, reject: 0 },
          complete: true,
          entryLimit: 100_000,
        },
      });
    }) as typeof fetch;

    render(<DatabaseOnboardingDialog open onOpenChange={() => {}} target={target} />);

    expect(await screen.findByText('research/notes/untitled.md')).not.toBeNull();
    expect(screen.getByText('Title is required.')).not.toBeNull();
    expect((screen.getByText('Start onboarding') as HTMLButtonElement).disabled).toBe(true);
    expect(requests).toEqual([{ action: 'preview_import', ...target }]);
  });

  test('starts only the exact reviewed, blocker-free source and manifest revision', async () => {
    const requests: Record<string, unknown>[] = [];
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push(body);
      if (body.action === 'preview_import') {
        return Response.json({
          action: 'preview_import',
          preview: {
            databaseId: target.databaseId,
            sourceId: target.sourceId,
            sourceFolder: 'research/notes',
            items: [
              {
                path: 'research/notes/ready.md',
                action: 'modify',
                reasons: [
                  {
                    code: 'record_identity_required',
                    message: 'A stable record ID will be assigned.',
                  },
                ],
                plannedChanges: [{ type: 'assign_record_id' }],
              },
            ],
            summary: { include: 0, exclude: 0, modify: 1, reject: 0 },
            complete: true,
            entryLimit: 100_000,
          },
        });
      }
      return Response.json({
        action: 'start',
        task: {
          id: 'task_import_reviewed',
          operation: 'import',
          state: 'queued',
          revision,
        },
      });
    }) as typeof fetch;

    render(<DatabaseOnboardingDialog open onOpenChange={() => {}} target={target} />);
    await screen.findByText(/No blockers/);
    fireEvent.click(screen.getByText('Start onboarding'));

    expect(await screen.findByText(/task_import_reviewed/)).not.toBeNull();
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toEqual({
      action: 'start',
      task: { operation: 'import', ...target },
    });
  });
});
