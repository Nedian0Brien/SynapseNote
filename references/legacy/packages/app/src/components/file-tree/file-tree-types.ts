import type { Ref } from 'react';

/** Public imperative contract owned by the sidebar controller. */
export interface FileTreeHandle {
  startCreating(kind: 'file' | 'folder', parentDir: string): void;
  createFromTemplate(parentDir: string, templateName: string): void;
  expandAll(): void;
  collapseAll(): void;
  getFolderState(): { folderCount: number; expandedCount: number };
  isCreationTargetCleared(): boolean;
  clearCreationTarget(): void;
  subscribe(listener: () => void): () => void;
}

export interface FileTreeProps {
  ref?: Ref<FileTreeHandle | null>;
  onContentHeightChange?: (px: number) => void;
}
