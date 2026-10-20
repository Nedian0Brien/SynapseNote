import { afterEach, describe, expect, it, vi } from 'vitest';
import { listen, parseInbound, post } from './bridge';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseInbound', () => {
  it('accepts the vault, page and command messages', () => {
    expect(parseInbound({ type: 'openVault', name: 'Notes' })).toEqual({ type: 'openVault', name: 'Notes', guide: false, compare: false });
    expect(parseInbound({ type: 'openVault', name: 'Notes', guide: true, compare: true })).toEqual({
      type: 'openVault',
      name: 'Notes',
      guide: true,
      compare: true,
    });
    expect(parseInbound({ type: 'show', pageId: 'a' })).toEqual({ type: 'show', pageId: 'a', find: null });
    expect(parseInbound({ type: 'show', pageId: null })).toEqual({ type: 'show', pageId: null, find: null });
    expect(parseInbound({ type: 'show', pageId: 'a', find: 'milk' })).toEqual({ type: 'show', pageId: 'a', find: 'milk' });
    expect(parseInbound({ type: 'createPage', parentId: null })).toEqual({ type: 'createPage', parentId: null, kind: 'page' });
    expect(parseInbound({ type: 'createPage', parentId: 'p', kind: 'database' })).toEqual({
      type: 'createPage',
      parentId: 'p',
      kind: 'database',
    });
    expect(parseInbound({ type: 'createPage', parentId: null, kind: 'canvas' })).toEqual({
      type: 'createPage',
      parentId: null,
      kind: 'canvas',
    });
    expect(parseInbound({ type: 'createPage', parentId: null, kind: 'journal' })).toBeNull();
    expect(parseInbound({ type: 'trashPage', pageId: 'a' })).toEqual({ type: 'trashPage', pageId: 'a' });
  });

  it('accepts the settings morrow keeps, as morrow reads them', () => {
    const preferences = { font: 'serif', width: 'wide', accent: 'rose', colorful: false, name: '  Dennis  ' };
    expect(parseInbound({ type: 'preferences', preferences })).toEqual({
      type: 'preferences',
      preferences: { ...preferences, name: 'Dennis' },
    });
    expect(parseInbound({ type: 'preferences', preferences: { ...preferences, font: 'comic' } })).toBeNull();
    expect(parseInbound({ type: 'preferences', preferences: { ...preferences, width: 'narrow' } })).toBeNull();
    expect(parseInbound({ type: 'preferences', preferences: { ...preferences, accent: 'pink' } })).toBeNull();
    expect(parseInbound({ type: 'preferences', preferences: { ...preferences, colorful: 'yes' } })).toBeNull();
    const long = parseInbound({ type: 'preferences', preferences: { ...preferences, name: 'x'.repeat(80) } });
    expect(long?.type === 'preferences' && long.preferences.name.length).toBe(60);
  });

  it('accepts custom css and quick notes', () => {
    expect(parseInbound({ type: 'previewCss', css: 'a{}' })).toEqual({ type: 'previewCss', css: 'a{}' });
    expect(parseInbound({ type: 'saveCss', css: '' })).toEqual({ type: 'saveCss', css: '' });
    expect(parseInbound({ type: 'saveCss' })).toBeNull();
    expect(parseInbound({ type: 'capture', text: 'milk' })).toEqual({ type: 'capture', text: 'milk' });
    expect(parseInbound({ type: 'capture', text: 3 })).toBeNull();
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

  it('accepts what the app session sends: outside edits, vault info and resyncs as JSON text', () => {
    expect(parseInbound({ type: 'external', id: 4, json: '{}' })).toEqual({ type: 'external', id: 4, json: '{}' });
    expect(parseInbound({ type: 'external', id: 1.5, json: '{}' })).toBeNull();
    expect(parseInbound({ type: 'external', id: 4, json: {} })).toBeNull();
    expect(parseInbound({ type: 'vaultInfo', json: '{"paths":{},"activity":{}}' })).toEqual({ type: 'vaultInfo', json: '{"paths":{},"activity":{}}' });
    expect(parseInbound({ type: 'resync', json: '{}' })).toEqual({ type: 'resync', json: '{}' });
    expect(parseInbound({ type: 'resync' })).toBeNull();
    expect(parseInbound({ type: 'vaultChanges', changes: [] })).toBeNull();
  });

  it('passes commands on for morrow to check, only when they have a type', () => {
    const command = { type: 'page.setFavorite', id: 'a', favorite: true };
    expect(parseInbound({ type: 'command', json: JSON.stringify(command) })).toEqual({ type: 'command', command });
    expect(parseInbound({ type: 'command', json: '{"id":"a"}' })).toBeNull();
    expect(parseInbound({ type: 'command', json: '{"type":' })).toBeNull();
    expect(parseInbound({ type: 'command', command })).toBeNull();
    expect(parseInbound({ type: 'command' })).toBeNull();
    // a document's keys come through in the order they were sent
    const parsed = parseInbound({ type: 'command', json: '{"type":"page.setDoc","id":"a","doc":{"type":"doc","content":[]},"now":1}' });
    expect(parsed && parsed.type === 'command' && Object.keys(parsed.command)).toEqual(['type', 'id', 'doc', 'now']);
    // commands applied together come as one array, every one with a type
    const both = [command, { type: 'page.rename', id: 'a', title: 'b', now: 1 }];
    expect(parseInbound({ type: 'commands', json: JSON.stringify(both) })).toEqual({ type: 'commands', commands: both });
    expect(parseInbound({ type: 'commands', json: '[]' })).toBeNull();
    expect(parseInbound({ type: 'commands', json: '[{"id":"a"}]' })).toBeNull();
    expect(parseInbound({ type: 'commands', json: '{"type":"page.rename"}' })).toBeNull();
  });

  it('accepts heading and find requests for the open page', () => {
    expect(parseInbound({ type: 'scrollToHeading', index: 2 })).toEqual({ type: 'scrollToHeading', index: 2 });
    expect(parseInbound({ type: 'scrollToHeading', index: -1 })).toBeNull();
    expect(parseInbound({ type: 'scrollToHeading', index: 1.5 })).toBeNull();
    expect(parseInbound({ type: 'find' })).toEqual({ type: 'find' });
  });

  it('accepts daily note and template requests', () => {
    expect(parseInbound({ type: 'openToday' })).toEqual({ type: 'openToday', date: null });
    expect(parseInbound({ type: 'openToday', date: '2026-10-19' })).toEqual({ type: 'openToday', date: '2026-10-19' });
    expect(parseInbound({ type: 'openToday', date: 'tomorrow' })).toBeNull();
    expect(parseInbound({ type: 'createFromTemplate', templateId: 't', parentId: null })).toEqual({
      type: 'createFromTemplate',
      templateId: 't',
      parentId: null,
    });
    expect(parseInbound({ type: 'createFromTemplate', parentId: null })).toBeNull();
    expect(parseInbound({ type: 'newTemplate' })).toEqual({ type: 'newTemplate' });
    expect(parseInbound({ type: 'openTemplates' })).toEqual({ type: 'openTemplates' });
    expect(parseInbound({ type: 'saveAsTemplate', pageId: 'p' })).toEqual({ type: 'saveAsTemplate', pageId: 'p' });
    expect(parseInbound({ type: 'saveAsTemplate' })).toBeNull();
  });

  it('accepts history, encryption and review requests', () => {
    expect(parseInbound({ type: 'openHistory', pageId: 'p' })).toEqual({ type: 'openHistory', pageId: 'p' });
    expect(parseInbound({ type: 'lockPage', pageId: 'p' })).toEqual({ type: 'lockPage', pageId: 'p' });
    expect(parseInbound({ type: 'unprotectPage', pageId: 'p' })).toEqual({ type: 'unprotectPage', pageId: 'p' });
    expect(parseInbound({ type: 'lockPage' })).toBeNull();
    expect(parseInbound({ type: 'gradeCard', cardId: 'c', grade: 'easy' })).toEqual({
      type: 'gradeCard',
      cardId: 'c',
      grade: 'easy',
    });
    expect(parseInbound({ type: 'gradeCard', cardId: 'c', grade: 'perfect' })).toBeNull();
  });

  it('accepts data, source and toast requests', () => {
    expect(parseInbound({ type: 'exportMarkdown', pageId: 'a' })).toEqual({ type: 'exportMarkdown', pageId: 'a' });
    expect(parseInbound({ type: 'exportMarkdown', pageId: null })).toBeNull();
    expect(parseInbound({ type: 'publish', pageId: null })).toEqual({ type: 'publish', pageId: null });
    expect(parseInbound({ type: 'publish', pageId: 'a' })).toEqual({ type: 'publish', pageId: 'a' });
    expect(parseInbound({ type: 'publish' })).toBeNull();
    for (const type of ['exportAll', 'backup', 'restore', 'deleteUnusedFiles']) expect(parseInbound({ type })).toEqual({ type });
    expect(parseInbound({ type: 'importMarkdown', parentId: null })).toEqual({ type: 'importMarkdown', parentId: null });
    expect(parseInbound({ type: 'importMarkdown', parentId: 'p' })).toEqual({ type: 'importMarkdown', parentId: 'p' });
    expect(parseInbound({ type: 'importMarkdown', parentId: 3 })).toBeNull();
    expect(parseInbound({ type: 'setSourceMode', pageId: 'a' })).toEqual({ type: 'setSourceMode', pageId: 'a' });
    expect(parseInbound({ type: 'setSourceMode', pageId: null })).toEqual({ type: 'setSourceMode', pageId: null });
    expect(parseInbound({ type: 'toastAction', id: 4 })).toEqual({ type: 'toastAction', id: 4 });
    expect(parseInbound({ type: 'dismissToast', id: 4 })).toEqual({ type: 'dismissToast', id: 4 });
    expect(parseInbound({ type: 'dismissToast', id: '4' })).toBeNull();
  });

  it('drops pages without an id, unknown messages and non objects', () => {
    expect(parseInbound({ type: 'show', pageId: '' })).toBeNull();
    expect(parseInbound({ type: 'show', pageId: 'a', find: 3 })).toBeNull();
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

  it('hands parsed messages to the listener and exposes the host calls', async () => {
    vi.stubGlobal('window', {});
    const handler = vi.fn();
    const flush = vi.fn(async () => true);
    listen(handler, {
      flush,
      query: (name) => (name === 'recent' ? '[]' : null),
      linkSelection: () => false,
      encryption: async () => '{"ok":true}',
      pdfSnapshot: (id) => (id === 'a' ? '{}' : null),
      files: async () => null,
    });
    const synapse = (globalThis.window as Window).synapse!;
    expect(synapse.receive({ type: 'show', pageId: 'a' })).toBe(true);
    expect(synapse.receive({ type: 'nope' })).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(await synapse.flush()).toBe(true);
    expect(synapse.query('recent', {})).toBe('[]');
    expect(synapse.linkSelection()).toBe(false);
    expect(synapse.pdfSnapshot('b')).toBeNull();
  });
});
