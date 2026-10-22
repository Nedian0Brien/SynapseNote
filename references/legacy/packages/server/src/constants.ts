/**
 * Server-side constants. The MCP server name is the wire-level identity the
 * `ok start` HTTP MCP endpoint advertises and the canonical key editor configs
 * use to identify the SynapseNote entry. CLI editor wiring imports this
 * via `@nedian0brien/synapsenote-server`; the value is defined once in
 * `@nedian0brien/synapsenote-core` and re-exported here so the server, the CLI
 * editor wiring, and the browser-safe in-app-terminal launch all stay in
 * lockstep.
 */
export { MCP_SERVER_NAME } from '@nedian0brien/synapsenote-core';
