import { describe, expect, test } from 'bun:test';
import {
  CHAT_PANE_DEFAULT_HEIGHT,
  CHAT_PANE_HEIGHT_STORAGE_KEY,
  CHAT_PANE_MIN_HEIGHT,
  chatPaneMaxHeight,
  clampChatPaneHeight,
  loadChatPaneHeight,
  resolveChatPaneHeight,
  saveChatPaneHeight,
} from './sidebar-pane-height';

describe('chat pane height', () => {
  test('keeps the pane inside the sidebar it shares with the file tree', () => {
    expect(chatPaneMaxHeight(1000)).toBe(600);
    expect(clampChatPaneHeight(5_000, 1000)).toBe(600);
    expect(clampChatPaneHeight(10, 1000)).toBe(CHAT_PANE_MIN_HEIGHT);
    // A window too short for the split still yields a usable range.
    expect(chatPaneMaxHeight(80)).toBe(CHAT_PANE_MIN_HEIGHT);
  });

  test('hugs a chat list shorter than the requested height', () => {
    expect(resolveChatPaneHeight({ requestedHeight: 208, contentHeight: 54, viewportHeight: 1000 })).toBe(
      54,
    );
    expect(
      resolveChatPaneHeight({ requestedHeight: 208, contentHeight: 400, viewportHeight: 1000 }),
    ).toBe(208);
  });

  test('falls back to the requested height while the list is unmeasured', () => {
    expect(
      resolveChatPaneHeight({ requestedHeight: 240, contentHeight: null, viewportHeight: 1000 }),
    ).toBe(240);
    expect(resolveChatPaneHeight({ requestedHeight: 240, contentHeight: 0, viewportHeight: 1000 })).toBe(
      240,
    );
  });

  test('round-trips the preference and survives a corrupt entry', () => {
    localStorage.clear();
    expect(loadChatPaneHeight()).toBe(CHAT_PANE_DEFAULT_HEIGHT);
    saveChatPaneHeight(311);
    expect(loadChatPaneHeight()).toBe(311);
    localStorage.setItem(CHAT_PANE_HEIGHT_STORAGE_KEY, 'not-a-number');
    expect(loadChatPaneHeight()).toBe(CHAT_PANE_DEFAULT_HEIGHT);
    localStorage.clear();
  });
});
