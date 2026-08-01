import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DATABASE_BOUNDARY_CONTRACT,
  LEGACY_MODULE_EXCEPTIONS,
  MODULE_SIZE_BUDGETS,
  missingDatabaseBoundaryModules,
  moduleLineCount,
  relativeAppModule,
  resolveAppModule,
} from './module-boundaries';

const APP_SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATABASE_LEAF_BOUNDARIES = [
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
  'components/database-saved-view-settings/DatabaseSavedViewSettingsCommonPanel.tsx',
  'components/database-saved-view-settings/DatabaseSavedViewSettingsLayoutPanel.tsx',
  'components/database-saved-view-settings/database-saved-view-settings-draft.ts',
  'components/database-saved-view-settings/database-saved-view-settings-utils.ts',
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
  'components/database-workspace/useDatabaseWorkspaceController.ts',
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
  'components/DatabaseSavedViewSettingsDialog.tsx',
  'components/DatabaseRecordPageChrome.tsx',
  'components/database-record-page/DatabaseRecordPageRouteAdapter.ts',
] as const;

describe('RFC 0002 module boundary guard', () => {
  test('every extracted boundary exists and stays below its size budget', () => {
    for (const budget of MODULE_SIZE_BUDGETS) {
      const file = resolveAppModule(APP_SRC, budget.path);
      expect(existsSync(file), `${budget.path} must exist`).toBe(true);
      expect(
        moduleLineCount(file),
        `${budget.path} exceeds ${budget.maxLines} lines`,
      ).toBeLessThanOrEqual(budget.maxLines);
    }
  });

  test('legacy facades are explicit and tied to an RFC phase', () => {
    for (const exception of LEGACY_MODULE_EXCEPTIONS) {
      const file = resolveAppModule(APP_SRC, exception.path);
      expect(existsSync(file), `${exception.path} must remain reviewable`).toBe(true);
      expect(exception.rfc).toBe('0002');
      expect(exception.targetBoundary.length).toBeGreaterThan(0);
      expect(exception.phase.length).toBeGreaterThan(0);
    }
  });

  test('all RFC 0002 legacy exceptions are retired', () => {
    expect(LEGACY_MODULE_EXCEPTIONS).toEqual([]);
  });

  test('editor tab shell is registered as a bounded leaf', () => {
    const path = 'components/editor-tabs/EditorTabShell.tsx';
    const budget = MODULE_SIZE_BUDGETS.find((candidate) => candidate.path === path);
    expect(budget, `${path} must have a size budget`).toBeDefined();
    expect(budget?.maxLines ?? 0).toBeLessThanOrEqual(450);
    expect(budget?.owner.length ?? 0).toBeGreaterThan(0);
  });

  test('database implementation boundaries are present and explicit', () => {
    const missing = missingDatabaseBoundaryModules(APP_SRC);
    expect(missing).toEqual([]);
    expect(DATABASE_BOUNDARY_CONTRACT).toContain(
      'components/database-table/DatabaseTableInteractionLayer.tsx',
    );
  });

  test('new leaves do not import an old giant facade by accident', () => {
    const forbidden = [
      'components/FileTree.tsx',
      'components/CommandPalette.tsx',
      'components/settings/SettingsDialogBody.tsx',
      'editor/DocumentContext.tsx',
      'components/EditorArea.tsx',
      'components/EditorTabs.tsx',
      'editor/extensions/JsxComponentView.tsx',
    ];
    for (const budget of MODULE_SIZE_BUDGETS) {
      const file = resolveAppModule(APP_SRC, budget.path);
      const source = readFileSync(file, 'utf8');
      for (const legacyPath of forbidden) {
        expect(source, `${budget.path} must not import ${legacyPath}`).not.toContain(legacyPath);
      }
    }
  });

  test('editor cache and provider pool stay on separate dependency ports', () => {
    const editorCacheModules = MODULE_SIZE_BUDGETS.filter(({ path }) =>
      path.startsWith('editor/editor-cache-'),
    );
    const providerPoolModules = MODULE_SIZE_BUDGETS.filter(({ path }) =>
      path.startsWith('editor/provider-pool-'),
    );
    const providerPoolImport = /\b(?:from|import)\s*(?:\(\s*)?['"][^'"]*provider-pool[^'"]*['"]/;
    const editorCacheImport = /\b(?:from|import)\s*(?:\(\s*)?['"][^'"]*editor-cache[^'"]*['"]/;

    expect(editorCacheModules.length).toBeGreaterThan(0);
    expect(providerPoolModules.length).toBeGreaterThan(0);
    for (const budget of editorCacheModules) {
      const source = readFileSync(resolveAppModule(APP_SRC, budget.path), 'utf8');
      expect(source, `${budget.path} must not import provider-pool implementation`).not.toMatch(
        providerPoolImport,
      );
    }
    for (const budget of providerPoolModules) {
      const source = readFileSync(resolveAppModule(APP_SRC, budget.path), 'utf8');
      expect(source, `${budget.path} must not import editor-cache implementation`).not.toMatch(
        editorCacheImport,
      );
    }
  });

  test('database leaves do not own transport, snapshot, or route writes', () => {
    for (const modulePath of DATABASE_LEAF_BOUNDARIES) {
      const source = readFileSync(resolveAppModule(APP_SRC, modulePath), 'utf8');
      expect(source, `${modulePath} must use a coordinator for transport`).not.toMatch(
        /database-(catalog|query)-client|database-(linked-view|offline)-cache/,
      );
      expect(source, `${modulePath} must use the route adapter`).not.toMatch(
        /window\.location\.hash\s*=/,
      );
    }
  });

  test('database command modules do not regress to the compatibility barrel', () => {
    for (const modulePath of DATABASE_LEAF_BOUNDARIES.filter((path) =>
      path.startsWith('lib/database-mutations/'),
    )) {
      const source = readFileSync(resolveAppModule(APP_SRC, modulePath), 'utf8');
      expect(source, `${modulePath} must import its domain peer directly`).not.toContain(
        'lib/database-cell-mutation',
      );
    }
  });

  test('inline and workspace controllers expose independent state and command ports', () => {
    const inlineFacade = readFileSync(
      resolveAppModule(APP_SRC, 'editor/components/use-inline-database-controller.ts'),
      'utf8',
    );
    expect(inlineFacade).toContain("from './use-inline-database-controller-state'");
    expect(inlineFacade).toContain("from './use-inline-database-commands'");
    expect(inlineFacade).toContain('useInlineDatabaseControllerState');
    expect(inlineFacade).toContain('useInlineDatabaseCommands');

    const workspaceFacade = readFileSync(
      resolveAppModule(APP_SRC, 'components/use-database-workspace-controller.ts'),
      'utf8',
    );
    expect(workspaceFacade).toContain("from './use-database-workspace-controller-state'");
    expect(workspaceFacade).toContain("from './use-database-workspace-read-lifecycle'");
    expect(workspaceFacade).toContain("from './use-database-workspace-mutation-record-commands'");
    expect(workspaceFacade).toContain("from './use-database-workspace-structure-commands'");
    expect(workspaceFacade).toContain('useDatabaseWorkspaceControllerState');
    expect(workspaceFacade).toContain('useDatabaseWorkspaceReadLifecycle');
    expect(workspaceFacade).toContain('useDatabaseWorkspaceMutationRecordCommands');
    expect(workspaceFacade).toContain('useDatabaseWorkspaceStructureCommands');

    const workspaceMutationRecordCommands = readFileSync(
      resolveAppModule(APP_SRC, 'components/use-database-workspace-mutation-record-commands.ts'),
      'utf8',
    );
    expect(workspaceMutationRecordCommands).toContain(
      "from './useDatabaseWorkspaceMutationCommands'",
    );
    expect(workspaceMutationRecordCommands).toContain(
      "from './useDatabaseWorkspaceRecordCommands'",
    );

    const workspaceStructureCommands = readFileSync(
      resolveAppModule(APP_SRC, 'components/use-database-workspace-structure-commands.ts'),
      'utf8',
    );
    expect(workspaceStructureCommands).toContain("from './useDatabaseWorkspaceBulkCommands'");
    expect(workspaceStructureCommands).toContain("from './useDatabaseWorkspaceSchemaCommands'");
    expect(workspaceStructureCommands).toContain("from './useDatabaseWorkspaceViewCommands'");
  });

  test('paths in diagnostics are app-relative', () => {
    const file = resolveAppModule(APP_SRC, MODULE_SIZE_BUDGETS[0]?.path ?? '');
    expect(relativeAppModule(APP_SRC, file)).toBe(MODULE_SIZE_BUDGETS[0]?.path);
  });
});
