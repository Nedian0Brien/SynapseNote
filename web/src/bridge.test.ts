import { afterEach, describe, expect, it, vi } from 'vitest';
import { listen, parseInbound, post } from './bridge';

const page = { id: 'a', title: 'A' };
const doc = { type: 'doc', content: [{ type: 'paragraph' }] };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseInbound', () => {
  it('accepts a load with the page and its doc in the workspace', () => {
    const message = parseInbound({ type: 'load', pageId: 'a', state: { pages: { a: page }, docs: { a: doc } } });
    expect(message).toEqual({ type: 'load', pageId: 'a', state: { pages: { a: page }, docs: { a: doc } }, editable: true });
  });

  it('keeps editable false only when it is false', () => {
    const message = parseInbound({ type: 'load', pageId: 'a', state: { pages: { a: page }, docs: { a: doc } }, editable: false });
    expect(message).toMatchObject({ editable: false });
  });

  it('drops a load whose page or doc is missing', () => {
    expect(parseInbound({ type: 'load', pageId: 'b', state: { pages: { a: page }, docs: { a: doc } } })).toBeNull();
    expect(parseInbound({ type: 'load', pageId: 'a', state: { pages: { a: page }, docs: {} } })).toBeNull();
  });

  it('drops pages keyed under another id and docs that are not documents', () => {
    expect(parseInbound({ type: 'load', pageId: 'a', state: { pages: { a: { id: 'x' } }, docs: { a: doc } } })).toBeNull();
    expect(parseInbound({ type: 'load', pageId: 'a', state: { pages: { a: page }, docs: { a: { type: 'p' } } } })).toBeNull();
  });

  it('accepts only the two themes', () => {
    expect(parseInbound({ type: 'theme', theme: 'dark' })).toEqual({ type: 'theme', theme: 'dark' });
    expect(parseInbound({ type: 'theme', theme: 'sepia' })).toBeNull();
  });

  it('drops unknown messages and non objects', () => {
    expect(parseInbound({ type: 'eval', code: '1' })).toBeNull();
    expect(parseInbound('load')).toBeNull();
    expect(parseInbound(null)).toBeNull();
    expect(parseInbound([])).toBeNull();
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

  it('hands parsed messages to the listener and reports whether one was accepted', () => {
    vi.stubGlobal('window', {});
    const handler = vi.fn();
    listen(handler);
    const receive = (globalThis.window as Window).synapse!.receive;
    expect(receive({ type: 'flush' })).toBe(true);
    expect(receive({ type: 'nope' })).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ type: 'flush' });
  });
});
