import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatBytes } from './attachments';
import { formatShortcut } from './actions';
import { createPage, getState, setState } from './pages';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('host modules', () => {
  // expected values are what morrow's formatBytes returns for the same sizes
  it('formats sizes the way morrow does', () => {
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.00 GB');
  });

  it('labels shortcuts', () => {
    expect(['⌘K', 'Ctrl+K']).toContain(formatShortcut('Mod+K'));
  });

  it('creates a page in the mirror and tells the app', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('window', { webkit: { messageHandlers: { editor: { postMessage } } } });
    setState({ pages: {}, docs: {} });
    const id = createPage({ parentId: null, title: 'New page' });
    expect(id).not.toBeNull();
    const page = getState().pages[id!];
    expect(page).toMatchObject({ id, title: 'New page', parentId: null, kind: 'page' });
    expect(postMessage).toHaveBeenCalledWith({ type: 'pageCreated', page, doc: getState().docs[id!] });
  });
});
