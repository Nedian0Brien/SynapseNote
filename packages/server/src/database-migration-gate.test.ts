import { describe, expect, test } from 'bun:test';
import { DatabaseMigrationGate } from './database-migration-gate.ts';

describe('DatabaseMigrationGate', () => {
  test('holds one owner and releases only for that owner', () => {
    const gate = new DatabaseMigrationGate();
    expect(gate.tryAcquire('task_one')).toBe(true);
    expect(gate.tryAcquire('task_two')).toBe(false);
    expect(gate.current()).toEqual({ taskId: 'task_one' });
    gate.release('task_two');
    expect(gate.current()).toEqual({ taskId: 'task_one' });
    gate.release('task_one');
    expect(gate.current()).toBeNull();
    expect(gate.tryAcquire('task_two')).toBe(true);
  });

  test('is idempotent for the current owner', () => {
    const gate = new DatabaseMigrationGate();
    expect(gate.tryAcquire('task_one')).toBe(true);
    expect(gate.tryAcquire('task_one')).toBe(true);
  });

  test('restores a durable owner after a process restart', () => {
    const restarted = new DatabaseMigrationGate();
    expect(restarted.restore('task_recovered')).toBe(true);
    expect(restarted.current()).toEqual({ taskId: 'task_recovered' });
    expect(restarted.restore('task_other')).toBe(false);
  });
});
