import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DatabasePermissionsDialog } from './DatabasePermissionsDialog';

const originalFetch = globalThis.fetch;
const originalConfirm = window.confirm;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.confirm = originalConfirm;
});

describe('DatabasePermissionsDialog', () => {
  test('creates, edits, and revokes an exact database action grant', async () => {
    const confirm = mock(() => true);
    window.confirm = confirm;
    const bodies: Array<Record<string, unknown>> = [];
    let revision = 'sha256:empty';
    const grant = {
      id: 'dbgrant_11111111-1111-4111-8111-111111111111',
      databaseId: 'db_tasks',
      principalId: 'user:collaborator',
      role: 'content_editor',
      actions: [
        'aggregate',
        'catalog',
        'describe',
        'expand_relation',
        'pack_context',
        'query',
        'read_record',
        'search',
        'create_record',
        'delete_record',
        'update_record',
      ],
      createdBy: 'user:owner',
      createdAt: '2026-07-21T00:00:00.000Z',
      updatedAt: '2026-07-21T00:00:00.000Z',
    };
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      if (body.action === 'list') {
        return Response.json({ action: 'list', grants: [], revision });
      }
      if (body.action === 'upsert') {
        revision = `sha256:${'1'.repeat(64)}`;
        return Response.json({ action: 'upsert', grant, revision });
      }
      revision = `sha256:${'2'.repeat(64)}`;
      return Response.json({ action: 'remove', grantId: grant.id, revision });
    }) as typeof fetch;

    render(
      <DatabasePermissionsDialog
        open
        onOpenChange={() => {}}
        databaseId="db_tasks"
        databaseName="Tasks"
      />,
    );

    expect(
      await screen.findByText('No explicit grants. Only the project owner has access.'),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Principal ID'), {
      target: { value: 'user:collaborator' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'Permission role' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Content editor' }));
    fireEvent.click(screen.getByText('Apply across the workspace'));
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(await screen.findByText('user:collaborator')).toBeTruthy();
    expect(bodies[1]).toMatchObject({
      action: 'upsert',
      databaseId: null,
      principalId: 'user:collaborator',
      role: 'content_editor',
      expectedRevision: 'sha256:empty',
    });
    expect(bodies[1]?.actions).toEqual(
      expect.arrayContaining(['create_record', 'update_record', 'delete_record']),
    );
    expect((bodies[1]?.actions as string[]).includes('alter_schema')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Edit user:collaborator' }));
    expect(screen.getByDisplayValue('user:collaborator')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke user:collaborator' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('database Tasks'));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('create the same grant again'));
    await waitFor(() => expect(screen.queryByText('user:collaborator')).toBeNull());
    expect(bodies[2]).toEqual({
      action: 'remove',
      grantId: grant.id,
      expectedRevision: `sha256:${'1'.repeat(64)}`,
    });
  });
});
