import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

export interface ModuleSizeBudget {
  path: string;
  maxLines: number;
  owner: string;
}

export interface LegacyModuleException {
  path: string;
  currentRole: string;
  targetBoundary: string;
  phase: string;
  rfc: string;
}

/** New leaf/coordinator files created by RFC 0002. */
export const MODULE_SIZE_BUDGETS: readonly ModuleSizeBudget[] = [
  {
    path: 'lib/database-cell-mutation.ts',
    maxLines: 80,
    owner: 'database mutation compatibility barrel',
  },
  {
    path: 'lib/database-mutations/database-desired-state-base.ts',
    maxLines: 250,
    owner: 'database desired-state base projection',
  },
  {
    path: 'lib/database-mutations/database-view-commands.ts',
    maxLines: 300,
    owner: 'database view commands',
  },
  {
    path: 'lib/database-mutations/database-page-commands.ts',
    maxLines: 250,
    owner: 'database page commands',
  },
  {
    path: 'lib/database-mutations/database-property-advanced-commands.ts',
    maxLines: 300,
    owner: 'database computed/property option commands',
  },
  {
    path: 'lib/database-mutations/database-property-option-commands.ts',
    maxLines: 260,
    owner: 'database select option lifecycle commands',
  },
  {
    path: 'lib/database-mutations/database-property-commands.ts',
    maxLines: 400,
    owner: 'database schema property commands',
  },
  {
    path: 'lib/database-mutations/database-property-catalog.ts',
    maxLines: 300,
    owner: 'database property catalog and seeds',
  },
  {
    path: 'lib/database-mutations/database-record-commands.ts',
    maxLines: 350,
    owner: 'database record commands',
  },
  {
    path: 'lib/database-mutations/database-bulk-commands.ts',
    maxLines: 220,
    owner: 'database bulk commands',
  },
  {
    path: 'lib/database-mutations/database-cell-commands.ts',
    maxLines: 250,
    owner: 'database cell draft commands',
  },
  {
    path: 'components/database-table/DatabaseTableGeometry.ts',
    maxLines: 350,
    owner: 'database geometry',
  },
  {
    path: 'components/database-table/database-workspace-contract.ts',
    maxLines: 300,
    owner: 'database workspace state',
  },
  {
    path: 'components/file-tree/file-tree-commands.ts',
    maxLines: 450,
    owner: 'file-tree commands',
  },
  {
    path: 'components/file-tree/file-tree-types.ts',
    maxLines: 180,
    owner: 'file-tree public contract',
  },
  {
    path: 'components/command-palette/command-palette-utils.ts',
    maxLines: 250,
    owner: 'command palette pure rules',
  },
  {
    path: 'components/command-palette/command-palette-types.ts',
    maxLines: 120,
    owner: 'command palette contract',
  },
  {
    path: 'editor/extensions/jsx-component-view/jsx-component-view-utils.ts',
    maxLines: 220,
    owner: 'JSX attribute rules',
  },
  {
    path: 'components/settings/SettingsSchemaRegistry.ts',
    maxLines: 300,
    owner: 'settings schema registry',
  },
  { path: 'components/settings/settings-types.ts', maxLines: 160, owner: 'settings contract' },
  {
    path: 'editor/document-context/useDocumentNavigation.ts',
    maxLines: 180,
    owner: 'document navigation',
  },
  { path: 'editor/document-context/useDocumentTabs.ts', maxLines: 180, owner: 'document tabs' },
  { path: 'editor/document-context/useDocumentPanels.ts', maxLines: 120, owner: 'document panels' },
  {
    path: 'editor/document-context/useDocumentCollaboration.ts',
    maxLines: 220,
    owner: 'document collaboration',
  },
  {
    path: 'editor/document-context/document-context-types.ts',
    maxLines: 120,
    owner: 'document context public contract',
  },
  {
    path: 'editor/components/use-inline-database-controller.ts',
    maxLines: 300,
    owner: 'inline database controller facade',
  },
  {
    path: 'editor/components/use-inline-database-controller-state.ts',
    maxLines: 350,
    owner: 'inline database interaction state',
  },
  {
    path: 'editor/components/use-inline-database-read-state.ts',
    maxLines: 350,
    owner: 'inline database read and projection state',
  },
  {
    path: 'editor/components/use-inline-database-commands.ts',
    maxLines: 450,
    owner: 'inline database command adapter',
  },
  {
    path: 'editor/components/use-inline-database-option-commands.ts',
    maxLines: 180,
    owner: 'inline database option command adapter',
  },
  {
    path: 'editor/components/use-inline-database-view-commands.ts',
    maxLines: 220,
    owner: 'inline database saved-view command adapter',
  },
  {
    path: 'editor/components/inline-database-history.ts',
    maxLines: 120,
    owner: 'inline database history keyboard command',
  },
  {
    path: 'components/use-database-workspace-controller.ts',
    maxLines: 300,
    owner: 'database workspace controller facade',
  },
  {
    path: 'components/use-database-workspace-controller-state.ts',
    maxLines: 450,
    owner: 'database workspace interaction state',
  },
  {
    path: 'components/DatabaseSavedViewSettingsDialog.tsx',
    maxLines: 80,
    owner: 'saved view settings facade',
  },
  {
    path: 'components/DatabaseRecordPageChrome.tsx',
    maxLines: 100,
    owner: 'record page chrome facade',
  },
  {
    path: 'components/database-saved-view-settings/database-saved-view-settings-utils.ts',
    maxLines: 160,
    owner: 'saved view settings pure rules',
  },
  {
    path: 'components/database-saved-view-settings/database-saved-view-settings-draft.ts',
    maxLines: 160,
    owner: 'saved view projection draft',
  },
  {
    path: 'components/database-saved-view-settings/DatabaseSavedViewSettingsCommonPanel.tsx',
    maxLines: 120,
    owner: 'saved view common settings panel',
  },
  {
    path: 'components/database-saved-view-settings/DatabaseSavedViewSettingsLayoutPanel.tsx',
    maxLines: 120,
    owner: 'saved view layout settings panel',
  },
  {
    path: 'components/database-record-page/database-record-page-utils.ts',
    maxLines: 160,
    owner: 'record page binding rules',
  },
  {
    path: 'components/database-record-page/DatabaseRecordPageBinding.ts',
    maxLines: 120,
    owner: 'record page binding state',
  },
  {
    path: 'components/database-record-page/DatabaseRecordPageRouteAdapter.ts',
    maxLines: 140,
    owner: 'record page route adapter',
  },
];

/**
 * Existing facades are intentionally tracked until the remaining extraction
 * phases land. An exception is not permission to grow: it records the owner,
 * target boundary and the RFC phase that must remove it.
 */
export const LEGACY_MODULE_EXCEPTIONS: readonly LegacyModuleException[] = [
  {
    path: 'components/FileTree.tsx',
    currentRole: 'tree facade/controller/render',
    targetBoundary: 'components/file-tree/',
    phase: '6a',
    rfc: '0002',
  },
  {
    path: 'editor/DocumentContext.tsx',
    currentRole: 'provider composition',
    targetBoundary: 'editor/document-context/',
    phase: '6b',
    rfc: '0002',
  },
  {
    path: 'components/CommandPalette.tsx',
    currentRole: 'palette coordinator/render',
    targetBoundary: 'components/command-palette/',
    phase: '6c',
    rfc: '0002',
  },
  {
    path: 'editor/extensions/JsxComponentView.tsx',
    currentRole: 'NodeView lifecycle/render',
    targetBoundary: 'editor/extensions/jsx-component-view/',
    phase: '6d',
    rfc: '0002',
  },
  {
    path: 'components/settings/SettingsDialogBody.tsx',
    currentRole: 'settings section coordinator',
    targetBoundary: 'components/settings/',
    phase: '6e',
    rfc: '0002',
  },
  {
    path: 'components/EditorArea.tsx',
    currentRole: 'editor layout coordinator',
    targetBoundary: 'components/editor-area/',
    phase: '6f',
    rfc: '0002',
  },
  {
    path: 'components/EditorTabs.tsx',
    currentRole: 'tab-strip coordinator',
    targetBoundary: 'components/editor-tabs/',
    phase: '6g',
    rfc: '0002',
  },
];

/** Database boundaries owned by the RFC 0006 feature tree. */
export const DATABASE_BOUNDARY_CONTRACT = [
  'lib/database-cell-mutation.ts',
  'lib/database-mutations/database-desired-state-base.ts',
  'lib/database-mutations/database-view-commands.ts',
  'lib/database-mutations/database-page-commands.ts',
  'lib/database-mutations/database-property-advanced-commands.ts',
  'lib/database-mutations/database-property-option-commands.ts',
  'lib/database-mutations/database-property-commands.ts',
  'lib/database-mutations/database-property-catalog.ts',
  'lib/database-mutations/database-record-commands.ts',
  'lib/database-mutations/database-bulk-commands.ts',
  'lib/database-mutations/database-cell-commands.ts',
  'components/database-table/DatabaseTableShell.tsx',
  'components/database-table/DatabaseTableViewport.tsx',
  'components/database-table/DatabaseTableHeader.tsx',
  'components/database-table/DatabaseTableBody.tsx',
  'components/database-table/DatabaseTableInteractionLayer.tsx',
  'components/database-saved-view-settings/DatabaseSavedViewSettingsShell.tsx',
  'components/database-workspace/useDatabaseWorkspaceController.ts',
  'lib/database-cell-mutation.ts',
  'components/DatabaseRecordPageChrome.tsx',
  'editor/components/use-inline-database-controller.ts',
  'editor/components/use-inline-database-controller-state.ts',
  'editor/components/use-inline-database-read-state.ts',
  'editor/components/use-inline-database-commands.ts',
  'editor/components/use-inline-database-option-commands.ts',
  'editor/components/use-inline-database-view-commands.ts',
  'editor/components/inline-database-history.ts',
  'components/use-database-workspace-controller.ts',
  'components/use-database-workspace-controller-state.ts',
  'components/DatabaseSavedViewSettingsDialog.tsx',
  'components/DatabaseRecordPageChrome.tsx',
  'components/database-saved-view-settings/database-saved-view-settings-utils.ts',
  'components/database-record-page/database-record-page-utils.ts',
] as const;

export function appSourceRoot(moduleFile: string): string {
  return join(dirname(moduleFile), '..');
}

export function moduleLineCount(file: string): number {
  return readFileSync(file, 'utf8').split(/\r?\n/).length;
}

export function resolveAppModule(appSrc: string, modulePath: string): string {
  return normalize(join(appSrc, modulePath));
}

export function relativeAppModule(appSrc: string, file: string): string {
  return relative(appSrc, file).replaceAll('\\', '/');
}

export function missingDatabaseBoundaryModules(appSrc: string): readonly string[] {
  return DATABASE_BOUNDARY_CONTRACT.filter(
    (modulePath) => !existsSync(resolveAppModule(appSrc, modulePath)),
  );
}
