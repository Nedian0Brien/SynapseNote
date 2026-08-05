import { describe, expect, test } from 'bun:test';
import { collectChatSources } from './chat-sources';
import type { ChatTimelineEntry } from './cli-chat-types';

describe('collectChatSources', () => {
  test('deduplicates answer links and observed tool sources', () => {
    const timeline: ChatTimelineEntry[] = [
      { id: 'u1', type: 'message', role: 'user', text: 'Ground this answer' },
      {
        id: 'a1',
        type: 'activity',
        kind: 'tool',
        category: 'file',
        label: 'read',
        detail: 'completed',
        fullDetail: 'Arguments\n{"document":{"path":"notes/source.md"}}',
      },
      {
        id: 'a2',
        type: 'activity',
        kind: 'tool',
        category: 'web_search',
        label: 'Web search',
        detail: 'https://example.com/report',
      },
      {
        id: 'm2',
        type: 'message',
        role: 'assistant',
        text: 'See [Source](notes/source.md#L4) and [Report](https://example.com/report).',
      },
    ];

    expect(collectChatSources(timeline, 3)).toEqual([
      expect.objectContaining({ kind: 'web', href: 'https://example.com/report' }),
      expect.objectContaining({ kind: 'file', href: 'notes/source.md#L4' }),
    ]);
  });

  test('keeps an observed search query when no result URL was emitted', () => {
    const timeline: ChatTimelineEntry[] = [
      { id: 'u1', type: 'message', role: 'user', text: 'Search' },
      {
        id: 'a1',
        type: 'activity',
        kind: 'tool',
        category: 'web_search',
        label: 'Web search',
        detail: 'agent trajectory evaluation',
      },
      { id: 'm2', type: 'message', role: 'assistant', text: 'Done.' },
    ];

    expect(collectChatSources(timeline, 2)).toEqual([
      {
        key: 'search:agent trajectory evaluation',
        kind: 'search',
        label: 'Web search',
        location: 'agent trajectory evaluation',
      },
    ]);
  });
});
