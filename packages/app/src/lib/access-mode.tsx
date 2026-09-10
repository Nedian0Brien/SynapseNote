/**
 * Access mode — is this shell being served over the internet, or from the
 * machine the workspace lives on?
 *
 * Several things the desktop app does act on that machine rather than on the
 * workspace: opening a file in Cursor, cloning a repository, replacing the
 * server's GitHub credential, writing a machine-global embeddings key. Over a
 * remote connection the server refuses all of them, and the point of this hook
 * is to hide those controls instead of offering buttons that answer 403.
 *
 * Same dual-channel shape as {@link useSingleFileMode}, and for the same
 * reason — see `single-file-mode.tsx` for why the desktop renderer cannot
 * reach `/api/config`. Desktop is always `local`, so the synchronous default
 * is already right there and no fetch is needed.
 *
 * Defaults to `local` everywhere it cannot tell: outside a provider, before
 * the fetch resolves, and against a server old enough not to send the field.
 * A wrong `local` renders a control that then fails; a wrong `remote` hides a
 * control that would have worked. The first is recoverable by the user, the
 * second looks like a missing feature, so the default leans that way.
 */
import { createContext, type ReactNode, use, useEffect, useState } from 'react';
import { fetchApiConfig } from '@/lib/api-config';
// Loads the `Window.okDesktop?` global augmentation (side-effect import).
import '@/lib/desktop-bridge-types';

export type AccessMode = 'local' | 'remote';

const AccessModeContext = createContext<AccessMode>('local');

export function AccessModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AccessMode>('local');

  useEffect(() => {
    // Desktop renders from `file://` and reaches the collab server over the
    // bridge, so `/api/config` is off-origin. It is also, by construction,
    // local — the default above is the answer.
    if (window.okDesktop) return;

    const controller = new AbortController();
    void fetchApiConfig(controller.signal)
      .then((result) => {
        if (controller.signal.aborted || result.status !== 'ok') return;
        setMode(result.config.accessMode);
      })
      // fetchApiConfig rethrows AbortError on unmount — expected, swallow it.
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return <AccessModeContext value={mode}>{children}</AccessModeContext>;
}

/** How this shell reaches its workspace. */
export function useAccessMode(): AccessMode {
  return use(AccessModeContext);
}

/**
 * `true` when this shell is served over the internet.
 *
 * Read it to hide a control, never to decide whether an action is allowed —
 * the server decides that, and it is the only side that can.
 */
export function useIsRemote(): boolean {
  return use(AccessModeContext) === 'remote';
}
