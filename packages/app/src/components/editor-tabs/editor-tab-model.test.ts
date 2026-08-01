import { describe, expect, test } from 'bun:test';

import { createEditorTabModel, transitionTabReorder } from './editor-tab-model';

describe('editor tab model', () => {
  test('derives the navigation fallback and scroll key for an active new tab', () => {
    const model = createEditorTabModel({
      activeContextTabId: null,
      activeDocName: 'notes/today',
      activeNewTabId: 'new-1',
      activeTargetTabId: null,
      isNewTabActive: true,
      newTabIds: ['new-1'],
      openTabs: ['notes/today'],
    });

    expect(model.activeTabId).toBe('notes/today');
    expect(model.activeTabScrollKey).toBe('new-1\u0000notes/today\u0000new-1');
    expect(model.newTabIdSet.has('new-1')).toBe(true);
  });

  test('only creates a reorder transition for two distinct visible tabs', () => {
    expect(
      transitionTabReorder(['one', 'two', 'three'], {
        activeTabId: 'three',
        overTabId: 'one',
      }),
    ).toEqual({ activeTabId: 'three', orderedTabIds: ['three', 'one', 'two'] });

    expect(
      transitionTabReorder(['one', 'two'], { activeTabId: 'one', overTabId: 'missing' }),
    ).toBeNull();
  });
});
