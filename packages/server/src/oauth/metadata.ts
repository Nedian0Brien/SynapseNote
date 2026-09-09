/**
 * The two discovery documents an MCP client fetches before it can authorize.
 *
 * The MCP authorization spec requires the protected resource metadata
 * (RFC 9728) and at least one authorization server metadata mechanism
 * (RFC 8414). This server is both roles in one process, so both documents
 * describe the same origin.
 *
 * Both are derived from one value — the public origin — so a deployment cannot
 * advertise endpoints it does not serve.
 */

import { SUPPORTED_CODE_CHALLENGE_METHODS } from './pkce.ts';

/** Well-known paths, fixed by RFC 9728 and RFC 8414. */
export const PROTECTED_RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource';
export const AUTHORIZATION_SERVER_METADATA_PATH = '/.well-known/oauth-authorization-server';

/** This server's OAuth endpoints. */
export const AUTHORIZE_PATH = '/oauth/authorize';
export const TOKEN_PATH = '/oauth/token';
export const REGISTER_PATH = '/oauth/register';

/** The MCP endpoint these tokens are audience-bound to. */
export const MCP_PATH = '/mcp';

/**
 * The single scope this server grants.
 *
 * One workspace, one operator, one level of access: a client that can read the
 * documents can also write them, because every MCP tool worth connecting for
 * does both. Splitting `read` and `write` in the metadata without enforcing
 * the split per tool would advertise a guarantee the server does not keep, so
 * the scope says exactly what it grants.
 */
export const WORKSPACE_SCOPE = 'synapsenote:workspace';

export interface ProtectedResourceMetadata {
  readonly resource: string;
  readonly authorization_servers: readonly string[];
  readonly scopes_supported: readonly string[];
  readonly bearer_methods_supported: readonly string[];
  readonly resource_documentation?: string;
}

export interface AuthorizationServerMetadata {
  readonly issuer: string;
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  readonly registration_endpoint: string;
  readonly scopes_supported: readonly string[];
  readonly response_types_supported: readonly string[];
  readonly grant_types_supported: readonly string[];
  readonly code_challenge_methods_supported: readonly string[];
  readonly token_endpoint_auth_methods_supported: readonly string[];
  readonly authorization_response_iss_parameter_supported: boolean;
  readonly client_id_metadata_document_supported: boolean;
}

/**
 * The canonical resource identifier for this MCP server.
 *
 * RFC 8707 audience validation compares against this exact string, so it is
 * defined once here and used by the metadata, the authorization endpoint's
 * `resource` check, and the token audience check alike.
 */
export function mcpResourceIdentifier(publicOrigin: string): string {
  return `${publicOrigin}${MCP_PATH}`;
}

export function buildProtectedResourceMetadata(publicOrigin: string): ProtectedResourceMetadata {
  return {
    resource: mcpResourceIdentifier(publicOrigin),
    authorization_servers: [publicOrigin],
    scopes_supported: [WORKSPACE_SCOPE],
    // `header` only: RFC 6750 also defines form-encoded body and query
    // parameters, and the MCP spec forbids tokens in the query string.
    bearer_methods_supported: ['header'],
  };
}

export function buildAuthorizationServerMetadata(
  publicOrigin: string,
): AuthorizationServerMetadata {
  return {
    issuer: publicOrigin,
    authorization_endpoint: `${publicOrigin}${AUTHORIZE_PATH}`,
    token_endpoint: `${publicOrigin}${TOKEN_PATH}`,
    registration_endpoint: `${publicOrigin}${REGISTER_PATH}`,
    scopes_supported: [WORKSPACE_SCOPE],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: [...SUPPORTED_CODE_CHALLENGE_METHODS],
    // `none` is the public-client method: an MCP client running in someone
    // else's browser or desktop app has nowhere to keep a client secret, so
    // PKCE rather than a secret is what binds the code to the client.
    token_endpoint_auth_methods_supported: ['none'],
    // RFC 9207. The spec says clients MUST reject a response with no `iss`
    // when this is advertised, so advertising it and emitting it must stay
    // in step.
    authorization_response_iss_parameter_supported: true,
    // Client ID Metadata Documents — the mechanism ChatGPT uses, and the one
    // the MCP spec prefers over dynamic registration.
    client_id_metadata_document_supported: true,
  };
}

/**
 * The `WWW-Authenticate` value a protected surface returns on 401.
 *
 * RFC 9728 §5.1 makes `resource_metadata` the discovery entry point: without
 * it a client that gets a 401 has no way to learn where to authorize.
 */
export function buildWwwAuthenticate(publicOrigin: string, options?: { error?: string }): string {
  const parts = [
    `Bearer resource_metadata="${publicOrigin}${PROTECTED_RESOURCE_METADATA_PATH}"`,
    `scope="${WORKSPACE_SCOPE}"`,
  ];
  if (options?.error !== undefined) parts.splice(1, 0, `error="${options.error}"`);
  return parts.join(', ');
}
