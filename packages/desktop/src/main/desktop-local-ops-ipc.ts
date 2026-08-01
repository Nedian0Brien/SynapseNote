/** Navigator-owned authentication and clone IPC capability construction. */
import { app, shell } from 'electron';
import type { DesktopIpcBindings, DesktopIpcHandler } from './desktop-ipc-composition.ts';
import { registerBugLocalOpsIpc } from './ipc/bug-local-ops-registrar.ts';

interface DesktopLocalOpsIpcDeps {
  readonly handle: DesktopIpcHandler;
  readonly bindings: DesktopIpcBindings;
}

export function registerDesktopLocalOpsIpc({ handle, bindings }: DesktopLocalOpsIpcDeps): void {
  registerBugLocalOpsIpc({ handle, app, shell, resolveCliArgs: bindings.resolveLocalOpCliArgs });
}
