/**
 * The `Set-Cookie` values that carry a browser session.
 *
 * Shared by the app's session exchange and the OAuth consent page, which both
 * need to sign an operator in. One definition means the two cannot end up with
 * different `SameSite` or a different `Secure` rule — a divergence that would
 * be invisible until one of them stopped working in a browser.
 */

import { SESSION_COOKIE_NAME } from '../access-control.ts';

/**
 * Build the cookie for a freshly minted session.
 *
 * `SameSite=Lax` is what closes the cross-site write path for a
 * cookie-authenticated API: a form or fetch from another origin does not carry
 * this cookie, so the Origin allowlist is a second line rather than the only
 * one. It still permits the top-level GET navigation that an OAuth redirect
 * performs, which is why `Strict` would break the consent flow.
 *
 * `secure` must reflect the client's own leg of the connection, not this
 * process's. A wrong `true` mints a cookie the browser silently drops over
 * plaintext — a sign-in that appears to succeed and never sticks.
 */
export function buildSessionCookie(secret: string, expiresAt: string, secure: boolean): string {
  const maxAgeSeconds = Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
  const attrs = [
    `${SESSION_COOKIE_NAME}=${secret}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

/** Build the cookie that clears a session. */
export function buildClearedSessionCookie(secure: boolean): string {
  const attrs = [`${SESSION_COOKIE_NAME}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}
