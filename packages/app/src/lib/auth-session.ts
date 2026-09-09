/**
 * The 401 signal, and signing out.
 *
 * Signing *in* lives in `auth-login.ts` — a username and password, or a
 * passkey. The browser never handles an access token: those remain for MCP
 * clients and the CLI, which send them as `Authorization: Bearer` and have
 * somewhere safe to keep them, which a page script does not.
 *
 * Inert against a local server: nothing here runs until a 401 actually
 * arrives, and a local server never sends one.
 */

/** Window event dispatched when an `/api/*` call answers 401. */
export const API_UNAUTHORIZED_EVENT = 'ok:api-unauthorized';

/** Path of the session endpoint. Kept in one place so the fetch wrapper and
 *  this module agree on which request must not re-trigger the 401 signal. */
export const AUTH_SESSION_PATH = '/api/auth/session';

/**
 * Announce that a request came back unauthorized.
 *
 * Called from the fetch wrapper rather than from each caller, so a route that
 * nobody thought about still surfaces the sign-in prompt instead of rendering
 * an empty pane.
 */
export function notifyApiUnauthorized(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(API_UNAUTHORIZED_EVENT));
}

/** Subscribe to unauthorized responses. Returns an unsubscribe function. */
export function onApiUnauthorized(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => listener();
  window.addEventListener(API_UNAUTHORIZED_EVENT, handler);
  return () => window.removeEventListener(API_UNAUTHORIZED_EVENT, handler);
}

/** Drop the session cookie. Resolves even when the server refuses. */
export async function signOut(): Promise<void> {
  try {
    await fetch(AUTH_SESSION_PATH, { method: 'DELETE' });
  } catch {
    // Signing out is best-effort from here: the cookie is the server's to
    // clear, and a failed request leaves the user exactly where they were.
  }
}
