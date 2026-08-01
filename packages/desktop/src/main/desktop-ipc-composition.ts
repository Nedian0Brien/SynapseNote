/**
 * Composes the static main-process request IPC surface.
 *
 * `index.ts` retains process lifetime and mutable application state. This
 * module owns only registration order, duplicate detection, and the narrow
 * bindings each trust-boundary registrar needs.
 */

import type { TerminalCli } from '@nedian0brien/synapsenote-core';
import { ipcMain } from 'electron';
import type { ClaudeReadiness, CliReadiness } from '../shared/bridge-contract.ts';
import { createHandler } from '../shared/ipc-handler.ts';
import type { KeyringSmokeResult } from '../utility/server-entry.ts';
import { registerDesktopAppStateIpc } from './desktop-app-state-ipc.ts';
import { registerDesktopAssetIpc } from './desktop-asset-ipc.ts';
import { registerDesktopIntegrationsIpc } from './desktop-integrations-ipc.ts';
import { registerDesktopLocalOpsIpc } from './desktop-local-ops-ipc.ts';
import { registerDesktopProjectIpc } from './desktop-project-ipc.ts';
import { registerDesktopTerminalIpc } from './desktop-terminal-ipc.ts';
import { registerBugReportIpc } from './ipc/bug-report-registrar.ts';
import { registerNativeShellIpc } from './ipc/native-shell-registrar.ts';
import type { ProjectRegistrarDeps } from './ipc/project-registrar.ts';
import { registerDesktopIpcRegistrars } from './ipc/registrar-registry.ts';
import { registerSeedIpc } from './ipc/seed-registrar.ts';
import { registerSharingIpc } from './ipc/sharing-registrar.ts';
import { registerStateDebugIpc } from './ipc/state-debug-registrar.ts';
import type { computePathInstallDescriptor, ensureCliOnPath } from './path-install.ts';
import type { reclaimUserSkillsOnLaunch } from './skill-reclaim.ts';

export type DesktopIpcHandler = ReturnType<typeof createHandler>;

/**
 * The main entrypoint supplies live state through accessors so registrars do
 * not acquire process-wide state or renderer-owned singletons themselves.
 */
export interface DesktopIpcBindings {
  readonly getWindowManager: () => import('./window-manager.ts').WindowManager | null;
  readonly getAppState: () => import('./state-store.ts').AppState;
  readonly setAppState: (state: import('./state-store.ts').AppState) => void;
  readonly refreshApplicationMenu: () => void;
  readonly activeTargetChanged: (
    target: import('../shared/ipc-channels.ts').RequestChannels['ok:editor:active-target-changed']['args'][0],
  ) => void;
  readonly viewMenuStateChanged: (
    event: Electron.IpcMainInvokeEvent,
    state: import('../shared/ipc-channels.ts').RequestChannels['ok:editor:view-menu-state-changed']['args'][0],
  ) => void;
  readonly setThemeSource: (
    source: import('../shared/ipc-channels.ts').RequestChannels['ok:theme:set-source']['args'][0]['source'],
  ) => { ok: true };
  readonly themeApplied: (
    event: Electron.IpcMainInvokeEvent,
    options: import('../shared/ipc-channels.ts').RequestChannels['ok:theme:applied']['args'][0],
  ) => void;
  readonly ingestRendererStartupMarks: (
    marks: import('../shared/ipc-channels.ts').RequestChannels['ok:startup:renderer-marks']['args'][0],
  ) => void;
  readonly rewireClaudeMcp: (event: Electron.IpcMainInvokeEvent) => Promise<string | undefined>;
  readonly isProjectClaudeMcpOwn: (projectRoot: string | undefined) => boolean;
  readonly resolveClaudeReadiness: (projectRoot: string | undefined) => Promise<ClaudeReadiness>;
  readonly resolveCliOnPath: (cli: TerminalCli) => Promise<CliReadiness>;
  readonly resolveCliInstalledMap: () => Promise<Record<TerminalCli, boolean>>;
  readonly getDockVisible: (windowId: number) => boolean;
  readonly setTerminalReaper: (reaper: import('./terminal-lifecycle.ts').TerminalReaper) => void;
  readonly openProject: ProjectRegistrarDeps['openProject'];
  readonly openNavigator: () => void;
  readonly logAiIntegrationOutcomes: (
    result: import('@nedian0brien/synapsenote').ProjectAiIntegrationsResult,
  ) => number;
  readonly getPendingSchemaIncompatibility: () =>
    | import('./state-store.ts').SchemaIncompatibilityDiagnostic
    | null;
  readonly clearPendingSchemaIncompatibility: () => void;
  readonly saveAppState: (state: import('./state-store.ts').AppState) => boolean;
  readonly getBuildChannel: () => import('./state-store.ts').UpdateChannel;
  readonly requestKeyringSmoke: (sender: Electron.WebContents) => Promise<KeyringSmokeResult>;
  readonly resolveLocalOpCliArgs: () => string[];
  readonly getCrashDetection: () => import('./crash-detection.ts').CrashDetection | null;
  readonly pathInstallLogger: Parameters<typeof computePathInstallDescriptor>[0]['logger'];
  readonly buildEnsureCliOnPathOpts: () => Parameters<typeof ensureCliOnPath>[0];
  readonly buildReclaimUserSkillsOpts: () => Parameters<typeof reclaimUserSkillsOnLaunch>[0];
}

export function registerDesktopIpcHandlers(bindings: DesktopIpcBindings): void {
  const rawHandle = createHandler(ipcMain);
  const registeredStaticChannels = new Set<string>();
  const handle: DesktopIpcHandler = (channel, handler, validation) => {
    if (registeredStaticChannels.has(channel)) {
      throw new Error(`duplicate desktop IPC handler registration: ${channel}`);
    }
    registeredStaticChannels.add(channel);
    rawHandle(channel, handler, validation);
  };

  registerDesktopTerminalIpc({ handle, bindings });
  registerDesktopAssetIpc({ handle, bindings });
  registerNativeShellIpc({ handle, bindings });
  registerDesktopAppStateIpc({ handle, bindings });
  registerStateDebugIpc({ handle, bindings });
  registerDesktopProjectIpc({ handle, bindings });
  registerSharingIpc({ handle, bindings });
  registerBugReportIpc({ handle, bindings });
  registerDesktopLocalOpsIpc({ handle, bindings });
  registerSeedIpc({ handle, bindings });
  registerDesktopIntegrationsIpc({ handle, bindings });

  const expectedStaticChannels = new Set<string>();
  registerDesktopIpcRegistrars((channel) => {
    expectedStaticChannels.add(channel);
    if (!registeredStaticChannels.has(channel)) {
      throw new Error(`desktop IPC registrar did not install ${channel}`);
    }
  });
  for (const channel of registeredStaticChannels) {
    if (!expectedStaticChannels.has(channel)) {
      throw new Error(`desktop IPC handler has no static registrar owner: ${channel}`);
    }
  }
}
