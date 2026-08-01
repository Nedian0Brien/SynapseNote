import type { RenamedDocMapping } from '@nedian0brien/synapsenote-core';
import type { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { mark } from '@/lib/perf';
import { MAX_CACHE } from './editor-cache-config';
import { tiptapCache } from './editor-cache-state';
import type { RenameSelectionJSON, RenameSnapshot } from './editor-cache-types';

const snapshots = new Map<string, RenameSnapshot>();

function consumed(docName: string, snapshot: RenameSnapshot | null): void {
  mark('ok/cache/snapshot-consumed', {
    docName,
    hit: snapshot !== null,
    hasScroll: Boolean(snapshot?.scrollTop),
    hasSelection: snapshot?.selection !== null,
  });
}

export function storeRenameSnapshot(docName: string, snapshot: RenameSnapshot): void {
  if (snapshots.size >= MAX_CACHE) {
    const oldest = snapshots.keys().next().value;
    if (oldest !== undefined) snapshots.delete(oldest);
  }
  snapshots.set(docName, snapshot);
  mark('ok/cache/snapshot-stored', {
    toDocName: docName,
    htmlBytes: snapshot.html.length,
    hasScroll: snapshot.scrollTop > 0,
    hasSelection: snapshot.selection !== null,
  });
}
export function peekRenameSnapshot(docName: string): RenameSnapshot | null {
  return snapshots.get(docName) ?? null;
}
export function __consumeRenameSnapshot(docName: string): RenameSnapshot | null {
  const snapshot = snapshots.get(docName) ?? null;
  snapshots.delete(docName);
  consumed(docName, snapshot);
  return snapshot;
}
export function clearRenameSnapshot(docName: string): void {
  const snapshot = snapshots.get(docName) ?? null;
  if (!snapshot) return;
  snapshots.delete(docName);
  consumed(docName, snapshot);
}
export function __resetRenameSnapshotStore(): void {
  snapshots.clear();
}

function readScrollTop(): number {
  try {
    if (typeof document === 'undefined') return 0;
    return (
      document.querySelector<HTMLDivElement>('[data-testid="editor-scroll-container"]')
        ?.scrollTop ?? 0
    );
  } catch (err) {
    mark('ok/cache/snapshot-scroll-read-failed', {
      message: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}
function captureSelection(editor: Editor): RenameSelectionJSON | null {
  try {
    const selection = editor.state.selection;
    if (selection instanceof TextSelection)
      return { type: 'text', anchor: selection.anchor, head: selection.head };
    if (selection instanceof NodeSelection) return { type: 'node', from: selection.from };
  } catch (err) {
    mark('ok/cache/snapshot-selection-read-failed', {
      message: err instanceof Error ? err.message : String(err),
    });
  }
  return null;
}

/** Capture warm-render lineage before the old name's cache entry is evicted. */
export function captureRenameSnapshots(renamed: readonly RenamedDocMapping[]): void {
  for (const { fromDocName, toDocName } of renamed) {
    try {
      const entry = tiptapCache.get(fromDocName);
      if (!entry || entry.editor.isDestroyed) {
        mark('ok/cache/snapshot-skipped', { fromDocName });
      } else if (entry.ytext.length === 0) {
        mark('ok/cache/snapshot-skipped-empty', { fromDocName });
      } else {
        storeRenameSnapshot(toDocName, {
          html: entry.editor.getHTML(),
          scrollTop: readScrollTop(),
          selection: captureSelection(entry.editor),
        });
      }
    } catch (err) {
      mark('ok/cache/snapshot-capture-failed', {
        fromDocName,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
