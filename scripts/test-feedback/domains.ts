import type { CommandSpec } from './command.ts';

export interface DomainManifest {
  commands: CommandSpec[];
  files: string[];
  maxSeconds: number;
  owner: string;
  reason: string;
}

/**
 * Small, stable contract suites for the L1 feedback tier.
 *
 * File paths are kept explicit so adding a new domain test requires an
 * intentional manifest update. Package-level commands are used where the
 * contract is already maintained by that package (for example, server
 * process isolation).
 */
export const DOMAIN_MANIFESTS: Record<string, DomainManifest> = {
  database: {
    owner: 'editor/database maintainers',
    reason: 'Database open, overlay, cell, property, continuity, and keyboard contracts.',
    maxSeconds: 60,
    files: [
      'packages/app/src/components/database-tests/DatabaseOpen.dom.test.tsx',
      'packages/app/src/components/database-tests/DatabaseOverlay.dom.test.tsx',
      'packages/app/src/components/database-tests/DatabaseCell.dom.test.tsx',
      'packages/app/src/components/database-tests/DatabaseProperty.dom.test.tsx',
      'packages/app/src/components/database-tests/DatabaseSettings.dom.test.tsx',
      'packages/app/src/components/database-tests/DatabaseContinuity.dom.test.tsx',
      'packages/app/src/components/database-tests/DatabaseKeyboard.dom.test.tsx',
      'packages/app/src/components/DatabaseTableEmptyCell.dom.test.tsx',
    ],
    commands: [
      {
        args: [
          'run',
          '--cwd',
          'packages/app',
          'test:dom',
          'src/components/database-tests/DatabaseOpen.dom.test.tsx',
          'src/components/database-tests/DatabaseOverlay.dom.test.tsx',
          'src/components/database-tests/DatabaseCell.dom.test.tsx',
          'src/components/database-tests/DatabaseProperty.dom.test.tsx',
          'src/components/database-tests/DatabaseSettings.dom.test.tsx',
          'src/components/database-tests/DatabaseContinuity.dom.test.tsx',
          'src/components/database-tests/DatabaseKeyboard.dom.test.tsx',
          'src/components/DatabaseTableEmptyCell.dom.test.tsx',
        ],
        label: 'database focused contract',
      },
    ],
  },
  editor: {
    owner: 'app/editor maintainers',
    reason: 'Editor chrome, pane, toolbar, composer, and tab interactions.',
    maxSeconds: 60,
    files: [
      'packages/app/src/components/EditorHeader.dom.test.tsx',
      'packages/app/src/components/EditorPane.dom.test.tsx',
      'packages/app/src/components/EditorToolbar.dom.test.tsx',
      'packages/app/src/editor/ComposerMentionInput.dom.test.tsx',
      'packages/app/src/editor/components/Tabs.dom.test.tsx',
    ],
    commands: [
      {
        args: [
          'run',
          '--cwd',
          'packages/app',
          'test:dom',
          'src/components/EditorHeader.dom.test.tsx',
          'src/components/EditorPane.dom.test.tsx',
          'src/components/EditorToolbar.dom.test.tsx',
          'src/editor/ComposerMentionInput.dom.test.tsx',
          'src/editor/components/Tabs.dom.test.tsx',
        ],
        label: 'editor focused contract',
      },
    ],
  },
  navigation: {
    owner: 'app/navigation maintainers',
    reason: 'Tree reveal, navigation history, command palette, and sidebar selection.',
    maxSeconds: 60,
    files: [
      'packages/app/src/components/FileTree.create.dom.test.tsx',
      'packages/app/src/components/FileTree.selection-mirror.dom.test.tsx',
      'packages/app/src/components/EditorNavigationButtons.dom.test.tsx',
      'packages/app/src/components/CommandPalette.dom.test.tsx',
      'packages/app/src/components/SidebarSearchBar.dom.test.tsx',
    ],
    commands: [
      {
        args: [
          'run',
          '--cwd',
          'packages/app',
          'test:dom',
          'src/components/FileTree.create.dom.test.tsx',
          'src/components/FileTree.selection-mirror.dom.test.tsx',
          'src/components/EditorNavigationButtons.dom.test.tsx',
          'src/components/CommandPalette.dom.test.tsx',
          'src/components/SidebarSearchBar.dom.test.tsx',
        ],
        label: 'navigation focused contract',
      },
    ],
  },
  search: {
    owner: 'core/search maintainers',
    reason: 'Workspace search ranking, filename quotas, categories, and tier behavior.',
    maxSeconds: 60,
    files: [
      'packages/core/src/search/workspace-search.test.ts',
      'packages/core/src/search/workspace-search.category-caps.test.ts',
      'packages/core/src/search/workspace-search.filename-quota.test.ts',
      'packages/core/src/search/workspace-search.tier-ranking.test.ts',
    ],
    commands: [
      {
        args: [
          'test',
          'packages/core/src/search/workspace-search.test.ts',
          'packages/core/src/search/workspace-search.category-caps.test.ts',
          'packages/core/src/search/workspace-search.filename-quota.test.ts',
          'packages/core/src/search/workspace-search.tier-ranking.test.ts',
        ],
        label: 'search focused contract',
      },
    ],
  },
  'server-startup': {
    owner: 'server/runtime maintainers',
    reason: 'Server boot, lifecycle, process, lock, and loopback behavior.',
    maxSeconds: 60,
    files: [
      'packages/server/src/boot-timings.test.ts',
      'packages/server/src/loopback-bind-discipline.test.ts',
      'packages/server/src/server-lock.test.ts',
      'packages/server/src/server-memory-telemetry.test.ts',
    ],
    commands: [
      {
        args: [
          'test',
          'packages/server/src/boot-timings.test.ts',
          'packages/server/src/loopback-bind-discipline.test.ts',
          'packages/server/src/server-lock.test.ts',
          'packages/server/src/server-memory-telemetry.test.ts',
        ],
        label: 'server startup contract',
      },
    ],
  },
  sync: {
    owner: 'sync/runtime maintainers',
    reason: 'Sync status, drift, and server-to-editor state propagation.',
    maxSeconds: 60,
    files: [
      'packages/app/src/components/SyncStatusBadge.dom.test.tsx',
      'packages/app/src/components/ServerDriftToast.dom.test.tsx',
      'packages/server/src/sync-engine.test.ts',
      'packages/server/src/sync-handshake-span-extension.test.ts',
    ],
    commands: [
      {
        args: [
          'run',
          '--cwd',
          'packages/app',
          'test:dom',
          'src/components/SyncStatusBadge.dom.test.tsx',
          'src/components/ServerDriftToast.dom.test.tsx',
        ],
        label: 'sync editor contract',
      },
      {
        args: [
          'test',
          'packages/server/src/sync-engine.test.ts',
          'packages/server/src/sync-handshake-span-extension.test.ts',
        ],
        label: 'sync server contract',
      },
    ],
  },
  contract: {
    owner: 'cross-package API maintainers',
    reason: 'Public schema, MCP, API, and package export contracts.',
    maxSeconds: 60,
    files: [
      'packages/core/src/schemas/api.type-tests.ts',
      'packages/core/src/schemas/api/document-read.test.ts',
      'packages/server/src/database-api-mcp-contract.test.ts',
      'packages/server/src/database-api-schema.test.ts',
    ],
    commands: [
      {
        args: [
          'test',
          'packages/core/src/schemas/api.type-tests.ts',
          'packages/core/src/schemas/api/document-read.test.ts',
        ],
        label: 'core contract suite',
      },
      {
        args: [
          'test',
          'packages/server/src/database-api-mcp-contract.test.ts',
          'packages/server/src/database-api-schema.test.ts',
        ],
        label: 'server contract suite',
      },
    ],
  },
};

export const REQUIRED_DOMAIN_NAMES = [
  'database',
  'editor',
  'navigation',
  'search',
  'server-startup',
  'sync',
];
