/**
 * Apple Writing Tools-inspired inline rewrite animation for WYSIWYG mode.
 *
 * Agent writes update the ProseMirror-bound Y.XmlFragment and Y.Map('agent-flash')
 * in one Yjs transaction. Depending on observer order, the activity signal can
 * arrive immediately before or after the y-prosemirror transaction, so this
 * plugin correlates the two in a deliberately narrow window and decorates only
 * the text ranges changed by that CRDT apply.
 *
 * Visual reference and timing: Apple WWDC25 “Dive deeper into Writing Tools,”
 * 11:17–11:19. Apple renders clear-background text previews, hides the live
 * range during the effect, and restores it after the animation. In the web
 * editor, ProseMirror inline decorations provide the equivalent no-reflow text
 * preview layer while preserving editor selection and document structure.
 * https://developer.apple.com/videos/play/wwdc2025/265/?time=677
 */

import { FLASH_DURATION_MS } from '@nedian0brien/synapsenote-core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { ySyncPluginKey } from '@tiptap/y-tiptap';
import type * as Y from 'yjs';

const CORRELATION_WINDOW_MS = 180;
const PENDING_SIGNAL_TTL_MS = 700;
const RANGE_STAGGER_MS = 70;

interface AgentActivitySignal {
  agentId: string;
  timestamp: number;
}

export interface AgentWritingToolsRange {
  from: number;
  to: number;
}

interface RecentRemoteChange {
  at: number;
  ranges: AgentWritingToolsRange[];
}

interface PendingActivity {
  expiresAt: number;
  signal: AgentActivitySignal;
}

interface AgentWritingToolsPluginState {
  decorations: DecorationSet;
  run: number;
}

type AgentWritingToolsMeta =
  | { kind: 'start'; ranges: AgentWritingToolsRange[]; run: number }
  | { kind: 'clear'; run: number };

export const agentWritingToolsPluginKey = new PluginKey<AgentWritingToolsPluginState>(
  'agentWritingTools',
);

function clampPosition(value: number, doc: ProseMirrorNode): number {
  return Math.max(0, Math.min(value, doc.content.size));
}

/** Merge overlapping/adjacent changed ranges after mapping them into the final document. */
export function mergeAgentWritingToolsRanges(
  ranges: AgentWritingToolsRange[],
): AgentWritingToolsRange[] {
  const sorted = ranges
    .filter((range) => Number.isFinite(range.from) && Number.isFinite(range.to))
    .map((range) => ({ from: Math.min(range.from, range.to), to: Math.max(range.from, range.to) }))
    .sort((a, b) => a.from - b.from || a.to - b.to);

  const merged: AgentWritingToolsRange[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range.from <= previous.to + 1) {
      previous.to = Math.max(previous.to, range.to);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/**
 * Extract the smallest changed range by comparing the pre/post ProseMirror
 * trees. y-prosemirror can represent a short CRDT text insertion as a full
 * paragraph ReplaceStep, so StepMap coordinates are not precise enough for the
 * visual effect; Fragment's structural diff still narrows it to the glyphs that
 * actually changed.
 */
export function changedRangesFromRemoteTransaction(
  transaction: Transaction,
): AgentWritingToolsRange[] {
  if (!transaction.docChanged || transaction.getMeta(ySyncPluginKey) === undefined) return [];

  const start = transaction.before.content.findDiffStart(transaction.doc.content);
  if (start === null) return [];
  const end = transaction.before.content.findDiffEnd(transaction.doc.content);
  let from = clampPosition(start, transaction.doc);
  // Fragment diff endpoints are content offsets. The inline Decoration range
  // is right-exclusive in document coordinates, so include the final changed
  // glyph before clamping to the document.
  let to = clampPosition((end?.b ?? start) + 1, transaction.doc);

  // A pure deletion has no new text to animate. Use the nearest surviving
  // character as a quiet completion cue instead of flashing an unrelated
  // whole paragraph.
  if (from === to && transaction.doc.content.size > 0) {
    from = Math.max(0, from - 1);
    to = Math.min(transaction.doc.content.size, to + 1);
  }

  return [{ from, to }];
}

/** Build text-only decorations so nodes, layout, selection, and scroll never move. */
export function createAgentWritingToolsDecorations(
  doc: ProseMirrorNode,
  ranges: AgentWritingToolsRange[],
  run: number,
): DecorationSet {
  const decorations: Decoration[] = [];

  ranges.forEach((range, rangeIndex) => {
    const from = clampPosition(range.from, doc);
    const to = clampPosition(range.to, doc);
    if (from >= to) return;

    doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText) return;
      const textFrom = Math.max(from, pos);
      const textTo = Math.min(to, pos + node.nodeSize);
      if (textFrom >= textTo) return false;

      decorations.push(
        Decoration.inline(textFrom, textTo, {
          class: 'agent-writing-tools-text',
          'data-agent-writing-tools-run': String(run),
          style: `--agent-writing-tools-delay: ${rangeIndex * RANGE_STAGGER_MS}ms`,
        }),
      );
      return false;
    });
  });

  return DecorationSet.create(doc, decorations);
}

function latestChangedActivity(
  event: Y.YMapEvent<unknown>,
  activityMap: Y.Map<unknown>,
  mountedAt: number,
): AgentActivitySignal | null {
  let latest: AgentActivitySignal | null = null;
  for (const key of event.keysChanged) {
    const change = event.changes.keys.get(key);
    if (change?.action === 'delete') continue;
    const value = activityMap.get(key) as { agentId?: unknown; timestamp?: unknown } | undefined;
    if (!value || typeof value.timestamp !== 'number' || value.timestamp < mountedAt) continue;
    const signal = {
      agentId: typeof value.agentId === 'string' ? value.agentId : key,
      timestamp: value.timestamp,
    };
    if (!latest || signal.timestamp > latest.timestamp) latest = signal;
  }
  return latest;
}

export function createAgentWritingToolsPlugin(
  document: Y.Doc,
): Plugin<AgentWritingToolsPluginState> {
  const activityMap = document.getMap('agent-flash');
  const mountedAt = Date.now();
  let pendingActivity: PendingActivity | null = null;
  let recentRemoteChange: RecentRemoteChange | null = null;
  let editorView: EditorView | null = null;
  let clearTimer: ReturnType<typeof setTimeout> | null = null;
  let runCounter = 0;

  const clearTimerIfNeeded = () => {
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
  };

  const scheduleClear = (run: number) => {
    clearTimerIfNeeded();
    clearTimer = setTimeout(
      () => {
        clearTimer = null;
        const view = editorView;
        if (!view) return;
        const state = agentWritingToolsPluginKey.getState(view.state);
        if (!state || state.run !== run) return;
        view.dispatch(view.state.tr.setMeta(agentWritingToolsPluginKey, { kind: 'clear', run }));
      },
      FLASH_DURATION_MS + RANGE_STAGGER_MS * 2,
    );
  };

  const dispatchStart = (ranges: AgentWritingToolsRange[]) => {
    const view = editorView;
    if (!view || ranges.length === 0) return;
    const run = ++runCounter;
    view.dispatch(
      view.state.tr.setMeta(agentWritingToolsPluginKey, {
        kind: 'start',
        ranges,
        run,
      } satisfies AgentWritingToolsMeta),
    );
    scheduleClear(run);
  };

  const activityObserver = (event: Y.YMapEvent<unknown>) => {
    const signal = latestChangedActivity(event, activityMap, mountedAt);
    if (!signal) return;

    const now = Date.now();
    if (recentRemoteChange && now - recentRemoteChange.at <= CORRELATION_WINDOW_MS) {
      const ranges = recentRemoteChange.ranges;
      recentRemoteChange = null;
      queueMicrotask(() => dispatchStart(ranges));
      return;
    }

    pendingActivity = {
      signal,
      expiresAt: now + PENDING_SIGNAL_TTL_MS,
    };
  };

  return new Plugin<AgentWritingToolsPluginState>({
    key: agentWritingToolsPluginKey,
    state: {
      init: () => ({ decorations: DecorationSet.empty, run: 0 }),
      apply(transaction, previous) {
        const meta = transaction.getMeta(agentWritingToolsPluginKey) as
          | AgentWritingToolsMeta
          | undefined;
        if (meta?.kind === 'clear') {
          if (meta.run !== previous.run) return previous;
          return { decorations: DecorationSet.empty, run: previous.run };
        }
        if (meta?.kind === 'start') {
          return {
            decorations: createAgentWritingToolsDecorations(transaction.doc, meta.ranges, meta.run),
            run: meta.run,
          };
        }

        const mapped = previous.decorations.map(transaction.mapping, transaction.doc);
        const ranges = changedRangesFromRemoteTransaction(transaction);
        if (ranges.length === 0) return { ...previous, decorations: mapped };

        // Collaboration can dispatch its initial fragment catch-up before this
        // plugin's view hook mounts. It is editor hydration, not a live agent
        // edit, and must never become the "recent remote change" matched to an
        // activity signal that arrives just after the editor opens.
        if (!editorView) return { ...previous, decorations: mapped };

        const now = Date.now();
        recentRemoteChange = { at: now, ranges };
        if (!pendingActivity || pendingActivity.expiresAt < now) {
          pendingActivity = null;
          return { ...previous, decorations: mapped };
        }

        pendingActivity = null;
        recentRemoteChange = null;
        const run = ++runCounter;
        queueMicrotask(() => scheduleClear(run));
        return {
          decorations: createAgentWritingToolsDecorations(transaction.doc, ranges, run),
          run,
        };
      },
    },
    props: {
      decorations(state) {
        return agentWritingToolsPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
    view(view) {
      editorView = view;
      activityMap.observe(activityObserver);
      return {
        destroy() {
          activityMap.unobserve(activityObserver);
          clearTimerIfNeeded();
          if (editorView === view) editorView = null;
          pendingActivity = null;
          recentRemoteChange = null;
        },
      };
    },
  });
}
