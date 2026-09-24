import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { EDITOR_TARGETS, type EditorId } from '../commands/editors.ts';
import {
  applyProjectIntegrations,
  DEFAULT_PROJECT_INTEGRATIONS,
  type IntegrationWriteOutcome,
  mcpConfigWriter,
  projectSkillWriter,
} from './project-integration-writers.ts';

let tmpRoot: string;
let projectDir: string;

beforeEach(() => {
  tmpRoot = realpathSync(mkdtempSync(resolve(tmpdir(), 'ok-project-integration-writers-')));
  projectDir = resolve(tmpRoot, 'proj');
  mkdirSync(projectDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// mcpConfigWriter
// ---------------------------------------------------------------------------

describe('mcpConfigWriter', () => {
  test('id is "mcp-config"', () => {
    expect(mcpConfigWriter.id).toBe('mcp-config');
  });

  test('writes a fresh project-scope MCP config and reports action "written"', () => {
    const outcome = mcpConfigWriter.write(EDITOR_TARGETS.cursor, projectDir, {});

    expect(outcome.integration).toBe('mcp-config');
    expect(outcome.editorId).toBe('cursor');
    expect(outcome.action).toBe('written');
    expect(outcome.path).toBe(join(projectDir, '.cursor', 'mcp.json'));
    expect(outcome.error).toBeUndefined();
    expect(existsSync(join(projectDir, '.cursor', 'mcp.json'))).toBe(true);
  });

  test('replaces an existing config and reports action "overwritten"', () => {
    const cursorMcp = join(projectDir, '.cursor', 'mcp.json');
    mkdirSync(join(projectDir, '.cursor'), { recursive: true });
    writeFileSync(
      cursorMcp,
      JSON.stringify({
        mcpServers: { synapsenote: { command: 'old', args: ['mcp'] } },
      }),
    );

    const outcome = mcpConfigWriter.write(EDITOR_TARGETS.cursor, projectDir, {});

    expect(outcome.action).toBe('overwritten');
    expect(outcome.path).toBe(cursorMcp);
    const written = JSON.parse(readFileSync(cursorMcp, 'utf-8'));
    expect(written.mcpServers.synapsenote.command).toBe('/bin/sh');
    expect(written.mcpServers.synapsenote.args.slice(0, 2)).toEqual(['-l', '-c']);
    expect(written.mcpServers.synapsenote.args[2]).toContain('# ok-mcp-v1');
  });

  test('reports "skipped-unsupported" for an editor without projectConfigPath', () => {
    // Claude Desktop has no projectConfigPath — there is no standardized
    // project-local MCP config format for it.
    const outcome = mcpConfigWriter.write(EDITOR_TARGETS['claude-desktop'], projectDir, {});

    expect(outcome.integration).toBe('mcp-config');
    expect(outcome.editorId).toBe('claude-desktop');
    expect(outcome.action).toBe('skipped-unsupported');
    expect(outcome.path).toBeUndefined();
    expect(outcome.error).toBeUndefined();
  });

  test('reports "failed" with a non-empty error when the underlying write fails', () => {
    // Plant a regular file where the .cursor directory would live so the
    // downstream mkdirSync inside writeEditorMcpConfig fails with EEXIST.
    writeFileSync(join(projectDir, '.cursor'), 'not a directory');

    const outcome = mcpConfigWriter.write(EDITOR_TARGETS.cursor, projectDir, {});

    expect(outcome.action).toBe('failed');
    expect(outcome.error).toBeDefined();
    expect(outcome.error?.length ?? 0).toBeGreaterThan(0);
    expect(outcome.path).toBe(join(projectDir, '.cursor', 'mcp.json'));
  });

  test('reports "declined" with the reason when the present config is unparseable', () => {
    // A present, non-empty project config OK can't safely parse: the surgical
    // writer leaves it byte-unchanged and returns action 'declined'. The writer
    // must surface that as a non-destructive decline (with the bounded reason),
    // not a hard 'failed' — declining is the guest-ownership contract, not an
    // integration failure.
    const cursorMcp = join(projectDir, '.cursor', 'mcp.json');
    mkdirSync(join(projectDir, '.cursor'), { recursive: true });
    const malformed = '{ "mcpServers": { "synapsenote": ';
    writeFileSync(cursorMcp, malformed);

    const outcome = mcpConfigWriter.write(EDITOR_TARGETS.cursor, projectDir, {});

    expect(outcome.action).toBe('declined');
    expect(outcome.reason).toBe('unparseable');
    expect(outcome.path).toBe(cursorMcp);
    expect(outcome.error).toBeUndefined();
    // The file is left byte-for-byte unchanged.
    expect(readFileSync(cursorMcp, 'utf-8')).toBe(malformed);
  });

  test('never throws even when the target path environment is hostile', () => {
    // Every editor in turn against a project planted with various blockers —
    // assert no throw and an outcome is produced for each.
    writeFileSync(join(projectDir, '.mcp.json'), 'not-json');
    writeFileSync(join(projectDir, '.cursor'), 'block');
    writeFileSync(join(projectDir, '.codex'), 'block');

    const editorIds: EditorId[] = ['claude', 'cursor', 'codex', 'claude-desktop'];
    for (const id of editorIds) {
      expect(() => mcpConfigWriter.write(EDITOR_TARGETS[id], projectDir, {})).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// projectSkillWriter
// ---------------------------------------------------------------------------

describe('projectSkillWriter', () => {
  test('never installs runtime skills, including explicit legacy writer calls', () => {
    for (const id of ['claude', 'cursor', 'codex', 'claude-desktop'] as const) {
      const outcome = projectSkillWriter.write(EDITOR_TARGETS[id], projectDir, {});
      expect(outcome.action).toBe('skipped-unsupported');
      expect(outcome.path).toBeUndefined();
    }
    expect(existsSync(join(projectDir, '.codex/skills/synapsenote/SKILL.md'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_PROJECT_INTEGRATIONS + applyProjectIntegrations
// ---------------------------------------------------------------------------

const outcomesFor = (
  outcomes: readonly IntegrationWriteOutcome[],
  editorId: EditorId,
): IntegrationWriteOutcome[] => outcomes.filter((o) => o.editorId === editorId);

describe('DEFAULT_PROJECT_INTEGRATIONS', () => {
  test('contains exactly [mcp-config, project-skill] in apply order', () => {
    expect(DEFAULT_PROJECT_INTEGRATIONS.map((w) => w.id)).toEqual(['mcp-config']);
  });

  test('the writers in the default set are the exported singletons', () => {
    expect(DEFAULT_PROJECT_INTEGRATIONS[0]).toBe(mcpConfigWriter);
    expect(DEFAULT_PROJECT_INTEGRATIONS).toHaveLength(1);
  });
});

describe('applyProjectIntegrations', () => {
  test('installs MCP connections without projecting the runtime skill', () => {
    const outcomes = applyProjectIntegrations(projectDir, ['claude', 'cursor', 'codex']);
    expect(outcomes).toHaveLength(3);
    expect(outcomes.map((o) => o.integration)).toEqual(['mcp-config', 'mcp-config', 'mcp-config']);
    expect(outcomes.map((o) => o.editorId)).toEqual(['claude', 'cursor', 'codex']);
    for (const host of ['.claude', '.cursor', '.codex']) {
      expect(existsSync(join(projectDir, host, 'skills/synapsenote/SKILL.md'))).toBe(false);
    }
    expect(existsSync(join(projectDir, '.mcp.json'))).toBe(true);
  });

  test('returns an empty array for an empty editorIds selection', () => {
    expect(applyProjectIntegrations(projectDir, [])).toEqual([]);
  });

  test('an editor failure does not prevent other connections', () => {
    writeFileSync(join(projectDir, '.cursor'), 'blocked');
    const outcomes = applyProjectIntegrations(projectDir, ['claude', 'cursor', 'codex']);
    expect(outcomesFor(outcomes, 'cursor')[0]?.action).toBe('failed');
    expect(outcomesFor(outcomes, 'claude')[0]?.action).toBe('written');
    expect(outcomesFor(outcomes, 'codex')[0]?.action).toBe('written');
  });

  test('claude-desktop has no project config', () => {
    const outcomes = applyProjectIntegrations(projectDir, ['claude-desktop']);

    expect(outcomes).toHaveLength(1);
    for (const outcome of outcomes) {
      expect(outcome.action).toBe('skipped-unsupported');
      expect(outcome.error).toBeUndefined();
    }
  });

  test('respects a custom writers parameter (extension point)', () => {
    // Pass only the mcp-config writer so the skill is intentionally skipped
    // for the duration of this call — the orchestrator's `writers` param IS
    // the contract that lets callers narrow or extend the default set.
    const outcomes = applyProjectIntegrations(projectDir, ['claude', 'cursor'], {}, [
      mcpConfigWriter,
    ]);

    expect(outcomes).toHaveLength(2);
    expect(outcomes.map((o) => o.integration)).toEqual(['mcp-config', 'mcp-config']);
    expect(existsSync(join(projectDir, '.claude', 'skills'))).toBe(false);
    expect(existsSync(join(projectDir, '.cursor', 'skills'))).toBe(false);
  });

  test('passes install options through to mcpConfigWriter (dev mode)', () => {
    const outcomes = applyProjectIntegrations(projectDir, ['claude'], { mode: 'dev' });

    const mcpOutcome = outcomes.find((o) => o.integration === 'mcp-config');
    expect(mcpOutcome?.action).toBe('written');
    const written = JSON.parse(readFileSync(join(projectDir, '.mcp.json'), 'utf-8'));
    // dev mode resolves the local CLI dist; the command becomes 'node'.
    expect(written.mcpServers.synapsenote.command).toBe('node');
  });
});
