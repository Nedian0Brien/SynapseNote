---
'@nedian0brien/synapsenote': minor
---

Add remote access mode, so a SynapseNote server can be reached from outside the machine it runs on.

Set `OK_ACCESS_MODE=remote` with a public origin and a trusted-proxy hop count, and every surface — the API, `/mcp`, the collaboration socket, and document assets — starts requiring an access token instead of treating a loopback connection as proof. Mint tokens with `synapsenote access token create <name>`; the web app trades one for an `HttpOnly` session cookie on first sign-in. The server refuses to start on an incomplete remote configuration and names every missing piece at once.

Local use is unchanged. Without `OK_ACCESS_MODE`, the desktop app, `bun run dev`, and `synapsenote start` behave exactly as before.

Remote mode also runs an OAuth 2.1 authorization server, which is what lets ChatGPT and other MCP clients connect. It publishes the discovery documents the MCP specification requires, resolves clients through Client ID Metadata Documents (with dynamic registration kept for clients that predate them), and asks you to approve each connection on a consent page. Access tokens are audience-bound to this server's `/mcp` endpoint and refresh tokens rotate.

`deploy/` carries a Dockerfile, a compose file, an nginx server block, and a deployment runbook.
