/**
 * Registry assertion — pins the consolidated tool surface of `registerAllTools`.
 *
 * The OK MCP redesign collapsed the original surface to 17 native
 * CRUD verbs + discriminated reads:
 *   - `write` / `edit` / `delete` / `move` are polymorphic over
 *     document / folder / template / asset — absorbing write_document,
 *     edit_document, edit_frontmatter, delete_document, rename(_document/_folder),
 *     set_folder_rule, write_template, delete_template, and folder_config.
 *   - `links` (read) absorbed the 6 link-graph getters.
 *   - `checkpoint` + `restore_version` replaced save_version + rollback_to_version
 *     (the interim single `version` tool was split).
 *   - `conflicts` absorbed list_conflicts + get_conflict_content.
 *   - `palette` absorbed get_components + get_authoring_palette.
 *   - `workflow({ kind })` absorbed ingest / research / consolidate / discover.
 *   - `history` / `config` / `preview_url` dropped the `get_` prefix.
 *   - read_document / grep / list_documents were dropped (exec subsumes).
 *
 * This test guards both ends: the complete current tool set is present and none
 * of the names in RETIRED_TOOL_NAMES are.
 */

import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OK_GATED_TOOL_NAMES } from '@nedian0brien/synapsenote-core';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import { DATABASE_SANDBOX_MCP_TOOL_NAMES, registerAllTools } from './index.ts';
import type { ServerInstance } from './shared.ts';

const BASE_CONFIG: Config = ConfigSchema.parse({});

const EXPECTED_TOOLS = [
  // Reads
  'exec',
  'search',
  'history',
  'links',
  'skills',
  'config',
  'palette',
  'preview_url',
  'share_link',
  'current_document',
  'data',
  'data_automation',
  'data_button',
  'data_place_search',
  'data_plan',
  'data_comments',
  'data_commit',
  'data_markdown_table',
  'data_undo',
  'data_repair',
  'data_task',
  'data_run',
  // Writes — CRUD verbs + version
  'write',
  'edit',
  'delete',
  'move',
  // Skill install-projection — the one new verb beyond the CRUD set.
  'install',
  'checkpoint',
  'restore_version',
  // GitHub-sync conflicts
  'conflicts',
  'resolve_conflict',
  // Workflow
  'workflow',
] as const;

const RETIRED_TOOL_NAMES = [
  // Link-graph getters → links
  'get_backlinks',
  'get_forward_links',
  'get_dead_links',
  'get_orphans',
  'get_hubs',
  'suggest_links',
  // Rename → rename
  'rename_document',
  'rename_folder',
  // Versioning writes → checkpoint + restore_version
  'save_version',
  'rollback_to_version',
  'version',
  // Folder-config writes → folder_config
  'set_folder_rule',
  'write_template',
  'delete_template',
  // Frontmatter patch → edit_frontmatter
  'frontmatter_patch',
  // CRUD-verb consolidation → write / edit / delete / move
  'write_document',
  'edit_document',
  'edit_frontmatter',
  'delete_document',
  'rename',
  'folder_config',
  // Typed reads → exec
  'read_document',
  'grep',
  'list_documents',
  // Components/palette merge → palette({ components? })
  'get_components',
  'get_authoring_palette',
  // Workflow primers → workflow({ kind })
  'ingest',
  'research',
  'consolidate',
  'discover',
  // get_ prefix drops → history / config / preview_url
  'get_history',
  'get_config',
  'get_preview_url',
] as const;

function captureRegistered(toolProfile: 'full' | 'database-sandbox' = 'full'): string[] {
  const names: string[] = [];
  const cwd = mkdtempSync(join(tmpdir(), 'ok-registry-assertion-'));
  const server = {
    registerTool(name: string, _cfg: unknown, _handler: unknown) {
      names.push(name);
    },
    tool() {
      throw new Error('legacy tool() API not expected — every tool must use registerTool');
    },
  } as unknown as ServerInstance;
  registerAllTools(server, {
    config: BASE_CONFIG,
    resolveCwd: async () => cwd,
    serverUrl: undefined,
    toolProfile,
  });
  return names;
}

describe('registerAllTools — 32-tool surface', () => {
  test('registers exactly 32 tools', () => {
    const names = captureRegistered();
    expect(names.length).toBe(32);
  });

  test('the 32 expected tool names are all present', () => {
    const names = new Set(captureRegistered());
    for (const expected of EXPECTED_TOOLS) {
      expect(names).toContain(expected);
    }
  });

  test('none of the 17 pre-consolidation tool names are registered', () => {
    const names = new Set(captureRegistered());
    for (const retired of RETIRED_TOOL_NAMES) {
      expect(names.has(retired)).toBe(false);
    }
  });

  test('the registered set matches the expected set exactly (no extras)', () => {
    const names = new Set(captureRegistered());
    expect(names).toEqual(new Set(EXPECTED_TOOLS));
  });

  test('no duplicate registrations', () => {
    const names = captureRegistered();
    expect(names.length).toBe(new Set(names).size);
  });

  test('database sandbox profile exposes only read surfaces and Data Plane operations', () => {
    const names = captureRegistered('database-sandbox');
    expect(names).toEqual([...DATABASE_SANDBOX_MCP_TOOL_NAMES]);
    expect(names).not.toContain('write');
    expect(names).not.toContain('edit');
    expect(names).not.toContain('delete');
    expect(names).not.toContain('move');
    expect(names).not.toContain('restore_version');
    expect(names).not.toContain('resolve_conflict');
    expect(names).not.toContain('config');
  });
});

/**
 * Guards the docked terminal's auto-approve policy (core `terminal-launch.ts`)
 * against this registry. Claude's allow-rule is the open-ended `mcp__<server>`
 * (every OK tool); safety is subtracted back by the CLOSED `OK_GATED_TOOL_NAMES`
 * deny-list. Left uncoupled, a newly registered destructive tool would inherit
 * auto-approval the moment it shipped.
 *
 * Every registered tool must therefore appear in exactly one of the two lists —
 * adding a tool fails here until it is consciously classified as gated or
 * auto-approved.
 *
 * On the auto-approved side: `write` / `edit` / `checkpoint` / `restore_version`
 * / `resolve_conflict` all mutate KB content, but the shadow repo versions every
 * write, so `history` + `restore_version` recover them. `exec` is a read-only
 * allowlisted sandbox. `install` is NOT here — it projects executable skill
 * scripts into the agent's own config dir, which no KB version history undoes.
 */
const OK_AUTO_APPROVED_TOOLS = [
  'exec',
  'search',
  'history',
  'links',
  'skills',
  'config',
  'palette',
  'preview_url',
  'current_document',
  'data',
  'data_button',
  'data_plan',
  'data_comments',
  'write',
  'edit',
  'checkpoint',
  'restore_version',
  'conflicts',
  'resolve_conflict',
  'workflow',
] as const;

describe('docked-terminal auto-approve classification', () => {
  test('every registered tool is classified as gated or auto-approved', () => {
    const classified = new Set([...OK_AUTO_APPROVED_TOOLS, ...OK_GATED_TOOL_NAMES]);
    const registered = new Set(captureRegistered());
    expect([...classified].sort()).toEqual([...registered].sort());
  });

  test('no tool is both gated and auto-approved', () => {
    const gated = new Set<string>(OK_GATED_TOOL_NAMES);
    expect(OK_AUTO_APPROVED_TOOLS.filter((name) => gated.has(name))).toEqual([]);
  });

  test('the deny-list only names tools that actually exist', () => {
    const registered = new Set(captureRegistered());
    for (const gated of OK_GATED_TOOL_NAMES) {
      expect(registered).toContain(gated);
    }
  });
});
