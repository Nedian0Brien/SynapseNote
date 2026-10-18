import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatShortcut } from './actions';
import { call, fromBase64, settle, toBase64 } from './rpc';
import { nativeVaultBridge } from './vaultBridge';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubApp() {
  const postMessage = vi.fn();
  vi.stubGlobal('window', { webkit: { messageHandlers: { editor: { postMessage } } } });
  return postMessage;
}

describe('rpc', () => {
  it('resolves a call with the matching reply', async () => {
    const postMessage = stubApp();
    const result = call<number>('exists', 'a.md');
    const sent = postMessage.mock.calls[0]![0] as { id: number; method: string; params: unknown[] };
    expect(sent).toMatchObject({ type: 'rpc', method: 'exists', params: ['a.md'] });
    settle(sent.id, { ok: true, value: 7 });
    await expect(result).resolves.toBe(7);
  });

  it('rejects a call the app could not finish', async () => {
    const postMessage = stubApp();
    const result = call('apply', []);
    const sent = postMessage.mock.calls[0]![0] as { id: number };
    settle(sent.id, { ok: false, error: 'The folder is gone.' });
    await expect(result).rejects.toThrow('The folder is gone.');
  });

  it('ignores replies nobody waits for', () => {
    expect(() => settle(999_999, { ok: true, value: null })).not.toThrow();
  });

  it('moves bytes as base64 without changing them', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255]);
    expect(new Uint8Array(fromBase64(toBase64(bytes.buffer)))).toEqual(bytes);
  });
});

describe('native vault bridge', () => {
  it('names vault files with the app scheme', () => {
    const bridge = nativeVaultBridge('Notes');
    expect(bridge.root).toBe('Notes');
    expect(bridge.fileUrl('attachments/my photo.png')).toBe('synapse-vault://vault/attachments/my%20photo.png');
  });

  it('sends file data as base64 and reads it back as bytes', async () => {
    const postMessage = stubApp();
    const bridge = nativeVaultBridge('Notes');
    const created = bridge.createFile('a.bin', new Uint8Array([9, 8]).buffer);
    const create = postMessage.mock.calls[0]![0] as { id: number; params: unknown[] };
    expect(create.params).toEqual(['a.bin', 'CQg=']);
    settle(create.id, { ok: true, value: null });
    await created;

    const read = bridge.readBytes('a.bin');
    const request = postMessage.mock.calls[1]![0] as { id: number };
    settle(request.id, { ok: true, value: 'CQg=' });
    expect(new Uint8Array((await read)!)).toEqual(new Uint8Array([9, 8]));
  });
});

describe('host actions', () => {
  it('labels shortcuts', () => {
    expect(['⌘K', 'Ctrl+K']).toContain(formatShortcut('Mod+K'));
  });
});
