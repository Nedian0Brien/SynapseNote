import { describe, expect, test } from 'bun:test';
import { mergeDatabaseRecordGit } from '@nedian0brien/synapsenote-core';
import { reconcile } from './reconciliation.ts';

type Actor = { kind: 'human' | 'agent'; principalId: string };

function record(input: { title: string; body?: string; actor: Actor; editedAt: string }): string {
  return `---
_sn:
  database_id: db_tasks
  source_id: ds_tasks
  record_id: rec_one
  created_at: 2026-07-21T00:00:00.000Z
  last_edited_at: ${input.editedAt}
  created_by:
    kind: human
    principal_id: user:creator
  last_edited_by:
    kind: ${input.actor.kind}
    principal_id: ${input.actor.principalId}
title: ${input.title}
---
${input.body ?? 'Base body'}
`;
}

const baseActor: Actor = { kind: 'human', principalId: 'user:creator' };
const actorRaces: ReadonlyArray<{
  name: string;
  ours: Actor;
  theirs: Actor;
}> = [
  {
    name: 'human/human',
    ours: { kind: 'human', principalId: 'user:alice' },
    theirs: { kind: 'human', principalId: 'user:bob' },
  },
  {
    name: 'human/agent',
    ours: { kind: 'human', principalId: 'user:alice' },
    theirs: { kind: 'agent', principalId: 'agent:researcher' },
  },
  {
    name: 'agent/agent',
    ours: { kind: 'agent', principalId: 'agent:writer' },
    theirs: { kind: 'agent', principalId: 'agent:reviewer' },
  },
];

describe('deterministic database conflict race fixtures', () => {
  for (const fixture of actorRaces) {
    test(`${fixture.name} divergent same-property writes remain explicit`, () => {
      const result = mergeDatabaseRecordGit(
        record({
          title: 'Base',
          actor: baseActor,
          editedAt: '2026-07-21T00:00:00.000Z',
        }),
        record({
          title: 'Ours',
          actor: fixture.ours,
          editedAt: '2026-07-21T01:00:00.000Z',
        }),
        record({
          title: 'Theirs',
          actor: fixture.theirs,
          editedAt: '2026-07-21T02:00:00.000Z',
        }),
      );
      expect(result).toEqual({
        ok: false,
        conflicts: [
          {
            path: ['title'],
            reason: 'both_changed',
            message: 'Both sides changed the same scalar or ordered value differently',
          },
        ],
      });
    });
  }

  test('filesystem/CRDT overlapping record-body writes produce a stable conflict', () => {
    const base = record({
      title: 'Base',
      body: 'Shared paragraph',
      actor: baseActor,
      editedAt: '2026-07-21T00:00:00.000Z',
    });
    const outcome = reconcile({
      docName: 'tasks/one',
      base,
      ours: base.replace('Shared paragraph', 'CRDT paragraph'),
      theirs: base.replace('Shared paragraph', 'Filesystem paragraph'),
    });
    expect(outcome).toMatchObject({
      kind: 'conflicts',
      conflicts: [
        {
          ours: expect.stringContaining('CRDT paragraph'),
          theirs: expect.stringContaining('Filesystem paragraph'),
        },
      ],
    });
  });

  test('Git/CRDT refuses conflict-marker bytes before they enter the live document', () => {
    const base = record({
      title: 'Base',
      actor: baseActor,
      editedAt: '2026-07-21T00:00:00.000Z',
    });
    expect(
      reconcile({
        docName: 'tasks/one',
        base,
        ours: base.replace('Base body', 'Live CRDT body'),
        theirs: `${base}<<<<<<< current\nGit conflict\n=======\nOther\n>>>>>>> incoming\n`,
      }),
    ).toEqual({ kind: 'refused', reason: 'conflict-markers' });
  });
});
