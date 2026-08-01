/** Main-owned project, worktree, and create-project IPC capability construction. */
import { realpathSync } from 'node:fs';
import { runStop, validateLocalFolderForShare } from '@nedian0brien/synapsenote';
import {
  findEnclosingGitRoot,
  findEnclosingProjectRoot,
  isProcessAlive,
  readServerLock,
  resolveLockDir,
} from '@nedian0brien/synapsenote-server';
import { app, BrowserWindow } from 'electron';
import { isEntryPoint } from '../shared/entry-point.ts';
import { sendToRenderer } from '../shared/ipc-send.ts';
import {
  type BranchInfoProxyDeps,
  proxyAwaitBranchSwitched,
  proxyFetchBranchInfo,
  proxyRunCheckout,
  proxyShareTargetStatus,
} from './branch-info-proxy.ts';
import { checkTargetExists } from './check-target-exists.ts';
import {
  CreateNewProjectError,
  folderState,
  resolveDefaultProjectsRoot,
  runCreateNew,
} from './create-new-project.ts';
import type { DesktopIpcBindings, DesktopIpcHandler } from './desktop-ipc-composition.ts';
import { getLogger } from './desktop-logger.ts';
import { registerProjectCreateIpcHandlers } from './ipc/project-create-registrar.ts';
import { registerProjectIpcHandlers } from './ipc/project-registrar.ts';
import { logIpcError } from './ipc-log.ts';
import { runOkInit } from './ok-init.ts';
import { recordCreateNewBannerShown, recordOnboardingFlow } from './onboarding-telemetry.ts';
import { readHeadBranch } from './read-head-branch.ts';
import { removeGitFolder } from './remove-git-folder.ts';
import {
  annotateMissing,
  getProjectSessionState,
  removeRecentProject,
  setLastUsedProjectParent,
  setProjectSessionState,
} from './state-store.ts';
import type { BrowserWindowLike } from './window-manager.ts';
import { classifyRecentGitAsync, readWorktreeBranchAsync } from './worktree-recents.ts';
import {
  checkoutShareBranchWorktree,
  createWorktree,
  listWorktreeSelector,
} from './worktree-service.ts';

interface DesktopProjectIpcDeps {
  readonly handle: DesktopIpcHandler;
  readonly bindings: DesktopIpcBindings;
}

export function registerDesktopProjectIpc({ handle, bindings }: DesktopProjectIpcDeps): void {
  const getWindowForWebContents = (sender: unknown) =>
    BrowserWindow.fromWebContents(sender as Electron.WebContents) ?? undefined;
  const getProjectContext = (window: BrowserWindowLike | undefined) =>
    window ? bindings.getWindowManager()?.getContextForBrowserWindow(window) : undefined;
  const branchInfoProxyDeps: BranchInfoProxyDeps = {
    readServerLock: (lockDir) => readServerLock(lockDir),
    isProcessAlive,
    fetch: globalThis.fetch,
    log: { warn: (message, metadata) => console.warn(message, metadata ?? {}) },
  };
  registerProjectIpcHandlers({
    handle,
    getWindowForWebContents,
    getProjectContext,
    getE2eSmoke: () => process.env.OK_DESKTOP_E2E_SMOKE === '1',
    getAppState: bindings.getAppState,
    setAppState: bindings.setAppState,
    saveAppState: bindings.saveAppState,
    refreshApplicationMenu: bindings.refreshApplicationMenu,
    annotateMissing,
    classifyRecentGit: classifyRecentGitAsync,
    readWorktreeBranch: readWorktreeBranchAsync,
    removeRecentProject,
    getProjectSessionState,
    setProjectSessionState,
    isEntryPoint,
    openProject: bindings.openProject,
    focusWindowForProject: (path) =>
      bindings.getWindowManager()?.focusWindowForProject(path) ?? null,
    sendToRenderer,
    checkTargetExists,
    realpath: realpathSync,
    listWorktrees: listWorktreeSelector,
    checkoutWorktree: checkoutShareBranchWorktree,
    createWorktree,
    validateLocalFolderForShare,
    readHeadBranch,
    branchInfoProxyDeps,
    proxyFetchBranchInfo,
    proxyRunCheckout,
    proxyShareTargetStatus,
    proxyAwaitBranchSwitched,
    runOkInit,
    closeProjectWindow: (path) => bindings.getWindowManager()?.closeProjectWindow(path) ?? false,
    restartAttachedServer: (path, options) =>
      bindings.getWindowManager()?.restartAttachedServer(path, options) ??
      Promise.resolve({ ok: false, reason: 'other' as const }),
    resolveLocalOpCliArgs: bindings.resolveLocalOpCliArgs,
    logIpcError,
  });
  registerProjectCreateIpcHandlers({
    handle,
    getAppState: bindings.getAppState,
    setAppState: bindings.setAppState,
    saveAppState: bindings.saveAppState,
    getDocumentsPath: () => app.getPath('documents'),
    resolveDefaultProjectsRoot,
    folderState,
    findEnclosingProjectRoot,
    findEnclosingGitRoot,
    stopWorktreeServer: (gitRoot) => {
      try {
        const outcome = runStop({
          lockDir: resolveLockDir(gitRoot),
          log: (message: string) =>
            getLogger('project').info({ gitRoot }, `[remove-git-folder] ${message}`),
        });
        getLogger('project').info(
          { gitRoot, stopped: outcome.stopped.length, hadTargets: outcome.hadTargets },
          'remove-git-folder: stopped worktree server before .git removal',
        );
      } catch (error) {
        getLogger('project').warn(
          { gitRoot, err: error instanceof Error ? error.message : String(error) },
          'remove-git-folder: worktree server stop failed',
        );
      }
    },
    removeGitFolder: (gitRoot, allowedGitRoots) => removeGitFolder(gitRoot, { allowedGitRoots }),
    runCreateNew,
    isCreateNewProjectError: (error): error is CreateNewProjectError =>
      error instanceof CreateNewProjectError,
    logAiIntegrationOutcomes: bindings.logAiIntegrationOutcomes,
    setLastUsedProjectParent,
    recordOnboardingFlow,
    logCreatedProject: (result) =>
      getLogger('create-new').info(
        {
          projectDir: result.projectDir,
          target: result.target,
          variant: result.variant,
          gitRootPromoted: result.gitRootPromoted,
        },
        'created project',
      ),
    openProject: (path) => bindings.openProject(path, 'create-new'),
    recordCreateNewBannerShown,
    openNavigator: bindings.openNavigator,
    logIpcError,
  });
}
