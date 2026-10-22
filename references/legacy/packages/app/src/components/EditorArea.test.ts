import { describe, expect, test } from 'bun:test';

describe('EditorArea module', () => {
  test('exports EditorArea component', async () => {
    const mod = await import('./EditorArea');
    expect(typeof mod.EditorArea).toBe('function');
  });
});
