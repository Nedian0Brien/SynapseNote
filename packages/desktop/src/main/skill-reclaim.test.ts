import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reclaimProjectSkillsOnProjectOpen, reclaimUserSkillsOnLaunch } from './skill-reclaim.ts';

const EXE = '/Applications/SynapseNote.app/Contents/MacOS/SynapseNote';

/** A `.mcp.json` body carrying the `# ok-mcp-v1` chain sentinel — the
 *  `createIfWired` signal the project sweep keys off. */
const OK_WIRED_MCP_JSON = JSON.stringify({
  mcpServers: {
    synapsenote: { command: '/bin/sh', args: ['-l', '-c', '# ok-mcp-v1\nexec ok mcp'] },
  },
});
/** A `.mcp.json` with an unrelated server and no OK marker. */

/** A `.mcp.json` carrying the WINDOWS chain sentinel — written by a Windows
 *  teammate into a shared repo; must still count as wired here. */

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const p = cleanupPaths.pop();
    if (!p) continue;
    try {
      rmSync(p, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
});

function setupBundle(): string {
  const bundle = mkdtempSync(join(tmpdir(), 'ok-skill-bundle-'));
  cleanupPaths.push(bundle);
  writeFileSync(join(bundle, 'SKILL.md'), '---\nname: synapsenote\n---\n# v-new\n');
  writeFileSync(join(bundle, 'extra.md'), 'extra-new');
  return bundle;
}

function makeHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'ok-skill-home-'));
  cleanupPaths.push(home);
  return home;
}

interface CapturedEvent {
  ts: string;
  outcome: 'installed' | 'failed';
  bundle?: string;
  version?: string;
  reason?: string;
}

interface FakeDeps {
  userGlobalBundles: ReadonlyArray<{ id: string; name: string }>;
  resolveBundledSkillDir(bundle: string): string;
  readServerPackageVersion(): Promise<string>;
  writeTargetVersion(
    home: string,
    target: 'cli-hosts',
    version: string,
    surface: 'desktop-direct',
  ): Promise<void>;
  recordSkillInstallEvent(event: {
    ts: string;
    surface: 'desktop-direct';
    target: 'cli-hosts';
    bundle?: string;
    outcome: 'installed' | 'failed';
    version?: string;
    reason?: string;
  }): Promise<void>;
  readBundleDecision(home: string, bundleName: string): Promise<boolean | null>;
  writeBundleDecision(home: string, bundleName: string, enabled: boolean): Promise<void>;
  removeBundleFromDisk(bundleId: string): void;
  /** Captured state for assertions. */
  stateWrites: Array<{ home: string; version: string }>;
  events: CapturedEvent[];
  /** Captured per-bundle decisions written (grandfather materialization). */
  decisionWrites: Array<{ bundleName: string; enabled: boolean }>;
  /** Captured bundle ids removed on decline. */
  removals: string[];
}

/** Default test bundle set — discovery only, so existing single-bundle
 *  assertions hold; multi-bundle tests pass an explicit list. */
const DISCOVERY_ONLY_BUNDLES = [{ id: 'discovery', name: 'synapsenote-discovery' }] as const;

function makeDeps(opts: {
  bundle: string;
  version?: string;
  versionThrows?: Error;
  resolveThrows?: Error;
  /** Inject a throw into the writeTargetVersion mock — exercises the
   *  state-write-failure → outcome:'failed' regression guard. */
  stateWriteThrows?: Error;
  /** Per-bundle opt-in decision the gate reads. Default `true` (consented) so
   *  existing install-assertion tests hold; `null` grandfathers to disk;
   *  `false` declines. A map keys by bundle NAME for multi-bundle tests. */
  bundleDecision?: boolean | null | Record<string, boolean | null>;
}): FakeDeps {
  const stateWrites: Array<{ home: string; version: string }> = [];
  const events: CapturedEvent[] = [];
  const decisionWrites: Array<{ bundleName: string; enabled: boolean }> = [];
  const removals: string[] = [];
  const decisionFor = (bundleName: string): boolean | null => {
    const d = opts.bundleDecision;
    if (d === undefined) return true;
    if (typeof d === 'object' && d !== null) return d[bundleName] ?? null;
    return d;
  };
  return {
    userGlobalBundles: DISCOVERY_ONLY_BUNDLES,
    resolveBundledSkillDir: () => {
      if (opts.resolveThrows) throw opts.resolveThrows;
      return opts.bundle;
    },
    readServerPackageVersion: async () => {
      if (opts.versionThrows) throw opts.versionThrows;
      return opts.version ?? '9.9.9';
    },
    writeTargetVersion: async (home, _target, version) => {
      if (opts.stateWriteThrows) throw opts.stateWriteThrows;
      stateWrites.push({ home, version });
    },
    recordSkillInstallEvent: async (event) => {
      events.push({
        ts: event.ts,
        outcome: event.outcome,
        bundle: event.bundle,
        version: event.version,
        reason: event.reason,
      });
    },
    readBundleDecision: async (_home, bundleName) => decisionFor(bundleName),
    writeBundleDecision: async (_home, bundleName, enabled) => {
      decisionWrites.push({ bundleName, enabled });
    },
    removeBundleFromDisk: (bundleId) => {
      removals.push(bundleId);
    },
    stateWrites,
    events,
    decisionWrites,
    removals,
  };
}

describe('reclaimUserSkillsOnLaunch', () => {
  test('skipped on non-darwin', async () => {
    const home = makeHome();
    const deps = makeDeps({ bundle: setupBundle() });
    const r = await reclaimUserSkillsOnLaunch({
      home,
      isPackaged: true,
      platform: 'linux',
      executablePath: EXE,
      deps,
    });
    expect(r.status).toBe('skipped');
  });

  test('central store always force-written even when nothing existed', async () => {
    const home = makeHome();
    const bundle = setupBundle();
    const deps = makeDeps({ bundle, version: '0.5.0-beta.41' });
    const r = await reclaimUserSkillsOnLaunch({
      home,
      isPackaged: true,
      platform: 'darwin',
      executablePath: EXE,
      deps,
    });
    expect(r.status).toBe('done');
    const central = join(home, '.agents', 'skills', 'synapsenote-discovery', 'SKILL.md');
    expect(existsSync(central)).toBe(true);
    expect(readFileSync(central, 'utf8')).toContain('v-new');
    expect(deps.stateWrites).toEqual([{ home, version: '0.5.0-beta.41' }]);
    expect(deps.events).toEqual([
      {
        ts: deps.events[0]?.ts ?? '',
        outcome: 'installed',
        bundle: 'discovery',
        version: '0.5.0-beta.41',
      },
    ]);
  });

  test('installs every user-global bundle (discovery + write-skill) into central + per-host', async () => {
    const home = makeHome();
    const bundle = setupBundle();
    // A `.claude` host so a per-host (non-central) write also happens.
    mkdirSync(join(home, '.claude', 'skills'), { recursive: true });
    const deps = {
      ...makeDeps({ bundle, version: '1.0.0' }),
      userGlobalBundles: [
        { id: 'discovery', name: 'synapsenote-discovery' },
        { id: 'write-skill', name: 'synapsenote-write-skill' },
      ],
    };
    const r = await reclaimUserSkillsOnLaunch({
      home,
      isPackaged: true,
      platform: 'darwin',
      executablePath: EXE,
      deps,
    });
    expect(r.status).toBe('done');
    // Both bundles landed in the central store and the `.claude` host.
    for (const name of ['synapsenote-discovery', 'synapsenote-write-skill']) {
      expect(existsSync(join(home, '.agents', 'skills', name, 'SKILL.md'))).toBe(true);
      expect(existsSync(join(home, '.claude', 'skills', name, 'SKILL.md'))).toBe(true);
    }
    // One installed event per bundle; the version marker is written once.
    const installed = deps.events.filter((e) => e.outcome === 'installed').map((e) => e.bundle);
    expect(installed.sort()).toEqual(['discovery', 'write-skill']);
    expect(deps.stateWrites).toEqual([{ home, version: '1.0.0' }]);
  });

  test('central store overwrites existing files even when same path is present', async () => {
    const home = makeHome();
    const bundle = setupBundle();
    const central = join(home, '.agents', 'skills', 'synapsenote-discovery');
    mkdirSync(central, { recursive: true });
    writeFileSync(join(central, 'SKILL.md'), '---\nname: synapsenote\n---\n# v-old\n');
    writeFileSync(join(central, 'orphan.md'), 'stale');
    const deps = makeDeps({ bundle, version: '0.5.0-beta.41' });
    const r = await reclaimUserSkillsOnLaunch({
      home,
      isPackaged: true,
      platform: 'darwin',
      executablePath: EXE,
      deps,
    });
    expect(r.status).toBe('done');
    expect(readFileSync(join(central, 'SKILL.md'), 'utf8')).toContain('v-new');
    // stale files inside the dir must be removed before cpSync (replaceDir contract)
    expect(existsSync(join(central, 'orphan.md'))).toBe(false);
    expect(existsSync(join(central, 'extra.md'))).toBe(true);
  });

  test('per-host write happens only when the host dir exists; missing host is skipped-host-absent', async () => {
    const home = makeHome();
    mkdirSync(join(home, '.claude'), { recursive: true });
    // .cursor intentionally missing
    const bundle = setupBundle();
    const deps = makeDeps({ bundle, version: '1.2.3' });
    const r = await reclaimUserSkillsOnLaunch({
      home,
      isPackaged: true,
      platform: 'darwin',
      executablePath: EXE,
      deps,
    });
    expect(r.status).toBe('done');
    if (r.status === 'done') {
      const claude = r.entries.find((e) => e.kind === 'host' && e.editorId === 'claude');
      const cursor = r.entries.find((e) => e.kind === 'host' && e.editorId === 'cursor');
      expect(claude?.status).toBe('written');
      expect(cursor?.status).toBe('skipped-host-absent');
    }
    expect(existsSync(join(home, '.claude', 'skills', 'synapsenote-discovery', 'SKILL.md'))).toBe(
      true,
    );
    expect(existsSync(join(home, '.cursor', 'skills', 'synapsenote-discovery'))).toBe(false);
  });

  test('codex installs to its own .codex host dir, distinct from the .agents central store', async () => {
    // Codex's per-host skills dir is now `.codex/skills` (not the shared
    // `.agents`). The all-agents central `.agents/skills/synapsenote-discovery`
    // store and codex's per-host copy are distinct paths — both get written,
    // no collapse.
    const home = makeHome();
    mkdirSync(join(home, '.codex'), { recursive: true });
    const bundle = setupBundle();
    const deps = makeDeps({ bundle, version: '1.2.3' });
    const events: Array<Record<string, unknown>> = [];
    const r = await reclaimUserSkillsOnLaunch({
      home,
      isPackaged: true,
      platform: 'darwin',
      executablePath: EXE,
      deps,
      logger: {
        event: (e) => events.push(e),
        warn: () => {},
      },
    });
    expect(r.status).toBe('done');
    if (r.status === 'done') {
      const central = r.entries.find((e) => e.kind === 'central');
      expect(central?.status).toBe('written');
      expect(central?.path).toContain(join('.agents', 'skills'));
      // Codex now produces its own host entry at `.codex`, distinct from central.
      const codex = r.entries.find((e) => e.kind === 'host' && e.editorId === 'codex');
      expect(codex?.status).toBe('written');
      expect(codex?.path).toContain(join('.codex', 'skills'));
      expect(codex?.path).not.toBe(central?.path);
    }
    // Both the central and the codex-host write fire (no collapse).
    expect(events.filter((e) => e.event === 'user-skill-reclaim-central-written')).toHaveLength(1);
    expect(
      events.filter((e) => e.event === 'user-skill-reclaim-host-written' && e.editorId === 'codex'),
    ).toHaveLength(1);
  });

  test('per-host overwrite when SKILL.md already exists (force-write)', async () => {
    const home = makeHome();
    const dest = join(home, '.claude', 'skills', 'synapsenote-discovery');
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, 'SKILL.md'), '---\nname: synapsenote\n---\n# v-old\n');
    const bundle = setupBundle();
    const deps = makeDeps({ bundle, version: '1.2.3' });
    const r = await reclaimUserSkillsOnLaunch({
      home,
      isPackaged: true,
      platform: 'darwin',
      executablePath: EXE,
      deps,
    });
    expect(r.status).toBe('done');
    if (r.status === 'done') {
      const claude = r.entries.find((e) => e.kind === 'host' && e.editorId === 'claude');
      expect(claude?.status).toBe('overwritten');
    }
    expect(readFileSync(join(dest, 'SKILL.md'), 'utf8')).toContain('v-new');
  });

  test('pre-split synapsenote dirs are removed at every host before the discovery bundle lands', async () => {
    const home = makeHome();
    const legacyHosts = ['.claude', '.cursor', '.agents'] as const;
    // Plant a stale pre-split install at all three host locations.
    for (const hostDir of legacyHosts) {
      const legacy = join(home, hostDir, 'skills', 'synapsenote');
      mkdirSync(legacy, { recursive: true });
      writeFileSync(
        join(legacy, 'SKILL.md'),
        '---\nname: synapsenote\nmetadata:\n  author: SynapseNote\n  repository: https://github.com/Nedian0Brien/SynapseNote\n---\n# legacy\n',
      );
    }
    const bundle = setupBundle();
    const deps = makeDeps({ bundle, version: '1.2.3' });
    const r = await reclaimUserSkillsOnLaunch({
      home,
      isPackaged: true,
      platform: 'darwin',
      executablePath: EXE,
      deps,
    });
    expect(r.status).toBe('done');
    for (const hostDir of legacyHosts) {
      // Legacy dir gone; the new discovery dir is present in its place.
      expect(existsSync(join(home, hostDir, 'skills', 'synapsenote'))).toBe(false);
      expect(existsSync(join(home, hostDir, 'skills', 'synapsenote-discovery', 'SKILL.md'))).toBe(
        true,
      );
    }
  });

  test('every write failing → JSONL records outcome:failed reason:all-targets-failed', async () => {
    const home = makeHome();
    const deps = makeDeps({ bundle: setupBundle(), version: '3.2.1' });
    // Inject an fs whose every write throws — central + per-host replaceDir
    // all fail, so no write succeeds and the state file is never advanced.
    const r = await reclaimUserSkillsOnLaunch({
      home,
      isPackaged: true,
      platform: 'darwin',
      executablePath: EXE,
      deps,
      fs: {
        existsSync: () => false,
        isDirectory: () => false,
        readdirSync: () => [],
        readFileSync: () => Buffer.from(''),
        writeFileSync: () => {
          throw new Error('ENOSPC: no space left on device');
        },
        mkdirSync: () => {
          throw new Error('ENOSPC: no space left on device');
        },
        rmSync: () => {},
      },
    });
    expect(r.status).toBe('done');
    expect(deps.stateWrites).toEqual([]);
    const failed = deps.events.find((e) => e.outcome === 'failed');
    expect(failed?.reason).toBe('all-targets-failed');
    expect(failed?.version).toBe('3.2.1');
  });

  test('bundle-missing surfaces as skipped with failed event', async () => {
    const home = makeHome();
    const deps = makeDeps({
      bundle: '/does-not-matter',
      resolveThrows: new Error('not found'),
    });
    const r = await reclaimUserSkillsOnLaunch({
      home,
      isPackaged: true,
      platform: 'darwin',
      executablePath: EXE,
      deps,
    });
    expect(r.status).toBe('skipped');
    expect(deps.events[0]?.outcome).toBe('failed');
    expect(deps.stateWrites).toEqual([]);
  });

  test('version-read failure surfaces as skipped; no state-write', async () => {
    const home = makeHome();
    const deps = makeDeps({ bundle: setupBundle(), versionThrows: new Error('bad pkg') });
    const r = await reclaimUserSkillsOnLaunch({
      home,
      isPackaged: true,
      platform: 'darwin',
      executablePath: EXE,
      deps,
    });
    expect(r.status).toBe('skipped');
    expect(deps.stateWrites).toEqual([]);
    expect(deps.events.at(-1)?.outcome).toBe('failed');
  });

  test('writeTargetVersion failure → JSONL outcome:failed (not installed) so event log matches state file', async () => {
    // Regression guard: a writeTargetVersion throw left the JSONL event
    // recording outcome:'installed' while ~/.ok/skill-state.yml stayed
    // pinned to a stale version — recreating the exact staleness symptom
    // this whole module is fixing. Gate the JSONL outcome on the state
    // write so the diagnostic trail stays coherent.
    const home = makeHome();
    const deps = makeDeps({
      bundle: setupBundle(),
      version: '1.2.3',
      stateWriteThrows: new Error('ENOSPC: no space left on device'),
    });
    const r = await reclaimUserSkillsOnLaunch({
      home,
      isPackaged: true,
      platform: 'darwin',
      executablePath: EXE,
      deps,
    });
    expect(r.status).toBe('done');
    expect(deps.stateWrites).toEqual([]);
    const installed = deps.events.find((e) => e.outcome === 'installed');
    expect(installed).toBeUndefined();
    const failed = deps.events.find((e) => e.outcome === 'failed');
    expect(failed?.version).toBe('1.2.3');
    expect(failed?.reason ?? '').toContain('state-write-failed');
    expect(failed?.reason ?? '').toContain('ENOSPC');
  });
});

describe('reclaimUserSkillsOnLaunch — per-bundle opt-in gate', () => {
  const DISCOVERY_DIR = ['.agents', 'skills', 'synapsenote-discovery'] as const;

  function seedCentral(home: string): void {
    const dir = join(home, ...DISCOVERY_DIR);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), 'preexisting');
  }

  test('FR1: fresh machine (no decision, nothing on disk) installs nothing', async () => {
    const home = makeHome();
    const deps = makeDeps({ bundle: setupBundle(), bundleDecision: null });
    const r = await reclaimUserSkillsOnLaunch({
      home,
      isPackaged: true,
      platform: 'darwin',
      executablePath: EXE,
      deps,
    });
    expect(r.status).toBe('skipped');
    if (r.status === 'skipped') expect(r.reason).toBe('all-bundles-declined');
    expect(existsSync(join(home, ...DISCOVERY_DIR, 'SKILL.md'))).toBe(false);
    expect(deps.events.some((e) => e.outcome === 'installed')).toBe(false);
  });

  test('D3b: declining an installed bundle removes it and does not re-install', async () => {
    const home = makeHome();
    seedCentral(home);
    const deps = makeDeps({ bundle: setupBundle(), bundleDecision: false });
    const r = await reclaimUserSkillsOnLaunch({
      home,
      isPackaged: true,
      platform: 'darwin',
      executablePath: EXE,
      deps,
    });
    expect(r.status).toBe('skipped');
    if (r.status === 'skipped') expect(r.reason).toBe('all-bundles-declined');
    expect(deps.removals).toEqual(['discovery']);
    // No install event for the declined bundle.
    expect(deps.events.some((e) => e.outcome === 'installed')).toBe(false);
  });

  test('FR4: grandfather — installed with no decision is kept + records enabled', async () => {
    const home = makeHome();
    seedCentral(home);
    const deps = makeDeps({ bundle: setupBundle(), version: '1.0.0', bundleDecision: null });
    const r = await reclaimUserSkillsOnLaunch({
      home,
      isPackaged: true,
      platform: 'darwin',
      executablePath: EXE,
      deps,
    });
    expect(r.status).toBe('done');
    // Force-written (grandfathered install stays) + decision materialized.
    expect(existsSync(join(home, ...DISCOVERY_DIR, 'SKILL.md'))).toBe(true);
    expect(deps.decisionWrites).toEqual([{ bundleName: 'synapsenote-discovery', enabled: true }]);
    expect(deps.removals).toEqual([]);
  });

  test('mixed decision: declined bundle is removed while the enabled bundle installs', async () => {
    const home = makeHome();
    // Seed both bundles on disk, then decline ONLY write-skill.
    for (const name of ['synapsenote-discovery', 'synapsenote-write-skill']) {
      const dir = join(home, '.agents', 'skills', name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'SKILL.md'), 'preexisting');
    }
    const deps = {
      ...makeDeps({
        bundle: setupBundle(),
        version: '1.0.0',
        bundleDecision: {
          'synapsenote-discovery': true,
          'synapsenote-write-skill': false,
        },
      }),
      userGlobalBundles: [
        { id: 'discovery', name: 'synapsenote-discovery' },
        { id: 'write-skill', name: 'synapsenote-write-skill' },
      ],
    };
    const r = await reclaimUserSkillsOnLaunch({
      home,
      isPackaged: true,
      platform: 'darwin',
      executablePath: EXE,
      deps,
    });
    expect(r.status).toBe('done');
    // write-skill torn down; discovery installed (its central write landed).
    expect(deps.removals).toEqual(['write-skill']);
    const installed = deps.events.filter((e) => e.outcome === 'installed').map((e) => e.bundle);
    expect(installed).toEqual(['discovery']);
  });
});

describe('project runtime retirement on open', () => {
  test('never creates a runtime skill for an MCP-wired project, on any platform', async () => {
    const projectDir = makeHome();
    writeFileSync(join(projectDir, '.mcp.json'), OK_WIRED_MCP_JSON);
    for (const platform of ['darwin', 'linux', 'win32']) {
      const result = await reclaimProjectSkillsOnProjectOpen({
        projectDir,
        executablePath: EXE,
        isPackaged: false,
        platform,
        createIfWired: true,
        deps: {
          resolveBundledSkillDir: () => {
            throw new Error('must not read bundle');
          },
        },
      });
      expect(result.status).toBe('done');
      expect(existsSync(join(projectDir, '.claude/skills/synapsenote/SKILL.md'))).toBe(false);
    }
  });

  test('archives existing product rules with user edits and never recreates them', async () => {
    const projectDir = makeHome();
    const dir = join(projectDir, '.codex/skills/synapsenote');
    mkdirSync(dir, { recursive: true });
    const content =
      '---\nname: synapsenote\nmetadata:\n  author: SynapseNote\n  repository: https://github.com/Nedian0Brien/SynapseNote\n---\nUser addition';
    writeFileSync(join(dir, 'SKILL.md'), content);
    const opts = {
      projectDir,
      executablePath: EXE,
      isPackaged: false,
      platform: 'darwin',
      deps: { resolveBundledSkillDir: setupBundle },
    };
    const first = await reclaimProjectSkillsOnProjectOpen(opts);
    expect(first.status).toBe('done');
    if (first.status === 'done') expect(first.entries[0]?.status).toBe('archived');
    expect(existsSync(join(dir, 'SKILL.md'))).toBe(false);
    const second = await reclaimProjectSkillsOnProjectOpen(opts);
    if (second.status === 'done') expect(second.entries).toEqual([]);
  });
});
