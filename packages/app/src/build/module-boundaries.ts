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
    path: 'components/database-workspace-controller-boundaries.ts',
    maxLines: 60,
    owner: 'database workspace controller boundary helpers',
  },
  {
    path: 'components/use-database-workspace-controller-state.ts',
    maxLines: 450,
    owner: 'database workspace interaction state',
  },
  {
    path: 'components/use-database-workspace-read-lifecycle.ts',
    maxLines: 400,
    owner: 'database workspace read lifecycle and projections',
  },
  {
    path: 'components/use-database-workspace-mutation-record-commands.ts',
    maxLines: 220,
    owner: 'database workspace mutation and record command ports',
  },
  {
    path: 'components/use-database-workspace-structure-commands.ts',
    maxLines: 450,
    owner: 'database workspace bulk, schema, and view command ports',
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
    maxLines: 135,
    owner: 'saved view layout settings panel',
  },
  {
    path: 'components/database-saved-view-settings/DatabaseSavedViewSettingsDialog.tsx',
    maxLines: 110,
    owner: 'saved view settings dialog composer',
  },
  {
    path: 'components/database-saved-view-settings/DatabaseSavedViewSettingsSortsGroupsPanel.tsx',
    maxLines: 245,
    owner: 'saved view sort and group controls',
  },
  {
    path: 'components/database-saved-view-settings/DatabaseSavedViewSettingsProjectionPanel.tsx',
    maxLines: 160,
    owner: 'saved view projection controls',
  },
  {
    path: 'components/database-saved-view-settings/DatabaseSavedViewSettingsConditionalColorsPanel.tsx',
    maxLines: 265,
    owner: 'saved view conditional color controls',
  },
  {
    path: 'components/database-saved-view-settings/DatabaseSavedViewSettingsTablePanel.tsx',
    maxLines: 60,
    owner: 'saved view table controls',
  },
  {
    path: 'components/database-saved-view-settings/DatabaseSavedViewSettingsBoardPanel.tsx',
    maxLines: 145,
    owner: 'saved view board controls',
  },
  {
    path: 'components/database-saved-view-settings/DatabaseSavedViewSettingsTimelinePanel.tsx',
    maxLines: 235,
    owner: 'saved view timeline controls',
  },
  {
    path: 'components/database-saved-view-settings/DatabaseSavedViewSettingsCalendarPanel.tsx',
    maxLines: 135,
    owner: 'saved view calendar controls',
  },
  {
    path: 'components/database-saved-view-settings/DatabaseSavedViewSettingsListPanel.tsx',
    maxLines: 145,
    owner: 'saved view list controls',
  },
  {
    path: 'components/database-saved-view-settings/DatabaseSavedViewSettingsGalleryPanel.tsx',
    maxLines: 150,
    owner: 'saved view gallery controls',
  },
  {
    path: 'components/database-saved-view-settings/DatabaseSavedViewSettingsChartPanel.tsx',
    maxLines: 300,
    owner: 'saved view chart controls',
  },
  {
    path: 'components/database-saved-view-settings/DatabaseSavedViewSettingsMapPanel.tsx',
    maxLines: 175,
    owner: 'saved view map controls',
  },
  {
    path: 'components/database-saved-view-settings/database-saved-view-settings-types.ts',
    maxLines: 40,
    owner: 'saved view settings panel contract',
  },
  {
    path: 'components/database-saved-view-settings/use-saved-view-settings-draft.ts',
    maxLines: 60,
    owner: 'saved view settings draft lifecycle',
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
  // RFC 0002 app-shell extraction leaves. Keep each responsibility explicit
  // so a future monolith regression is visible at the boundary guard.
  {
    path: 'editor/document-context/DocumentProviderComposition.tsx',
    maxLines: 150,
    owner: 'Owns document provider composition.',
  },
  {
    path: 'editor/document-context/context.ts',
    maxLines: 40,
    owner: 'Owns document context creation and accessors.',
  },
  {
    path: 'editor/document-context/hmr.ts',
    maxLines: 60,
    owner: 'Owns document context hot-module replacement wiring.',
  },
  {
    path: 'editor/document-context/runtime-helpers.ts',
    maxLines: 280,
    owner: 'Owns document runtime helper state.',
  },
  {
    path: 'editor/document-context/useDocumentCommands.ts',
    maxLines: 380,
    owner: 'Owns document command actions.',
  },
  {
    path: 'editor/document-context/useDocumentPoolLifecycle.ts',
    maxLines: 390,
    owner: 'Owns document pool lifecycle transitions.',
  },
  {
    path: 'editor/document-context/useDocumentProviderState.ts',
    maxLines: 400,
    owner: 'Owns document provider state projection.',
  },
  {
    path: 'editor/document-context/useDocumentTabCommands.ts',
    maxLines: 450,
    owner: 'Owns document tab command transitions.',
  },
  {
    path: 'components/command-palette/CommandPaletteCommandResults.tsx',
    maxLines: 260,
    owner: 'Owns command palette command result rendering.',
  },
  {
    path: 'components/command-palette/CommandPaletteModeResults.tsx',
    maxLines: 220,
    owner: 'Owns command palette mode result rendering.',
  },
  {
    path: 'components/command-palette/CommandPaletteNavigationItem.tsx',
    maxLines: 120,
    owner: 'Owns command palette navigation item rendering.',
  },
  {
    path: 'components/command-palette/CommandPaletteNavigationResults.tsx',
    maxLines: 150,
    owner: 'Owns command palette navigation result rendering.',
  },
  {
    path: 'components/command-palette/CommandPaletteProjectResults.tsx',
    maxLines: 240,
    owner: 'Owns command palette project result rendering.',
  },
  {
    path: 'components/command-palette/CommandPaletteResults.tsx',
    maxLines: 40,
    owner: 'Owns command palette result composition.',
  },
  {
    path: 'components/command-palette/CommandPaletteSearchHint.tsx',
    maxLines: 60,
    owner: 'Owns command palette search hint rendering.',
  },
  {
    path: 'components/command-palette/CommandPaletteStateProvider.tsx',
    maxLines: 50,
    owner: 'Owns command palette state context.',
  },
  {
    path: 'components/command-palette/CommandPaletteSurface.tsx',
    maxLines: 160,
    owner: 'Owns command palette surface composition.',
  },
  {
    path: 'components/command-palette/command-palette-command-registry.ts',
    maxLines: 40,
    owner: 'Owns command palette command registration.',
  },
  {
    path: 'components/command-palette/use-command-palette-actions.ts',
    maxLines: 140,
    owner: 'Owns command palette action dispatch.',
  },
  {
    path: 'components/command-palette/use-command-palette-controller.ts',
    maxLines: 380,
    owner: 'Owns command palette controller orchestration.',
  },
  {
    path: 'components/command-palette/use-command-palette-lexical-search.ts',
    maxLines: 150,
    owner: 'Owns command palette lexical search.',
  },
  {
    path: 'components/command-palette/use-command-palette-semantic-search.ts',
    maxLines: 220,
    owner: 'Owns command palette semantic search.',
  },
  {
    path: 'components/command-palette/use-command-palette-session.ts',
    maxLines: 100,
    owner: 'Owns command palette session state.',
  },
  {
    path: 'components/command-palette/use-command-palette-tags.ts',
    maxLines: 130,
    owner: 'Owns command palette tag filtering.',
  },
  {
    path: 'components/editor-area/SettingsDialogPortal.tsx',
    maxLines: 30,
    owner: 'Owns editor area settings dialog portal rendering.',
  },
  {
    path: 'components/editor-area/EditorAreaDocumentSurface.tsx',
    maxLines: 150,
    owner: 'Owns editor area document surface rendering.',
  },
  {
    path: 'components/editor-area/EditorAreaLayout.tsx',
    maxLines: 100,
    owner: 'Owns editor area layout composition.',
  },
  {
    path: 'components/editor-area/EditorAreaRightPanels.tsx',
    maxLines: 180,
    owner: 'Owns editor area right-panel rendering.',
  },
  {
    path: 'components/editor-area/EditorAreaStateProvider.tsx',
    maxLines: 190,
    owner: 'Owns editor area state context.',
  },
  {
    path: 'components/editor-area/EditorAreaTerminalColumn.tsx',
    maxLines: 80,
    owner: 'Owns editor area terminal column rendering.',
  },
  {
    path: 'components/editor-area/EditorAreaView.tsx',
    maxLines: 160,
    owner: 'Owns editor area primary view composition.',
  },
  {
    path: 'components/editor-area/types.ts',
    maxLines: 50,
    owner: 'Owns editor area public view contracts.',
  },
  {
    path: 'components/editor-area/useEditorAreaRightRail.ts',
    maxLines: 400,
    owner: 'Owns editor area right-rail state.',
  },
  {
    path: 'components/editor-tabs/EditorTabChrome.tsx',
    maxLines: 330,
    owner: 'Owns editor tab chrome rendering.',
  },
  {
    path: 'components/editor-tabs/EditorTabItem.tsx',
    maxLines: 400,
    owner: 'Owns editor tab item rendering and actions.',
  },
  {
    path: 'components/editor-tabs/EditorTabStrip.tsx',
    maxLines: 220,
    owner: 'Owns editor tab strip composition.',
  },
  {
    path: 'components/editor-tabs/editor-tab-model.ts',
    maxLines: 140,
    owner: 'Owns editor tab model transformations.',
  },
  {
    path: 'components/editor-tabs/useEditorTabKeyboardShortcuts.ts',
    maxLines: 180,
    owner: 'Owns editor tab keyboard commands.',
  },
  {
    path: 'components/editor-tabs/useEditorTabRename.ts',
    maxLines: 270,
    owner: 'Owns editor tab rename transitions.',
  },
  {
    path: 'editor/extensions/jsx-component-view/JsxComponentViewChrome.tsx',
    maxLines: 260,
    owner: 'Owns JSX component view chrome rendering.',
  },
  {
    path: 'editor/extensions/jsx-component-view/JsxComponentViewContent.tsx',
    maxLines: 190,
    owner: 'Owns JSX component view content rendering.',
  },
  {
    path: 'editor/extensions/jsx-component-view/JsxComponentViewOverlays.tsx',
    maxLines: 140,
    owner: 'Owns JSX component view overlay rendering.',
  },
  {
    path: 'editor/extensions/jsx-component-view/jsx-component-view-attribute-policy.ts',
    maxLines: 90,
    owner: 'Owns JSX component attribute policy.',
  },
  {
    path: 'editor/extensions/jsx-component-view/jsx-component-view-conversion-policy.ts',
    maxLines: 50,
    owner: 'Owns JSX component conversion policy.',
  },
  {
    path: 'editor/extensions/jsx-component-view/jsx-component-view-interaction-policy.ts',
    maxLines: 80,
    owner: 'Owns JSX component interaction policy.',
  },
  {
    path: 'editor/extensions/jsx-component-view/use-jsx-component-view-interactions.ts',
    maxLines: 260,
    owner: 'Owns JSX component view interaction state.',
  },
  {
    path: 'editor/extensions/jsx-component-view/use-jsx-component-view-lifecycle.ts',
    maxLines: 210,
    owner: 'Owns JSX component view lifecycle.',
  },
  {
    path: 'components/settings/settings-dialog/attachments-section.tsx',
    maxLines: 270,
    owner: 'Owns settings attachment controls.',
  },
  {
    path: 'components/settings/settings-dialog/config-validation-feedback.ts',
    maxLines: 80,
    owner: 'Owns settings configuration validation feedback.',
  },
  {
    path: 'components/settings/settings-dialog/hotkeys-section.tsx',
    maxLines: 150,
    owner: 'Owns settings hotkey controls.',
  },
  {
    path: 'components/settings/settings-dialog/integrations-section.tsx',
    maxLines: 80,
    owner: 'Owns settings integration controls.',
  },
  {
    path: 'components/settings/settings-dialog/preferences-panel.tsx',
    maxLines: 50,
    owner: 'Owns settings preference controls.',
  },
  {
    path: 'components/settings/settings-dialog/schema-settings-section.tsx',
    maxLines: 100,
    owner: 'Owns settings schema controls.',
  },
  {
    path: 'components/settings/settings-dialog/section-skeleton.tsx',
    maxLines: 40,
    owner: 'Owns settings section loading skeleton.',
  },
  {
    path: 'components/settings/settings-dialog/settings-dialog-section-registry.tsx',
    maxLines: 90,
    owner: 'Owns settings dialog section registry.',
  },
  {
    path: 'components/settings/settings-dialog/settings-field.tsx',
    maxLines: 420,
    owner: 'Owns settings field rendering and updates.',
  },
  {
    path: 'components/settings/settings-dialog/sync-section.tsx',
    maxLines: 300,
    owner: 'Owns settings synchronization controls.',
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
  'components/database-workspace-controller-boundaries.ts',
  'components/use-database-workspace-controller-state.ts',
  'components/use-database-workspace-read-lifecycle.ts',
  'components/use-database-workspace-mutation-record-commands.ts',
  'components/use-database-workspace-structure-commands.ts',
  'components/DatabaseSavedViewSettingsDialog.tsx',
  'components/DatabaseRecordPageChrome.tsx',
  'components/database-saved-view-settings/database-saved-view-settings-utils.ts',
  'components/database-saved-view-settings/database-saved-view-settings-draft.ts',
  'components/database-saved-view-settings/database-saved-view-settings-types.ts',
  'components/database-saved-view-settings/use-saved-view-settings-draft.ts',
  'components/database-saved-view-settings/DatabaseSavedViewSettingsDialog.tsx',
  'components/database-saved-view-settings/DatabaseSavedViewSettingsSortsGroupsPanel.tsx',
  'components/database-saved-view-settings/DatabaseSavedViewSettingsProjectionPanel.tsx',
  'components/database-saved-view-settings/DatabaseSavedViewSettingsConditionalColorsPanel.tsx',
  'components/database-saved-view-settings/DatabaseSavedViewSettingsTablePanel.tsx',
  'components/database-saved-view-settings/DatabaseSavedViewSettingsBoardPanel.tsx',
  'components/database-saved-view-settings/DatabaseSavedViewSettingsTimelinePanel.tsx',
  'components/database-saved-view-settings/DatabaseSavedViewSettingsCalendarPanel.tsx',
  'components/database-saved-view-settings/DatabaseSavedViewSettingsListPanel.tsx',
  'components/database-saved-view-settings/DatabaseSavedViewSettingsGalleryPanel.tsx',
  'components/database-saved-view-settings/DatabaseSavedViewSettingsChartPanel.tsx',
  'components/database-saved-view-settings/DatabaseSavedViewSettingsMapPanel.tsx',
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
