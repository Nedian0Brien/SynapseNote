import type { WorktreeSelectorEntry } from '@nedian0brien/synapsenote-core';
import type { Dispatch, SetStateAction } from 'react';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { refreshWorktrees } from '@/lib/worktree-store';
import {
  loadOmnibarRecents,
  type OmnibarRecentEntry,
  rememberOmnibarRecent,
  saveOmnibarRecents,
} from '../command-palette-recents';
import type { WorkspaceEntry } from '../command-palette-search';
import type { DatabaseNavigationEntry } from '../database-navigation-entries';
import { navigateToDocHash, runWithToast } from './command-palette-utils';

function navigateToDatabaseHash(hash: string): void {
  window.location.assign(hash);
}

/** Owns palette command side effects: navigation, recents, and desktop worktree activation. */
export function useCommandPaletteActions({
  bridge,
  commandFailure,
  onOpenChange,
  setRecentNavigation,
  worktreeError,
}: {
  bridge: OkDesktopBridge | null;
  commandFailure: string;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
  setRecentNavigation: Dispatch<SetStateAction<OmnibarRecentEntry[]>>;
  worktreeError: string;
}) {
  const runAction = (fn: () => Promise<void> | void, fallback = commandFailure) => {
    onOpenChange(false);
    void runWithToast(async () => {
      await fn();
    }, fallback);
  };

  function rememberNavigation(
    entry: WorkspaceEntry | OmnibarRecentEntry | DatabaseNavigationEntry,
  ) {
    const nextEntry: OmnibarRecentEntry =
      entry.kind === 'database'
        ? {
            kind: 'database',
            path: entry.path,
            lastOpenedAt: new Date().toISOString(),
            name: entry.name,
            databaseId: entry.databaseId,
            sourceId: entry.sourceId,
            databaseName: entry.databaseName,
            sourceName: entry.sourceName,
            databaseKey: entry.databaseKey,
            sourceKey: entry.sourceKey,
            purpose: entry.purpose,
          }
        : { kind: entry.kind, path: entry.path, lastOpenedAt: new Date().toISOString() };
    const nextRecents = rememberOmnibarRecent(loadOmnibarRecents(), nextEntry);
    saveOmnibarRecents(nextRecents);
    setRecentNavigation(nextRecents);
  }

  function navigateToEntry(entry: WorkspaceEntry | OmnibarRecentEntry | DatabaseNavigationEntry) {
    onOpenChange(false);
    rememberNavigation(entry);
    if (entry.kind === 'database') {
      navigateToDatabaseHash(entry.path);
      return;
    }
    navigateToDocHash(entry.path);
  }

  function openWorktreeEntry(entry: WorktreeSelectorEntry) {
    if (!bridge) return;
    if (entry.worktreePath !== null) {
      runAction(
        () =>
          bridge.project.open({
            path: entry.worktreePath as string,
            target: 'new-window',
            entryPoint: 'worktree',
          }),
        worktreeError,
      );
      return;
    }
    if (entry.branch === null) return;
    runAction(async () => {
      const result = await bridge.worktree.create({
        branch: entry.branch as string,
        createBranch: false,
      });
      if (!result.ok) throw new Error(result.reason);
      refreshWorktrees();
      await bridge.project.open({
        path: result.path,
        target: 'new-window',
        entryPoint: 'worktree',
      });
    }, worktreeError);
  }

  return { navigateToEntry, openWorktreeEntry, runAction };
}
