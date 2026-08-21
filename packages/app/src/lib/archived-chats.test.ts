import { describe, expect, test } from 'bun:test';
import {
  archiveChat,
  archivedChatKey,
  loadArchivedChats,
  subscribeToArchivedChats,
  unarchiveChat,
} from './archived-chats';

describe('archived chats', () => {
  test('round-trips a chat out of and back into the lists', () => {
    localStorage.clear();
    expect(loadArchivedChats().size).toBe(0);

    archiveChat('codex', 'session-a');
    expect(loadArchivedChats().has(archivedChatKey('codex', 'session-a'))).toBe(true);
    // The two CLIs mint ids independently, so the CLI is part of the identity.
    expect(loadArchivedChats().has(archivedChatKey('claude', 'session-a'))).toBe(false);

    unarchiveChat('codex', 'session-a');
    expect(loadArchivedChats().size).toBe(0);
    localStorage.clear();
  });

  test('notifies the surfaces that read the set', () => {
    localStorage.clear();
    const seen: number[] = [];
    const unsubscribe = subscribeToArchivedChats((archived) => seen.push(archived.size));

    archiveChat('claude', 'session-b');
    archiveChat('claude', 'session-c');
    unarchiveChat('claude', 'session-b');
    unsubscribe();
    archiveChat('claude', 'session-d');

    expect(seen).toEqual([1, 2, 1]);
    localStorage.clear();
  });

  test('survives a corrupt entry', () => {
    localStorage.setItem('synapsenote:archived-chats:v1', '{"not":"an array"}');
    expect(loadArchivedChats().size).toBe(0);
    localStorage.clear();
  });
});
