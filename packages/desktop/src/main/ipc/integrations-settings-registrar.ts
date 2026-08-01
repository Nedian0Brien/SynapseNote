/**
 * Persistent Settings IPC for user-global and sender-scoped project AI tools.
 *
 * The main entry supplies all process and Electron state. In particular, the
 * project resolver is deliberately composed from the requesting webContents,
 * its BrowserWindow, and window-manager-owned ProjectContext; renderer input
 * never selects a project directory.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALL_EDITOR_IDS,
  classifyExistingMcpEntry,
  detectInstalledEditors,
  EDITOR_TARGETS,
  HOSTS_WITH_USER_SKILL_DIR,
  isEntryUpToDate,
  isOwnManagedEntry,
  type McpInstallOptions,
  removeOwnMcpEntry,
  removeProjectSkill,
  removeUserGlobalSkillBundle,
  writeEditorMcpConfig,
  writeProjectSkill,
  writeUserMcpConfigs,
} from '@nedian0brien/synapsenote';
import {
  BUNDLE_SKILL_NAME,
  USER_GLOBAL_BUNDLE_IDS,
  writeBundleDecision,
} from '@nedian0brien/synapsenote-server';
import type { App, BrowserWindow, IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import type { DesktopLogger } from '../desktop-logger.ts';
import {
  type RegisterIntegrationsSettingsOpts,
  registerIntegrationsSettings as registerIntegrationsSettingsImpl,
} from '../integrations-settings.ts';
import {
  computePathInstallDescriptor,
  ensureCliOnPath,
  isPathShimInstalled,
  removePathShimFromRcFiles,
} from '../path-install.ts';
import {
  type RegisterProjectIntegrationsSettingsOpts,
  registerProjectIntegrationsSettings as registerProjectIntegrationsSettingsImpl,
} from '../project-integrations-settings.ts';
import { reclaimUserSkillsOnLaunch } from '../skill-reclaim.ts';

type PathInstallLogger = Parameters<typeof computePathInstallDescriptor>[0]['logger'];

export interface IntegrationsSettingsRegistrarDeps {
  readonly app: Pick<App, 'getPath' | 'isPackaged'>;
  readonly ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>;
  readonly platform: NodeJS.Platform;
  readonly env: NodeJS.ProcessEnv;
  readonly homeDir: () => string;
  readonly getLogger: (subsystem: string) => DesktopLogger;
  readonly pathInstallLogger: PathInstallLogger;
  readonly buildEnsureCliOnPathOpts: () => Parameters<typeof ensureCliOnPath>[0];
  readonly buildReclaimUserSkillsOpts: () => Parameters<typeof reclaimUserSkillsOnLaunch>[0];
  readonly getWindowForWebContents: (sender: WebContents) => BrowserWindow | null;
  readonly getProjectPath: (window: BrowserWindow) => string | undefined;
  readonly registerGlobal?: (opts: RegisterIntegrationsSettingsOpts) => unknown;
  readonly registerProject?: (opts: RegisterProjectIntegrationsSettingsOpts) => unknown;
}

function available(deps: IntegrationsSettingsRegistrarDeps): boolean {
  return (
    deps.env.OK_RECLAIM_DISABLE !== '1' &&
    deps.platform === 'darwin' &&
    (deps.app.isPackaged || deps.env.OK_M6B_FORCE === '1') &&
    /\.app\/Contents\/MacOS\/[^/]+$/.test(deps.app.getPath('exe'))
  );
}

function tildifyHomePath(homeDir: () => string, path: string): string {
  const home = homeDir();
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

/** Register the user-global Settings → AI tools surface. */
export function registerIntegrationsSettingsIpc(deps: IntegrationsSettingsRegistrarDeps): void {
  const logger = deps.getLogger('integrations-settings');
  const registerGlobal = deps.registerGlobal ?? registerIntegrationsSettingsImpl;

  registerGlobal({
    home: deps.homeDir(),
    available: available(deps),
    ipcMain: deps.ipcMain,
    cli: {
      // Project-scope editors (Pi) have no user-global config to manage.
      allEditorIds: ALL_EDITOR_IDS.filter((id) => EDITOR_TARGETS[id].scope === 'global'),
      editorLabel: (id) => EDITOR_TARGETS[id].label,
      detectInstalledEditors: (cwd, home) => detectInstalledEditors(cwd, home),
      classifyExistingMcpEntry: (id, home) =>
        classifyExistingMcpEntry(EDITOR_TARGETS[id], '', home),
      isOwnEntry: (entry) => isEntryUpToDate(entry) || isOwnManagedEntry(entry),
      editorConfigPath: (id) => {
        try {
          return tildifyHomePath(deps.homeDir, EDITOR_TARGETS[id].configPath('', deps.homeDir()));
        } catch {
          return null;
        }
      },
      editorEntryLocator: (id) => {
        const target = EDITOR_TARGETS[id];
        const server = target.serverName('');
        return target.format === 'toml'
          ? `[${target.topLevelKey}.${server}]`
          : [target.topLevelKey, target.serverMapSubKey, server].filter(Boolean).join('.');
      },
      writeUserMcpConfigs: (opts) => writeUserMcpConfigs(opts),
      removeUserMcpEntry: (id) => removeOwnMcpEntry(EDITOR_TARGETS[id], '', deps.homeDir()),
    },
    path: {
      computeStatus: () => {
        const descriptor = computePathInstallDescriptor({
          home: deps.homeDir(),
          env: deps.env,
          logger: deps.pathInstallLogger,
        });
        return {
          shellDetected: descriptor.shellDetected,
          rcFilesToTouch: descriptor.rcFilesToTouch,
          installed: isPathShimInstalled({
            home: deps.homeDir(),
            env: deps.env,
            logger: deps.pathInstallLogger,
          }),
        };
      },
      install: async () => {
        const result = await ensureCliOnPath({
          ...deps.buildEnsureCliOnPathOpts(),
          consentDecision: { status: 'granted', at: new Date().toISOString() },
        });
        if (result.status === 'failed-all') return { ok: false as const, error: result.error };
        if (result.status === 'skipped') {
          return {
            ok: false as const,
            error: `PATH setup is unavailable in this build (${result.reason}).`,
          };
        }
        return { ok: true as const };
      },
      uninstall: async () => {
        const result = removePathShimFromRcFiles({
          home: deps.homeDir(),
          env: deps.env,
          logger: deps.pathInstallLogger,
        });
        if (result.status === 'failed') return { ok: false as const, error: result.error };
        return { ok: true as const };
      },
    },
    skills: {
      computeStatuses: () =>
        USER_GLOBAL_BUNDLE_IDS.map((id) => {
          const home = deps.homeDir();
          const name = BUNDLE_SKILL_NAME[id];
          return {
            id,
            name,
            installed: existsSync(join(home, '.agents', 'skills', name)),
            paths: [
              `~/.agents/skills/${name}`,
              ...HOSTS_WITH_USER_SKILL_DIR.filter((host) =>
                existsSync(join(home, host.hostDir)),
              ).map((host) => `~/${host.hostDir}/skills/${name}`),
            ],
          };
        }),
      setEnabled: async (bundleId, enabled) => {
        const home = deps.homeDir();
        const id = USER_GLOBAL_BUNDLE_IDS.find((candidate) => candidate === bundleId);
        if (!id) return { ok: false as const, error: 'Unknown skill.' };
        const name = BUNDLE_SKILL_NAME[id];
        try {
          await writeBundleDecision(home, name, enabled);
        } catch (error) {
          return {
            ok: false as const,
            error: `Couldn't save your preference for ${name}: ${formatUnknownError(error)}`,
          };
        }
        if (!enabled) {
          try {
            removeUserGlobalSkillBundle(home, id);
          } catch (error) {
            return { ok: false as const, error: formatUnknownError(error) };
          }
          return { ok: true as const };
        }
        try {
          const result = await reclaimUserSkillsOnLaunch(deps.buildReclaimUserSkillsOpts());
          if (result.status === 'skipped') {
            return { ok: false as const, error: `Couldn't install ${name} (${result.reason}).` };
          }
        } catch (error) {
          return { ok: false as const, error: formatUnknownError(error) };
        }
        return existsSync(join(home, '.agents', 'skills', name))
          ? { ok: true as const }
          : { ok: false as const, error: `Couldn't install ${name}.` };
      },
    },
    logger: {
      warn: (message, context) => logger.warn((context ?? {}) as Record<string, unknown>, message),
      error: (message, context) =>
        logger.error((context ?? {}) as Record<string, unknown>, message),
      event: (payload) => logger.info(payload, payload.event),
    },
  });
}

/** Register the sender-scoped Settings → This project → AI tools surface. */
export function registerProjectIntegrationsSettingsIpc(
  deps: IntegrationsSettingsRegistrarDeps,
): void {
  const logger = deps.getLogger('project-integrations-settings');
  const registerProject = deps.registerProject ?? registerProjectIntegrationsSettingsImpl;
  const canonicalSkillTarget = EDITOR_TARGETS.claude;
  const projectInstallOpts: McpInstallOptions = { mode: 'published', skipAvailabilityCheck: true };

  registerProject({
    available: available(deps),
    ipcMain: deps.ipcMain,
    cli: {
      allEditorIds: ALL_EDITOR_IDS,
      editorLabel: (id) => EDITOR_TARGETS[id].label,
      projectConfigPath: (id, projectDir) =>
        EDITOR_TARGETS[id].projectConfigPath?.(projectDir) ?? null,
      projectSkillPath: (id, projectDir) =>
        EDITOR_TARGETS[id].projectSkillPath?.(projectDir) ?? null,
      entryLocator: (id) => {
        const target = EDITOR_TARGETS[id];
        if (target.format === 'file') return 'synapsenote (managed extension file)';
        const server = target.serverName('');
        return target.format === 'toml'
          ? `[${target.topLevelKey}.${server}]`
          : [target.topLevelKey, target.serverMapSubKey, server].filter(Boolean).join('.');
      },
      classifyExistingProjectMcpConfig: (id, projectDir, projectPath) =>
        classifyExistingMcpEntry(EDITOR_TARGETS[id], projectDir, undefined, projectPath),
      isOwnEntry: (entry) => isEntryUpToDate(entry) || isOwnManagedEntry(entry),
      writeProjectMcpConfig: ({ id, projectDir, projectPath }) => {
        const result = writeEditorMcpConfig(
          EDITOR_TARGETS[id],
          projectDir,
          projectInstallOpts,
          undefined,
          projectPath,
        );
        if (result.action === 'written' || result.action === 'overwritten') {
          return { action: result.action };
        }
        if (result.action === 'declined') {
          return { action: 'declined', reason: result.declineReason };
        }
        return { action: 'failed', error: result.error };
      },
      removeProjectMcpEntry: (id, projectDir, projectPath) =>
        removeOwnMcpEntry(EDITOR_TARGETS[id], projectDir, undefined, projectPath),
      isProjectSkillInstalled: (projectDir) => {
        const skillPath = canonicalSkillTarget.projectSkillPath?.(projectDir);
        return skillPath !== undefined && existsSync(skillPath);
      },
      writeProjectSkill: (id, projectDir) => {
        const result = writeProjectSkill(EDITOR_TARGETS[id], projectDir);
        return { action: result.action, ...(result.error ? { error: result.error } : {}) };
      },
      removeProjectSkill: (id, projectDir) => {
        const result = removeProjectSkill(EDITOR_TARGETS[id], projectDir);
        return { action: result.action, ...(result.error ? { error: result.error } : {}) };
      },
    },
    resolveProjectDir: (event: IpcMainInvokeEvent) => {
      const window = deps.getWindowForWebContents(event.sender);
      return window ? (deps.getProjectPath(window) ?? null) : null;
    },
    tildify: (path) => tildifyHomePath(deps.homeDir, path),
    logger: {
      warn: (message, context) => logger.warn((context ?? {}) as Record<string, unknown>, message),
      event: (payload) => logger.info(payload, payload.event),
    },
  });
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
