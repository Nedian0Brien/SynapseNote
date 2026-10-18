import { afterEach, describe, expect, it, vi } from 'vitest';
import { listen, parseInbound, post } from './bridge';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseInbound', () => {
  it('accepts the vault, page and command messages', () => {
    expect(parseInbound({ type: 'openVault', name: 'Notes' })).toEqual({ type: 'openVault', name: 'Notes' });
    expect(parseInbound({ type: 'show', pageId: 'a' })).toEqual({ type: 'show', pageId: 'a' });
    expect(parseInbound({ type: 'show', pageId: null })).toEqual({ type: 'show', pageId: null });
    expect(parseInbound({ type: 'createPage', parentId: null })).toEqual({ type: 'createPage', parentId: null });
    expect(parseInbound({ type: 'trashPage', pageId: 'a' })).toEqual({ type: 'trashPage', pageId: 'a' });
  });

  it('reads rpc results as success or failure', () => {
    expect(parseInbound({ type: 'rpcResult', id: 3, ok: true, value: [1] })).toEqual({
      type: 'rpcResult',
      id: 3,
      ok: true,
      value: [1],
    });
    expect(parseInbound({ type: 'rpcResult', id: 3, ok: false, error: 'no' })).toEqual({
      type: 'rpcResult',
      id: 3,
      ok: false,
      error: 'no',
    });
    expect(parseInbound({ type: 'rpcResult', id: '3', ok: true })).toBeNull();
  });

  it('accepts vault changes only in morrow form', () => {
    const change = { path: 'a.md', text: 'x', mtime: 1, birthtime: 1 };
    const removed = { path: 'b.md', text: null, mtime: 1, birthtime: 0, dir: false, other: false };
    expect(parseInbound({ type: 'vaultChanges', changes: [change, removed] })).toEqual({
      type: 'vaultChanges',
      changes: [change, removed],
    });
    expect(parseInbound({ type: 'vaultChanges', changes: [{ path: 'a.md' }] })).toBeNull();
  });

  it('passes commands on for morrow to check, only when they have a type', () => {
    const command = { type: 'page.setFavorite', id: 'a', favorite: true };
    expect(parseInbound({ type: 'command', command })).toEqual({ type: 'command', command });
    expect(parseInbound({ type: 'command', command: { id: 'a' } })).toBeNull();
    expect(parseInbound({ type: 'command' })).toBeNull();
  });

  it('drops pages without an id, unknown messages and non objects', () => {
    expect(parseInbound({ type: 'show', pageId: '' })).toBeNull();
    expect(parseInbound({ type: 'trashPage' })).toBeNull();
    expect(parseInbound({ type: 'theme', theme: 'sepia' })).toBeNull();
    expect(parseInbound({ type: 'eval', code: '1' })).toBeNull();
    expect(parseInbound('openVault')).toBeNull();
    expect(parseInbound(null)).toBeNull();
  });
});

describe('post and listen', () => {
  it('posts to the editor message handler', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('window', { webkit: { messageHandlers: { editor: { postMessage } } } });
    post({ type: 'ready' });
    expect(postMessage).toHaveBeenCalledWith({ type: 'ready' });
  });

  it('does nothing outside the app', () => {
    vi.stubGlobal('window', {});
    expect(() => post({ type: 'ready' })).not.toThrow();
  });

  it('hands parsed messages to the listener and exposes flush', async () => {
    vi.stubGlobal('window', {});
    const handler = vi.fn();
    const flush = vi.fn(async () => true);
    listen(handler, flush, (id) => (id === 'a' ? 'A.md' : null));
    const synapse = (globalThis.window as Window).synapse!;
    expect(synapse.receive({ type: 'show', pageId: 'a' })).toBe(true);
    expect(synapse.receive({ type: 'nope' })).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(await synapse.flush()).toBe(true);
    expect(synapse.pathOf('a')).toBe('A.md');
  });
});
