/* biome-ignore-all lint/suspicious/noExplicitAny: presentation and command contexts are intentionally transitional during the workspace split. */

/**
 * Render context shared by workspace presentation slices.
 *
 * The runtime owns the controller and supplies this immutable snapshot to
 * header/content/overlay components. Keeping this contract separate avoids
 * importing the runtime from a presentation module and makes the dependency
 * direction explicit while the controller is being split into domains.
 */
export type DatabaseWorkspaceRenderContext = Record<string, any>;

/** Internal command dependency bag used only during the controller split. */
export type DatabaseWorkspaceControllerContext = Record<string, any>;
