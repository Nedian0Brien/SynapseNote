import { useLingui } from '@lingui/react/macro';
import { SHOW_INSTALL_SKILL } from '@nedian0brien/synapsenote-core';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { searchDatabaseNavigationEntries } from '@/components/database-navigation-entries';
import { usePageList } from '@/components/PageListContext';
import { useDocumentNavigation } from '@/editor/document-context/useDocumentNavigation';
import { useIsEmbedded } from '@/hooks/use-is-embedded';
import { useWorktrees } from '@/hooks/use-worktrees';
import { matchesKeyboardShortcut } from '@/lib/keyboard-shortcuts';
import { useSingleFileMode } from '@/lib/single-file-mode';
import { useWorkspace } from '@/lib/use-workspace';
import {
  filterOmnibarRecents,
  makeOmnibarRecentKey,
  type OmnibarRecentEntry,
} from '../command-palette-recents';
import { buildWorkspaceEntries, searchWorkspaceEntries } from '../command-palette-search';
import { TAG_QUERY_PREFIX } from '../command-palette-tag-search';
import { buildHandoffInput, useHandoffDispatch } from '../handoff/useHandoffDispatch';
import { useInstalledAgents } from '../handoff/useInstalledAgents';
import {
  type CommandPaletteRegistryEntry,
  filterCommandPaletteRegistry,
} from './command-palette-command-registry';
import type { CommandPaletteProps } from './command-palette-types';
import { resolveCreateInitialDir } from './command-palette-utils';
import { useCommandPaletteActions } from './use-command-palette-actions';
import { useCommandPaletteLexicalSearch } from './use-command-palette-lexical-search';
import { useCommandPaletteSemanticSearch } from './use-command-palette-semantic-search';
import { useCommandPaletteSession } from './use-command-palette-session';
import { useCommandPaletteTags } from './use-command-palette-tags';

/** Owns command-palette state transitions and derives render-ready command populations. */
export function useCommandPaletteController({
  bridge = null,
  onOpenAgentRuns,
  onOpenChange,
  onOpenDataInspector,
  onOpenDatabaseDiagnostics,
  onOpenDatabases,
  open,
}: CommandPaletteProps) {
  const { t } = useLingui();
  const singleFile = useSingleFileMode();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [createDialogKind, setCreateDialogKind] = useState<'file' | 'folder' | null>(null);
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [reportBugOpen, setReportBugOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { activeDocName, activeTarget } = useDocumentNavigation();
  const {
    pages,
    pageTitles,
    pageMeta,
    folderPaths,
    filePaths,
    loading: pagesLoading,
  } = usePageList();
  const workspace = useWorkspace();
  const { states: installStates, refresh: refreshInstallStates } = useInstalledAgents();
  const { dispatch: dispatchHandoff } = useHandoffDispatch();
  const handoffInput = buildHandoffInput({ docName: activeDocName, workspace });
  const semantic = useCommandPaletteSemanticSearch({
    inputRef,
    open,
    pagesLoading,
    query,
    setQuery,
  });
  const tags = useCommandPaletteTags({
    deferredQuery,
    open,
    semanticMode: semantic.isSemanticMode,
  });
  const inExclusiveMode = tags.isTagMode || semantic.isSemanticMode;
  const lexical = useCommandPaletteLexicalSearch({
    deferredQuery,
    inExclusiveMode,
    open,
    pagesLoading,
    query,
  });
  const session = useCommandPaletteSession({
    bridge,
    open,
    recentProjectsError: t`Failed to load recent projects.`,
    refreshInstallStates,
  });
  const actions = useCommandPaletteActions({
    bridge,
    commandFailure: t`Command failed.`,
    onOpenChange,
    setRecentNavigation: session.setRecentNavigation,
    worktreeError: t`Failed to open worktree.`,
  });

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!matchesKeyboardShortcut(event, 'command-palette')) return;
      event.preventDefault();
      onOpenChange(!open);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpenChange, open]);

  const workspaceEntries = buildWorkspaceEntries(
    pages,
    folderPaths,
    pageTitles,
    pageMeta,
    filePaths,
  );
  const validRecentKeys = new Set([
    ...workspaceEntries.map((entry) => makeOmnibarRecentKey(entry.kind, entry.path)),
    ...session.databaseNavigation.map((entry) => makeOmnibarRecentKey(entry.kind, entry.path)),
  ]);
  const visibleRecents: Array<OmnibarRecentEntry | (typeof session.databaseNavigation)[number]> =
    [];
  for (const entry of filterOmnibarRecents(session.recentNavigation, validRecentKeys)) {
    if (entry.kind !== 'database') {
      visibleRecents.push(entry);
      continue;
    }
    const databaseEntry = session.databaseNavigation.find(
      (candidate) => candidate.path === entry.path,
    );
    if (databaseEntry) visibleRecents.push(databaseEntry);
  }
  const trimmedDeferredQuery = lexical.trimmedDeferredQuery;
  const fallbackSearchResults =
    trimmedDeferredQuery === ''
      ? []
      : searchWorkspaceEntries(workspaceEntries, trimmedDeferredQuery, 8);
  const databaseSearchResults =
    !inExclusiveMode && session.databaseNavigationStatus === 'success'
      ? searchDatabaseNavigationEntries(session.databaseNavigation, trimmedDeferredQuery, 8)
      : [];
  const worktreeModel = useWorktrees();
  const switchableWorktrees =
    bridge && worktreeModel
      ? worktreeModel.entries.filter((entry) => entry.branch !== null && !entry.isCurrent)
      : [];
  const currentPath = bridge?.config.projectPath ?? null;
  const switchableProjects = bridge
    ? session.projectRecents.filter((row) => row.path !== currentPath)
    : [];
  const isEmbedded = useIsEmbedded();
  const registry: readonly CommandPaletteRegistryEntry[] = [
    { id: 'new-file', label: t`New file`, aliases: ['create file'], available: !inExclusiveMode },
    {
      id: 'new-folder',
      label: t`New folder`,
      aliases: ['create folder'],
      available: !inExclusiveMode,
    },
    {
      id: 'new-database',
      label: t`New database`,
      aliases: ['create database', 'new table', 'database page'],
      available: !inExclusiveMode && !singleFile,
    },
    {
      id: 'graph',
      label: t`Open graph`,
      aliases: ['graph panel network'],
      available: !inExclusiveMode && activeDocName !== null,
    },
    {
      id: 'seed',
      label: t`Initialize starter pack`,
      aliases: ['scaffold', 'seed', 'pack', 'starter'],
      available: !inExclusiveMode,
    },
    {
      id: 'data-inspector',
      label: t`Inspect agent data context`,
      aliases: [
        'what the agent saw',
        'context pack',
        'database inspector',
        'tokens redactions omissions',
      ],
      available: !inExclusiveMode && !singleFile && onOpenDataInspector !== undefined,
    },
    {
      id: 'agent-runs',
      label: t`Open Agent Runs`,
      aliases: ['database agent history', 'proposed diff verification undo'],
      available: !inExclusiveMode && !singleFile && onOpenAgentRuns !== undefined,
    },
    {
      id: 'databases',
      label: t`Open databases`,
      aliases: ['database table records properties', 'browse data'],
      available: !inExclusiveMode && !singleFile && onOpenDatabases !== undefined,
    },
    {
      id: 'database-diagnostics',
      label: t`Open database diagnostics`,
      aliases: ['index state invalid records', 'schema revisions tasks repair'],
      available: !inExclusiveMode && !singleFile && onOpenDatabaseDiagnostics !== undefined,
    },
    {
      id: 'new-project',
      label: t`New project`,
      aliases: ['create new project scaffold'],
      available: !inExclusiveMode && bridge !== null,
    },
    {
      id: 'open-folder',
      label: t`Open folder on disk`,
      aliases: ['project'],
      available: !inExclusiveMode && bridge !== null,
    },
    {
      id: 'switch-project',
      label: t`Switch project`,
      aliases: ['switch project navigator projects'],
      available: !inExclusiveMode && !singleFile && bridge !== null,
    },
    {
      id: 'settings',
      label: t`Settings`,
      aliases: ['preferences config'],
      available: !inExclusiveMode && !singleFile,
    },
    {
      id: 'install-claude',
      label: t`Install for Claude Chat & Cowork (Desktop App)`,
      aliases: ['claude desktop install cowork'],
      available: SHOW_INSTALL_SKILL && !inExclusiveMode,
    },
    {
      id: 'report-bug',
      label: t`Report a bug`,
      aliases: ['bug report issue feedback problem'],
      available: !inExclusiveMode && bridge !== null,
    },
  ];
  const commandIds = new Set(
    filterCommandPaletteRegistry(registry, deferredQuery).map((entry) => entry.id),
  );
  const matchedWorktrees = switchableWorktrees.filter(
    (entry) =>
      trimmedDeferredQuery === '' ||
      filterCommandPaletteRegistry(
        [
          {
            id: 'worktree',
            label: entry.branch ?? '',
            aliases: ['worktree branch'],
            available: true,
          },
        ],
        deferredQuery,
      ).length > 0,
  );
  const showProjectRecents =
    !inExclusiveMode &&
    bridge !== null &&
    switchableProjects.length > 0 &&
    (trimmedDeferredQuery === '' ||
      switchableProjects.some(
        (row) =>
          filterCommandPaletteRegistry(
            [
              {
                id: row.path,
                label: `${row.name} ${row.path}`,
                aliases: ['open recent project'],
                available: true,
              },
            ],
            deferredQuery,
          ).length > 0,
      ));
  const showAgentGroup = !inExclusiveMode && !isEmbedded && handoffInput !== null;

  function toggleTagMode() {
    if (semantic.isSemanticMode) semantic.leaveSemanticModeForTag();
    setQuery(tags.isTagMode ? '' : TAG_QUERY_PREFIX);
    inputRef.current?.focus();
  }

  return {
    ...actions,
    ...lexical,
    ...semantic,
    ...session,
    ...tags,
    activeDocName,
    bridge,
    commandIds,
    createDialogKind,
    createProjectOpen,
    databaseSearchResults,
    dispatchHandoff,
    fallbackSearchResults,
    handoffInput,
    initialCreateDir: resolveCreateInitialDir(activeTarget, activeDocName),
    inExclusiveMode,
    inputRef,
    installStates,
    matchedWorktrees,
    onOpenAgentRuns,
    onOpenChange,
    onOpenDataInspector,
    onOpenDatabaseDiagnostics,
    onOpenDatabases,
    open,
    pagesLoading,
    query,
    reportBugOpen,
    seedDialogOpen,
    setCreateDialogKind,
    setCreateProjectOpen,
    setQuery,
    setReportBugOpen,
    setSeedDialogOpen,
    showAgentGroup,
    showProjectRecents,
    singleFile,
    switchableProjects,
    t,
    toggleTagMode,
    trimmedDeferredQuery,
    visibleRecents,
  };
}
