/**
 * The authorization server's request handling, as pure functions over parsed
 * inputs.
 *
 * Kept free of `IncomingMessage` and `ServerResponse` so every branch —
 * including the ones that only differ by which OAuth error code comes back —
 * is reachable from a test without a socket. The HTTP wiring lives in
 * `api-extension.ts` and does nothing but parse, call, and serialize.
 *
 * ## Where errors go
 *
 * OAuth splits error reporting in two, and getting it backwards is a security
 * bug rather than a cosmetic one:
 *
 * - Once the redirect URI is known to be legitimate, authorization errors go
 *   back to the client as query parameters on that redirect.
 * - Before that — an unknown client, or a redirect URI that is not registered —
 *   the error MUST be shown to the user instead. Redirecting would turn this
 *   endpoint into an open redirector that reports errors to whoever asked.
 */

import type { CimdResolver } from './cimd.ts';
import { isClientIdMetadataUrl } from './cimd.ts';
import { WORKSPACE_SCOPE } from './metadata.ts';
import { isValidCodeChallenge, verifyCodeChallenge } from './pkce.ts';
import type { OAuthStore } from './store.ts';

/** The operator, resolved from the session cookie or a personal access token. */
export interface ResourceOwner {
  readonly id: string;
  readonly label: string;
}

export interface AuthorizeRequest {
  readonly clientId: string | undefined;
  readonly redirectUri: string | undefined;
  readonly responseType: string | undefined;
  readonly codeChallenge: string | undefined;
  readonly codeChallengeMethod: string | undefined;
  readonly scope: string | undefined;
  readonly state: string | undefined;
  readonly resource: string | undefined;
}

/** Shown to the operator: either a consent prompt or a refusal. */
export type AuthorizeDecision =
  /** Everything checks out; render the consent page. */
  | {
      readonly kind: 'consent';
      readonly clientId: string;
      readonly clientName: string;
      readonly redirectUri: string;
      readonly scope: string;
      readonly resource: string;
      readonly state: string | undefined;
      readonly codeChallenge: string;
    }
  /** The request is broken in a way that must not be redirected anywhere. */
  | { readonly kind: 'refuse'; readonly error: string; readonly description: string }
  /** The request is well-formed but rejected; report via the redirect. */
  | {
      readonly kind: 'redirect-error';
      readonly redirectUri: string;
      readonly error: string;
      readonly description: string;
      readonly state: string | undefined;
    };

export interface AuthorizeDeps {
  readonly store: OAuthStore;
  readonly cimd: CimdResolver;
  /** Canonical resource identifier this server issues tokens for. */
  readonly resourceIdentifier: string;
}

/**
 * Validate an authorization request and resolve the client.
 *
 * Does not mint anything — approval is a separate, explicit step, so a GET
 * that a browser might prefetch cannot hand out a code.
 */
export async function evaluateAuthorizeRequest(
  request: AuthorizeRequest,
  deps: AuthorizeDeps,
): Promise<AuthorizeDecision> {
  const clientId = request.clientId;
  if (clientId === undefined || clientId === '') {
    return { kind: 'refuse', error: 'invalid_request', description: 'client_id is required.' };
  }

  // Resolve the client first: until it is known, there is no redirect URI that
  // may be trusted to carry an error.
  let clientName: string;
  let registeredRedirectUris: readonly string[];
  if (isClientIdMetadataUrl(clientId)) {
    const resolved = await deps.cimd.resolve(clientId);
    if (!resolved.ok) {
      return {
        kind: 'refuse',
        error: 'invalid_client',
        description: `Could not resolve the client metadata document (${resolved.reason}).`,
      };
    }
    clientName = resolved.document.client_name;
    registeredRedirectUris = resolved.document.redirect_uris;
    deps.store.upsertClient({
      clientId,
      clientName,
      redirectUris: registeredRedirectUris,
      source: 'cimd',
    });
  } else {
    const registered = deps.store.getClient(clientId);
    if (registered === undefined) {
      return { kind: 'refuse', error: 'invalid_client', description: 'Unknown client_id.' };
    }
    clientName = registered.clientName ?? registered.clientId;
    registeredRedirectUris = registered.redirectUris;
  }

  // RFC 6749 §3.1.2.3: with several registered URIs the request must name one.
  // With exactly one, omitting it is allowed and means that one.
  const redirectUri =
    request.redirectUri ??
    (registeredRedirectUris.length === 1 ? registeredRedirectUris[0] : undefined);
  if (redirectUri === undefined) {
    return {
      kind: 'refuse',
      error: 'invalid_request',
      description: 'redirect_uri is required when the client registers more than one.',
    };
  }
  // Exact string match, per OAuth 2.1. Prefix or wildcard matching is how
  // redirect allowlists become open redirectors.
  if (!registeredRedirectUris.includes(redirectUri)) {
    return {
      kind: 'refuse',
      error: 'invalid_request',
      description: 'redirect_uri does not match the client registration.',
    };
  }

  // From here the redirect URI is trusted, so failures travel back on it.
  const fail = (error: string, description: string): AuthorizeDecision => ({
    kind: 'redirect-error',
    redirectUri,
    error,
    description,
    state: request.state,
  });

  if (request.responseType !== 'code') {
    return fail('unsupported_response_type', 'Only the authorization code flow is supported.');
  }
  if (request.codeChallenge === undefined || !isValidCodeChallenge(request.codeChallenge)) {
    return fail('invalid_request', 'A valid S256 code_challenge is required.');
  }
  if (request.codeChallengeMethod !== 'S256') {
    return fail('invalid_request', 'code_challenge_method must be S256.');
  }

  // RFC 8707. The MCP spec requires clients to send it; a token minted for a
  // different audience than this server would be usable somewhere else.
  const resource = request.resource;
  if (resource !== undefined && !resourceMatches(resource, deps.resourceIdentifier)) {
    return fail('invalid_target', 'resource does not identify this MCP server.');
  }

  const scope =
    request.scope === undefined || request.scope === '' ? WORKSPACE_SCOPE : request.scope;
  if (!scope.split(/\s+/).every((s) => s === WORKSPACE_SCOPE)) {
    return fail('invalid_scope', `The only supported scope is ${WORKSPACE_SCOPE}.`);
  }

  return {
    kind: 'consent',
    clientId,
    clientName,
    redirectUri,
    scope: WORKSPACE_SCOPE,
    resource: deps.resourceIdentifier,
    state: request.state,
    codeChallenge: request.codeChallenge,
  };
}

/**
 * Compare a client-supplied `resource` against ours.
 *
 * The MCP spec asks clients for the most specific URI they can give and notes
 * that a trailing slash is not significant, so `https://host/mcp` and
 * `https://host/mcp/` are the same target. The origin alone is also accepted:
 * a client that identifies the server rather than the endpoint is still
 * naming this server.
 */
export function resourceMatches(candidate: string, canonical: string): boolean {
  const strip = (value: string) => value.replace(/\/+$/, '').toLowerCase();
  const c = strip(candidate);
  if (c === strip(canonical)) return true;
  try {
    return c === strip(new URL(canonical).origin);
  } catch {
    return false;
  }
}

/**
 * Mint the code once the operator approves.
 *
 * `issuer` is required rather than optional: the authorization server
 * metadata advertises `authorization_response_iss_parameter_supported: true`,
 * and a client reading that is entitled to reject any response without `iss`.
 * Making it a parameter the caller must supply keeps the advertisement and the
 * response from drifting apart.
 */
export function approveAuthorization(
  consent: Extract<AuthorizeDecision, { kind: 'consent' }>,
  owner: ResourceOwner,
  deps: Pick<AuthorizeDeps, 'store'>,
  issuer: string,
): { readonly redirectTo: string } {
  const { code } = deps.store.createAuthorizationCode({
    clientId: consent.clientId,
    redirectUri: consent.redirectUri,
    codeChallenge: consent.codeChallenge,
    scope: consent.scope,
    resource: consent.resource,
    principalId: owner.id,
    principalLabel: owner.label,
  });
  return {
    redirectTo: buildRedirect(consent.redirectUri, { code, state: consent.state }, issuer),
  };
}

/**
 * Render an authorization error onto the client's redirect URI.
 *
 * Carries `iss` for the same reason the success path does: RFC 9207 §2.4 has
 * clients validate the issuer on error responses too, and a mismatch means
 * they must not even display the error.
 */
export function buildErrorRedirect(
  decision: Extract<AuthorizeDecision, { kind: 'redirect-error' }>,
  issuer: string,
): string {
  return buildRedirect(
    decision.redirectUri,
    { error: decision.error, error_description: decision.description, state: decision.state },
    issuer,
  );
}

/**
 * Append OAuth response parameters to a redirect URI.
 *
 * `iss` rides on every response, success and error alike: RFC 9207 is what
 * lets a client detect an authorization-server mix-up, and the metadata
 * advertises `authorization_response_iss_parameter_supported: true`, which
 * makes a client entitled to reject a response that lacks it.
 */
export function buildRedirect(
  redirectUri: string,
  params: Record<string, string | undefined>,
  issuer?: string,
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  if (issuer !== undefined) url.searchParams.set('iss', issuer);
  return url.toString();
}

export interface TokenRequest {
  readonly grantType: string | undefined;
  readonly code: string | undefined;
  readonly redirectUri: string | undefined;
  readonly clientId: string | undefined;
  readonly codeVerifier: string | undefined;
  readonly refreshToken: string | undefined;
  readonly resource: string | undefined;
}

export type TokenResult =
  | {
      readonly ok: true;
      readonly body: {
        readonly access_token: string;
        readonly token_type: 'Bearer';
        readonly expires_in: number;
        readonly refresh_token: string;
        readonly scope: string;
      };
    }
  | {
      readonly ok: false;
      readonly status: 400 | 401;
      readonly error: string;
      readonly description: string;
    };

/** Exchange an authorization code or a refresh token for a new grant. */
export function handleTokenRequest(
  request: TokenRequest,
  deps: Pick<AuthorizeDeps, 'store' | 'resourceIdentifier'>,
): TokenResult {
  if (request.grantType === 'authorization_code') return exchangeCode(request, deps);
  if (request.grantType === 'refresh_token') return exchangeRefresh(request, deps);
  return {
    ok: false,
    status: 400,
    error: 'unsupported_grant_type',
    description: 'Supported grant types are authorization_code and refresh_token.',
  };
}

function exchangeCode(
  request: TokenRequest,
  deps: Pick<AuthorizeDeps, 'store' | 'resourceIdentifier'>,
): TokenResult {
  const invalidGrant = (description: string): TokenResult => ({
    ok: false,
    status: 400,
    error: 'invalid_grant',
    description,
  });

  if (request.code === undefined) return invalidGrant('code is required.');
  if (request.codeVerifier === undefined) return invalidGrant('code_verifier is required.');

  // Redeeming removes the record, so every failure below still spends the
  // code. That is the intent: a code that has been presented once must not be
  // presentable again, whatever went wrong afterwards.
  const record = deps.store.redeemAuthorizationCode(request.code);
  if (record === null) return invalidGrant('The authorization code is invalid or expired.');

  if (request.clientId !== undefined && request.clientId !== record.clientId) {
    return invalidGrant('The authorization code was issued to a different client.');
  }
  if (request.redirectUri !== undefined && request.redirectUri !== record.redirectUri) {
    return invalidGrant('redirect_uri does not match the authorization request.');
  }
  if (!verifyCodeChallenge(request.codeVerifier, record.codeChallenge)) {
    return invalidGrant('code_verifier does not match the code_challenge.');
  }
  if (request.resource !== undefined && !resourceMatches(request.resource, record.resource)) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_target',
      description: 'resource does not match the authorization request.',
    };
  }

  const grant = deps.store.issueGrant({
    clientId: record.clientId,
    scope: record.scope,
    resource: record.resource,
    principalId: record.principalId,
    principalLabel: record.principalLabel,
  });
  return {
    ok: true,
    body: {
      access_token: grant.accessToken,
      token_type: 'Bearer',
      expires_in: grant.expiresInSeconds,
      refresh_token: grant.refreshToken,
      scope: grant.scope,
    },
  };
}

function exchangeRefresh(
  request: TokenRequest,
  deps: Pick<AuthorizeDeps, 'store' | 'resourceIdentifier'>,
): TokenResult {
  if (request.refreshToken === undefined) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_request',
      description: 'refresh_token is required.',
    };
  }
  const record = deps.store.redeemRefreshToken(request.refreshToken);
  if (record === null) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_grant',
      description: 'The refresh token is invalid or expired.',
    };
  }
  if (request.clientId !== undefined && request.clientId !== record.clientId) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_grant',
      description: 'The refresh token was issued to a different client.',
    };
  }
  const grant = deps.store.issueGrant({
    clientId: record.clientId,
    scope: record.scope,
    resource: record.resource,
    principalId: record.principalId,
    principalLabel: record.principalLabel,
  });
  return {
    ok: true,
    body: {
      access_token: grant.accessToken,
      token_type: 'Bearer',
      expires_in: grant.expiresInSeconds,
      refresh_token: grant.refreshToken,
      scope: grant.scope,
    },
  };
}

export interface RegistrationRequest {
  readonly redirectUris: unknown;
  readonly clientName: unknown;
}

export type RegistrationResult =
  | {
      readonly ok: true;
      readonly body: {
        readonly client_id: string;
        readonly client_name: string;
        readonly redirect_uris: readonly string[];
        readonly token_endpoint_auth_method: 'none';
        readonly grant_types: readonly string[];
        readonly response_types: readonly string[];
      };
    }
  | { readonly ok: false; readonly error: string; readonly description: string };

/**
 * RFC 7591 dynamic registration.
 *
 * The MCP spec deprecates this in favour of Client ID Metadata Documents but
 * keeps it for clients that predate them. Supported here for exactly that
 * reason: a client that cannot host a metadata document still has a way in.
 *
 * No client secret is issued — every client here is public and authenticates
 * with PKCE, which is what `token_endpoint_auth_methods_supported: ["none"]`
 * in the metadata already promises.
 */
export function handleRegistrationRequest(
  request: RegistrationRequest,
  deps: Pick<AuthorizeDeps, 'store'>,
  mintClientId: () => string,
): RegistrationResult {
  const uris = request.redirectUris;
  if (
    !Array.isArray(uris) ||
    uris.length === 0 ||
    !uris.every((uri) => typeof uri === 'string' && uri.length > 0)
  ) {
    return {
      ok: false,
      error: 'invalid_redirect_uri',
      description: 'redirect_uris must be a non-empty array of strings.',
    };
  }
  for (const uri of uris as string[]) {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      return { ok: false, error: 'invalid_redirect_uri', description: `Not a URL: ${uri}` };
    }
    // https, or http on loopback — the native-app pattern RFC 8252 blesses.
    const loopback =
      parsed.protocol === 'http:' &&
      (parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '::1' ||
        parsed.hostname === 'localhost');
    if (parsed.protocol !== 'https:' && !loopback) {
      return {
        ok: false,
        error: 'invalid_redirect_uri',
        description: 'redirect_uris must use https, or http on a loopback host.',
      };
    }
  }

  const clientName =
    typeof request.clientName === 'string' && request.clientName.length > 0
      ? request.clientName
      : 'Unnamed client';
  const clientId = mintClientId();
  const record = deps.store.upsertClient({
    clientId,
    clientName,
    redirectUris: uris as string[],
    source: 'dcr',
  });
  return {
    ok: true,
    body: {
      client_id: record.clientId,
      client_name: clientName,
      redirect_uris: record.redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
  };
}
