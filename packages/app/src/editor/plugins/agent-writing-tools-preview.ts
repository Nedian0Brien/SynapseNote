/**
 * Clear-background line previews for the WYSIWYG Writing Tools animation.
 *
 * Mirrors Apple's custom-text-engine contract: hide the live range, animate
 * read-only previews, then reveal the live text after the preview reaches its
 * final position. Each visual line gets its own clipped editor snapshot so
 * wrapped paragraphs can travel top-to-bottom without changing layout.
 */

import type { EditorView } from '@tiptap/pm/view';
import type { AgentWritingToolsRange } from './agent-writing-tools';

export const AGENT_WRITING_TOOLS_LINE_STAGGER_MS = 105;
export const AGENT_WRITING_TOOLS_MAX_PREVIEW_LINES = 8;

export interface AgentWritingToolsPreviewRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

type DomPosition = ReturnType<EditorView['domAtPos']>;

function setRangeBoundary(range: Range, position: DomPosition, start: boolean): void {
  const { node } = position;
  const maxOffset = node.nodeType === 3 ? (node.textContent?.length ?? 0) : node.childNodes.length;
  const offset = Math.max(0, Math.min(position.offset, maxOffset));
  if (start) range.setStart(node, offset);
  else range.setEnd(node, offset);
}

function toPreviewRect(rect: DOMRect): AgentWritingToolsPreviewRect {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

/** Merge adjacent fragments that belong to the same browser-rendered line. */
export function mergeAgentWritingToolsPreviewRects(
  rects: AgentWritingToolsPreviewRect[],
): AgentWritingToolsPreviewRect[] {
  const sorted = rects
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .sort((a, b) => a.top - b.top || a.left - b.left);
  const merged: AgentWritingToolsPreviewRect[] = [];

  for (const rect of sorted) {
    const previous = merged.at(-1);
    const sameLine =
      previous &&
      Math.abs(previous.top - rect.top) <= 1 &&
      Math.abs(previous.bottom - rect.bottom) <= 1 &&
      rect.left <= previous.right + 1;
    if (!sameLine) {
      merged.push({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      });
      continue;
    }

    previous.left = Math.min(previous.left, rect.left);
    previous.top = Math.min(previous.top, rect.top);
    previous.right = Math.max(previous.right, rect.right);
    previous.bottom = Math.max(previous.bottom, rect.bottom);
    previous.width = previous.right - previous.left;
    previous.height = previous.bottom - previous.top;
  }

  return merged;
}

/** Resolve exact browser line boxes for the changed ProseMirror ranges. */
export function collectAgentWritingToolsPreviewRects(
  view: EditorView,
  ranges: AgentWritingToolsRange[],
): AgentWritingToolsPreviewRect[] {
  const rects: AgentWritingToolsPreviewRect[] = [];
  for (const changed of ranges) {
    const from = Math.max(0, Math.min(changed.from, view.state.doc.content.size));
    const to = Math.max(from, Math.min(changed.to, view.state.doc.content.size));
    if (from >= to) continue;

    const domRange = document.createRange();
    try {
      setRangeBoundary(domRange, view.domAtPos(from), true);
      setRangeBoundary(domRange, view.domAtPos(to), false);
      for (const rect of domRange.getClientRects()) rects.push(toPreviewRect(rect));
    } finally {
      domRange.detach?.();
    }
  }
  return mergeAgentWritingToolsPreviewRects(rects).slice(0, AGENT_WRITING_TOOLS_MAX_PREVIEW_LINES);
}

function sanitizeSnapshot(snapshot: HTMLElement): void {
  snapshot.removeAttribute('contenteditable');
  snapshot.setAttribute('aria-hidden', 'true');
  snapshot.setAttribute('inert', '');
  snapshot.classList.remove('agent-writing-tools-live-text');
  for (const hidden of snapshot.querySelectorAll('.agent-writing-tools-live-text')) {
    hidden.classList.remove('agent-writing-tools-live-text');
  }
  for (const nestedOverlay of snapshot.querySelectorAll('.agent-writing-tools-preview-root')) {
    nestedOverlay.remove();
  }
  for (const identified of snapshot.querySelectorAll('[id]')) identified.removeAttribute('id');
}

function createSnapshot(
  view: EditorView,
  editorRect: DOMRect,
  lineRect: AgentWritingToolsPreviewRect,
  kind: 'final' | 'spectrum',
): HTMLElement | null {
  const snapshot = view.dom.cloneNode(false) as HTMLElement;
  sanitizeSnapshot(snapshot);
  snapshot.classList.add(
    'agent-writing-tools-preview-snapshot',
    `agent-writing-tools-preview-snapshot-${kind}`,
  );
  Object.assign(snapshot.style, {
    position: 'absolute',
    left: `${editorRect.left - lineRect.left}px`,
    top: `${editorRect.top - lineRect.top}px`,
    width: `${editorRect.width}px`,
    minWidth: `${editorRect.width}px`,
    margin: '0',
  });
  let blockCount = 0;
  for (const original of view.dom.children) {
    const blockRect = original.getBoundingClientRect();
    const intersectsLine =
      blockRect.bottom >= lineRect.top - 1 &&
      blockRect.top <= lineRect.bottom + 1 &&
      blockRect.right >= lineRect.left - 1 &&
      blockRect.left <= lineRect.right + 1;
    if (!intersectsLine) continue;

    const block = original.cloneNode(true) as HTMLElement;
    sanitizeSnapshot(block);
    Object.assign(block.style, {
      position: 'absolute',
      left: `${blockRect.left - editorRect.left}px`,
      top: `${blockRect.top - editorRect.top}px`,
      width: `${blockRect.width}px`,
      height: `${blockRect.height}px`,
      margin: '0',
    });
    snapshot.append(block);
    blockCount += 1;
  }
  if (blockCount === 0) return null;
  return snapshot;
}

export interface AgentWritingToolsPreviewController {
  clear(): void;
  show(view: EditorView, ranges: AgentWritingToolsRange[], run: number): number | null;
}

/** Owns the one active preview overlay for an EditorView. */
export function createAgentWritingToolsPreviewController(): AgentWritingToolsPreviewController {
  let activeOverlay: HTMLElement | null = null;

  const clear = () => {
    activeOverlay?.remove();
    activeOverlay = null;
  };

  const show = (view: EditorView, ranges: AgentWritingToolsRange[], run: number): number | null => {
    clear();
    const host = view.dom.parentElement;
    if (!host || !view.dom.isConnected) return null;
    const rects = collectAgentWritingToolsPreviewRects(view, ranges);
    if (rects.length === 0) return null;

    const hostRect = host.getBoundingClientRect();
    const editorRect = view.dom.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.className = 'agent-writing-tools-preview-root';
    overlay.dataset.agentWritingToolsRun = String(run);
    overlay.setAttribute('aria-hidden', 'true');

    let renderedLines = 0;
    rects.forEach((rect) => {
      const finalSnapshot = createSnapshot(view, editorRect, rect, 'final');
      const spectrumSnapshot = createSnapshot(view, editorRect, rect, 'spectrum');
      if (!finalSnapshot || !spectrumSnapshot) return;

      const line = document.createElement('div');
      line.className = 'agent-writing-tools-preview-line';
      line.style.setProperty('--agent-writing-tools-line-index', String(renderedLines));
      Object.assign(line.style, {
        left: `${rect.left - hostRect.left + host.scrollLeft}px`,
        top: `${rect.top - hostRect.top + host.scrollTop}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
      line.append(finalSnapshot, spectrumSnapshot);
      overlay.append(line);
      renderedLines += 1;
    });

    if (renderedLines === 0) return null;
    host.append(overlay);
    activeOverlay = overlay;
    return (renderedLines - 1) * AGENT_WRITING_TOOLS_LINE_STAGGER_MS;
  };

  return { clear, show };
}
