/**
 * Browser side of the remote-access session exchange.
 *
 * On a server running in remote mode every `/api/*` call needs a credential.
 * The browser gets one by posting an access token to `/api/auth/session`,
 * which answers with an `HttpOnly` cookie — so this module never holds either
 * secret, and neither does any other page script. Its whole job is to run the
 * exchange and to let the shell know when a request came back unauthorized.
 *
 * Inert against a local server: nothing here runs until a 401 actually
 * arrives, and a local server never sends one.
 */

/** Window event dispatched when an `/api/*` call answers 401. */
export const API_UNAUTHORIZED_EVENT = 'ok:api-unauthorized';

/** Path of the session exchange. Kept in one place so the fetch wrapper and
 *  this module agree on which request must not re-trigger the 401 signal. */
export const AUTH_SESSION_PATH = '/api/auth/session';

export type SignInResult =
  | { readonly ok: true; readonly label: string }
  /** The server refused the token. */
  | { readonly ok: false; readonly reason: 'rejected' }
  /** The server is not running in remote mode, so there is nothing to sign in to. */
  | { readonly ok: false; readonly reason: 'unavailable' }
  /** The request never completed. */
  | { readonly ok: false; readonly reason: 'network' };

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

/**
 * Trade an access token for a session cookie.
 *
 * The response body carries the token's label and expiry; the credential
 * itself arrives as a `Set-Cookie` the browser stores and this code cannot
 * read. That asymmetry is the point of the exchange.
 */
export async function signIn(token: string): Promise<SignInResult> {
  let res: Response;
  try {
    res = await fetch(AUTH_SESSION_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  // 404 means the server runs in local mode, where the endpoint does not
  // exist. Telling the user their token was wrong would send them hunting for
  // a better token when the server simply never asked for one.
  if (res.status === 404) return { ok: false, reason: 'unavailable' };
  if (!res.ok) return { ok: false, reason: 'rejected' };
  try {
    const body = (await res.json()) as { label?: unknown };
    return { ok: true, label: typeof body.label === 'string' ? body.label : '' };
  } catch {
    // The cookie is set regardless of whether the body parsed, so treat a
    // malformed body as a successful sign-in with no label rather than
    // stranding the user on a form that already worked.
    return { ok: true, label: '' };
  }
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
