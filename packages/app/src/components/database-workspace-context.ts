/* biome-ignore-all lint/suspicious/noExplicitAny: the controller command bag is still an untyped dependency bag during the workspace split. */

import type { useDatabaseWorkspaceController } from './use-database-workspace-controller-runtime';

/**
 * Render context shared by workspace presentation slices.
 *
 * The runtime owns the controller and supplies this immutable snapshot to
 * header/content/overlay components. The contract is derived from the
 * controller's own `workspaceRenderContext` literal so it cannot drift from its
 * producer — adding a key to the runtime publishes it to every presentation
 * slice, and removing one fails the consumers that still destructure it.
 *
 * The dependency direction this file documents is preserved: `import type` is
 * erased at compile time, so a presentation module still takes no runtime
 * import on the controller runtime and the bundle is unchanged.
 */
export type DatabaseWorkspaceRenderContext = ReturnType<
  typeof useDatabaseWorkspaceController
>['workspaceRenderContext'];

/** Internal command dependency bag used only during the controller split. */
export type DatabaseWorkspaceControllerContext = Record<string, any>;
