import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabaseAutomationNotificationStore } from './database-automation-notification-store.ts';

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('DatabaseAutomationNotificationStore', () => {
  test('persists recipient-scoped notifications and replays delivery idempotently', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-automation-note-'));
    tempDirs.push(projectDir);
    const options = {
      projectDir,
      now: () => new Date('2026-07-21T00:00:00.000Z'),
      generateUuid: () => 'aaaaaaaa-0000-4000-8000-000000000000',
    };
    const first = createDatabaseAutomationNotificationStore(options);
    const input = {
      recipientIds: ['person_owner'],
      title: 'Review task',
      body: 'One task needs attention.',
      idempotencyKey: 'automation-run:one:action:notify',
    };
    const delivered = await first.deliver(input);
    expect(
      existsSync(join(projectDir, '.ok', 'local', 'database-automation-notifications.json')),
    ).toBe(true);
    expect(existsSync(join(projectDir, '.ok', 'databases', 'automation-notifications.json'))).toBe(
      false,
    );
    expect(await createDatabaseAutomationNotificationStore(options).deliver(input)).toEqual(
      delivered,
    );
    expect(await first.list({ recipientId: 'person_owner', unreadOnly: true })).toEqual([
      expect.objectContaining({ id: delivered.receiptId, title: 'Review task', readAt: null }),
    ]);
    await first.markRead(delivered.receiptId);
    expect(await first.list({ recipientId: 'person_owner', unreadOnly: true })).toEqual([]);
  });
});
