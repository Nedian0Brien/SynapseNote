/**
 * Human-facing product/brand name. Centralized so the runtime TS prose
 * surfaces — the macOS About panel, window titles, CLI status lines, and
 * non-localized renderer toasts — share one source of truth instead of
 * scattered string literals.
 *
 * This is DISPLAY prose, NOT a technical identifier. The kebab/scoped/
 * reverse-DNS slugs are deliberately separate and MUST NOT be derived from
 * this value:
 *   - npm package        `@nedian0brien/synapsenote`
 *   - macOS appId        `kr.lawdigest.synapsenote`
 *   - deep-link scheme   `synapsenote://`
 *   - MCP server name /  `synapsenote`
 *     keyring service
 *   - shadow writer-ID   `synapsenote-service`
 *
 * Build-time identity (electron-builder `productName`, package.json) cannot
 * import this constant — those are static config and stay in lockstep via
 * the `helper-bundle-name-agreement` test.
 * Localized renderer strings cannot use it either (lingui keys on the source
 * string), so it covers the raw-literal TS surfaces only.
 */
export const PRODUCT_NAME = 'SynapseNote';
