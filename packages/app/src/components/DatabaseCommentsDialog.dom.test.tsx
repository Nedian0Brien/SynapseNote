import { afterEach, describe, expect, test } from 'bun:test';
import {
  DatabaseDefinitionSchema,
  DatabaseRecordCommentsSchema,
} from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  DatabaseCommentRequest,
  DatabaseCommentSnapshot,
} from '@/lib/database-comments-client';
import { DatabaseCommentsDialog } from './DatabaseCommentsDialog';

afterEach(cleanup);

const database = DatabaseDefinitionSchema.parse({
  version: 1,
  id: 'db_tasks',
  key: 'tasks',
  name: 'Tasks',
  contract: {
    purpose: 'Track tasks',
    canonicality: 'canonical',
    vocabulary: ['task'],
    freshness: { expectation: 'realtime' },
    sensitivity: 'internal',
  },
  people: [{ id: 'person_reviewer', key: 'reviewer', name: 'Reviewer', kind: 'collaborator' }],
  sources: [
    {
      id: 'ds_tasks',
      key: 'tasks',
      name: 'Tasks',
      recordMeaning: 'One task',
      folder: 'tasks',
      properties: [
        { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
        { id: 'prop_score', key: 'score', name: 'Score', type: 'number' },
        { id: 'prop_empty', key: 'empty', name: 'Empty', type: 'text' },
      ],
    },
  ],
});
const source = database.sources[0];
if (!source) throw new Error('expected source');
const emptyDocument = DatabaseRecordCommentsSchema.parse({
  version: 1,
  databaseId: database.id,
  recordId: 'rec_first',
  threads: [],
});
const revision = `sha256:${'0'.repeat(64)}`;

describe('DatabaseCommentsDialog', () => {
  test('creates a mentioned property thread and exposes resolve/reopen lifecycle', async () => {
    const requests: DatabaseCommentRequest[] = [];
    const request = async (input: DatabaseCommentRequest): Promise<DatabaseCommentSnapshot> => {
      requests.push(input);
      if (input.action === 'read') return { revision, document: emptyDocument };
      if (input.action === 'add_thread') {
        return {
          revision: `sha256:${'1'.repeat(64)}`,
          document: DatabaseRecordCommentsSchema.parse({
            ...emptyDocument,
            threads: [
              {
                id: 'cth_first',
                anchor: input.anchor,
                comments: [
                  {
                    id: 'cmt_first',
                    author: input.actor,
                    body: input.body,
                    mentionedPersonIds: input.mentionedPersonIds,
                    createdAt: '2026-07-21T10:00:00.000Z',
                  },
                ],
              },
            ],
          }),
        };
      }
      return {
        revision: `sha256:${'2'.repeat(64)}`,
        document: DatabaseRecordCommentsSchema.parse({
          ...emptyDocument,
          threads: [
            {
              id: 'cth_first',
              anchor: { type: 'property', propertyId: 'prop_score' },
              comments: [
                {
                  id: 'cmt_first',
                  author: input.actor,
                  body: 'Check zero',
                  mentionedPersonIds: [],
                  createdAt: '2026-07-21T10:00:00.000Z',
                },
              ],
              resolvedAt: '2026-07-21T10:01:00.000Z',
              resolvedBy: input.actor,
            },
          ],
        }),
      };
    };

    render(
      <DatabaseCommentsDialog
        open
        onOpenChange={() => {}}
        database={database}
        source={source}
        record={{
          id: 'rec_first',
          path: 'tasks/first.md',
          revision,
          values: { prop_title: 'First', prop_score: 0 },
        }}
        request={request}
      />,
    );
    await screen.findByText('No comments yet.');
    const anchor = screen.getByLabelText('Comment on');
    fireEvent.click(anchor);
    expect(screen.getByRole('option', { name: 'Page' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Score' })).toBeDefined();
    expect(screen.queryByRole('option', { name: 'Title' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Empty' })).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: 'Score' }));
    fireEvent.change(screen.getByPlaceholderText('Add a comment'), {
      target: { value: 'Check zero' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: '@Reviewer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add comment' }));
    await screen.findByText('Check zero');
    expect(requests.at(-1)).toMatchObject({
      action: 'add_thread',
      anchor: { type: 'property', propertyId: 'prop_score' },
      mentionedPersonIds: ['person_reviewer'],
      expectedRevision: revision,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reopen' })).toBeDefined());
    expect(requests.at(-1)).toMatchObject({ action: 'set_resolved', resolved: true });
  });
});
