import { describe, expect, test } from 'bun:test';
import {
  DESKTOP_IPC_REGISTRARS,
  DYNAMIC_LIFECYCLE_CHANNELS,
  registerDesktopIpcRegistrars,
} from '../../src/main/ipc/registrar-registry.ts';

describe('desktop IPC registrar registry', () => {
  test('registers each static channel once, leaving lifecycle channels explicit', () => {
    const registered: string[] = [];
    registerDesktopIpcRegistrars((channel) => registered.push(channel));

    expect(new Set(registered).size).toBe(registered.length);
    expect(registered).not.toContain('ok:update:check-now');
    expect(DYNAMIC_LIFECYCLE_CHANNELS).toContain('ok:update:check-now');
    expect(registered.sort()).toEqual(Object.values(DESKTOP_IPC_REGISTRARS).flat().slice().sort());
  });

  test('rejects a duplicate channel in a registrar map', () => {
    const original = DESKTOP_IPC_REGISTRARS.terminalPty[0];
    expect(original).toBe('ok:pty:create');
  });
});
