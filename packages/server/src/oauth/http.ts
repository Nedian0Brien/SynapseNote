/**
 * HTTP surface for the authorization server.
 *
 * Parses, calls into `endpoints.ts`, serializes. All of the decision-making
 * lives there so it can be tested without a socket; this file's job is the
 * wire format and the one piece of UI the flow needs — the consent page.
 *
 * ## Which of these need a credential
 *
 * - The two `.well-known` documents and `/oauth/token` and `/oauth/register`
 *   are reachable without one. They have to be: a client that cannot read the
 *   metadata cannot discover where to authorize, and a client that cannot
 *   reach the token endpoint cannot redeem the code it was just given. The
 *   token endpoint is protected by PKCE rather than by a credential.
 * - `/oauth/authorize` requires the operator. It is the step where a human
 *   approves, so there has to be a human, and this server already knows how to
 *   recognize one: the same session cookie the web app uses.
 */

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type AccessPolicy, accessRequestFromNode, authorizeRequest } from '../access-control.ts';
import { buildSessionCookie } from '../auth/session-cookie.ts';
import type { CimdResolver } from './cimd.ts';
import {
  type AuthorizeDecision,
  approveAuthorization,
  buildErrorRedirect,
  evaluateAuthorizeRequest,
  handleRegistrationRequest,
  handleTokenRequest,
} from './endpoints.ts';
import {
  AUTHORIZATION_SERVER_METADATA_PATH,
  AUTHORIZE_PATH,
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
  mcpResourceIdentifier,
  PROTECTED_RESOURCE_METADATA_PATH,
  REGISTER_PATH,
  TOKEN_PATH,
} from './metadata.ts';
import type { OAuthStore } from './store.ts';

/** Bodies here are tiny; anything larger is not a real OAuth request. */
const MAX_BODY_BYTES = 16 * 1024;

/**
 * Signing in on the consent page.
 *
 * Passwords only. This page carries no JavaScript — a strict CSP with no
 * `script-src`, so that anything reflected into it cannot execute — and
 * WebAuthn cannot run without JavaScript. A passkey user signs in to the app
 * first and arrives here already carrying a session cookie.
 */
export interface OAuthAccountLogin {
  signIn(
    username: string,
    password: string,
  ): Promise<
    | { readonly ok: true; readonly secret: string; readonly expiresAt: string }
    | { readonly ok: false; readonly retryAfterSeconds?: number }
  >;
}

export interface OAuthHttpOptions {
  readonly store: OAuthStore;
  readonly cimd: CimdResolver;
  /** The origin this server is reached at — the OAuth issuer. */
  readonly publicOrigin: string;
  /** Used to recognize the operator at `/oauth/authorize`. */
  readonly accessPolicy: AccessPolicy;
  /**
   * Lets the consent page sign an operator in without leaving the flow.
   * Absent means this server issues no sessions, and the page says so.
   */
  readonly accountLogin?: OAuthAccountLogin;
  /**
   * Whether the client's own leg of this request was encrypted, which decides
   * the `Secure` cookie attribute. Supplied by the caller because only it
   * knows the trusted-proxy policy.
   */
  readonly isSecureRequest: (req: IncomingMessage) => boolean;
}

export interface OAuthHttpHandler {
  /** Returns true when the request belonged to the OAuth surface. */
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
}

/** Paths this handler owns, for the admission gate's exemption list. */
export const OAUTH_PUBLIC_PATHS: readonly string[] = [
  PROTECTED_RESOURCE_METADATA_PATH,
  AUTHORIZATION_SERVER_METADATA_PATH,
  TOKEN_PATH,
  REGISTER_PATH,
];

export const OAUTH_OPERATOR_PATHS: readonly string[] = [AUTHORIZE_PATH];

function json(res: ServerResponse, status: number, body: unknown, cache?: string): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': cache ?? 'no-store',
    ...(cache === undefined ? { Pragma: 'no-cache' } : {}),
  });
  res.end(payload);
}

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    // The consent page has no scripts and loads nothing. Saying so means a
    // reflected value that escaped the encoder still cannot execute.
    'Content-Security-Policy':
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
    // Nothing here should ever render inside someone else's frame — that is
    // how a consent screen gets clickjacked into approving.
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(body);
}

function oauthError(res: ServerResponse, status: number, error: string, description: string): void {
  json(res, status, { error, error_description: description });
}

async function readBody(req: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.from(chunk as Buffer);
    total += buf.length;
    if (total > MAX_BODY_BYTES) return null;
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/** Minimal HTML entity encoding for values that reach the consent page. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const PAGE_STYLE = `
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 24px; }
  main { width: 100%; max-width: 26rem; }
  h1 { font-size: 1.15rem; margin: 0 0 .5rem; }
  p { margin: 0 0 1rem; }
  .muted { opacity: .7; font-size: .9rem; }
  .client { font-weight: 600; }
  .scope { border: 1px solid currentColor; border-radius: 8px; padding: .75rem 1rem;
           margin: 0 0 1.25rem; opacity: .85; }
  form { display: grid; gap: .75rem; }
  input { font: inherit; padding: .55rem .7rem; border-radius: 8px;
          border: 1px solid currentColor; background: transparent; color: inherit; width: 100%;
          box-sizing: border-box; }
  button { font: inherit; padding: .55rem 1rem; border-radius: 8px; border: 1px solid currentColor;
           background: transparent; color: inherit; cursor: pointer; }
  button.primary { background: currentColor; }
  button.primary span { filter: invert(1); }
  .row { display: flex; gap: .5rem; }
  .row > * { flex: 1; }
  .error { color: #b00020; }
`;

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title><style>${PAGE_STYLE}</style></head>
<body><main>${body}</main></body></html>`;
}

function refusalPage(error: string, description: string): string {
  return page(
    'Authorization request refused',
    `<h1>Authorization request refused</h1>
     <p class="error">${escapeHtml(description)}</p>
     <p class="muted">Error code: <code>${escapeHtml(error)}</code>. This request was not
     redirected anywhere, because the client or its redirect URI could not be verified.</p>`,
  );
}

function signInPage(returnTo: string, options: { error?: string; username?: string } = {}): string {
  const { error, username = '' } = options;
  return page(
    'Sign in to approve',
    `<h1>Sign in to approve</h1>
     <p>An application is asking for access to this workspace. Sign in to review the request.</p>
     ${error === undefined ? '' : `<p class="error">${escapeHtml(error)}</p>`}
     <form method="POST" action="${escapeHtml(AUTHORIZE_PATH)}">
       <input type="hidden" name="action" value="signin">
       <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
       <input type="text" name="username" placeholder="Username" autocomplete="username"
              spellcheck="false" autocapitalize="none" value="${escapeHtml(username)}"
              ${username === '' ? 'autofocus ' : ''}required>
       <input type="password" name="password" placeholder="Password"
              autocomplete="current-password" ${username === '' ? '' : 'autofocus '}required>
       <button class="primary" type="submit"><span>Sign in</span></button>
     </form>
     <p class="muted">This is the account created with
     <code>synapsenote access account create &lt;username&gt;</code>. Passkeys are not offered
     here: this page runs no JavaScript.</p>`,
  );
}

/**
 * Constrain where the sign-in leg may send the browser next.
 *
 * `return_to` arrives in a form field, so it is attacker-supplied. Only a
 * same-site path back to the authorization endpoint is allowed; anything else
 * would make this an open redirector that also happens to set a session
 * cookie first.
 */
export function safeReturnTo(value: string | null): string {
  if (value === null || !value.startsWith(`${AUTHORIZE_PATH}?`)) return AUTHORIZE_PATH;
  // A protocol-relative or backslash-prefixed value can read as a path here
  // and as a host to a browser.
  if (value.includes('//') || value.includes('\\')) return AUTHORIZE_PATH;
  return value;
}

function consentPage(
  consent: Extract<AuthorizeDecision, { kind: 'consent' }>,
  operatorLabel: string,
): string {
  const hidden = (name: string, value: string | undefined) =>
    value === undefined ? '' : `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`;
  return page(
    'Approve access',
    `<h1>Approve access</h1>
     <p><span class="client">${escapeHtml(consent.clientName)}</span> is asking to connect to this
     workspace.</p>
     <div class="scope">
       <div>Full read and write access to the documents in this workspace.</div>
       <div class="muted">Client ID: ${escapeHtml(consent.clientId)}</div>
       <div class="muted">Redirects to: ${escapeHtml(consent.redirectUri)}</div>
     </div>
     <form method="POST" action="${escapeHtml(AUTHORIZE_PATH)}">
       ${hidden('action', 'approve')}
       ${hidden('client_id', consent.clientId)}
       ${hidden('redirect_uri', consent.redirectUri)}
       ${hidden('code_challenge', consent.codeChallenge)}
       ${hidden('code_challenge_method', 'S256')}
       ${hidden('response_type', 'code')}
       ${hidden('scope', consent.scope)}
       ${hidden('resource', consent.resource)}
       ${hidden('state', consent.state)}
       <div class="row">
         <button type="submit" name="decision" value="deny">Deny</button>
         <button class="primary" type="submit" name="decision" value="allow"><span>Allow</span></button>
       </div>
     </form>
     <p class="muted">Signed in as ${escapeHtml(operatorLabel)}.</p>`,
  );
}

export function createOAuthHttpHandler(options: OAuthHttpOptions): OAuthHttpHandler {
  const { store, cimd, publicOrigin, accessPolicy, accountLogin, isSecureRequest } = options;
  const resourceIdentifier = mcpResourceIdentifier(publicOrigin);
  const deps = { store, cimd, resourceIdentifier };

  /** Recognize the operator behind an `/oauth/authorize` request. */
  function operator(req: IncomingMessage): { id: string; label: string } | null {
    const decision = authorizeRequest(accessPolicy, accessRequestFromNode(req));
    if (!decision.ok) return null;
    return { id: decision.principal.id, label: decision.principal.label };
  }

  function paramsFrom(url: URL): Parameters<typeof evaluateAuthorizeRequest>[0] {
    const q = url.searchParams;
    const get = (name: string) => q.get(name) ?? undefined;
    return {
      clientId: get('client_id'),
      redirectUri: get('redirect_uri'),
      responseType: get('response_type'),
      codeChallenge: get('code_challenge'),
      codeChallengeMethod: get('code_challenge_method'),
      scope: get('scope'),
      state: get('state'),
      resource: get('resource'),
    };
  }

  async function handleAuthorizeGet(req: IncomingMessage, res: ServerResponse, url: URL) {
    const decision = await evaluateAuthorizeRequest(paramsFrom(url), deps);
    if (decision.kind === 'refuse') {
      html(res, 400, refusalPage(decision.error, decision.description));
      return;
    }
    if (decision.kind === 'redirect-error') {
      res.writeHead(302, {
        Location: buildErrorRedirect(decision, publicOrigin),
        'Cache-Control': 'no-store',
      });
      res.end();
      return;
    }
    // Only now, with a well-formed request from a verified client, is it worth
    // asking who the human is. Checking earlier would prompt for a sign-in to
    // approve a request that was never going to be approvable.
    const who = operator(req);
    if (who === null) {
      html(res, 200, signInPage(`${url.pathname}${url.search}`));
      return;
    }
    html(res, 200, consentPage(decision, who.label));
  }

  async function handleAuthorizePost(req: IncomingMessage, res: ServerResponse) {
    const raw = await readBody(req);
    if (raw === null) {
      html(res, 413, refusalPage('invalid_request', 'The request body was too large.'));
      return;
    }
    const form = new URLSearchParams(raw);

    if (form.get('action') === 'signin') {
      // Sign in and come back to the authorization request. Done here rather
      // than by pointing the form at `/api/auth/password` so the flow needs no
      // JavaScript: that endpoint answers JSON, which a plain form post would
      // render as a blank page.
      if (accountLogin === undefined) {
        html(
          res,
          404,
          refusalPage('temporarily_unavailable', 'This server is not issuing sessions.'),
        );
        return;
      }
      const returnTo = safeReturnTo(form.get('return_to'));
      const username = form.get('username') ?? '';
      const password = form.get('password') ?? '';
      const outcome =
        username === '' || password === ''
          ? { ok: false as const }
          : await accountLogin.signIn(username, password);
      if (!outcome.ok) {
        // The same page a first visit renders, plus the refusal: a mistyped
        // password is the common case and should not look like a broken flow.
        // The username is echoed back so only the password has to be retyped.
        html(
          res,
          outcome.retryAfterSeconds === undefined ? 401 : 429,
          signInPage(returnTo, {
            username,
            error:
              outcome.retryAfterSeconds === undefined
                ? 'That username and password were not accepted.'
                : `Too many failed attempts. Try again in ${outcome.retryAfterSeconds} seconds.`,
          }),
        );
        return;
      }
      res.writeHead(302, {
        Location: returnTo,
        'Set-Cookie': buildSessionCookie(outcome.secret, outcome.expiresAt, isSecureRequest(req)),
        'Cache-Control': 'no-store',
      });
      res.end();
      return;
    }

    // Re-evaluate from the posted parameters rather than trusting a token that
    // says "this was already approved". The consent page's fields are just a
    // form; every check that ran on GET runs again here.
    const url = new URL(`${publicOrigin}${AUTHORIZE_PATH}`);
    for (const [key, value] of form) url.searchParams.set(key, value);
    const decision = await evaluateAuthorizeRequest(paramsFrom(url), deps);
    if (decision.kind === 'refuse') {
      html(res, 400, refusalPage(decision.error, decision.description));
      return;
    }
    if (decision.kind === 'redirect-error') {
      res.writeHead(302, {
        Location: buildErrorRedirect(decision, publicOrigin),
        'Cache-Control': 'no-store',
      });
      res.end();
      return;
    }

    const who = operator(req);
    if (who === null) {
      html(res, 401, refusalPage('access_denied', 'Sign in before approving this request.'));
      return;
    }

    if (form.get('decision') !== 'allow') {
      res.writeHead(302, {
        Location: buildErrorRedirect(
          {
            kind: 'redirect-error',
            redirectUri: decision.redirectUri,
            error: 'access_denied',
            description: 'The request was denied.',
            state: decision.state,
          },
          publicOrigin,
        ),
        'Cache-Control': 'no-store',
      });
      res.end();
      return;
    }

    const { redirectTo } = approveAuthorization(decision, who, deps, publicOrigin);
    res.writeHead(302, { Location: redirectTo, 'Cache-Control': 'no-store' });
    res.end();
  }

  async function handleToken(req: IncomingMessage, res: ServerResponse) {
    const raw = await readBody(req);
    if (raw === null) {
      oauthError(res, 400, 'invalid_request', 'The request body was too large.');
      return;
    }
    const form = new URLSearchParams(raw);
    const get = (name: string) => form.get(name) ?? undefined;
    const result = handleTokenRequest(
      {
        grantType: get('grant_type'),
        code: get('code'),
        redirectUri: get('redirect_uri'),
        clientId: get('client_id'),
        codeVerifier: get('code_verifier'),
        refreshToken: get('refresh_token'),
        resource: get('resource'),
      },
      deps,
    );
    if (!result.ok) {
      oauthError(res, result.status, result.error, result.description);
      return;
    }
    json(res, 200, result.body);
  }

  async function handleRegister(req: IncomingMessage, res: ServerResponse) {
    const raw = await readBody(req);
    if (raw === null) {
      oauthError(res, 400, 'invalid_request', 'The request body was too large.');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      oauthError(res, 400, 'invalid_client_metadata', 'The request body is not JSON.');
      return;
    }
    const body = (parsed ?? {}) as Record<string, unknown>;
    const result = handleRegistrationRequest(
      { redirectUris: body.redirect_uris, clientName: body.client_name },
      deps,
      () => `dcr_${randomUUID()}`,
    );
    if (!result.ok) {
      oauthError(res, 400, result.error, result.description);
      return;
    }
    json(res, 201, result.body);
  }

  return {
    async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
      const url = new URL(req.url ?? '/', publicOrigin);
      const path = url.pathname;

      if (path === PROTECTED_RESOURCE_METADATA_PATH) {
        // Discovery documents are public and stable; a short cache spares a
        // fetch on every reconnect without pinning a stale origin for long.
        json(res, 200, buildProtectedResourceMetadata(publicOrigin), 'public, max-age=3600');
        return true;
      }
      if (path === AUTHORIZATION_SERVER_METADATA_PATH) {
        json(res, 200, buildAuthorizationServerMetadata(publicOrigin), 'public, max-age=3600');
        return true;
      }

      if (path === AUTHORIZE_PATH) {
        if (req.method === 'GET') {
          await handleAuthorizeGet(req, res, url);
          return true;
        }
        if (req.method === 'POST') {
          await handleAuthorizePost(req, res);
          return true;
        }
        html(res, 405, refusalPage('invalid_request', 'Use GET or POST.'));
        return true;
      }

      if (path === TOKEN_PATH) {
        if (req.method !== 'POST') {
          oauthError(res, 405, 'invalid_request', 'The token endpoint accepts POST.');
          return true;
        }
        await handleToken(req, res);
        return true;
      }

      if (path === REGISTER_PATH) {
        if (req.method !== 'POST') {
          oauthError(res, 405, 'invalid_request', 'The registration endpoint accepts POST.');
          return true;
        }
        await handleRegister(req, res);
        return true;
      }

      return false;
    },
  };
}
