/** Cached, main-owned terminal capability probes. */
import {
  classifyExistingMcpEntry,
  EDITOR_TARGETS,
  isOwnManagedEntry,
} from '@nedian0brien/synapsenote';
import { TERMINAL_CLIS, type TerminalCli } from '@nedian0brien/synapsenote-core';
import type { ClaudeReadiness, CliReadiness } from '../shared/bridge-contract.ts';
import {
  cliProbeArgs,
  resolveClaudeReadiness,
  resolveCliInstalledMap,
  resolveCliOnPath,
} from './claude-readiness.ts';

export interface TerminalCapabilitiesDeps {
  readonly homeDir: () => string;
  readonly probeLoginShell: (args?: readonly string[]) => Promise<number | null>;
  readonly classifyClaudeMcp: Parameters<typeof resolveClaudeReadiness>[0]['classifyMcpEntry'];
  readonly now?: () => number;
}

export interface TerminalCapabilities {
  readonly isProjectClaudeMcpOwn: (projectRoot: string | undefined) => boolean;
  readonly resolveClaudeReadiness: (projectRoot: string | undefined) => Promise<ClaudeReadiness>;
  readonly resolveCliOnPath: (cli: TerminalCli) => Promise<CliReadiness>;
  readonly resolveCliInstalledMap: () => Promise<Record<TerminalCli, boolean>>;
}

const CACHE_TTL_MS = 60_000;

/** Keeps process-local probe cache state out of the main IPC composer. */
export function createTerminalCapabilities(deps: TerminalCapabilitiesDeps): TerminalCapabilities {
  let installedMapCache: { at: number; value: Promise<Record<TerminalCli, boolean>> } | null = null;
  const now = deps.now ?? Date.now;
  const isProjectClaudeMcpOwn = (projectRoot: string | undefined): boolean => {
    if (projectRoot === undefined) return false;
    const target = EDITOR_TARGETS.claude;
    const projectPath = target.projectConfigPath?.(projectRoot);
    if (projectPath === undefined) return false;
    const classified = classifyExistingMcpEntry(target, projectRoot, undefined, projectPath);
    return classified.kind === 'present' && isOwnManagedEntry(classified.entry);
  };
  const resolveClaude = (projectRoot: string | undefined): Promise<ClaudeReadiness> =>
    resolveClaudeReadiness({
      probeClaude: () => deps.probeLoginShell(),
      classifyMcpEntry: deps.classifyClaudeMcp,
      isProjectMcpPreApprovable: () => isProjectClaudeMcpOwn(projectRoot),
    });
  const resolveCli = (cli: TerminalCli): Promise<CliReadiness> =>
    resolveCliOnPath({
      probe: () => deps.probeLoginShell(cliProbeArgs(TERMINAL_CLIS[cli].bin)),
      ...(cli === 'codex'
        ? {
            okServerConfigured: () =>
              classifyExistingMcpEntry(EDITOR_TARGETS.codex, '', deps.homeDir()).kind === 'present',
          }
        : {}),
    });
  const resolveInstalled = (): Promise<Record<TerminalCli, boolean>> => {
    if (installedMapCache && now() - installedMapCache.at < CACHE_TTL_MS)
      return installedMapCache.value;
    const value = resolveCliInstalledMap({
      probe: (cli) => deps.probeLoginShell(cliProbeArgs(TERMINAL_CLIS[cli].bin)),
    }).catch((error) => {
      installedMapCache = null;
      throw error;
    });
    installedMapCache = { at: now(), value };
    return value;
  };
  return {
    isProjectClaudeMcpOwn,
    resolveClaudeReadiness: resolveClaude,
    resolveCliOnPath: resolveCli,
    resolveCliInstalledMap: resolveInstalled,
  };
}
