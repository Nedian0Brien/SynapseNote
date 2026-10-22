#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REPO_ROOT = resolve(APP_ROOT, '..', '..');

// This list is deliberately small and owned: it is the source boundary that
// must survive a clean clone. Large generated trees are checked separately.
export const DATABASE_FEATURE_INVENTORY = [
  ['source', 'packages/app/src/components/DatabaseTableDialog.tsx'],
  ['source', 'packages/app/src/components/DatabaseTableRuntime.tsx'],
  ['source', 'packages/app/src/components/DatabaseOverlayHost.tsx'],
  ['source', 'packages/app/src/lib/database-record-open-command.ts'],
  ['source', 'packages/app/src/lib/database-navigation.ts'],
  ['source', 'packages/app/src/lib/database-overlay-store.ts'],
  ['source', 'packages/app/src/lib/database-mutations'],
  ['source', 'packages/app/src/editor/components/use-inline-database-controller.ts'],
  ['source', 'packages/app/src/components/use-database-workspace-controller.ts'],
  ['test', 'packages/app/src/lib/database-record-open-command.dom.test.tsx'],
  ['test', 'packages/app/src/components/DatabaseTableDialog.dom.test.tsx'],
  ['test', 'packages/app/src/components/DatabaseTableViewState.dom.test.tsx'],
  ['fixture', 'packages/core/src/database/fixtures/v1/database.yml'],
  ['fixture', 'packages/core/src/database/fixtures/v1/records/feedback/report.md'],
  ['generated', 'packages/app/dist'],
  ['generated', 'packages/desktop/out'],
  ['generated', 'packages/desktop/dist-desktop-local'],
];

function gitTracked(path) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', path], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

export function collectDatabaseFeatureInventory() {
  return DATABASE_FEATURE_INVENTORY.map(([kind, path]) => ({
    kind,
    path,
    exists: existsSync(resolve(REPO_ROOT, path)),
    tracked: gitTracked(path),
    directory:
      existsSync(resolve(REPO_ROOT, path)) && statSync(resolve(REPO_ROOT, path)).isDirectory(),
  }));
}

export function assertDatabaseFeatureInventory() {
  const entries = collectDatabaseFeatureInventory();
  const missingSource = entries.filter(
    (entry) =>
      (entry.kind === 'source' || entry.kind === 'test' || entry.kind === 'fixture') &&
      !entry.exists,
  );
  if (missingSource.length > 0) {
    throw new Error(
      `Database feature source inventory has missing entries: ${missingSource.map((entry) => entry.path).join(', ')}`,
    );
  }
  return entries;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const entries = assertDatabaseFeatureInventory();
    console.log(JSON.stringify({ version: 1, missingSource: [], entries }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
