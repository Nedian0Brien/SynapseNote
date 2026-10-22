/**
 * Durable form of the `RecentlyRemovedDocs` cache at
 * `<projectDir>/.ok/local/removed-docs.json`.
 *
 * Every anti-resurrection signal (removal LRU, per-doc lifecycle markers,
 * reconciledBase) is otherwise per-process — after a restart the server
 * retains zero memory that a deletion or rename ever happened, while
 * clients (a browser tab's y-indexeddb cache) still hold the doc's full
 * Yjs state and would be admitted as a legitimate first write, re-creating
 * the file. Persisting the cache keeps the removal-redirect guard armed
 * across restarts. Stale entries are harmless: the guard is
 * file-existence-first for `deleted` entries (a re-created file drops the
 * entry and admits), and `/api/create-page` plus the watcher `add` arm
 * invalidate eagerly.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getLocalDir } from './config/paths.ts';
import { tracedMkdirSync, tracedRenameSync, tracedWriteFileSync } from './fs-traced.ts';
import { getLogger } from './logger.ts';
import type { RemovalEntry } from './recently-removed-docs.ts';

const log = getLogger('removed-docs-journal');

const REMOVED_DOCS_JOURNAL_FILENAME = 'removed-docs.json';

interface RemovedDocsJournalV1 {
  version: 1;
  entries: Array<{ docName: string } & RemovalEntry>;
}

export function removedDocsJournalPath(projectDir: string): string {
  return join(getLocalDir(projectDir), REMOVED_DOCS_JOURNAL_FILENAME);
}

function isJournalEntry(value: unknown): value is { docName: string } & RemovalEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.docName !== 'string' || entry.docName.length === 0) return false;
  if (typeof entry.addedAt !== 'number') return false;
  if (entry.kind === 'deleted') return true;
  if (entry.kind === 'renamed') return typeof entry.newDocName === 'string';
  return false;
}

/**
 * Read the persisted removal entries, oldest-first (LRU order preserved so
 * re-populating the cache reproduces the same eviction order). Missing
 * file → empty. Corrupt / wrong-shape file → warn and empty — the guard
 * degrades to today's per-process behavior rather than blocking boot.
 */
export function loadRemovedDocsJournal(projectDir: string): Array<[string, RemovalEntry]> {
  const path = removedDocsJournalPath(projectDir);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<RemovedDocsJournalV1>;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      log.warn({ path }, '[removed-docs-journal] unrecognized journal shape — ignoring');
      return [];
    }
    const entries: Array<[string, RemovalEntry]> = [];
    for (const raw of parsed.entries) {
      if (!isJournalEntry(raw)) continue;
      const { docName, ...entry } = raw;
      entries.push([docName, entry as RemovalEntry]);
    }
    return entries;
  } catch (err) {
    log.warn({ path, err }, '[removed-docs-journal] failed to read journal — ignoring');
    return [];
  }
}

/**
 * Atomically persist the cache snapshot (tmp + rename for POSIX atomicity so
 * a crash mid-write can't leave a truncated journal). The fixed `.tmp` suffix
 * is safe here — one server per contentDir (`server.lock`) and the debounce
 * coalesces saves, so there is never a concurrent writer — matching the
 * single-writer journal discipline (`managed-rename-journal`), not
 * persistence's UUID-suffixed tmp (which exists for concurrent writers).
 */
export function saveRemovedDocsJournal(
  projectDir: string,
  entries: ReadonlyArray<[string, RemovalEntry]>,
): void {
  const path = removedDocsJournalPath(projectDir);
  const journal: RemovedDocsJournalV1 = {
    version: 1,
    entries: entries.map(([docName, entry]) => ({ docName, ...entry })),
  };
  tracedMkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.tmp`;
  tracedWriteFileSync(tmpPath, JSON.stringify(journal), 'utf-8');
  tracedRenameSync(tmpPath, path);
}
