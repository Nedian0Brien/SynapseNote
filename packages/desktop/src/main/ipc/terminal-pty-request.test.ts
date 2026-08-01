import { describe, expect, test } from 'bun:test';
import { parseTerminalPtyArgs } from './terminal-pty-request.ts';

describe('parseTerminalPtyArgs', () => {
  test('rejects null PTY payloads before the registrar dereferences them', () => {
    expect(parseTerminalPtyArgs('ok:pty:create', [null])).toBeUndefined();
    expect(parseTerminalPtyArgs('ok:pty:input', [null])).toBeUndefined();
  });
});
