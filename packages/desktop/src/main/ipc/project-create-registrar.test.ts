import { describe, expect, test } from 'bun:test';
import { registerProjectCreateIpcHandlers } from './project-create-registrar.ts';

describe('registerProjectCreateIpcHandlers', () => {
  test('admits a git root only after main has surfaced it before deletion', async () => {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
    const removedWith: ReadonlySet<string>[] = [];

    registerProjectCreateIpcHandlers({
      handle: (channel, handler) => handlers.set(channel, handler),
      getAppState: () => ({ lastUsedProjectParent: null }) as never,
      setAppState: () => {},
      saveAppState: () => {},
      getDocumentsPath: () => '/documents',
      resolveDefaultProjectsRoot: () => '/documents/SynapseNote',
      folderState: () => 'free',
      findEnclosingProjectRoot: () => null,
      findEnclosingGitRoot: (path) => (path === '/candidate' ? { gitRoot: '/repo' } : null),
      stopWorktreeServer: () => {},
      removeGitFolder: async (gitRoot, allowedGitRoots) => {
        if (typeof gitRoot !== 'string' || !allowedGitRoots.has(gitRoot)) {
          throw new Error('not surfaced by a recent probe');
        }
        removedWith.push(allowedGitRoots);
      },
      runCreateNew: async () => {
        throw new Error('unused');
      },
      isCreateNewProjectError: () => false,
      logAiIntegrationOutcomes: () => 0,
      setLastUsedProjectParent: (state) => state,
      recordOnboardingFlow: () => {},
      logCreatedProject: () => {},
      openProject: async () => {},
      recordCreateNewBannerShown: () => {},
      openNavigator: () => {},
      logIpcError: () => {},
    });

    await expect(handlers.get('ok:fs:remove-git-folder')?.({}, '/repo')).rejects.toThrow(
      'not surfaced by a recent probe',
    );
    await handlers.get('ok:fs:find-enclosing-git-root')?.({}, '/candidate');
    await handlers.get('ok:fs:remove-git-folder')?.({}, '/repo');

    expect(removedWith).toHaveLength(1);
    expect(removedWith[0]?.has('/repo')).toBe(true);
  });
});
