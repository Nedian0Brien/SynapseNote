import type { Editor } from '@tiptap/core';
import { yUndoPluginKey } from '@tiptap/y-tiptap';
import { mark } from '@/lib/perf';
import { readNumericOverride } from '@/lib/perf/env-override';

export const CACHE_ENABLED = true;
export const MAX_CACHE = readNumericOverride('MAX_CACHE', 10);
export const VIEW_COUNT_CACHE_THRESHOLD = readNumericOverride('VIEW_COUNT_CACHE_THRESHOLD', 50);
export const BYTES_CACHE_THRESHOLD = readNumericOverride('BYTES_CACHE_THRESHOLD', 8_000_000);

/** Break TipTap collaboration's post-destroy editor graph retention chain. */
export function readEditorUndoManager(editor: Editor): { restore?: unknown } | null {
  try {
    return (
      (
        yUndoPluginKey.getState(editor.state) as
          | { undoManager?: { restore?: unknown } }
          | null
          | undefined
      )?.undoManager ?? null
    );
  } catch (err) {
    mark('ok/cache/undo-manager-read-failed', {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
