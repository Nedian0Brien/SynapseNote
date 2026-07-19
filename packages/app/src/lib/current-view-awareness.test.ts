import { describe, expect, test } from 'bun:test';
import { currentViewSnapshot, publishCurrentView } from './current-view-awareness';

describe('current-view system awareness', () => {
  test('builds an explicit document/focus snapshot', () => {
    expect(
      currentViewSnapshot('notes/active', {
        focused: true,
        visible: true,
        updatedAt: 123,
      }),
    ).toEqual({
      document: 'notes/active',
      focused: true,
      visible: true,
      updatedAt: 123,
    });
  });

  test('publishes currentView while preserving existing awareness fields', () => {
    let state: Record<string, unknown> | null = {
      agentPresence: { codex: { currentDoc: 'other' } },
    };
    publishCurrentView(
      {
        getLocalState: () => state,
        setLocalState: (next) => {
          state = next;
        },
      },
      {
        document: 'notes/active',
        focused: false,
        visible: true,
        updatedAt: 456,
      },
    );

    expect(state).toEqual({
      agentPresence: { codex: { currentDoc: 'other' } },
      currentView: {
        document: 'notes/active',
        focused: false,
        visible: true,
        updatedAt: 456,
      },
    });
  });

  test('bootstraps a null local awareness state', () => {
    let state: Record<string, unknown> | null = null;
    publishCurrentView(
      {
        getLocalState: () => state,
        setLocalState: (next) => {
          state = next;
        },
      },
      { document: null, focused: true, visible: true, updatedAt: 789 },
    );
    expect(state).toEqual({
      currentView: { document: null, focused: true, visible: true, updatedAt: 789 },
    });
  });
});
