import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseDefinitionSchema, type DatabaseRecord } from '@nedian0brien/synapsenote-core';
import { createDatabaseCommentStore, DatabaseCommentStoreError } from './database-comment-store';

const tempDirs: string[] = [];
afterEach(() => {
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture(input?: { deny?: string }) {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-comments-'));
  tempDirs.push(projectDir);
  const definition = DatabaseDefinitionSchema.parse({
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
    people: [
      { id: 'person_reviewer', key: 'reviewer', name: 'Reviewer', kind: 'collaborator' },
      {
        id: 'person_inactive',
        key: 'inactive',
        name: 'Inactive',
        kind: 'collaborator',
        active: false,
      },
    ],
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
  const source = definition.sources[0];
  if (!source) throw new Error('expected source');
  const record: DatabaseRecord = {
    id: 'rec_first',
    databaseId: definition.id,
    sourceId: source.id,
    path: 'tasks/first.md',
    revision: `sha256:${'a'.repeat(64)}`,
    values: { prop_title: 'First', prop_score: 0 },
    body: 'Body',
  };
  let uuid = 0;
  const store = createDatabaseCommentStore({
    projectDir,
    resolveRecord: (databaseId, recordId) =>
      databaseId === definition.id && recordId === record.id
        ? { definition, source, record, people: definition.people }
        : null,
    authorize: ({ action }) => action !== input?.deny,
    now: (() => {
      let minute = 0;
      return () => new Date(`2026-07-21T10:${String(minute++).padStart(2, '0')}:00.000Z`);
    })(),
    generateUuid: () => `${String(++uuid).padStart(8, '0')}-0000-4000-8000-000000000000`,
  });
  return {
    projectDir,
    store,
    human: { kind: 'human' as const, principal_id: 'user:local' },
    agent: { kind: 'agent' as const, principal_id: 'agent:codex' },
  };
}

describe('DatabaseCommentStore', () => {
  test('persists mentions and resolved threads with revision-safe lifecycle updates', async () => {
    const { projectDir, store, human } = fixture();
    const empty = await store.read({ databaseId: 'db_tasks', recordId: 'rec_first', actor: human });
    const added = await store.addThread({
      databaseId: 'db_tasks',
      recordId: 'rec_first',
      actor: human,
      expectedRevision: empty.revision,
      anchor: { type: 'page' },
      body: 'Please review this.',
      mentionedPersonIds: ['person_reviewer'],
    });
    expect(added.document.threads[0]?.comments[0]).toMatchObject({
      body: 'Please review this.',
      mentionedPersonIds: ['person_reviewer'],
    });
    await expect(
      store.addThread({
        databaseId: 'db_tasks',
        recordId: 'rec_first',
        actor: human,
        expectedRevision: empty.revision,
        anchor: { type: 'page' },
        body: 'Stale',
      }),
    ).rejects.toMatchObject({ code: 'revision_changed' });
    const threadId = added.document.threads[0]?.id;
    if (!threadId) throw new Error('expected thread');
    const resolved = await store.setResolved({
      databaseId: 'db_tasks',
      recordId: 'rec_first',
      actor: human,
      expectedRevision: added.revision,
      threadId,
      resolved: true,
    });
    expect(resolved.document.threads[0]?.resolvedBy).toEqual(human);
    await expect(
      store.reply({
        databaseId: 'db_tasks',
        recordId: 'rec_first',
        actor: human,
        expectedRevision: resolved.revision,
        threadId,
        body: 'Reply while closed',
      }),
    ).rejects.toMatchObject({ code: 'thread_resolved' });
    const reopened = await store.setResolved({
      databaseId: 'db_tasks',
      recordId: 'rec_first',
      actor: human,
      expectedRevision: resolved.revision,
      threadId,
      resolved: false,
    });
    const replied = await store.reply({
      databaseId: 'db_tasks',
      recordId: 'rec_first',
      actor: human,
      expectedRevision: reopened.revision,
      threadId,
      body: 'Verified.',
    });
    expect(replied.document.threads[0]?.comments).toHaveLength(2);
    const path = join(projectDir, '.ok/comments/databases/db_tasks/rec_first.json');
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf8')).version).toBe(1);
  });

  test('enforces property anchors, active mentions, authorship, and permissions', async () => {
    const { store, human, agent } = fixture();
    let snapshot = await store.read({
      databaseId: 'db_tasks',
      recordId: 'rec_first',
      actor: human,
    });
    await expect(
      store.addThread({
        databaseId: 'db_tasks',
        recordId: 'rec_first',
        actor: human,
        expectedRevision: snapshot.revision,
        anchor: { type: 'property', propertyId: 'prop_title' },
        body: 'Not allowed',
      }),
    ).rejects.toMatchObject({ code: 'invalid_anchor' });
    await expect(
      store.addThread({
        databaseId: 'db_tasks',
        recordId: 'rec_first',
        actor: human,
        expectedRevision: snapshot.revision,
        anchor: { type: 'property', propertyId: 'prop_empty' },
        body: 'No value',
      }),
    ).rejects.toMatchObject({ code: 'invalid_anchor' });
    await expect(
      store.addThread({
        databaseId: 'db_tasks',
        recordId: 'rec_first',
        actor: human,
        expectedRevision: snapshot.revision,
        anchor: { type: 'page' },
        body: 'Inactive mention',
        mentionedPersonIds: ['person_inactive'],
      }),
    ).rejects.toMatchObject({ code: 'invalid_mention' });
    snapshot = await store.addThread({
      databaseId: 'db_tasks',
      recordId: 'rec_first',
      actor: human,
      expectedRevision: snapshot.revision,
      anchor: { type: 'property', propertyId: 'prop_score' },
      body: 'Zero is still assigned.',
    });
    const thread = snapshot.document.threads[0];
    const comment = thread?.comments[0];
    if (!thread || !comment) throw new Error('expected comment');
    await expect(
      store.editComment({
        databaseId: 'db_tasks',
        recordId: 'rec_first',
        actor: agent,
        expectedRevision: snapshot.revision,
        threadId: thread.id,
        commentId: comment.id,
        body: 'Impersonated edit',
      }),
    ).rejects.toMatchObject({ code: 'not_comment_author' });

    const denied = fixture({ deny: 'comment' });
    const deniedSnapshot = await denied.store.read({
      databaseId: 'db_tasks',
      recordId: 'rec_first',
      actor: denied.human,
    });
    await expect(
      denied.store.addThread({
        databaseId: 'db_tasks',
        recordId: 'rec_first',
        actor: denied.human,
        expectedRevision: deniedSnapshot.revision,
        anchor: { type: 'page' },
        body: 'Denied',
      }),
    ).rejects.toBeInstanceOf(DatabaseCommentStoreError);
  });
});
