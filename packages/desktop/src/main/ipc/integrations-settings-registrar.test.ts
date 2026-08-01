import { describe, expect, test } from 'bun:test';
import type { RegisterIntegrationsSettingsOpts } from '../integrations-settings.ts';
import type { RegisterProjectIntegrationsSettingsOpts } from '../project-integrations-settings.ts';
import {
  type IntegrationsSettingsRegistrarDeps,
  registerIntegrationsSettingsIpc,
  registerProjectIntegrationsSettingsIpc,
} from './integrations-settings-registrar.ts';

function makeDeps(): IntegrationsSettingsRegistrarDeps & {
  globalOptions: RegisterIntegrationsSettingsOpts | undefined;
  projectOptions: RegisterProjectIntegrationsSettingsOpts | undefined;
  resolvedSender: unknown;
  resolvedWindow: unknown;
} {
  let globalOptions: RegisterIntegrationsSettingsOpts | undefined;
  let projectOptions: RegisterProjectIntegrationsSettingsOpts | undefined;
  const resolvedWindow = { id: 7 };
  let resolvedSender: unknown;

  return {
    resolvedWindow,
    app: {
      isPackaged: true,
      getPath: () => '/Applications/SynapseNote.app/Contents/MacOS/SynapseNote',
    },
    ipcMain: { handle: () => {}, removeHandler: () => {} },
    platform: 'darwin',
    env: {},
    homeDir: () => '/test-home',
    getLogger: () => ({ warn: () => {}, error: () => {}, info: () => {}, debug: () => {} }),
    pathInstallLogger: { event: () => {} },
    buildEnsureCliOnPathOpts: () => ({}) as never,
    buildReclaimUserSkillsOpts: () => ({}) as never,
    getWindowForWebContents: (sender) => {
      resolvedSender = sender;
      return resolvedWindow as never;
    },
    getProjectPath: (window) => (window === resolvedWindow ? '/project-from-window' : undefined),
    registerGlobal: (options) => {
      globalOptions = options;
    },
    registerProject: (options) => {
      projectOptions = options;
    },
    get globalOptions() {
      return globalOptions;
    },
    get projectOptions() {
      return projectOptions;
    },
    get resolvedSender() {
      return resolvedSender;
    },
  };
}

describe('integrations settings IPC registrar', () => {
  test('uses the desktop availability gate for global settings', () => {
    const deps = makeDeps();

    registerIntegrationsSettingsIpc(deps);

    expect(deps.globalOptions?.available).toBe(true);
    expect(deps.globalOptions?.home).toBe('/test-home');
    expect(deps.globalOptions?.cli.allEditorIds).not.toContain('pi');
  });

  test('resolves project settings from the requesting sender window', () => {
    const deps = makeDeps();
    const sender = { id: 42 };

    registerProjectIntegrationsSettingsIpc(deps);

    expect(deps.projectOptions?.resolveProjectDir({ sender } as never)).toBe(
      '/project-from-window',
    );
    expect(deps.resolvedSender).toBe(sender);
  });
});
