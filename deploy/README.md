# Deploying the SynapseNote server

Runs the server in remote access mode behind the host's existing nginx, on
`https://synapse.lawdigest.kr`.

## What remote mode changes

Locally, the server treats reachability as authorization: only a process on
your machine can open a loopback socket, so no credential is needed. A public
deployment removes that reasoning, so every surface asks for one instead:

| Surface | Without a credential |
| --- | --- |
| `/api/*` | 401 |
| `/mcp` | 401 |
| `/collab` WebSocket | connection closed |
| Content assets (images, attachments) | 404 |
| `POST /api/auth/password`, `/api/auth/passkey/authenticate/*` | reachable — this is how you sign in |
| The React app itself | served — it is where the sign-in form lives |
| `/.well-known/oauth-*`, `/oauth/token`, `/oauth/register` | reachable — a client cannot discover or complete OAuth otherwise |

Three credentials do the work, for three different callers.

An **access token** is long-lived, minted from the CLI, and handed to an MCP
client or a script as `Authorization: Bearer`. The browser never sees one: a
pasted token is a long-lived secret in the place least able to keep it.

An **account** — one username and password, plus any passkeys registered
against it — is how a person signs in. A successful sign-in yields a
**session**: an `HttpOnly` cookie, so page scripts hold nothing durable.

## Before the first deploy

The server refuses to start on an incomplete remote configuration and lists
every missing piece at once. Four things must hold:

1. `OK_PUBLIC_ORIGIN` names the origin the browser loads.
2. That origin is `https://`. Tokens and cookies cross the network otherwise,
   and a `Secure` cookie would never be sent back at all.
3. `OK_TRUSTED_PROXY_HOPS` is set explicitly — `1` here, for nginx. This is the
   one that silently breaks security if it is wrong: behind a proxy, every
   request arrives from loopback, so a server that ignored the header would see
   the whole internet as a local client.
4. At least one access token exists.

An account is *not* required to boot. A server that has tokens but no account
starts and serves; only the sign-in screen refuses, and it names the command
that fixes that.

## Deploy

Everything below runs on the Oracle host. Build there rather than pushing an
image: the runtime installs native addons whose binaries are chosen per
architecture, and the host is `linux/arm64`.

```bash
git clone https://github.com/Nedian0Brien/SynapseNote.git
cd SynapseNote
```

**1. Put the workspace in place.** The container mounts a named volume at
`/workspace`. To start from an existing set of notes, copy them in after the
first `up`, or point the volume at a host directory you already have.

**2. Mint a token.** The store lives at `.ok/local/access.json` inside the
workspace, so mint through the running container — but the server will not
start without a token, so the first one is minted before the server does:

```bash
docker compose -f deploy/compose.yml run --rm --entrypoint sh synapsenote \
  -c 'node /app/dist/cli.mjs init && node /app/dist/cli.mjs access token create bootstrap'
```

The token is printed on stdout, once. Copy it now.

**3. Start the server.** On a host where 8080 is already taken, pick a free
port and use the same number in the nginx upstream.

```bash
export SYNAPSENOTE_HOST_PORT=18081
docker compose -f deploy/compose.yml up -d --build
docker compose -f deploy/compose.yml logs -f synapsenote
```

It publishes on loopback only, so nginx stays the only way in.

**4. Point nginx at it.** Back up whatever serves the hostname today first —
this replaces it.

```bash
sudo cp /etc/nginx/sites-available/synapse.lawdigest.kr \
        /etc/nginx/sites-available/synapse.lawdigest.kr.bak.$(date +%Y%m%d%H%M%S)

# The map the server block depends on. Skip if $connection_upgrade already
# exists on this host — nginx refuses to start on a duplicate map.
sudo cp deploy/nginx/10-connection-upgrade.conf /etc/nginx/conf.d/

sudo cp deploy/nginx/synapse.lawdigest.kr.conf \
        /etc/nginx/sites-available/synapse.lawdigest.kr
sudo ln -sf /etc/nginx/sites-available/synapse.lawdigest.kr \
            /etc/nginx/sites-enabled/synapse.lawdigest.kr
sudo nginx -t && sudo systemctl reload nginx
```

Read the config's comments before installing it: the `proxy_set_header` lines
are load-bearing, and the upstream port has to match `SYNAPSENOTE_HOST_PORT`.

**5. Check it.**

```bash
# The app loads without a credential — the sign-in form lives here.
curl -o /dev/null -w '%{http_code}\n' https://synapse.lawdigest.kr/

# The API does not.
curl -o /dev/null -w '%{http_code}\n' https://synapse.lawdigest.kr/api/config     # 401
curl -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
     https://synapse.lawdigest.kr/api/config                                      # 200
```

**6. Create the account you will sign in with.** Note the missing `-T`: the
command reads the password from the terminal, and refuses to run without one.
There is no `--password` flag — an argument would land in the process list, the
shell history, and the daemon log.

```bash
docker compose -f deploy/compose.yml exec synapsenote \
  node /app/dist/cli.mjs access account create <username>
```

Then open `https://synapse.lawdigest.kr`, sign in, and register a passkey from
Settings → Account so the password is not needed again on that device.

## Managing the account

```bash
# Change the password. Signs out every open browser session; passkeys keep
# working, so remove those from Settings too if that is the point.
docker compose -f deploy/compose.yml exec synapsenote \
  node /app/dist/cli.mjs access account passwd

# Username, creation date, registered passkeys.
docker compose -f deploy/compose.yml exec synapsenote \
  node /app/dist/cli.mjs access account show
```

One server holds one account. Ten failed password attempts inside fifteen
minutes lock sign-in for fifteen more; a registered passkey is unaffected,
which is the other reason to register one.

## Managing tokens

Mint one per client, so a single revocation does not sign out everything else:

```bash
docker compose -f deploy/compose.yml exec synapsenote \
  node /app/dist/cli.mjs access token create iphone
docker compose -f deploy/compose.yml exec synapsenote \
  node /app/dist/cli.mjs access token list
docker compose -f deploy/compose.yml exec synapsenote \
  node /app/dist/cli.mjs access token revoke <id>
```

The running server picks these up without a restart. Revoking a token also
kills every browser session minted from it.

## Backups

Back up the workspace volume. It holds the documents, the shadow git repository
behind version history, the access tokens, and the account with its passkeys.

Compose prefixes volume names with the project name, so the volume is
`synapsenote-remote_synapsenote-workspace`. Confirm with `docker volume ls`
rather than assuming.

```bash
docker run --rm -v synapsenote-remote_synapsenote-workspace:/w -v "$PWD":/out \
  debian:stable-slim tar czf /out/synapsenote-workspace.tar.gz -C /w .
```

## Things that go wrong

**Every request answers 403 `host-not-allowed`.** nginx is not forwarding the
original `Host`. Check `proxy_set_header Host $host;`.

**Sign-in succeeds and the page comes back signed out.** The cookie was minted
`Secure` and the browser dropped it over plaintext, or minted without `Secure`
and the proxy is not reporting TLS. Check `proxy_set_header X-Forwarded-Proto
$scheme;`.

**The editor loads but never syncs.** The WebSocket upgrade is not reaching the
container. Check the `Upgrade` and `Connection` headers and the `map` block.

**The server refuses to start.** It printed the reason and every missing piece
with it. Read the list rather than changing one variable at a time.

## Connecting an MCP client

Remote mode also runs an OAuth 2.1 authorization server, which is how MCP
clients that cannot be handed a token — ChatGPT among them — connect.

Point the client at `https://synapse.lawdigest.kr/mcp` and choose OAuth. It
discovers everything else on its own:

| Document | Path |
| --- | --- |
| Protected resource metadata (RFC 9728) | `/.well-known/oauth-protected-resource` |
| Authorization server metadata (RFC 8414) | `/.well-known/oauth-authorization-server` |

The browser then lands on a consent page. Sign in with your username and
password if you have not already — the page runs no JavaScript, so passkeys are
not offered there — review which client is asking, and approve. The client
receives a token scoped to `synapsenote:workspace` and bound to this server's
`/mcp` endpoint as its audience.

Clients register through Client ID Metadata Documents — the client's identity
is an HTTPS URL this server fetches — which is the mechanism the MCP
specification prefers and the one ChatGPT uses. `POST /oauth/register`
(RFC 7591) is kept for clients that predate it.

Access tokens last an hour and refresh tokens rotate: spending one retires the
whole grant it belonged to, so a stolen pair cannot outlive the real client.

To see or cut off what is connected:

```bash
docker compose -f deploy/compose.yml exec synapsenote \
  node /app/dist/cli.mjs access client list
docker compose -f deploy/compose.yml exec synapsenote \
  node /app/dist/cli.mjs access client revoke <client-id>
```

Revoking drops every token the client holds and forgets the approval, so it
has to be approved again to reconnect. The running server picks this up
without a restart.

## Not covered here

The agent surface (Claude / Codex chat) does not run in this container: the
image ships neither CLI binary nor any credential for one. Running agents
server-side is a separate milestone. The chat sidebar says so rather than
showing an empty list.

Anything that acts on the machine SynapseNote is installed on stays in the
desktop app, and the web UI hides the control instead of offering a button
that answers 403: opening a file in Cursor, cloning or initializing a project,
connecting or disconnecting GitHub, and setting the machine-global embeddings
key.

Publishing to GitHub Pages is in the same group, for a reason worth knowing:
the CLI keeps its GitHub token under `$HOME/.ok/auth.yml`, and this compose
file mounts `/home/node` as tmpfs, so the token would not survive a restart
even if it could be written. Reading the connection state works — Settings →
Account reports which account the server syncs with, or that there is none.

Scopes are not split by operation. `synapsenote:workspace` grants read and
write together, because every MCP tool worth connecting for does both.
Advertising a `read`/`write` split without enforcing it per tool would promise
a guarantee the server does not keep.
