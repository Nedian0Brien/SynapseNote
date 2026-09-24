/**
 * Main-process boot orchestration. Electron and process state stay in the
 * entrypoint; this module only preserves the ordering contract between the
 * synchronous setup, the ready sequence, and shutdown listeners.
 */

export interface BootCompositionDeps<ProtocolControl> {
  logBoot: () => void;
  installPreReady: () => void;
  registerProtocol: () => ProtocolControl;
  whenReady: () => Promise<void>;
  runReady: (protocol: ProtocolControl) => Promise<void>;
  installLifecycle: () => void;
  reportReadyFailure: (error: unknown) => void;
}

export function bootPrimaryInstance<ProtocolControl>(
  deps: BootCompositionDeps<ProtocolControl>,
): void {
  deps.logBoot();
  deps.installPreReady();
  const protocol = deps.registerProtocol();
  deps
    .whenReady()
    .then(() => deps.runReady(protocol))
    .catch(deps.reportReadyFailure);
  deps.installLifecycle();
}
