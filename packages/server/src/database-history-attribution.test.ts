import { describe, expect, test } from 'bun:test';
import {
  parseContributors,
  parseWriterId,
} from '@nedian0brien/synapsenote-core/shadow-repo-layout';
import {
  databaseTimelineCommitMessage,
  databaseTimelineDocumentNames,
  databaseWriterIdentity,
} from './database-commit';

describe('database history attribution', () => {
  test('uses recognized per-actor shadow writer identities', () => {
    const agent = databaseWriterIdentity({ principalId: 'agent:codex', kind: 'agent' });
    const human = databaseWriterIdentity({ principalId: 'user:ada', kind: 'human' });
    expect(parseWriterId(agent.id).classification).toBe('agent');
    expect(parseWriterId(human.id).classification).toBe('principal');
    expect(databaseWriterIdentity({ principalId: 'local', kind: 'filesystem' }).id).toBe(
      'file-system',
    );
  });

  test('maps only content Markdown paths to canonical doc names', () => {
    expect(
      databaseTimelineDocumentNames(
        [
          '.ok/databases/tasks.yml',
          'content/tasks/one.md',
          'content/tasks/two.mdx',
          'content/tasks/one.md',
          'elsewhere/no.md',
        ],
        'content',
      ),
    ).toEqual(['tasks/one', 'tasks/two']);
  });

  test('emits the existing structured contributor contract for timeline consumers', () => {
    const message = databaseTimelineCommitMessage({
      actor: { principalId: 'agent:codex', kind: 'agent', sessionId: 'session-1' },
      summary: 'Update task status',
      docs: ['tasks/one'],
    });
    expect(message.startsWith('database: Update task status\n\n')).toBe(true);
    expect(parseContributors(message)).toEqual([
      {
        v: 1,
        id: databaseWriterIdentity({ principalId: 'agent:codex', kind: 'agent' }).id,
        name: 'agent:codex',
        colorSeed: 'agent:codex',
        docs: ['tasks/one'],
        summaries: ['Update task status'],
      },
    ]);
  });
});
