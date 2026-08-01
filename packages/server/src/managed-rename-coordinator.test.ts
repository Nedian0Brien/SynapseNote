import { describe, expect, test } from 'bun:test';
import { createManagedRenameCoordinator } from './managed-rename-coordinator.ts';

describe('managed rename coordinator recovery ordering', () => {
  test('writes the journal before the disk move and clears it only after the rename log', async () => {
    const events: string[] = [];
    const coordinator = createManagedRenameCoordinator({
      withRecovery: async (operation) => {
        events.push('journal-write');
        await operation();
        events.push('journal-clear');
      },
    });

    await coordinator.runDurableRename(async () => {
      events.push('disk-move');
      events.push('rename-log');
    });

    expect(events).toEqual(['journal-write', 'disk-move', 'rename-log', 'journal-clear']);
  });

  test('does not clear the journal when the rename log append fails', async () => {
    const events: string[] = [];
    const coordinator = createManagedRenameCoordinator({
      withRecovery: async (operation) => {
        events.push('journal-write');
        await operation();
        events.push('journal-clear');
      },
    });

    await expect(
      coordinator.runDurableRename(async () => {
        events.push('disk-move');
        throw new Error('EIO append rename log');
      }),
    ).rejects.toThrow('EIO append rename log');

    expect(events).toEqual(['journal-write', 'disk-move']);
  });
});
