import { readdir, realpath, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import {
  type DocumentListEntry,
  type InlineAssetMediaKind,
  mediaKindForSidebarAssetExtension,
} from '@nedian0brien/synapsenote-core';
import type { ContentFilter } from './content-filter.ts';
import { isSupportedDocFile, stripDocExtension } from './doc-extensions.ts';
import { isWithinDir, toPosix } from './path-utils.ts';

/**
 * Synthesize an `assetExt` string for files surfaced by Show All Files mode
 * that fall outside the markdown / standard-asset extension set. Schema
 * requires `assetExt: z.string().min(1)`. Mapping:
 *   - `foo.ts` → `'ts'` (extname → strip leading dot)
 *   - `.gitignore` → `'gitignore'` (dotfile with no extname → use name minus dot)
 *   - `LICENSE` → `'file'` (extensionless non-dotfile → 'file' fallback sentinel)
 */
export function synthesizeShowAllAssetExt(name: string): string {
  const ext = extname(name);
  if (ext) return ext.slice(1).toLowerCase();
  if (name.startsWith('.') && name.length > 1) return name.slice(1).toLowerCase();
  return 'file';
}

/**
 * Per-request ceiling on the entries `walkContentDirForShowAll` accumulates.
 * Read from `OK_SHOWALL_MAX_ENTRIES` on every call — never cached at module
 * load — so ops can retune the floor without a restart and tests can drive a
 * low cap. Non-positive / non-integer input falls back to the default. A
 * content dir pointed at a large repo can hold far more entries than the
 * sidebar can render, and the walk accumulates one object per entry, so the
 * cap is the cheap heap floor.
 */
export const DEFAULT_SHOWALL_MAX_ENTRIES = 50_000;
export function getShowAllMaxEntries(): number {
  const raw = process.env.OK_SHOWALL_MAX_ENTRIES;
  if (raw === undefined) return DEFAULT_SHOWALL_MAX_ENTRIES;
  // `Number()` (not `parseInt`) so scientific notation like `1e5` lifts cleanly
  // to 100000 instead of silently truncating to 1 at the first non-digit. The
  // `isInteger` guard still rejects `1e-5`, `0.5`, `Infinity`, and `NaN`.
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_SHOWALL_MAX_ENTRIES;
}

/**
 * Per-build ceiling on the name-only `kind:'file'` tier of the search corpus.
 * Read from `OK_SEARCH_MAX_ENTRIES` on every build (never cached at module load)
 * so ops can retune without a restart and tests can drive a low cap. Non-positive
 * / non-integer input falls back to the default. Markdown content docs are NEVER
 * subject to this cap — only the all-files name tier, which is the part that grows
 * with a pathological repo. The corpus is materialized twice (server + client),
 * so this is the heap floor for the file tier. Mirrors `getShowAllMaxEntries`.
 */
export const DEFAULT_SEARCH_MAX_ENTRIES = 50_000;
export function getSearchMaxEntries(): number {
  const raw = process.env.OK_SEARCH_MAX_ENTRIES;
  if (raw === undefined) return DEFAULT_SEARCH_MAX_ENTRIES;
  // `Number()` (not `parseInt`) so scientific notation like `1e5` lifts cleanly
  // to 100000 instead of silently truncating to 1 at the first non-digit. The
  // `isInteger` guard still rejects `1e-5`, `0.5`, `Infinity`, and `NaN`.
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_SEARCH_MAX_ENTRIES;
}

/**
 * Test-only observability for the Show All Files walk. `invocations` counts how
 * many times `walkContentDirForShowAll` ran — the document-list single-flight
 * dedupe collapses concurrent identical requests to one invocation, so this is
 * how a test proves N requests triggered exactly one walk. `aborts` counts
 * walks that bailed because their `signal` fired (abort-on-disconnect). Counters
 * are module-scoped because the walk function is; reset between tests with the
 * companion helper. Mirrors the `__resetRenameTelemetryForTesting` seam above.
 */
let showAllWalkInvocations = 0;
let showAllWalkAborts = 0;
export function __getShowAllWalkStatsForTesting(): {
  invocations: number;
  aborts: number;
} {
  return { invocations: showAllWalkInvocations, aborts: showAllWalkAborts };
}
export function __resetShowAllWalkStatsForTesting(): void {
  showAllWalkInvocations = 0;
  showAllWalkAborts = 0;
}

export interface StreamShowAllOpts {
  contentDir: string;
  contentFilter: ContentFilter;
  /** Optional dir filter (contentDir-relative subtree to walk; null = whole tree). */
  dirFilter: string | null;
  /** Hard ceiling on emitted entries; the walk stops once reached. */
  maxEntries: number;
  /**
   * Optional cancellation. When every caller waiting on this walk has
   * disconnected, the document-list handler aborts this signal; the walk then
   * bails at the next directory boundary rather than finishing a result nobody
   * will read.
   */
  signal?: AbortSignal;
  /**
   * Maximum directory depth to descend, relative to `dirFilter` (or contentDir
   * when no filter). Omitted/`Infinity` = the full recursive Show All walk.
   * `1` = the lazy per-directory contract: yield only the immediate
   * children of the scoped dir, no recursion, and stamp each folder child with
   * `hasChildren` so the client can render an expand affordance without walking
   * the subtree.
   */
  maxDepth?: number;
  /**
   * Admit `.ok` entries — minus `.ok/worktrees` and `.ok/local` — through the
   * content filter's always-skip floor (see `ContentFilterReadOpts.showOk`).
   * Backs `?showOk=true`; threaded into every filter consultation the walk
   * and its `hasChildren` probe make.
   */
  showOk?: boolean;
}

export interface WalkShowAllOpts extends StreamShowAllOpts {
  /** Accumulator the buffered wrapper drains the generator into. */
  documents: DocumentListEntry[];
}

/**
 * Walk `contentDir` on-demand for the `?showAll=true` flag, `yield`ing one
 * `DocumentListEntry` at a time instead of accumulating an array. Streaming the
 * walk this way collapses the showAll serialization heap peak: the buffered
 * design held the listing three times live (accumulator + Zod-validated clone +
 * `JSON.stringify` string), but a consumer that writes each yielded entry to
 * the socket retains only one entry plus the traversal cursors.
 *
 * Emission is level-order (BFS): every admitted entry at depth N across the
 * whole tree yields before any entry at depth N+1, and a parent folder always
 * yields before its children. Hitting the `maxEntries` cap therefore drops
 * the deepest entries first — the top of the tree stays complete whenever the
 * cap covers the shallow levels.
 *
 * Uses `ContentFilter.{isExcluded,isDirExcluded}` with `bypassFilters:true` so
 * `.gitignored` / `.okignored` / content-bearing `BUILTIN_SKIP_DIRS` (`dist/`,
 * `build/`, `coverage/`, …) surface. The `ALWAYS_SKIP_DIRS` floor still prunes
 * `.git/` / `node_modules/` / `.ok/` even under bypass (those trees are
 * unbounded and never hold user markdown — pruning them is the Show All Files
 * OOM guard); `showOk` re-admits `.ok` minus `worktrees`/`local`, the two
 * children that can be repo-scale. The un-bypassable STOP-rule gate keeps
 * synthetic `__system__` / `__config__` / `__user__` / `__local__` docs
 * hidden.
 *
 * Yields the union DocumentListEntry shape:
 *   - dirs → kind: 'folder' (with `path`)
 *   - `.md` / `.mdx` files → kind: 'document'
 *   - everything else → kind: 'asset' (with synthesized `assetExt` + `mediaKind`
 *     via `mediaKindForSidebarAssetExtension`; `referencedBy: []` since
 *     non-md/non-asset files have no `[[wiki-link]]` references)
 *
 * Returns `{ truncated }`: true when the `maxEntries` ceiling was hit and the
 * stream is a partial prefix. Per-directory read errors are silent-caught
 * (mirrors `populateDirCount` + `loadNestedIgnoreFiles` in `content-filter.ts`)
 * so a single broken symlink or permission failure doesn't abort the whole walk.
 */
export async function* streamShowAllEntries(
  opts: StreamShowAllOpts,
): AsyncGenerator<DocumentListEntry, { truncated: boolean }, void> {
  const { contentDir, contentFilter, dirFilter, maxEntries, signal, showOk } = opts;
  const maxDepth = opts.maxDepth ?? Number.POSITIVE_INFINITY;
  // One opts object for every filter consultation: the dir gates, the
  // `hasChildren` probe, and the file backstop must agree on admission, or a
  // revealed folder probes childless / yields rows its own dir gate pruned.
  const filterOpts = { bypassFilters: true, showOk } as const;
  showAllWalkInvocations += 1;
  // Running count of yielded entries — the streaming analogue of the buffered
  // `documents.length` cap probe. Shared across the whole traversal so the
  // entry ceiling is global, not per-directory.
  let emitted = 0;
  let truncated = false;
  // Set when the walk bails on the abort signal; counted once after the walk
  // completes so `aborts` reflects "this walk stopped early".
  let aborted = false;

  const passesDirFilter = (rel: string): boolean => {
    if (!dirFilter) return true;
    return rel === dirFilter || rel.startsWith(`${dirFilter}/`);
  };

  // Resolve contentDir to its canonical form so we can compare descendants
  // by realpath. Without this, a user-created symlink at `<contentDir>/foo
  // -> /etc` would have `Dirent.isDirectory()` return true and recursion
  // would enumerate `/etc`'s metadata into the API response — metadata
  // disclosure of paths outside the project. The same realpath-based
  // containment guard is the spine of `ok:shell:show-item-in-folder` and
  // the trash-item IPC handler.
  let contentDirCanonical: string;
  try {
    contentDirCanonical = await realpath(contentDir);
  } catch {
    contentDirCanonical = contentDir;
  }
  const isInsideContentDir = (resolved: string): boolean =>
    isWithinDir(resolved, contentDirCanonical);

  const docVariantCounts = async (
    entries: readonly import('node:fs').Dirent[],
    absDir: string,
    relDir: string,
  ): Promise<ReadonlyMap<string, number>> => {
    const candidateCounts = new Map<string, number>();
    for (const entry of entries) {
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;
      if (!isSupportedDocFile(entry.name)) continue;
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      const docName = stripDocExtension(relPath);
      candidateCounts.set(docName, (candidateCounts.get(docName) ?? 0) + 1);
    }
    const collidingDocNames = new Set(
      [...candidateCounts].filter(([, count]) => count > 1).map(([docName]) => docName),
    );
    if (collidingDocNames.size === 0) return new Map();

    const counts = new Map<string, number>();
    for (const entry of entries) {
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;
      if (!isSupportedDocFile(entry.name)) continue;
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      const docName = stripDocExtension(relPath);
      if (!collidingDocNames.has(docName)) continue;
      if (contentFilter.isExcluded(relPath, { bypassFilters: true })) continue;
      if (!passesDirFilter(relPath)) continue;

      if (entry.isSymbolicLink()) {
        const linkAbs = join(absDir, entry.name);
        let canonical: string;
        try {
          canonical = await realpath(linkAbs);
        } catch {
          continue;
        }
        if (!isInsideContentDir(canonical)) continue;
        let canonStat: import('node:fs').Stats;
        try {
          canonStat = await stat(canonical);
        } catch {
          continue;
        }
        if (!canonStat.isFile()) continue;
      } else {
        try {
          await stat(join(absDir, entry.name));
        } catch {
          continue;
        }
      }

      counts.set(docName, (counts.get(docName) ?? 0) + 1);
    }
    return counts;
  };

  const showAllDocName = (
    relPath: string,
    countsByExtensionlessDocName: ReadonlyMap<string, number>,
  ): string => {
    const extensionless = stripDocExtension(relPath);
    return (countsByExtensionlessDocName.get(extensionless) ?? 0) > 1 ? relPath : extensionless;
  };

  // Cheap bounded probe for `hasChildren` on a leaf-depth folder (depth-1
  // contract): readdir the folder and stop at the first admitted child, so the
  // client can render an expand affordance without the server walking the
  // subtree. Applies the same ALWAYS_SKIP_DIRS-floor / ignore gate the walk
  // uses, so a folder containing only skipped entries reports hasChildren:false.
  async function probeHasChildren(absDir: string, relDir: string): Promise<boolean> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch (err) {
      // Log to match the sibling walk's readdir-failure convention — an
      // EACCES/EPERM here silently reporting hasChildren:false (folder renders
      // as a non-expandable leaf) is otherwise invisible to operators.
      console.warn(`[document-list][showAll] probe readdir failed for ${absDir}:`, err);
      return false;
    }
    for (const entry of entries) {
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (contentFilter.isDirExcluded(relPath, filterOpts)) continue;
        // Symlink-escape parity with the main walk: a child that is a symlink to
        // a directory outside contentDir must not count as an admitted child
        // (the walk refuses to descend into it), so the probe must refuse it too.
        try {
          const childCanonical = await realpath(join(absDir, entry.name));
          if (!isInsideContentDir(childCanonical)) continue;
        } catch (err) {
          // Lazy expansion keys the expand affordance off this probe — a
          // silently-wrong hasChildren:false renders the folder permanently
          // childless with no operator trace (same convention as the readdir
          // and main-walk realpath catches).
          console.warn(
            `[document-list][showAll] probe realpath failed for ${absDir}/${entry.name}:`,
            err,
          );
          continue;
        }
        return true;
      }
      if (entry.isFile() && !contentFilter.isExcluded(relPath, filterOpts)) {
        return true;
      }
    }
    return false;
  }

  // Level-order (BFS) traversal via an explicit FIFO queue rather than DFS
  // recursion: every admitted entry at depth N (across the whole tree) yields
  // before any entry at depth N+1, so the `maxEntries` cap always cuts the
  // deepest entries first instead of starving root-level siblings of whichever
  // subtree readdir happened to enumerate first (readdir order is
  // filesystem-dependent, so WHICH siblings survived a DFS cap was arbitrary).
  // A parent folder still yields before its children — the folder while its
  // parent directory is processed, its children once it is dequeued. The queue
  // holds pending directory paths only (bounded by the emitted folder count,
  // itself <= maxEntries), preserving the O(1)-entries streaming property.
  async function* walk(
    startAbsDir: string,
    startRelDir: string,
    startDepth: number,
  ): AsyncGenerator<DocumentListEntry> {
    const queue: Array<{ absDir: string; relDir: string; depth: number }> = [
      { absDir: startAbsDir, relDir: startRelDir, depth: startDepth },
    ];
    // Head-index dequeue: `queue.length` re-evaluates each iteration, so
    // directories pushed mid-loop extend the walk; `Array.shift` would be
    // O(n) against the tens of thousands of directories the default cap
    // admits.
    for (let head = 0; head < queue.length; head++) {
      // Abort gate at the queue boundary: empty or fully-filtered directories
      // never reach the per-entry check below, so without this a disconnected
      // client's walk would keep issuing readdir across the queued breadth.
      if (signal?.aborted) {
        aborted = true;
        return;
      }
      const { absDir, relDir, depth } = queue[head];
      let entries: import('node:fs').Dirent[];
      try {
        entries = await readdir(absDir, { withFileTypes: true });
      } catch (err) {
        console.warn(`[document-list][showAll] readdir failed for ${absDir}:`, err);
        continue;
      }
      const variantCountsByDocName = await docVariantCounts(entries, absDir, relDir);

      for (const entry of entries) {
        // Abort-on-disconnect: stop walking once the request's last waiter has
        // gone. Checked at the same per-entry boundary as the entry cap so both
        // bounds short-circuit before any further readdir/stat work.
        if (signal?.aborted) {
          aborted = true;
          return;
        }
        // Bound the walk. A content dir pointed at a large repo can hold far
        // more entries than the response can carry; without a ceiling the
        // consumer is fed entries until the server heap is exhausted. Checking
        // before any yield keeps the emitted count <= maxEntries exactly.
        if (emitted >= maxEntries) {
          truncated = true;
          return;
        }
        const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          // bypassFilters:true admits gitignored + content-bearing skip-dirs
          // (dist/, build/), but the ALWAYS_SKIP_DIRS floor still prunes
          // .git/, node_modules/, .ok/ here — the Show All Files OOM guard.
          // showOk re-admits .ok minus worktrees/local for the tree reveal.
          if (contentFilter.isDirExcluded(relPath, filterOpts)) continue;

          // Symlink-escape guard. `Dirent.isDirectory()` returns true for a
          // symlink pointing at a directory; without canonical-path containment,
          // a `<contentDir>/foo -> /etc` symlink would enumerate /etc into the
          // response. Resolve the canonical target and refuse anything outside
          // contentDir's realpath. Skip-with-log mirrors the file-watcher's
          // existing symlink-escape protection.
          const dirAbsRaw = join(absDir, entry.name);
          let dirCanonical: string;
          try {
            dirCanonical = await realpath(dirAbsRaw);
          } catch (err) {
            console.warn(`[document-list][showAll] realpath failed for ${dirAbsRaw}:`, err);
            continue;
          }
          if (!isInsideContentDir(dirCanonical)) {
            console.warn(
              `[document-list][showAll] refusing symlink-escape ${dirAbsRaw} -> ${dirCanonical}`,
            );
            continue;
          }

          if (passesDirFilter(relPath)) {
            let folderStat: import('node:fs').Stats | null = null;
            try {
              folderStat = await stat(dirAbsRaw);
            } catch (err) {
              // Stat failure is non-fatal: emit with modified='' as a graceful
              // fallback so the dir still surfaces in the tree. Log the
              // failure for diagnosability — symmetric with the file-stat
              // sibling catch below, so EACCES/EPERM/ELOOP on a restricted
              // subdir is visible in operator logs instead of silently
              // returning empty-mtime folder entries.
              console.warn(`[document-list][showAll] stat failed for ${dirAbsRaw}:`, err);
            }
            emitted += 1;
            // At leaf depth (the depth-1 lazy contract stops descending here),
            // probe whether this folder has any admitted child so the client can
            // show an expand affordance. On the full recursive walk the children
            // are emitted directly, so the probe is skipped and hasChildren stays
            // absent (the recursive showAll response never carries it).
            const atLeafDepth = depth >= maxDepth;
            const hasChildren = atLeafDepth
              ? await probeHasChildren(dirAbsRaw, relPath)
              : undefined;
            yield {
              kind: 'folder',
              path: relPath,
              size: 0,
              modified: folderStat ? folderStat.mtime.toISOString() : '',
              docExt: '.md',
              isSymlink: false,
              canonicalDocName: null,
              targetPath: null,
              ...(hasChildren === undefined ? {} : { hasChildren }),
            };
          }

          // Enqueue only while under the depth ceiling. depth-1 (maxDepth=1)
          // yields a single level and enqueues nothing; the default walk has
          // an infinite ceiling and visits the whole subtree level by level.
          if (depth < maxDepth) {
            queue.push({
              absDir: dirAbsRaw,
              relDir: relPath,
              depth: depth + 1,
            });
          }
          continue;
        }

        // Symlinked entries: a `Dirent` for a symlink reports neither
        // isDirectory() nor isFile() (d_type is DT_LNK), so the directory branch
        // above skips them and the `!isFile()` guard below would drop them.
        // Resolve the target and surface symlinked directories (and files) so
        // aliased folders appear in the tree. A symlinked directory is emitted as
        // a folder but NOT enqueued — the full walk must never recurse into a
        // symlink (cycles + symlink-farm blow-up); lazy expansion re-enters via
        // `dir=<aliasPath>`, where readdir follows the link and lists the
        // canonical's children under the alias prefix.
        if (entry.isSymbolicLink()) {
          const linkAbs = join(absDir, entry.name);
          let canonical: string;
          try {
            canonical = await realpath(linkAbs);
          } catch (err) {
            console.warn(`[document-list][showAll] symlink realpath failed for ${linkAbs}:`, err);
            continue;
          }
          if (!isInsideContentDir(canonical)) {
            console.warn(
              `[document-list][showAll] refusing symlink-escape ${linkAbs} -> ${canonical}`,
            );
            continue;
          }
          let canonStat: import('node:fs').Stats;
          try {
            canonStat = await stat(canonical);
          } catch (err) {
            console.warn(
              `[document-list][showAll] symlink target stat failed for ${linkAbs}:`,
              err,
            );
            continue;
          }
          const targetRel = toPosix(relative(contentDir, canonical));
          if (canonStat.isDirectory()) {
            if (contentFilter.isDirExcluded(relPath, filterOpts)) continue;
            if (!passesDirFilter(relPath)) continue;
            emitted += 1;
            yield {
              kind: 'folder',
              path: relPath,
              size: 0,
              modified: canonStat.mtime.toISOString(),
              docExt: '.md',
              isSymlink: true,
              canonicalDocName: targetRel,
              targetPath: targetRel,
              hasChildren: await probeHasChildren(canonical, relPath),
            };
            continue;
          }
          if (!canonStat.isFile()) continue;
          if (contentFilter.isExcluded(relPath, filterOpts)) continue;
          if (!passesDirFilter(relPath)) continue;
          emitted += 1;
          if (isSupportedDocFile(entry.name)) {
            const docName = showAllDocName(relPath, variantCountsByDocName);
            yield {
              kind: 'document',
              docName,
              docExt: extname(entry.name),
              size: canonStat.size,
              modified: canonStat.mtime.toISOString(),
              isSymlink: true,
              canonicalDocName: targetRel.replace(/\.(md|mdx)$/i, ''),
              targetPath: targetRel,
            };
          } else {
            const assetExt = synthesizeShowAllAssetExt(entry.name);
            yield {
              kind: 'asset',
              docName: relPath,
              docExt: assetExt,
              path: relPath,
              assetExt,
              mediaKind: mediaKindForSidebarAssetExtension(assetExt),
              referencedBy: [],
              size: canonStat.size,
              modified: canonStat.mtime.toISOString(),
              isSymlink: true,
              canonicalDocName: null,
              targetPath: targetRel,
            };
          }
          continue;
        }

        if (!entry.isFile()) continue;
        // The file-level backstop mirrors the dir gate's admission (shared
        // filterOpts): floor files can't actually reach here — the dir gate
        // above already skipped .git/node_modules/(non-revealed) .ok.
        if (contentFilter.isExcluded(relPath, filterOpts)) continue;
        if (!passesDirFilter(relPath)) continue;

        let fileStat: import('node:fs').Stats | null = null;
        try {
          fileStat = await stat(join(absDir, entry.name));
        } catch (err) {
          console.warn(`[document-list][showAll] stat failed for ${absDir}/${entry.name}:`, err);
          continue;
        }

        if (isSupportedDocFile(entry.name)) {
          // Markdown — classify as 'document'. The directory entry is the
          // show-all source of truth for the file extension.
          const docName = showAllDocName(relPath, variantCountsByDocName);
          const docExt = extname(entry.name);
          emitted += 1;
          yield {
            kind: 'document',
            docName,
            docExt,
            size: fileStat.size,
            modified: fileStat.mtime.toISOString(),
            isSymlink: false,
            canonicalDocName: null,
            targetPath: null,
          };
          continue;
        }

        // Non-markdown — classify as 'asset' with synthesized assetExt.
        // `mediaKindForSidebarAssetExtension` returns null for extensions with no sidebar
        // viewer (e.g. .docx, .zip), and 'text' for .base/.canvas (text-viewer-fallback
        // set) even though those extensions are absent from ASSET_EXTENSIONS (serve
        // allowlist unchanged). No explicit ASSET_EXTENSIONS check needed; the function
        // already encodes the full dispatch table.
        const assetExt = synthesizeShowAllAssetExt(entry.name);
        const mediaKind: InlineAssetMediaKind | null = mediaKindForSidebarAssetExtension(assetExt);
        emitted += 1;
        yield {
          kind: 'asset',
          docName: relPath,
          docExt: assetExt,
          path: relPath,
          assetExt,
          mediaKind,
          referencedBy: [],
          size: fileStat.size,
          modified: fileStat.mtime.toISOString(),
          isSymlink: false,
          canonicalDocName: null,
          targetPath: null,
        };
      }
    }
  }

  const startAbs = dirFilter ? join(contentDir, dirFilter) : contentDir;
  const startRel = dirFilter ?? '';
  // The scoped dir's own children are depth 1; `walk` stops enqueuing once
  // `depth >= maxDepth`, so maxDepth=1 yields exactly one level.
  yield* walk(startAbs, startRel, 1);
  if (aborted) showAllWalkAborts += 1;
  return { truncated };
}

/**
 * Buffered adapter over `streamShowAllEntries`: drains the generator into the
 * caller's `documents` accumulator and returns the same `{ truncated }` outcome.
 * This is the single-flight path (`GET /api/documents?showAll=true` without an
 * NDJSON `Accept`) — it preserves the sortable, validate-once, single-JSON
 * response shape every non-streaming caller depends on. Streaming callers
 * consume `streamShowAllEntries` directly and never materialize this array.
 */
export async function walkContentDirForShowAll(
  opts: WalkShowAllOpts,
): Promise<{ truncated: boolean }> {
  const { documents, ...streamOpts } = opts;
  const generator = streamShowAllEntries(streamOpts);
  let next = await generator.next();
  while (!next.done) {
    documents.push(next.value);
    next = await generator.next();
  }
  return next.value;
}
