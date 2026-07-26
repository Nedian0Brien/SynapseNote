import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Database surfaces must not invent their own hash writes. Keeping this list
 * explicit makes a future surface addition fail closed until it uses the
 * canonical route adapter.
 */
const databaseNavigationSurfaces = [
  '../components/DatabaseRecordPageChrome.tsx',
  '../components/DatabaseRecordPeek.tsx',
  '../components/DatabaseSidebarSection.tsx',
  '../components/DatabaseWorkspaceHeader.tsx',
  '../components/DatabaseWorkspaceOverlayHost.tsx',
  '../components/useDatabaseWorkspaceViewCommands.ts',
  '../editor/components/InlineDatabaseToolbar.tsx',
  '../editor/components/InlineDatabaseOverlayHost.tsx',
  '../editor/components/use-inline-database-controller.ts',
];

const commandSurfaces = [
  '../components/database-workspace-types.ts',
  '../components/use-database-workspace-controller.ts',
  '../components/useDatabaseWorkspaceViewCommands.ts',
  '../editor/components/use-inline-database-controller.ts',
];

describe('database navigation boundary', () => {
  test('database surfaces delegate hash writes to the route adapter', () => {
    for (const relativePath of databaseNavigationSurfaces) {
      const source = readFileSync(resolve(import.meta.dir, relativePath), 'utf8');
      expect(source, `${relativePath} must not write window.location.hash directly`).not.toMatch(
        /window\.location\.hash\s*=/,
      );
    }
  });

  test('the route adapter owns the one imperative hash write', () => {
    const source = readFileSync(resolve(import.meta.dir, './database-navigation.ts'), 'utf8');
    expect(source.match(/window\.location\.hash\s*=/g)?.length ?? 0).toBe(1);
  });

  test('record opening cannot fall back to an optional callback or silent branch', () => {
    for (const relativePath of commandSurfaces) {
      const source = readFileSync(resolve(import.meta.dir, relativePath), 'utf8');
      expect(source, `${relativePath} must use the typed open command`).not.toContain(
        'onOpenRecord',
      );
    }
  });

  test('production NodeViews emit lifecycle trace events without owning the overlay', () => {
    const source = readFileSync(
      resolve(import.meta.dir, '../editor/extensions/JsxComponentView.tsx'),
      'utf8',
    );
    expect(source).toContain("'node_view_mounted'");
    expect(source).toContain("'node_view_unmounted'");
    expect(source).not.toContain('recordPeek');
    expect(source).not.toContain('DatabaseRecordPeek');
  });

  test('inline and workspace title/open/keyboard routes share the canonical open command', () => {
    const inline = readFileSync(
      resolve(import.meta.dir, '../editor/components/use-inline-database-commands.ts'),
      'utf8',
    );
    const workspace = readFileSync(
      resolve(import.meta.dir, '../components/useDatabaseWorkspaceViewCommands.ts'),
      'utf8',
    );
    expect(inline.match(/requestOpenDatabaseRecord/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(workspace.match(/requestOpenDatabaseRecord/g)?.length ?? 0).toBeGreaterThanOrEqual(2);

    const block = readFileSync(
      resolve(import.meta.dir, '../editor/components/InlineDatabaseBlock.tsx'),
      'utf8',
    );
    expect(block.match(/onOpen={onOpenRecord}/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(block).toContain('onOpenRecord: (record: ProjectedDatabaseRecord) => void');
  });
});
