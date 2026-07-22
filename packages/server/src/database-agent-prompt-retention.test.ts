import { describe, expect, test } from 'bun:test';
import {
  createDatabaseAgentPromptRetentionStore,
  DATABASE_AGENT_PROMPT_RETENTION_MAX_SECONDS,
} from './database-agent-prompt-retention.ts';

describe('DatabaseAgentPromptRetentionStore', () => {
  test('requires explicit bounded opt-in and keeps metadata content-free', () => {
    const store = createDatabaseAgentPromptRetentionStore({
      now: () => new Date('2026-07-21T00:00:00.000Z'),
    });
    expect(() =>
      store.retain({
        runId: 'run_one',
        prompt: 'private prompt',
        consent: false as true,
        ttlSeconds: 60,
      }),
    ).toThrow(expect.objectContaining({ code: 'prompt_retention_invalid' }));
    expect(() =>
      store.retain({
        runId: 'run_one',
        prompt: 'private prompt',
        consent: true,
        ttlSeconds: DATABASE_AGENT_PROMPT_RETENTION_MAX_SECONDS + 1,
      }),
    ).toThrow(expect.objectContaining({ code: 'prompt_retention_invalid' }));

    const metadata = store.retain({
      runId: 'run_one',
      prompt: 'private prompt',
      consent: true,
      ttlSeconds: 60,
    });
    expect(metadata).toEqual({
      runId: 'run_one',
      storage: 'process_memory',
      retainedAt: '2026-07-21T00:00:00.000Z',
      expiresAt: '2026-07-21T00:01:00.000Z',
      bytes: 14,
    });
    expect(JSON.stringify(metadata)).not.toContain('private prompt');
    expect(store.get('run_one').prompt).toBe('private prompt');
    store.clear();
  });

  test('deletes expired prompts and loses all retained content on process-store clear', () => {
    let now = new Date('2026-07-21T00:00:00.000Z');
    const store = createDatabaseAgentPromptRetentionStore({ now: () => now });
    store.retain({ runId: 'run_expiring', prompt: 'ephemeral', consent: true, ttlSeconds: 60 });
    now = new Date('2026-07-21T00:01:00.000Z');
    expect(() => store.get('run_expiring')).toThrow(
      expect.objectContaining({ code: 'prompt_retention_not_found' }),
    );
    store.retain({
      runId: 'run_restart',
      prompt: 'restart-safe privacy',
      consent: true,
      ttlSeconds: 60,
    });
    store.clear();
    expect(() => store.get('run_restart')).toThrow(
      expect.objectContaining({ code: 'prompt_retention_not_found' }),
    );
  });
});
