/**
 * MCP tool registry.
 *
 * Reads:     exec, search, data, history, links, skills, config, palette, preview_url,
 *            share_link, current_document
 * Planning:  data_plan, data_button (ephemeral exact plans; no project-file writes)
 * Commits:   data_commit (exact approved plan; user-approval gated)
 * Agent Runs: data_run (compact inspection + revision-bound retry/resume)
 * Undo:      data_undo (conflict preview + approval-gated reversal)
 * Repair:    data_repair (diagnostic preview + approval-gated repair)
 * Tasks:     data_task (approval-gated durable launch, progress, and recovery)
 * Writes:    write, edit, delete, move, checkpoint, restore_version
 * Conflicts: conflicts, resolve_conflict
 * Workflow:  workflow (kind: ingest | research | consolidate | discover)
 *
 * `write` / `edit` / `delete` / `move` are native CRUD verbs, polymorphic
 * over document / folder / template / asset via a nested target object
 * (Pattern B). They absorb the former write_document / edit_document /
 * edit_frontmatter / delete_document / rename / folder_config tools. The one
 * soft constraint ("exactly one target") is enforced by a teaching error.
 * `links` covers six link-graph reads; `checkpoint`/`restore_version` split the former `version` tool.
 *
 * Read-tool routing:
 *   - `exec` — primary read surface: shell-style `cat`/`ls`/`grep`/`find`,
 *     enriched with frontmatter / backlinks / shadow-repo history / folder
 *     defaults / template menus on every wiki file or directory referenced.
 *   - `search` — ranked workspace retrieval (Orama; mirrors cmd-K).
 *
 * - `workflow` returns instructional text (kind: ingest | research |
 *   consolidate | discover) and needs no server connection; its discover
 *   body's Phase 5 (link-graph activation) checks for Hocuspocus itself.
 * - Document tools make HTTP calls to Hocuspocus and require `serverUrl`.
 * - `search` calls `POST /api/search` and requires Hocuspocus.
 *
 * Project-level scaffolding has two paths: `ok seed` CLI for empty repos
 * (Karpathy three-layer + `log.md` + per-layer folder defaults) and the
 * `workflow({ kind: "discover" })` primer for existing-content repos (extracts conventions
 * from siblings; sets folder frontmatter + templates + `.okignore`).
 *
 * To add a new tool: create `packages/server/src/mcp/tools/<name>.ts` with a
 * `register(...)` export, then import and call it from here.
 */

import type { DatabaseIndexChangeEvent } from '../../database-index-coordinator.ts';
import { createEnsureSingleFileSession } from '../../ensure-single-file-session.ts';
import type { AgentIdentity } from '../agent-identity.ts';
import { getCurrentMcpLogger, type McpLogger } from '../logger.ts';
import { registerDatabaseResources } from '../resources/database.ts';
import { createLoggedServer } from '../tool-logging.ts';
import { register as registerCheckpoint } from './checkpoint.ts';
import { register as registerConfig } from './config.ts';
import { register as registerConflicts } from './conflicts.ts';
import { register as registerCurrentDocument } from './current-document.ts';
import { register as registerData } from './database.ts';
import { register as registerDataAutomation } from './database-automation.ts';
import { register as registerDataButton } from './database-button.ts';
import { register as registerDataComments } from './database-comments.ts';
import { register as registerDataCommit } from './database-commit.ts';
import { register as registerDataMarkdownTable } from './database-markdown-table.ts';
import { register as registerDataPlaceSearch } from './database-place-search.ts';
import { register as registerDataPlan } from './database-plan.ts';
import { register as registerDataRepair } from './database-repair.ts';
import { register as registerDataRun } from './database-run.ts';
import { register as registerDataTask } from './database-task.ts';
import { register as registerDataUndo } from './database-undo.ts';
import { register as registerDelete } from './delete.ts';
import { register as registerEdit } from './edit.ts';
import { register as registerExec } from './exec.ts';
import { register as registerPreviewUrl } from './get-preview-url.ts';
import { register as registerHistory } from './history.ts';
import { register as registerInstall } from './install.ts';
import { register as registerLinks } from './links.ts';
import { register as registerMove } from './move.ts';
import { register as registerPalette } from './palette.ts';
import { register as registerResolveConflict } from './resolve-conflict.ts';
import { register as registerRestoreVersion } from './restore-version.ts';
import { register as registerSearch } from './search.ts';
import { register as registerShareLink } from './share-link.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import { register as registerSkills } from './skills.ts';
import { register as registerWorkflow } from './workflow.ts';
import { register as registerWrite } from './write.ts';

/**
 * Per-call cwd resolver. Returns the absolute host directory that the
 * current tool call should operate against. Priority:
 *   1. explicit `cwd` arg from the tool call
 *   2. the client's only advertised MCP root
 *   3. otherwise error
 */
type ResolveCwd = (explicit?: string) => Promise<string>;

export type McpToolProfile = 'full' | 'database-sandbox';

export const DATABASE_SANDBOX_MCP_TOOL_NAMES = [
  'exec',
  'workflow',
  'search',
  'current_document',
  'data',
  'data_automation',
  'data_button',
  'data_place_search',
  'data_plan',
  'data_commit',
  'data_markdown_table',
  'data_comments',
  'data_undo',
  'data_repair',
  'data_task',
  'data_run',
] as const;

interface RegisterAllToolsOptions {
  /**
   * Hocuspocus URL. Accept a string (explicit override, e.g. `--port`), or a
   * lazy resolver that re-discovers per-call from the effective project cwd.
   * The resolver variant is what lets one MCP stdio process route different
   * tool calls to different SynapseNote projects.
   */
  serverUrl?: ServerUrlOrResolver;
  /** Resolves the cwd for a given tool call (see `ResolveCwd` docs). */
  resolveCwd: ResolveCwd;
  config: ConfigOrResolver;
  identityRef?: { current: AgentIdentity };
  logger?: McpLogger;
  /**
   * True when this MCP server process is running inside OK Desktop's own
   * built-in terminal (`OK_DESKTOP_TERMINAL=1` inherited from the pty). The
   * global `ok mcp` server sets it from its env; the shared collab server
   * (`ok start`) never has the marker, so it stays false there. `preview_url`
   * uses it to steer the agent to `ok open` (which focuses the OK Desktop
   * window) instead of returning a URL the agent shouldn't navigate.
   */
  isDesktopTerminal?: boolean;
  subscribeDatabaseChanges?: (listener: (event: DatabaseIndexChangeEvent) => void) => () => void;
  /** Restricts the registered capability surface for a read-only agent process. */
  toolProfile?: McpToolProfile;
}

export function registerAllTools(
  server: ServerInstance,
  opts: RegisterAllToolsOptions,
): { close: () => void } {
  const log = opts.logger;
  const registrationServer = createLoggedServer(server, {
    logger: opts.logger,
    identityRef: opts.identityRef,
  });
  const named =
    (tool: string): ResolveCwd =>
    async (explicit?: string) => {
      try {
        const cwd = await opts.resolveCwd(explicit);
        const activeLog = getCurrentMcpLogger() ?? log;
        activeLog?.debug('tool cwd resolved', { tool, cwd, ...(explicit ? { explicit } : {}) });
        return cwd;
      } catch (err) {
        const activeLog = getCurrentMcpLogger() ?? log;
        activeLog?.warn('tool call failed', {
          tool,
          error: err instanceof Error ? err.message : String(err),
          ...(explicit ? { explicit } : {}),
        });
        throw err;
      }
    };

  const databaseResources =
    typeof server.registerResource === 'function'
      ? registerDatabaseResources(server, {
          resolveCwd: named('database_resource'),
          config: opts.config,
          serverUrl: opts.serverUrl,
          ...(opts.subscribeDatabaseChanges
            ? { subscribeDatabaseChanges: opts.subscribeDatabaseChanges }
            : {}),
        })
      : { close: () => {} };

  // exec — the primary surface.
  registerExec(registrationServer, {
    resolveCwd: named('exec'),
    serverUrl: opts.serverUrl,
    config: opts.config,
  });

  // Workflow primers — return instructional text (kind: ingest | research |
  // consolidate | discover), no server connection needed. discover's Phase 5
  // (link-graph activation) checks for Hocuspocus in its own body.
  registerWorkflow(registrationServer, { config: opts.config, resolveCwd: named('workflow') });

  // Search — exec covers cat / ls / grep / find via fs-direct shell. `search`
  // is the ranked-retrieval read (Orama; mirrors cmd-K).
  registerSearch(registrationServer, {
    resolveCwd: named('search'),
    config: opts.config,
    serverUrl: opts.serverUrl,
  });
  registerCurrentDocument(registrationServer, {
    resolveCwd: named('current_document'),
    config: opts.config,
    serverUrl: opts.serverUrl,
  });
  registerData(registrationServer, {
    resolveCwd: named('data'),
    config: opts.config,
    serverUrl: opts.serverUrl,
    identityRef: opts.identityRef,
  });
  registerDataAutomation(registrationServer, {
    resolveCwd: named('data_automation'),
    config: opts.config,
    serverUrl: opts.serverUrl,
    identityRef: opts.identityRef,
  });
  registerDataButton(registrationServer, {
    resolveCwd: named('data_button'),
    config: opts.config,
    serverUrl: opts.serverUrl,
    identityRef: opts.identityRef,
  });
  registerDataPlaceSearch(registrationServer, {
    resolveCwd: named('data_place_search'),
    config: opts.config,
    serverUrl: opts.serverUrl,
    identityRef: opts.identityRef,
  });
  registerDataPlan(registrationServer, {
    resolveCwd: named('data_plan'),
    config: opts.config,
    serverUrl: opts.serverUrl,
    identityRef: opts.identityRef,
  });
  registerDataCommit(registrationServer, {
    resolveCwd: named('data_commit'),
    config: opts.config,
    serverUrl: opts.serverUrl,
    identityRef: opts.identityRef,
  });
  registerDataMarkdownTable(registrationServer, {
    resolveCwd: named('data_markdown_table'),
    config: opts.config,
    serverUrl: opts.serverUrl,
    identityRef: opts.identityRef,
  });
  registerDataComments(registrationServer, {
    resolveCwd: named('data_comments'),
    config: opts.config,
    serverUrl: opts.serverUrl,
    identityRef: opts.identityRef,
  });
  registerDataUndo(registrationServer, {
    resolveCwd: named('data_undo'),
    config: opts.config,
    serverUrl: opts.serverUrl,
    identityRef: opts.identityRef,
  });
  registerDataRepair(registrationServer, {
    resolveCwd: named('data_repair'),
    config: opts.config,
    serverUrl: opts.serverUrl,
    identityRef: opts.identityRef,
  });
  registerDataTask(registrationServer, {
    resolveCwd: named('data_task'),
    config: opts.config,
    serverUrl: opts.serverUrl,
    identityRef: opts.identityRef,
  });
  registerDataRun(registrationServer, {
    resolveCwd: named('data_run'),
    config: opts.config,
    serverUrl: opts.serverUrl,
    identityRef: opts.identityRef,
  });
  if (opts.toolProfile === 'database-sandbox') {
    return { close: databaseResources.close };
  }
  // Unified link-graph reader — replaces the six dedicated getters
  // (get_backlinks, get_forward_links, get_dead_links, get_orphans, get_hubs,
  // suggest_links) behind a `kind` discriminator.
  registerLinks(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('links'),
  });

  // CRUD verbs — polymorphic over document / folder / template / asset
  // (Pattern B: per-target fields nested inside the address key). `write`,
  // `edit`, `delete` span CRDT (document) + HTTP (folder-create, asset) +
  // fs-direct (folder frontmatter, template) backends by target; the address
  // key signals which.
  registerWrite(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('write'),
    identityRef: opts.identityRef,
  });
  registerEdit(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('edit'),
    identityRef: opts.identityRef,
  });
  registerDelete(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('delete'),
    identityRef: opts.identityRef,
  });
  // `move` — move/rename a document, folder, or asset; probes the content
  // directory to set `kind` and rewrites the link graph.
  registerMove(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('move'),
    identityRef: opts.identityRef,
  });
  // `install` — project an authored skill into the editor host dirs
  // (Draft → Installed). The one new verb beyond the `skill` CRUD target.
  registerInstall(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('install'),
    identityRef: opts.identityRef,
  });
  registerHistory(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('history'),
  });
  // Read half of the skill vocabulary (list + read across both scopes) — the
  // mutate verbs (write/edit/delete/move/install) already cover `skill`.
  registerSkills(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('skills'),
  });
  // Version management, split by risk-shape: `checkpoint` is a project-wide
  // snapshot; `restore_version` is a per-doc restore. `history` is the read.
  registerCheckpoint(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('checkpoint'),
    identityRef: opts.identityRef,
  });
  registerRestoreVersion(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('restore_version'),
    identityRef: opts.identityRef,
  });
  // `palette` — markdown-native authoring forms + themed embed starters +
  // theme tokens; pass `components: [ids]` for full JSX-form detail (merged
  // from the former get_components). Pure module-export data; no server needed.
  registerPalette(registrationServer, {
    resolveCwd: named('palette'),
    config: opts.config,
  });

  // Config tools — fs-direct (no Hocuspocus required).
  //
  // All tools use `server.registerTool`. These config/search tools also pass
  // structured-output and annotation channels (`outputSchema`, `readOnlyHint`,
  // `idempotentHint`, `destructiveHint`) where clients need a strict schema or
  // richer metadata. Registration is wrapped by `createLoggedServer` (see
  // tool-logging.ts).
  registerConfig(registrationServer, {
    config: opts.config,
    resolveCwd: named('config'),
  });
  // Resolves the browser-reachable preview URL on demand — the one place the
  // preview base/port reaches an agent. Per-response `previewUrl` fields are
  // route-only; hosts that open the URL themselves call this tool. Takes
  // `serverUrl` for its backend-ensure (a preview request is demand for a
  // backend), though it never makes HTTP calls itself — `ui.lock` stays the
  // URL source.
  registerPreviewUrl(registrationServer, {
    config: opts.config,
    resolveCwd: named('preview_url'),
    serverUrl: opts.serverUrl,
    isDesktopTerminal: opts.isDesktopTerminal,
    // Boot-on-demand for the `file` branch is wired only when this registration
    // has backend/spawn authority (the same gate as `serverUrl`): it spawns a
    // detached `ok <file>` via this process's own CLI entry.
    ...(opts.serverUrl ? { ensureSingleFileSession: createEnsureSingleFileSession() } : {}),
  });
  // Conflict tools — wrap `/api/sync/conflict*` endpoints. `conflicts` is a
  // read (kind: list | content); `resolve_conflict` is a separate write
  // (annotated `destructiveHint: true`).
  registerConflicts(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('conflicts'),
  });
  registerResolveConflict(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('resolve_conflict'),
  });

  // Share-link construction — wraps `POST /api/share/construct-url`. Read-only
  // against the working tree; no commits/pushes/fetches. The no-remote branch
  // returns a clear actionable error rather than running the Publish wizard;
  // publishing is an explicit user act, not agent-initiated.
  registerShareLink(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('share_link'),
  });

  return { close: databaseResources.close };
}
