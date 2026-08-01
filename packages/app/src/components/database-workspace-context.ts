/* biome-ignore-all lint/suspicious/noExplicitAny: the remaining controller context is removed after the five command contracts are migrated. */
import type { useDatabaseWorkspaceController } from './use-database-workspace-controller-runtime';

/**
 * Render context shared by workspace presentation slices.
 *
 * The runtime owns the controller and supplies this immutable snapshot to
 * header/content/overlay components. Keeping this contract separate avoids
 * importing the runtime from a presentation module and makes the dependency
 * direction explicit while the controller is being split into domains.
 */
export type DatabaseWorkspaceRenderContext = ReturnType<
  typeof useDatabaseWorkspaceController
>['workspaceRenderContext'];

/** Internal command dependency bag used while the command contracts are migrated. */
export type DatabaseWorkspaceControllerContext = Record<string, any>;

export type DatabaseWorkspaceSuccessContext = DatabaseWorkspaceRenderContext & {
  description: NonNullable<DatabaseWorkspaceRenderContext['description']> & {
    source: NonNullable<NonNullable<DatabaseWorkspaceRenderContext['description']>['source']>;
  };
};

export type DatabaseWorkspaceResultContext = DatabaseWorkspaceSuccessContext & {
  result: NonNullable<DatabaseWorkspaceRenderContext['result']>;
};

export function isDatabaseWorkspaceSuccessContext(
  context: DatabaseWorkspaceRenderContext,
): context is DatabaseWorkspaceSuccessContext {
  const supportsDescriptionOnlyRendering =
    context.selectedView?.layout.type === 'form' ||
    context.selectedView?.layout.type === 'dashboard';
  return Boolean(
    context.tableStatus === 'success' &&
      context.description?.source &&
      (context.result || supportsDescriptionOnlyRendering),
  );
}

export function isDatabaseWorkspaceResultContext(
  context: DatabaseWorkspaceSuccessContext,
): context is DatabaseWorkspaceResultContext {
  return context.result !== null;
}
