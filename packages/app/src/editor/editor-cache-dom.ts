import type { Editor } from '@tiptap/core';
import type { CmCacheEntry, TiptapCacheEntry } from './editor-cache-types';

type TiptapView = { dom: HTMLElement; scrollDOM?: HTMLElement };

export function getTiptapEditorView(editor: Editor): TiptapView | null {
  return (editor as unknown as { editorView?: TiptapView }).editorView ?? null;
}

export function hadFocus(root: HTMLElement): boolean {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement;
  return active === root || Boolean(active && root.contains(active));
}

export function createParkingNode(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const node = document.createElement('div');
  node.setAttribute('data-ok-editor-parking', '');
  node.style.display = 'none';
  node.style.position = 'absolute';
  node.style.left = '-99999px';
  return node;
}

function reparent(dom: HTMLElement, container: HTMLElement): void {
  const previous = dom.parentElement;
  if (previous && previous !== container) previous.removeChild(dom);
  if (dom.parentElement !== container) container.appendChild(dom);
}

export function reparentTiptap(entry: TiptapCacheEntry, container: HTMLElement): void {
  const view = getTiptapEditorView(entry.editor);
  if (view) reparent(view.dom, container);
}

export function reparentCm(entry: CmCacheEntry, container: HTMLElement): void {
  reparent(entry.view.dom as HTMLElement, container);
}

export function parkTiptapDom(entry: TiptapCacheEntry): void {
  const view = getTiptapEditorView(entry.editor);
  if (!view) return;
  entry.hadFocus = hadFocus(view.dom);
  entry.scrollTop = (view.scrollDOM ?? view.dom.parentElement ?? view.dom).scrollTop ?? 0;
  view.dom.parentElement?.removeChild(view.dom);
  entry.parkingNode ||= createParkingNode();
  entry.parkingNode?.appendChild(view.dom);
}

export function parkCmDom(entry: CmCacheEntry): void {
  const dom = entry.view.dom as HTMLElement;
  entry.hadFocus = hadFocus(dom);
  entry.scrollTop = ((entry.view.scrollDOM as HTMLElement | undefined) ?? dom).scrollTop ?? 0;
  dom.parentElement?.removeChild(dom);
  entry.parkingNode ||= createParkingNode();
  entry.parkingNode?.appendChild(dom);
}
