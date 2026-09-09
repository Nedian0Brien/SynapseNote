import { describe, expect, test } from 'bun:test';
import {
  AUTHORIZATION_SERVER_METADATA_PATH,
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
  buildWwwAuthenticate,
  mcpResourceIdentifier,
  PROTECTED_RESOURCE_METADATA_PATH,
  WORKSPACE_SCOPE,
} from './metadata.ts';

const ORIGIN = 'https://notes.example.com';

/**
 * These documents are a wire contract: MCP clients read them by exact field
 * name, so the assertions here pin names and values rather than shape.
 */
describe('protected resource metadata (RFC 9728)', () => {
  test('names this server as the resource and itself as the authorization server', () => {
    expect(buildProtectedResourceMetadata(ORIGIN)).toEqual({
      resource: 'https://notes.example.com/mcp',
      authorization_servers: ['https://notes.example.com'],
      scopes_supported: [WORKSPACE_SCOPE],
      bearer_methods_supported: ['header'],
    });
  });

  test('advertises only the header method', () => {
    // The MCP spec forbids access tokens in the query string, and advertising
    // a method the server will not accept sends clients down a dead end.
    const doc = buildProtectedResourceMetadata(ORIGIN);
    expect(doc.bearer_methods_supported).not.toContain('query');
    expect(doc.bearer_methods_supported).not.toContain('body');
  });

  test('the advertised resource is the identifier tokens are bound to', () => {
    expect(buildProtectedResourceMetadata(ORIGIN).resource).toBe(mcpResourceIdentifier(ORIGIN));
  });
});

describe('authorization server metadata (RFC 8414)', () => {
  const doc = buildAuthorizationServerMetadata(ORIGIN);

  test('points every endpoint at this origin', () => {
    expect(doc.issuer).toBe(ORIGIN);
    expect(doc.authorization_endpoint).toBe('https://notes.example.com/oauth/authorize');
    expect(doc.token_endpoint).toBe('https://notes.example.com/oauth/token');
    expect(doc.registration_endpoint).toBe('https://notes.example.com/oauth/register');
  });

  test('offers only the authorization code flow with S256', () => {
    expect(doc.response_types_supported).toEqual(['code']);
    expect(doc.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
    expect(doc.code_challenge_methods_supported).toEqual(['S256']);
    expect(doc.code_challenge_methods_supported).not.toContain('plain');
  });

  test('declares public clients', () => {
    expect(doc.token_endpoint_auth_methods_supported).toEqual(['none']);
  });

  test('advertises CIMD, which is how ChatGPT registers', () => {
    expect(doc.client_id_metadata_document_supported).toBe(true);
  });

  test('advertises the RFC 9207 issuer parameter', () => {
    // A client is entitled to reject a response with no `iss` once this is
    // true, so the flag and the redirect builder have to stay in step.
    expect(doc.authorization_response_iss_parameter_supported).toBe(true);
  });
});

describe('WWW-Authenticate', () => {
  test('points at the protected resource metadata, which is the discovery entry point', () => {
    expect(buildWwwAuthenticate(ORIGIN)).toBe(
      `Bearer resource_metadata="https://notes.example.com${PROTECTED_RESOURCE_METADATA_PATH}", scope="${WORKSPACE_SCOPE}"`,
    );
  });

  test('carries an error code when one applies', () => {
    expect(buildWwwAuthenticate(ORIGIN, { error: 'insufficient_scope' })).toContain(
      'error="insufficient_scope"',
    );
  });
});

describe('well-known paths', () => {
  test('match the values fixed by the RFCs', () => {
    expect(PROTECTED_RESOURCE_METADATA_PATH).toBe('/.well-known/oauth-protected-resource');
    expect(AUTHORIZATION_SERVER_METADATA_PATH).toBe('/.well-known/oauth-authorization-server');
  });
});
