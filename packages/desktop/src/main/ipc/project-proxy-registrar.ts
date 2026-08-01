/** Validation and registration for project-path proxy IPC. */

import type { ProjectRegistrarDeps } from './project-registrar.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasStringFields(
  value: unknown,
  fields: readonly string[],
): value is Record<string, unknown> {
  return isRecord(value) && fields.every((field) => typeof value[field] === 'string');
}

export function registerProjectProxyIpcHandlers(deps: ProjectRegistrarDeps): void {
  const { handle } = deps;
  handle('ok:share:validate-folder', async (_event, request) =>
    !hasStringFields(request, ['folderPath', 'owner', 'repo'])
      ? ({ kind: 'not-git' } as const)
      : (deps.validateLocalFolderForShare(request.folderPath, {
          owner: request.owner,
          repo: request.repo,
        }) as never),
  );
  handle('ok:project:check-target-exists', async (_event, request) =>
    hasStringFields(request, ['projectPath', 'path']) &&
    (request.kind === 'doc' || request.kind === 'folder')
      ? deps.checkTargetExists(request.projectPath, request.kind, request.path)
      : 'unreadable',
  );
  handle(
    'ok:project:read-head-branch',
    async (_event, projectPath) =>
      (typeof projectPath === 'string'
        ? deps.readHeadBranch(projectPath)
        : { branch: null, detached: false }) as never,
  );
  handle(
    'ok:project:fetch-branch-info',
    async (_event, request) =>
      (hasStringFields(request, ['projectPath', 'branch', 'path']) &&
      (request.kind === 'doc' || request.kind === 'folder')
        ? deps.proxyFetchBranchInfo(request as never, deps.branchInfoProxyDeps)
        : null) as never,
  );
  handle(
    'ok:project:run-checkout',
    async (_event, request) =>
      (hasStringFields(request, ['projectPath', 'branch'])
        ? deps.proxyRunCheckout(request as never, deps.branchInfoProxyDeps)
        : null) as never,
  );
  handle(
    'ok:project:fetch-target-status',
    async (_event, request) =>
      (hasStringFields(request, ['projectPath', 'branch', 'path']) &&
      (request.kind === 'doc' || request.kind === 'folder')
        ? deps.proxyShareTargetStatus(request as never, deps.branchInfoProxyDeps)
        : null) as never,
  );
  handle(
    'ok:project:await-branch-switched',
    async (_event, request) =>
      (hasStringFields(request, ['projectPath', 'branch']) && typeof request.timeoutMs === 'number'
        ? deps.proxyAwaitBranchSwitched(request as never, deps.branchInfoProxyDeps)
        : { ok: false, reason: 'timeout' }) as never,
  );
  handle(
    'ok:project:ok-init',
    async (_event, request) =>
      (hasStringFields(request, ['projectPath'])
        ? deps.runOkInit(request.projectPath)
        : { ok: false, reason: 'unknown', message: 'invalid project request' }) as never,
  );
}
