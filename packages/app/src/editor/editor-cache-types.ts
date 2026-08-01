import type { Compartment } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { Editor } from '@tiptap/core';
import type * as Y from 'yjs';
import type { EditorCacheSizeStats } from './editor-cache-policy';

export type SizeStats = EditorCacheSizeStats;

export interface TiptapCacheEntry {
  editor: Editor;
  ydoc: Y.Doc;
  ytext: Y.Text;
  provider: HocuspocusProvider;
  scrollTop: number;
  hadFocus: boolean;
  activeMountKey: string | null;
  parkingNode: HTMLElement | null;
  __uncached?: boolean;
}

export interface CmCacheEntry {
  view: EditorView;
  ydoc: Y.Doc;
  ytext: Y.Text;
  provider: HocuspocusProvider;
  themeCompartment: Compartment;
  wordWrapCompartment: Compartment;
  placeholderCompartment: Compartment;
  scrollTop: number;
  hadFocus: boolean;
  activeMountKey: string | null;
  parkingNode: HTMLElement | null;
  __uncached?: boolean;
}

export interface TiptapFactoryResult {
  editor: Editor;
  ydoc: Y.Doc;
  ytext: Y.Text;
  provider: HocuspocusProvider;
}

export interface CmFactoryResult {
  view: EditorView;
  ydoc: Y.Doc;
  ytext: Y.Text;
  provider: HocuspocusProvider;
  themeCompartment: Compartment;
  wordWrapCompartment: Compartment;
  placeholderCompartment: Compartment;
}

export interface MountTiptapParams {
  docName: string;
  container: HTMLElement;
  factory: (container: HTMLElement) => TiptapFactoryResult;
  sizeStats?: SizeStats;
}

export interface MountCmParams {
  docName: string;
  container: HTMLElement;
  factory: (container: HTMLElement) => CmFactoryResult;
  sizeStats?: SizeStats;
}

export type RenameSelectionJSON =
  | { type: 'text'; anchor: number; head: number }
  | { type: 'node'; from: number };

export interface RenameSnapshot {
  html: string;
  scrollTop: number;
  selection: RenameSelectionJSON | null;
}
