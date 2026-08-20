import { describe, expect, test } from 'bun:test';
import { CHAT_TAB_ID, parseEditorTabId, tabIdForNavigationTarget } from './editor-tabs';

describe('main chat editor tab', () => {
  test('round-trips the singleton chat target', () => {
    expect(tabIdForNavigationTarget({ kind: 'chat', target: '#/__chat__' })).toBe(CHAT_TAB_ID);
    expect(parseEditorTabId(CHAT_TAB_ID)).toEqual({ kind: 'chat' });
  });
});
