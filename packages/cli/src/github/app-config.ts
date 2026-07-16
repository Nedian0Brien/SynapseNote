import { DEFAULT_GITHUB_OAUTH_CLIENT_ID } from '@nedian0brien/synapsenote-core';

/**
 * Resolve the OAuth App client ID. Precedence:
 *   1. `SYNAPSENOTE_GITHUB_CLIENT_ID` environment variable
 *   2. `DEFAULT_GITHUB_OAUTH_CLIENT_ID` built-in constant
 */
export function getOAuthClientId(): string {
  return process.env.SYNAPSENOTE_GITHUB_CLIENT_ID ?? DEFAULT_GITHUB_OAUTH_CLIENT_ID;
}
