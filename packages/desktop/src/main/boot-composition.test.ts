import { describe, expect, test } from 'bun:test';
import { bootPrimaryInstance } from './boot-composition.ts';

describe('bootPrimaryInstance', () => {
  test('installs synchronous boot work before readiness work and lifecycle cleanup', async () => {
    const calls: string[] = [];
    let resolveReady: (() => void) | undefined;

    bootPrimaryInstance({
      logBoot: () => calls.push('log'),
      installPreReady: () => calls.push('pre-ready'),
      registerProtocol: () => {
        calls.push('protocol');
        return { id: 'protocol' };
      },
      whenReady: () =>
        new Promise<void>((resolve) => {
          resolveReady = resolve;
        }),
      runReady: async (protocol) => {
        calls.push(`ready:${protocol.id}`);
      },
      installLifecycle: () => calls.push('lifecycle'),
      reportReadyFailure: () => calls.push('failure'),
    });

    expect(calls).toEqual(['log', 'pre-ready', 'protocol', 'lifecycle']);

    resolveReady?.();
    await Promise.resolve();

    expect(calls).toEqual(['log', 'pre-ready', 'protocol', 'lifecycle', 'ready:protocol']);
  });
});
