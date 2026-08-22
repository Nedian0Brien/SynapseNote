/**
 * Apple Writing Tools-inspired inline rewrite animation for Source mode.
 *
 * The server records the exact Y.Text delta for every agent write in
 * Y.Map('agent-effects'). Source mode can map those offsets directly to
 * CodeMirror ranges, so only inserted/replaced source characters receive the
 * color sweep. Nested CodeMirror node views are intentionally ignored because
 * their local document coordinates do not match the full source Y.Text.
 */

import { type Extension, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin } from '@codemirror/view';
import { FLASH_DURATION_MS } from '@nedian0brien/synapsenote-core';
import type * as Y from 'yjs';
import { AGENT_WRITING_TOOLS_LINE_STAGGER_MS } from './agent-writing-tools-preview';

interface SourceAnimationRange {
  from: number;
  to: number;
}

interface AgentEffectValue {
  timestamp?: number;
  delta?: Y.YTextEvent['delta'];
}

const addWritingToolsEffect = StateEffect.define<{
  ranges: SourceAnimationRange[];
  run: number;
}>();
const removeWritingToolsEffect = StateEffect.define<number>();

function mergeRanges(ranges: SourceAnimationRange[]): SourceAnimationRange[] {
  const sorted = ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: SourceAnimationRange[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range.from <= previous.to) previous.to = Math.max(previous.to, range.to);
    else merged.push({ ...range });
  }
  return merged;
}

/** Convert a post-change Y.Text delta into exact CodeMirror character ranges. */
export function sourceAnimationRangesFromDelta(
  delta: Y.YTextEvent['delta'],
  docLength: number,
): SourceAnimationRange[] {
  const ranges: SourceAnimationRange[] = [];
  let cursor = 0;
  let deletionCursor: number | null = null;

  for (const operation of delta) {
    if (typeof operation.retain === 'number') cursor += operation.retain;

    if (typeof operation.insert === 'string' && operation.insert.length > 0) {
      const from = Math.max(0, Math.min(cursor, docLength));
      const to = Math.max(from, Math.min(cursor + operation.insert.length, docLength));
      if (from < to) ranges.push({ from, to });
      cursor += operation.insert.length;
    }

    if (typeof operation.delete === 'number' && operation.delete > 0) {
      deletionCursor ??= cursor;
    }
  }

  if (ranges.length === 0 && deletionCursor !== null) {
    const from = Math.max(0, Math.min(deletionCursor - 1, docLength));
    const to = Math.min(docLength, Math.max(from + 1, deletionCursor + 1));
    if (from < to) ranges.push({ from, to });
  }

  return mergeRanges(ranges);
}

const writingToolsField = StateField.define<{ decorations: DecorationSet; run: number }>({
  create() {
    return { decorations: Decoration.none, run: 0 };
  },
  update(value, transaction) {
    let decorations = value.decorations.map(transaction.changes);
    let run = value.run;

    for (const effect of transaction.effects) {
      if (effect.is(addWritingToolsEffect)) {
        run = effect.value.run;
        const marks = effect.value.ranges.map((range) =>
          Decoration.mark({
            class: 'agent-writing-tools-source-text',
            attributes: {
              'data-agent-writing-tools-run': String(run),
            },
          }).range(range.from, range.to),
        );
        const lineStarts = new Set<number>();
        for (const range of effect.value.ranges) {
          let line = transaction.state.doc.lineAt(range.from);
          const finalLine = transaction.state.doc.lineAt(Math.max(range.from, range.to - 1));
          while (line.number <= finalLine.number) {
            lineStarts.add(line.from);
            if (line.number === finalLine.number) break;
            line = transaction.state.doc.line(line.number + 1);
          }
        }
        const lines = [...lineStarts]
          .sort((a, b) => a - b)
          .map((from, index) =>
            Decoration.line({
              class: 'agent-writing-tools-source-line',
              attributes: {
                style: `--agent-writing-tools-line-index: ${index}`,
              },
            }).range(from),
          );
        decorations = Decoration.set([...marks, ...lines], true);
      }

      if (effect.is(removeWritingToolsEffect) && effect.value === run) {
        decorations = Decoration.none;
      }
    }

    return { decorations, run };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

/** Creates the full-source CodeMirror animation extension. */
export function createAgentFlashSourceExtension(doc: Y.Doc): Extension {
  const effectsMap = doc.getMap<AgentEffectValue>('agent-effects');

  const writingToolsViewPlugin = ViewPlugin.define((view) => {
    const mountedAt = Date.now();
    let run = 0;
    let clearTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    const clearTimerIfNeeded = () => {
      if (!clearTimer) return;
      clearTimeout(clearTimer);
      clearTimer = null;
    };

    const animate = (delta: Y.YTextEvent['delta']) => {
      if (destroyed || document.visibilityState !== 'visible') return;
      // Only the full-page SourceEditor shares coordinates with Y.Text('source').
      // Nested CM node views use this factory too but contain only one node.
      if (view.state.doc.length !== doc.getText('source').length) return;

      const ranges = sourceAnimationRangesFromDelta(delta, view.state.doc.length);
      if (ranges.length === 0) return;
      run += 1;
      view.dispatch({ effects: addWritingToolsEffect.of({ ranges, run }) });
      clearTimerIfNeeded();
      const scheduledRun = run;
      const lineNumbers = new Set<number>();
      for (const range of ranges) {
        const first = view.state.doc.lineAt(range.from).number;
        const last = view.state.doc.lineAt(Math.max(range.from, range.to - 1)).number;
        for (let line = first; line <= last; line += 1) lineNumbers.add(line);
      }
      clearTimer = setTimeout(
        () => {
          clearTimer = null;
          if (destroyed) return;
          view.dispatch({ effects: removeWritingToolsEffect.of(scheduledRun) });
        },
        FLASH_DURATION_MS + Math.max(0, lineNumbers.size - 1) * AGENT_WRITING_TOOLS_LINE_STAGGER_MS,
      );
    };

    const effectsObserver = (event: Y.YMapEvent<AgentEffectValue>) => {
      let latest: AgentEffectValue | null = null;
      for (const key of event.keysChanged) {
        const change = event.changes.keys.get(key);
        if (change?.action === 'delete') continue;
        const value = effectsMap.get(key);
        if (!value || typeof value.timestamp !== 'number' || value.timestamp < mountedAt) continue;
        if (!latest || value.timestamp > (latest.timestamp ?? 0)) latest = value;
      }
      if (!latest?.delta) return;
      const delta = latest.delta;
      queueMicrotask(() => animate(delta));
    };

    effectsMap.observe(effectsObserver);
    return {
      destroy() {
        destroyed = true;
        effectsMap.unobserve(effectsObserver);
        clearTimerIfNeeded();
      },
    };
  });

  return [writingToolsField, writingToolsViewPlugin];
}
