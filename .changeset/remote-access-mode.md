---
'@nedian0brien/synapsenote': minor
---

Add remote access mode, so a SynapseNote server can be reached from outside the machine it runs on.

Set `OK_ACCESS_MODE=remote` with a public origin and a trusted-proxy hop count, and every surface — the API, `/mcp`, the collaboration socket, and document assets — starts requiring an access token instead of treating a loopback connection as proof. Mint tokens with `synapsenote access token create <name>`; the web app trades one for an `HttpOnly` session cookie on first sign-in. The server refuses to start on an incomplete remote configuration and names every missing piece at once.

Local use is unchanged. Without `OK_ACCESS_MODE`, the desktop app, `bun run dev`, and `synapsenote start` behave exactly as before.

`deploy/` carries a Dockerfile, a compose file, an nginx server block, and a deployment runbook.
