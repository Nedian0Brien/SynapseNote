import { describe, expect, it } from 'vitest';
import { applyCommand } from '../vendor/morrow/src/core/commands';
import type { Command } from '../vendor/morrow/src/core/commands';
import { emptyWorkspace } from '../vendor/morrow/src/core/model';
import type { WorkspaceState } from '../vendor/morrow/src/core/model';
import { createDeltas } from './stateDelta';

function apply(state: WorkspaceState, command: Command): WorkspaceState {
  const result = applyCommand(state, command);
  if (!result.ok) throw new Error(result.error);
  return result.value.state;
}

describe('state deltas', () => {
  it('sends the whole workspace first, then only what changed', () => {
    const deltas = createDeltas();
    let state = apply(emptyWorkspace(), { type: 'page.create', id: 'a', parentId: null, now: 1, title: 'A' });
    state = apply(state, { type: 'page.create', id: 'b', parentId: null, now: 2, title: 'B' });
    const first = deltas.next({ state, unreadable: [], activity: {}, reviewLog: {} })!;
    expect(first.full).toBe(true);
    expect(first.revision).toBe(1);
    expect(first.pages.map((page) => page.id)).toEqual(['a', 'b']);
    expect(Object.keys(first.docs)).toEqual(['a', 'b']);
    expect(first.activity).toEqual({});

    expect(deltas.next({ state, unreadable: [], activity: {}, reviewLog: {} })).toBeNull();

    state = apply(state, { type: 'page.rename', id: 'b', title: 'B2', now: 3 });
    const renamed = deltas.next({ state, unreadable: [], activity: { '2026-10-19': 1 }, reviewLog: {} })!;
    expect(renamed.full).toBe(false);
    expect(renamed.revision).toBe(2);
    expect(renamed.pages.map((page) => page.title)).toEqual(['B2']);
    expect(renamed.docs).toEqual({});
    expect(renamed.activity).toEqual({ '2026-10-19': 1 });
    expect(renamed.reviewLog).toBeUndefined();

    state = apply(state, { type: 'page.trash', id: 'a', now: 4 });
    state = apply(state, { type: 'page.deleteForever', id: 'a' });
    const removed = deltas.next({ state, unreadable: ['b'], activity: { '2026-10-19': 1 }, reviewLog: {} })!;
    expect(removed.removed).toEqual(['a']);
    expect(removed.unreadable).toEqual(['b']);

    deltas.reset();
    expect(deltas.next({ state, unreadable: [], activity: {}, reviewLog: {} })!.full).toBe(true);
  });
});
