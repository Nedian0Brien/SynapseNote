import { disposeDocumentPool } from './runtime-helpers';
import { resetPrincipalFetchWarning } from './useDocumentProviderState';

export function installDocumentContextHmr(): void {
  if (!import.meta.hot) return;
  import.meta.hot.dispose(() => {
    disposeDocumentPool();
    resetPrincipalFetchWarning();
    if (typeof window === 'undefined') return;
    for (const key of [
      '__providerPool',
      '__activeProvider',
      '__activeEditor',
      '__test_rejectSyncPromise',
      '__test_armPendingRejection',
      '__test_closeActiveWebSocket',
    ]) {
      try {
        delete (window as unknown as Record<string, unknown>)[key];
      } catch {
        // Dev-only cleanup tolerates non-configurable browser globals.
      }
    }
  });
}
