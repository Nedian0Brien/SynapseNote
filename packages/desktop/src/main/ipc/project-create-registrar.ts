/** Create-project dialog IPC with a bounded main-owned git-root admission set. */

import type { ProjectAiIntegrationsResult } from '@nedian0brien/synapsenote';
import type { FindEnclosingGitRootResult } from '@nedian0brien/synapsenote-server';
import type { createHandler } from '../../shared/ipc-handler.ts';
import type {
  CreateNewProjectError,
  folderState as folderStateImpl,
  runCreateNew as runCreateNewImpl,
} from '../create-new-project.ts';
import type { recordOnboardingFlow as recordOnboardingFlowImpl } from '../onboarding-telemetry.ts';
import type { AppState } from '../state-store.ts';

type IpcHandle = ReturnType<typeof createHandler>;
type CreateNewResult = Awaited<ReturnType<typeof runCreateNewImpl>>;

const RECENT_GIT_ROOTS_CAP = 256;

export interface ProjectCreateRegistrarDeps {
  readonly handle: IpcHandle;
  readonly getAppState: () => AppState;
  readonly setAppState: (state: AppState) => void;
  readonly saveAppState: (state: AppState) => void;
  readonly getDocumentsPath: () => string;
  readonly resolveDefaultProjectsRoot: (lastUsedParent: string | null, documents: string) => string;
  readonly folderState: typeof folderStateImpl;
  readonly findEnclosingProjectRoot: (path: string) => unknown;
  readonly findEnclosingGitRoot: (path: string) => FindEnclosingGitRootResult | null;
  /** Best-effort stop for a just-admitted root; never broadens deletion admission. */
  readonly stopWorktreeServer: (gitRoot: string) => void;
  readonly removeGitFolder: (
    gitRoot: unknown,
    allowedGitRoots: ReadonlySet<string>,
  ) => Promise<void>;
  readonly runCreateNew: (args: {
    parent: string;
    name: string;
    editors: readonly string[];
    sharing?: 'shared' | 'local-only';
    packId?: string;
  }) => Promise<CreateNewResult>;
  readonly isCreateNewProjectError: (error: unknown) => error is CreateNewProjectError;
  readonly logAiIntegrationOutcomes: (result: ProjectAiIntegrationsResult) => number;
  readonly setLastUsedProjectParent: (state: AppState, parent: string) => AppState;
  readonly recordOnboardingFlow: typeof recordOnboardingFlowImpl;
  readonly logCreatedProject: (result: CreateNewResult) => void;
  readonly openProject: (path: string, entryPoint: 'create-new') => Promise<void>;
  readonly recordCreateNewBannerShown: (banner: 'nested' | 'nonempty' | 'git-confirm') => void;
  readonly openNavigator: () => void;
  readonly logIpcError: (payload: {
    event: 'ipc.error';
    channel: string;
    reason: string;
    handler: string;
    cause?: unknown;
  }) => void;
}

/**
 * Registers the create-project cascade. `recentGitRoots` is intentionally
 * process-local and populated only by a main-owned probe result, so the
 * destructive handler cannot be turned into a general directory remover.
 */
export function registerProjectCreateIpcHandlers(deps: ProjectCreateRegistrarDeps): void {
  const { handle } = deps;
  const recentGitRoots = new Set<string>();
  const recordRecentGitRoot = (gitRoot: string): void => {
    if (recentGitRoots.has(gitRoot)) recentGitRoots.delete(gitRoot);
    recentGitRoots.add(gitRoot);
    while (recentGitRoots.size > RECENT_GIT_ROOTS_CAP) {
      const oldest = recentGitRoots.values().next().value;
      if (oldest === undefined) break;
      recentGitRoots.delete(oldest);
    }
  };

  handle('ok:fs:default-projects-root', async () =>
    deps.resolveDefaultProjectsRoot(
      deps.getAppState().lastUsedProjectParent,
      deps.getDocumentsPath(),
    ),
  );

  handle('ok:fs:folder-state', async (_event, path) => {
    if (typeof path !== 'string' || path.length === 0) {
      throw new Error('ok:fs:folder-state rejected: path must be a non-empty string');
    }
    return deps.folderState(path);
  });

  handle('ok:fs:find-enclosing-project-root', async (_event, path) => {
    if (typeof path !== 'string' || path.length === 0) {
      throw new Error(
        'ok:fs:find-enclosing-project-root rejected: path must be a non-empty string',
      );
    }
    return deps.findEnclosingProjectRoot(path) as never;
  });

  handle('ok:fs:find-enclosing-git-root', async (_event, path) => {
    if (typeof path !== 'string' || path.length === 0) {
      throw new Error('ok:fs:find-enclosing-git-root rejected: path must be a non-empty string');
    }
    const result = deps.findEnclosingGitRoot(path);
    if (result !== null) recordRecentGitRoot(result.gitRoot);
    return result;
  });

  handle('ok:fs:remove-git-folder', async (_event, gitRoot) => {
    if (typeof gitRoot === 'string' && recentGitRoots.has(gitRoot)) {
      deps.stopWorktreeServer(gitRoot);
    }
    await deps.removeGitFolder(gitRoot, recentGitRoots);
    return undefined;
  });

  handle('ok:project:create-new', async (_event, args) => {
    let result: CreateNewResult;
    try {
      result = await deps.runCreateNew({
        parent: args.parent,
        name: args.name,
        editors: args.editors,
        sharing: args.sharing,
        packId: args.packId,
      });
    } catch (cause) {
      deps.logIpcError({
        event: 'ipc.error',
        channel: 'ok:project:create-new',
        reason: deps.isCreateNewProjectError(cause) ? cause.reason : 'unexpected',
        handler: 'runCreateNew',
        cause: deps.isCreateNewProjectError(cause) ? { message: cause.message } : cause,
      });
      throw cause;
    }

    const aiFailedCount = deps.logAiIntegrationOutcomes(result.aiIntegrations);
    const state = deps.setLastUsedProjectParent(deps.getAppState(), args.parent);
    deps.setAppState(state);
    deps.saveAppState(state);
    deps.recordOnboardingFlow({
      flowKind: result.variant,
      entryPoint: 'create-new',
      gitInitRequested: !result.gitRootPromoted,
      contentDirChanged: false,
      warningsCount: 0,
      failedCount: aiFailedCount,
    });
    deps.logCreatedProject(result);
    await deps.openProject(result.projectDir, 'create-new');
    return undefined;
  });

  handle('ok:project:record-create-new-banner-shown', async (_event, banner) => {
    if (banner !== 'nested' && banner !== 'nonempty' && banner !== 'git-confirm') {
      throw new Error(
        `ok:project:record-create-new-banner-shown rejected: unknown banner ${JSON.stringify(banner)}`,
      );
    }
    deps.recordCreateNewBannerShown(banner);
    return undefined;
  });

  handle('ok:navigator:open', async () => {
    deps.openNavigator();
    return undefined;
  });
}
