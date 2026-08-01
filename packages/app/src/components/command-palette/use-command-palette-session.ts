import { useEffect, useState } from 'react';
import { fetchDatabaseCatalog } from '@/lib/database-catalog-client';
import type { OkDesktopBridge, RecentProjectEntry } from '@/lib/desktop-bridge-types';
import { loadOmnibarRecents, type OmnibarRecentEntry } from '../command-palette-recents';
import {
  buildDatabaseNavigationEntries,
  type DatabaseNavigationEntry,
} from '../database-navigation-entries';
import { runWithToast } from './command-palette-utils';

export type CommandPaletteLoadStatus = 'idle' | 'loading' | 'success' | 'error';

/** Owns palette-session catalog, recents, and desktop project-index lifecycle. */
export function useCommandPaletteSession({
  bridge,
  open,
  recentProjectsError,
  refreshInstallStates,
}: {
  bridge: OkDesktopBridge | null;
  open: boolean;
  recentProjectsError: string;
  refreshInstallStates: () => Promise<void> | void;
}) {
  const [projectRecents, setProjectRecents] = useState<RecentProjectEntry[]>([]);
  const [recentNavigation, setRecentNavigation] = useState<OmnibarRecentEntry[]>([]);
  const [databaseNavigation, setDatabaseNavigation] = useState<DatabaseNavigationEntry[]>([]);
  const [databaseNavigationStatus, setDatabaseNavigationStatus] =
    useState<CommandPaletteLoadStatus>('idle');

  useEffect(() => {
    if (!open) {
      setDatabaseNavigation([]);
      setDatabaseNavigationStatus('idle');
      return;
    }
    setRecentNavigation(loadOmnibarRecents());
    const controller = new AbortController();
    setDatabaseNavigationStatus('loading');
    void fetchDatabaseCatalog({ signal: controller.signal })
      .then((catalog) => {
        setDatabaseNavigation(buildDatabaseNavigationEntries(catalog.candidates));
        setDatabaseNavigationStatus('success');
      })
      .catch(() => {
        if (!controller.signal.aborted) setDatabaseNavigationStatus('error');
      });
    void refreshInstallStates();
    if (!bridge) return () => controller.abort();
    let cancelled = false;
    void runWithToast(async () => {
      const result = await bridge.project.listRecent();
      if (!cancelled) setProjectRecents(result);
    }, recentProjectsError);
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [bridge, open, recentProjectsError, refreshInstallStates]);

  return {
    databaseNavigation,
    databaseNavigationStatus,
    projectRecents,
    recentNavigation,
    setRecentNavigation,
  };
}
