export const APP_NAVIGATION_REPLACED_EVENT = 'synapsenote:app-navigation-replaced';

export interface AppNavigationReplacedDetail {
  hash: string;
}

/**
 * `history.replaceState` does not emit `hashchange`. Notify app-level history
 * consumers when a navigation surface intentionally replaces the URL after it
 * has already opened the target directly.
 */
export function emitAppNavigationReplaced(hash: string): void {
  window.dispatchEvent(
    new CustomEvent<AppNavigationReplacedDetail>(APP_NAVIGATION_REPLACED_EVENT, {
      detail: { hash },
    }),
  );
}
