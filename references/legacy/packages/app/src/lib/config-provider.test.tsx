import { describe, expect, test } from 'bun:test';

describe('ConfigProvider module surface', () => {
  test('exports ConfigProvider component and useConfigContext hook', async () => {
    const mod = await import('./config-provider');
    expect(typeof mod.ConfigProvider).toBe('function');
    expect(typeof mod.useConfigContext).toBe('function');
  });
});
