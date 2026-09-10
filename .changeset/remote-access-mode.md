---
'@nedian0brien/synapsenote': minor
---

Add remote access mode, so a SynapseNote server can be reached from outside the machine it runs on.

Set `OK_ACCESS_MODE=remote` with a public origin and a trusted-proxy hop count, and every surface — the API, `/mcp`, the collaboration socket, and document assets — starts requiring an access token instead of treating a loopback connection as proof. The server refuses to start on an incomplete remote configuration and names every missing piece at once.

Local use is unchanged. Without `OK_ACCESS_MODE`, the desktop app, `bun run dev`, and `synapsenote start` behave exactly as before.

Remote mode also runs an OAuth 2.1 authorization server, which is what lets ChatGPT and other MCP clients connect. It publishes the discovery documents the MCP specification requires, resolves clients through Client ID Metadata Documents (with dynamic registration kept for clients that predate them), and asks you to approve each connection on a consent page. Access tokens are audience-bound to this server's `/mcp` endpoint and refresh tokens rotate.

You sign in to the web app with a username and password, or with a passkey — Touch ID, Face ID, or a security key. Create the account on the server with `synapsenote access account create <username>`, which asks for the password interactively rather than taking it as an argument, then register passkeys from Settings → Account. Ten failed password attempts lock sign-in for fifteen minutes; a wrong username and a wrong password are indistinguishable, so the endpoint says nothing about which accounts exist.

Access tokens are unchanged for MCP clients and the CLI, which send them as `Authorization: Bearer`. The browser no longer accepts one: a token pasted into a page is a long-lived credential in the place least able to keep it.

Over a remote connection the web app does what the desktop app does, with one
group of exceptions. Editing, search, databases, starter packs, skill installs,
and git sync — including the conflict list and manual sync — all work. What does
not is anything whose effect is on the machine SynapseNote is installed on:
opening a file in Cursor, cloning a project, connecting GitHub, setting the
machine-global embeddings key, publishing to GitHub Pages, and running agents.
The web UI hides those controls and says where to find them, rather than
offering a button that fails.

The gate in front of those endpoints was also rebuilt. It used to ask for a
loopback socket and a loopback `Origin`, and behind a reverse proxy neither
question means anything: the socket peer is always the proxy, and an absent
`Origin` passed. A browser sent its real origin and was refused while a script
that omitted the header was admitted — which meant an access-token holder could
trigger a git push remotely. It now asks the question that separates the
operator from everyone else: whether a person signed in. Access tokens reach
documents; they do not reach the operator's git and GitHub credentials.

`deploy/` carries a Dockerfile, a compose file, an nginx server block, and a deployment runbook.
